'use strict';

const webworkify = require('webworkify');
const unworkify = require('unworkify');
const ndarray = require('ndarray');
const Voxel4dLocation = require('./voxel-4d-location');
const level = require('./level');
var createBuffer = require('gl-buffer');
var createVAO = require('gl-vao');
var glShader = require('gl-shader');
var glslify = require('glslify');
var mat4 = require('gl-mat4');

module.exports = function (game, opts) {
    return new Voxel4D(game, opts);
};

module.exports.pluginInfo = {
    loadAfter: [
        'voxel-registry',
        'voxel-keys',
        'voxel-shader',
    ],
};

// When true, swap axis is determined by continuous look direction (any angle).
// When false, swap axis is snapped to the nearest cardinal axis (X, Y, or Z only).
var FREE_AXIS_SWAP = false;

function Voxel4D(game, opts) {
    this.game = game;

    this.registry = game.plugins.get('voxel-registry');
    if (!this.registry) throw new Error('voxel-4d requires voxel-registry plugin');
    this.keys = game.plugins.get('voxel-keys');
    if (!this.keys) throw new Error('voxel-4d requires voxel-keys plugin');
    this.shaderPlugin = game.plugins.get('voxel-shader');
    if (!this.shaderPlugin) throw new Error('voxel-4d requires voxel-shader plugin');

    this.enable();
}

Voxel4D.prototype.enable = function () {
    const self = this

    this.location = new Voxel4dLocation()

    // Register blocks
    const blockGrass = this.registry.registerBlock('grass', {
        texture: ['grass_top', 'dirt', 'grass_side'],
        hardness: 1.0,
        itemDrop: 'dirt',
        effectiveTool: 'spade'
    });
    const blockDirt = this.registry.registerBlock('dirt', {texture: 'dirt', hardness: 0.75, effectiveTool: 'spade'});
    const blockObsidian = this.registry.registerBlock('obsidian', {
        texture: 'obsidian',
        hardness: 128,
        requiredTool: 'pickaxe'
    });

    if (process.browser) {
        this.worker = webworkify(require('./voxel-4d-worker.js'));
    } else {
        // fallback to unthreaded
        this.worker = unworkify(require('./voxel-4d-worker.js'));
    }
    this.worker.addEventListener('message', this.onWorkerMessage = this.workerMessage.bind(this));


    // can't clone types, so need to send size instead
    var arrayElementSize
    if (this.game.arrayType === Uint8Array || this.game.arrayType === Uint8ClampedArray)
        arrayElementSize = 1;
    else if (this.game.arrayType === Uint16Array)
        arrayElementSize = 2;
    else if (this.game.arrayType === Uint32Array)
        arrayElementSize = 4;
    else
        throw new Error('unknown game.arrayType: ' + this.game.arrayType)

    this.worker.postMessage({
        cmd: 'configure', opts: {
            width: this.game.chunkSize,
            pad: this.game.chunkPad,
            arrayElementSize: arrayElementSize,
            seed: 'foo',
            blockGrass: blockGrass,
            blockObsidian: blockObsidian,
            blockDirt: blockDirt,
        }
    });

    // Chunk loading
    this.game.voxels.on('missingChunk', this.onMissingChunk = this.missingChunk.bind(this));

    // Keep track of added/deleted blocks
    this.game.on('setBlock', this.onSetBlock = this.setBlock.bind(this));

    // Key bindings
    this.keys.down.on('dimension axis switch', this.onDimensionAxisSwitch = this.dimensionAxisSwitch.bind(this));
    this.keys.down.on('dimension increment', this.onDimensionIncrement = function () {
        self.dimensionIncrement(+1)
    });
    this.keys.down.on('dimension decrement', this.onDimensionDecrement = function () {
        self.dimensionIncrement(-1)
    });

    // Dimension-swap plane animation
    this.activePlanes = [];
    this.game.shell.on('gl-init', this.onGlInit = this.glInit.bind(this));
    this.game.shell.on('gl-render', this.onGlRender = this.glRender.bind(this));

    // Place the starting scene. Deferred to engine-init because level.js uses
    // blocks from plugins (voxel-decorative, voxel-wool) that load after us,
    // and because chunks are not generated until the stitcher is ready — so the
    // overrides below are baked in as each chunk is generated.
    this.game.on('engine-init', this.onEngineInit = function () {
        const blocks = [];
        level.setScene(self.registry, function (position, value) {
            blocks.push([position[0], position[1], position[2], position[3], value]);
        });
        self.setBlocksXyzw(blocks);
    });
};

