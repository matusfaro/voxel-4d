'use strict';

const webworkify = require('webworkify');
const unworkify = require('unworkify');
const ndarray = require('ndarray');
const Voxel4dLocation = require('./voxel-4d-location');

module.exports = function (game, opts) {
    return new Voxel4D(game, opts);
};

module.exports.pluginInfo = {
    loadAfter: [
        'voxel-registry',
        'voxel-keys'
    ],
};

function Voxel4D(game, opts) {
    this.game = game;

    this.registry = game.plugins.get('voxel-registry');
    if (!this.registry) throw new Error('voxel-4d requires voxel-registry plugin');
    this.keys = game.plugins.get('voxel-keys');
    if (!this.keys) throw new Error('voxel-4d requires voxel-keys plugin');

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
};

Voxel4D.prototype.disable = function () {
    this.game.removeListener('setBlock', this.onSetBlock);
    this.worker.removeListener('message', this.onWorkerMessage);
    this.game.voxels.removeListener('missingChunk', this.onMissingChunk);
    this.keys.down.removeListener('dimension axis switch', this.onDimensionAxisSwitch);
    this.keys.down.removeListener('dimension increment', this.onDimensionIncrement);
    this.keys.down.removeListener('dimension decrement', this.onDimensionDecrement);
};

// API

Voxel4D.prototype.workerMessage = function (event) {
    if (event.data.cmd === 'chunkGenerated') {
        this.chunkGenerated(event.data.position, event.data.voxelBuffer)
    } else {
        console.error('Unknown message from worker', event.data)
    }
};

Voxel4D.prototype.setBlock = function (position, value, old) {
    this.worker.postMessage({cmd: 'setBlock', position: position, value: value})
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

Voxel4D.prototype.dimensionAxisSwitch = function () {

    // Figure out which axis to swap
    const playerPosition = this.game.playerPosition()
    const yaw = this.game.controls.target().yaw.rotation.y
    const pitch = this.game.controls.target().pitch.rotation.x
    const facingAxis = this.getLookDirection(yaw, pitch)

    // Record locally
    this.location.dimensionAxisSwitch(facingAxis, playerPosition)
    // Record in worker
    this.worker.postMessage({cmd: 'dimensionAxisSwitch', facingAxis: facingAxis, playerPosition: playerPosition})

    this.reloadAllChunks(game)

    // Show blue planes
    // TODO convert from THREEJS to webgl
    // this.showPlane(this.game, facingAxis, 'left', playerPosition)
    // this.showPlane(this.game, facingAxis, 'right', playerPosition)
}

Voxel4D.prototype.dimensionIncrement = function (increment) {

    // Record locally
    this.location.dimensionIncrement(increment)
    // Record in worker
    this.worker.postMessage({cmd: 'dimensionIncrement', increment: increment})

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

Voxel4D.prototype.showPlane = function (facingAxis, moveDirection, playerPosition) {
    // TODO convert from THREEJS to webgl
    var self = this
    const THREE = this.game.THREE
    const scene = this.game.scene

    const geometry = new THREE.PlaneGeometry(100, 100);
    const material = new THREE.MeshBasicMaterial({
        color: 0x80ddff,
        transparent: true,
        side: THREE.DoubleSide,
        opacity: 1,
    });
    const plane = new THREE.Mesh(geometry, material);

    // Set position
    const alignFun = moveDirection === 'left' ? Math.floor : Math.ceil
    const position = [alignFun(playerPosition[0]), playerPosition[1], alignFun(playerPosition[2])]
    const planeAabb = this.game.playerAABB(position);
    plane.position.set(planeAabb.x0() + planeAabb.width() / 2, planeAabb.y0() + planeAabb.height() / 2, planeAabb.z0() + planeAabb.depth() / 2)
    // Set orientation
    if (facingAxis === 'z') {
        plane.rotation.y = Math.PI / 2;
    }
    // Render
    scene.add(plane);

    // Make it move and fade out over time
    var moveAmount = (moveDirection === 'left' ? -1 : 1) * 0.01
    const onTick = function () {

        // Move
        plane.position.set(
            plane.position.x + (facingAxis === 'z' ? moveAmount : 0),
            plane.position.y,
            plane.position.z + (facingAxis === 'x' ? moveAmount : 0))
        // Speed up movement
        moveAmount += moveAmount

        // Fade out
        material.opacity -= 0.05
        if (material.opacity < 0.01) {
            self.game.removeListener('tick', onTick)
            scene.remove(plane);
        }
    }
    this.game.on('tick', onTick)
}

Voxel4D.prototype.getLookDirection = function (yaw, pitch) {
    // Figure out if you're looking at the sun at a 45 degree or more angle
    const isLookingUp = Math.abs(Math.sin(pitch)) > 0.707
    if (isLookingUp) {
        // Up
        return 'y'
    }
    // Figure out yaw for cardinal direction
    const normalizedYaw = (yaw + (2 * Math.PI)) % (2 * Math.PI);
    return Math.abs(Math.sin(normalizedYaw)) > Math.abs(Math.cos(normalizedYaw))
        // East/West
        ? 'x'
        // North/South
        : 'z'
}