Voxel4D.prototype.disable = function () {
    this.game.removeListener('engine-init', this.onEngineInit);
    this.game.removeListener('setBlock', this.onSetBlock);
    this.worker.removeListener('message', this.onWorkerMessage);
    this.game.voxels.removeListener('missingChunk', this.onMissingChunk);
    this.keys.down.removeListener('dimension axis switch', this.onDimensionAxisSwitch);
    this.keys.down.removeListener('dimension increment', this.onDimensionIncrement);
    this.keys.down.removeListener('dimension decrement', this.onDimensionDecrement);
    this.game.shell.removeListener('gl-init', this.onGlInit);
    this.game.shell.removeListener('gl-render', this.onGlRender);
};

// API

Voxel4D.prototype.workerMessage = function (event) {
    if (event.data.cmd === 'chunkGenerated') {
        this.chunkGenerated(event.data.position, event.data.voxelBuffer)
    } else {
        console.error('Unknown message from worker', event.data)
    }
};

Voxel4D.prototype.setBlock = function (position, value) {
    this.worker.postMessage({cmd: 'setBlock', position: position, value: value})
};

/**
 * Bulk variant of setBlockXyzw for scene building, as one message rather than
 * one per block. Does not reload chunks: callers run before chunks generate.
 * @param {number[][]} blocks - array of [x, y, z, w, value]
 */
Voxel4D.prototype.setBlocksXyzw = function (blocks) {
    this.worker.postMessage({cmd: 'setBlocksXyzw', blocks: blocks})
};

Voxel4D.prototype.setBlockXyzwAndReloadChunk = function (position, value) {
    this.worker.postMessage({cmd: 'setBlockXyzw', position: position, value: value})
    const positionXyz = this.location.pUntransformer(position[0], position[1], position[2], position[3])
    // Check if this block is in our dimension
    if (positionXyz !== null) {
        const chunkPosition = this.game.voxels.chunkAtPosition(positionXyz)
        // Check if a block is loaded at this position
        if (chunkPosition) {
            // Reload the chunk
            this.missingChunk(chunkPosition)
        }
    }
};

Voxel4D.prototype.missingChunk = function (position) {
    this.worker.postMessage({cmd: 'generateChunk', position: position})
}

Voxel4D.prototype.chunkGenerated = function (position, voxelBuffer) {
    const voxels = new this.game.arrayType(voxelBuffer);
    const chunk = ndarray(voxels, [this.game.chunkSize + this.game.chunkPad, this.game.chunkSize + this.game.chunkPad, this.game.chunkSize + this.game.chunkPad]);
    chunk.position = position;

    this.game.showChunk(chunk);
}

Voxel4D.prototype.syncWorkerLocationState = function () {
    this.worker.postMessage({
        cmd: 'syncLocationState',
        basisMatrix: this.location.basisMatrix,
        origin: this.location.origin
    });
};

Voxel4D.prototype.dimensionAxisSwitch = function () {

    const playerPosition = this.game.playerPosition()
    const yaw = this.game.controls.target().yaw.rotation.y
    const pitch = this.game.controls.target().pitch.rotation.x

    // Sideways direction (perpendicular to look): this is what gets swapped with W
    var perpDir;
    var isVertical = Math.abs(Math.sin(pitch)) > 0.707;
    var sector;

    if (FREE_AXIS_SWAP) {
        // Free mode: any direction based on continuous yaw
        if (isVertical) {
            perpDir = [0, 1, 0];
            sector = 8;
        } else {
            perpDir = [Math.cos(yaw), 0, Math.sin(yaw)];
            var normalizedYaw = ((yaw % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI);
            sector = Math.floor(((normalizedYaw + Math.PI / 8) % (2 * Math.PI)) / (Math.PI / 4));
        }
    } else {
        // Cardinal mode: snap to nearest X, Y, or Z axis only
        if (isVertical) {
            perpDir = [0, 1, 0];
            sector = 1; // Y
        } else {
            var cx = Math.abs(Math.cos(yaw));
            var cz = Math.abs(Math.sin(yaw));
            if (cx >= cz) {
                perpDir = [Math.cos(yaw) > 0 ? 1 : -1, 0, 0];
                sector = 0; // X
            } else {
                perpDir = [0, 0, Math.sin(yaw) > 0 ? 1 : -1];
                sector = 2; // Z
            }
        }
    }

    // Toggle: same sector = reverse, different sector = forward
    var direction;
    if (this.lastSwapSector === sector) {
        direction = -this.lastSwapDirection;
    } else {
        direction = 1;
    }
    this.lastSwapSector = sector;
    this.lastSwapDirection = direction;

    // Record locally
    this.location.dimensionAxisSwitch(perpDir, playerPosition, direction)
    // Sync to worker
    this.syncWorkerLocationState()

    this.reloadAllChunks(game)

    // Animation: two planes perpendicular to the swap direction
    // The plane normal IS perpDir — naturally tilted for diagonal looks, flat for cardinal
    var proj = perpDir[0] * playerPosition[0] + perpDir[1] * playerPosition[1] + perpDir[2] * playerPosition[2];
    var lowEdge = Math.floor(proj);
    var highEdge = Math.ceil(proj);
    if (highEdge === lowEdge) highEdge = lowEdge + 1;

    // Tangent vectors spanning the plane surface
    var tangent1, tangent2;
    if (isVertical) {
        tangent1 = [1, 0, 0];
        tangent2 = [0, 0, 1];
    } else {
        tangent1 = [perpDir[2], 0, -perpDir[0]]; // horizontal perp (= look direction)
        tangent2 = [0, 1, 0]; // vertical
    }

    var now = Date.now();
    this.activePlanes = [
        { normal: perpDir, tangent1: tangent1, tangent2: tangent2, origin: playerPosition.slice(), dist: lowEdge,  direction: -1, startTime: now },
        { normal: perpDir, tangent1: tangent1, tangent2: tangent2, origin: playerPosition.slice(), dist: highEdge, direction: +1, startTime: now },
    ];
}

Voxel4D.prototype.dimensionIncrement = function (increment) {

    // Record locally
    this.location.dimensionIncrement(increment)
    // Sync to worker
    this.syncWorkerLocationState()

    this.reloadAllChunks(game)
}

Voxel4D.prototype.reloadAllChunks = function () {
    var self = this

    // Stop processing any chunks that are queued
    this.worker.postMessage({cmd: 'discardQueuedChunkGeneration'})

    // Reload all existing chunks
    const playerChunkPosition = this.game.playerPosition()
        .map(function (pos) {
            return pos / self.game.chunkSize
        })
    Object.values(this.game.voxels.chunks)
        .sort(function (a, b) {
            // Load nearby chunks first
            return Math.sqrt(
                Math.pow(a.position[0] - playerChunkPosition[0], 2) +
                Math.pow(a.position[1] - playerChunkPosition[1], 2) +
                Math.pow(a.position[2] - playerChunkPosition[2], 2)
            ) - Math.sqrt(
                Math.pow(b.position[0] - playerChunkPosition[0], 2) +
                Math.pow(b.position[1] - playerChunkPosition[1], 2) +
                Math.pow(b.position[2] - playerChunkPosition[2], 2)
            )
        })
        .forEach(function (chunk) {
            self.missingChunk(chunk.position)
        })

    // If you spam reloading chunks, sometimes far away chunks never get loaded
    // Request missing chunks around player just in case
    this.game.voxels.requestMissingChunks(this.game.playerPosition())
}

var planeModelMatrix = mat4.create();

/**
 * Generate 6 vertices (2 triangles) for a plane defined by normal/tangent vectors.
 * center = origin + (dist - projOrigin) * normal, where projOrigin = dot(origin, normal)
 * corners = center ± half * tangent1 ± half * tangent2
 */
function makePlaneVertices(normal, tangent1, tangent2, dist, origin, half) {
    var projOrigin = normal[0] * origin[0] + normal[1] * origin[1] + normal[2] * origin[2];
    var d = dist - projOrigin;
    var cx = origin[0] + d * normal[0];
    var cy = origin[1] + d * normal[1];
    var cz = origin[2] + d * normal[2];

    var corners = [];
    var signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (var c = 0; c < 4; c++) {
        var s1 = signs[c][0], s2 = signs[c][1];
        corners.push([
            cx + s1 * half * tangent1[0] + s2 * half * tangent2[0],
            cy + s1 * half * tangent1[1] + s2 * half * tangent2[1],
            cz + s1 * half * tangent1[2] + s2 * half * tangent2[2],
        ]);
    }

    return new Float32Array([
        corners[0][0], corners[0][1], corners[0][2],
        corners[1][0], corners[1][1], corners[1][2],
        corners[2][0], corners[2][1], corners[2][2],
        corners[0][0], corners[0][1], corners[0][2],
        corners[2][0], corners[2][1], corners[2][2],
        corners[3][0], corners[3][1], corners[3][2],
    ]);
}

Voxel4D.prototype.glInit = function () {
    var gl = this.game.shell.gl;
    this.planeShader = glShader(gl,
        glslify("/* voxel-4d plane vertex shader */\
attribute vec3 position;\
uniform mat4 projection;\
uniform mat4 view;\
uniform mat4 model;\
void main() {\
  gl_Position = projection * view * model * vec4(position, 1.0);\
}", {inline: true}),
        glslify("/* voxel-4d plane fragment shader */\
precision highp float;\
uniform vec4 color;\
void main() {\
  gl_FragColor = color;\
}", {inline: true}));

    // Full-screen overlay shader (clip space, no matrices)
    this.overlayShader = glShader(gl,
        glslify("/* voxel-4d overlay vertex shader */\
attribute vec2 position;\
void main() {\
  gl_Position = vec4(position, 0.0, 1.0);\
}", {inline: true}),
        glslify("/* voxel-4d overlay fragment shader */\
precision highp float;\
uniform vec4 color;\
void main() {\
  gl_FragColor = color;\
}", {inline: true}));

    // Pre-create the full-screen quad (clip space -1..1)
    this.overlayBuf = createBuffer(gl, new Float32Array([
        -1, -1,  1, -1,  1, 1,
        -1, -1,  1,  1, -1, 1,
    ]));
    this.overlayVao = createVAO(gl, [{buffer: this.overlayBuf, size: 2}]);

    this.planeGlInited = true;
}

Voxel4D.prototype.glRender = function () {
    if (!this.planeGlInited || this.activePlanes.length === 0) return;

    var now = Date.now();
    var duration = 1.5; // seconds
    var expRate = 3.0;  // exponential growth rate for movement
    var half = 50;
    var gl = this.game.shell.gl;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    this.planeShader.bind();
    this.planeShader.attributes.position.location = 0;
    this.planeShader.uniforms.projection = this.shaderPlugin.projectionMatrix;
    this.planeShader.uniforms.view = this.shaderPlugin.viewMatrix;
    mat4.identity(planeModelMatrix);
    this.planeShader.uniforms.model = planeModelMatrix;

    var stillAlive = [];
    var overlayOpacity = 0;
    for (var i = 0; i < this.activePlanes.length; i++) {
        var plane = this.activePlanes[i];
        var elapsed = (now - plane.startTime) / 1000;

        if (elapsed >= duration) continue;
        stillAlive.push(plane);

        var t = elapsed / duration; // 0..1
        // Start fully opaque, then fade out
        var opacity = 1.0 - t;
        // Exponential movement: starts slow, accelerates fast
        var offset = plane.direction * (Math.exp(expRate * t) - 1);
        var dist = plane.dist + offset;

        var vertices = makePlaneVertices(
            plane.normal, plane.tangent1, plane.tangent2, dist, plane.origin, half
        );

        var vertBuf = createBuffer(gl, vertices);
        var vao = createVAO(gl, [{buffer: vertBuf, size: 3}]);

        this.planeShader.uniforms.color = [0.2, 0.4, 1.0, opacity];
        vao.bind();
        vao.draw(gl.TRIANGLES, 6);
        vao.unbind();
        vao.dispose();
        vertBuf.dispose();

        // Check if player has crossed past this plane
        var playerPos = this.game.playerPosition();
        var playerProj = plane.normal[0] * playerPos[0] + plane.normal[1] * playerPos[1] + plane.normal[2] * playerPos[2];
        var crossed = plane.direction > 0
            ? playerProj > dist
            : playerProj < dist;
        if (crossed && opacity > overlayOpacity) {
            overlayOpacity = opacity;
        }
    }

    // Draw full-screen blur overlay if player has crossed a plane
    if (overlayOpacity > 0) {
        this.overlayShader.bind();
        this.overlayShader.attributes.position.location = 0;
        this.overlayShader.uniforms.color = [0.2, 0.4, 1.0, overlayOpacity];
        this.overlayVao.bind();
        this.overlayVao.draw(gl.TRIANGLES, 6);
        this.overlayVao.unbind();
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);

    this.activePlanes = stillAlive;
}
