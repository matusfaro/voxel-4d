var createBuffer = require('gl-buffer');
var createVAO = require('gl-vao');
var glShader = require('gl-shader');
var glslify = require('glslify');
var mat4 = require('gl-mat4');

module.exports = function (game, x, y, z) {
    return new VoxelMultiplayerEntities(game, x, y, z);
};
module.exports.pluginInfo = {
    loadAfter: [
        'voxel-4d',
        'voxel-mesher',
        'voxel-shader',
        'voxel-stitch',
    ]
};

function VoxelMultiplayerEntities(game) {
    this.game = game
    this.entities = {}
    this.localMapId = 0  // which map the local player is viewing; set by voxel-multiplayer

    this.voxel4d = game.plugins.get('voxel-4d');
    if (!this.voxel4d) throw new Error('voxel-multiplayer-entities requires voxel-4d plugin');

    this.mesherPlugin = game.plugins.get('voxel-mesher');
    if (!this.mesherPlugin) throw new Error('voxel-multiplayer-entities requires voxel-mesher');

    this.shaderPlugin = game.plugins.get('voxel-shader');
    if (!this.shaderPlugin) throw new Error('voxel-multiplayer-entities requires voxel-shader');

    this.stitchPlugin = game.plugins.get('voxel-stitch');
    if (!this.stitchPlugin) throw new Error('voxel-multiplayer-entities requires voxel-stitch');

    this.enable();
}

VoxelMultiplayerEntities.prototype.enable = function () {
    this.game.shell.on("gl-init", this.init.bind(this));
    this.game.shell.on("gl-render", this.onRender = this.render.bind(this));
    this.stitchPlugin.on('updateTexture', this.onUpdateTexture = this.updateTexture.bind(this));
}

VoxelMultiplayerEntities.prototype.disable = function () {
    this.game.shell.removeListener("gl-render", this.onRender);
    this.stitchPlugin.removeListener('updateTexture', this.onUpdateTexture);
}

VoxelMultiplayerEntities.prototype.addEntity = function (key, entity) {
    this.entities[key] = entity
}

VoxelMultiplayerEntities.prototype.getEntity = function (key) {
    return this.entities[key]
}

VoxelMultiplayerEntities.prototype.removeEntity = function (key) {
    delete this.entities[key]
}

VoxelMultiplayerEntities.prototype.removeAllEntities = function () {
    this.entities = {}
}

// Peers on a different map are hidden in-world (they're still listed in the HUD).
VoxelMultiplayerEntities.prototype.setLocalMapId = function (mapId) {
    this.localMapId = mapId
}

VoxelMultiplayerEntities.prototype.init = function () {
    this.glInited = true;
    this.shader = glShader(this.game.shell.gl,
        glslify("/* voxel-decals vertex shader */\
attribute vec3 position;\
attribute vec2 uv;\
attribute float alpha;\
\
uniform mat4 projection;\
uniform mat4 view;\
uniform mat4 model;\
varying vec2 vUv;\
varying float vAlpha;\
\
void main() {\
  gl_Position = projection * view * model * vec4(position, 1.0);\
  vUv = uv;\
  vAlpha = alpha;\
}", {inline: true}),

        glslify("/* voxel-decals fragment shader */\
precision highp float;\
\
uniform sampler2D texture;\
varying vec2 vUv;\
varying float vAlpha;\
\
void main() {\
  vec4 texColor = texture2D(texture, vUv);\
  gl_FragColor = vec4(texColor.rgb, texColor.a * vAlpha);\
}", {inline: true}));
}

VoxelMultiplayerEntities.prototype.updateTexture = function () {
    this.stitchLoaded = true;
    this.update()
}

VoxelMultiplayerEntities.prototype.update = function () {
    const self = this

    if (!this.stitchLoaded) {
        return
    }

    var vertices = [];
    var uvArray = [];
    var alphaArray = [];

    Object.values(this.entities).forEach(function (entity) {
        if (entity.mapId !== undefined && entity.mapId !== self.localMapId) {
            return // this entity is in another map/world
        }
        const positionXyzw = entity.getPosition()
        const result = self.voxel4d.location.pUntransformerWithShift(positionXyzw[0], positionXyzw[1], positionXyzw[2], positionXyzw[3]);
        if (!result) {
            return // this entity is in another dimension
        }
        var positionXyz = result;
        var hiddenDist = result[3]; // absolute hidden component distance

        // Fade: 1.0 within ±1 block, linear fade to 0.5 at ±2 blocks, 0.5 beyond
        var entityAlpha;
        if (hiddenDist <= 1) {
            entityAlpha = 1.0;
        } else if (hiddenDist <= 2) {
            entityAlpha = 1.0 - 0.5 * (hiddenDist - 1);
        } else {
            entityAlpha = 0.5;
        }

        // texturing (textures loaded from voxel-stitch updateTexture event)
        var tileUV = self.stitchPlugin.getTextureUV(`glass_${entity.getColor()}`);
        if (!tileUV) throw new Error('failed to load decal texture');

        // Turn the body to face its movement direction. Heading is derived from
        // the rendered (local-slice) position delta so it's already in the
        // viewer's frame; tiny movements keep the previous heading.
        if (entity.renderX !== undefined) {
            var ddx = positionXyz[0] - entity.renderX;
            var ddz = positionXyz[2] - entity.renderZ;
            if (ddx * ddx + ddz * ddz > 0.0004) entity.renderYaw = Math.atan2(ddx, ddz);
        }
        entity.renderX = positionXyz[0];
        entity.renderZ = positionXyz[2];
        var yaw = entity.renderYaw || 0;
        var cos = Math.cos(yaw), sin = Math.sin(yaw);

        // Build a humanoid (head, torso, two arms, two legs) from boxes instead
        // of a single cube. All parts share the player's colour tile and alpha.
        for (var pi = 0; pi < PERSON_PARTS.length; pi++) {
            pushBox(vertices, uvArray, alphaArray, PERSON_PARTS[pi],
                positionXyz[0], positionXyz[1], positionXyz[2], cos, sin, tileUV, entityAlpha);
        }
    })

    var uv = new Float32Array(uvArray);

    var gl = this.game.shell.gl;

    var verticesBuf = createBuffer(gl, new Float32Array(vertices));
    var uvBuf = createBuffer(gl, uv);
    var alphaBuf = createBuffer(gl, new Float32Array(alphaArray));

    this.mesh = createVAO(gl, [
        {
            buffer: verticesBuf,
            size: 3
        },
        {
            buffer: uvBuf,
            size: 2
        },
        {
            buffer: alphaBuf,
            size: 1
        }
    ]);
    this.mesh.length = vertices.length / 3;
};

var scratch0 = mat4.create();

VoxelMultiplayerEntities.prototype.render = function (deltaTime) {
    if (!this.mesh || !this.glInited) {
        return
    }

    const gl = this.game.shell.gl;

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    this.shader.bind();
    this.shader.attributes.position.location = 0;
    this.shader.attributes.uv.location = 1;
    this.shader.attributes.alpha.location = 2;
    this.shader.uniforms.projection = this.shaderPlugin.projectionMatrix;
    this.shader.uniforms.view = this.shaderPlugin.viewMatrix;
    this.shader.uniforms.model = scratch0;

    if (this.stitchPlugin.texture) this.shader.uniforms.texture = this.stitchPlugin.texture.bind();

    this.mesh.bind();
    this.mesh.draw(gl.TRIANGLES, this.mesh.length);
    this.mesh.unbind();

    gl.disable(gl.BLEND);
}

// A humanoid avatar, as boxes in person-local space: feet centred at the origin,
// +y up, +z the direction the body faces. [x0,y0,z0, sx,sy,sz] per part.
var PERSON_PARTS = [
    [-0.22, 0.00, -0.11, 0.20, 0.72, 0.22],  // left leg
    [ 0.02, 0.00, -0.11, 0.20, 0.72, 0.22],  // right leg
    [-0.25, 0.72, -0.13, 0.50, 0.60, 0.26],  // torso
    [-0.44, 0.70, -0.11, 0.18, 0.60, 0.22],  // left arm
    [ 0.26, 0.70, -0.11, 0.18, 0.60, 0.22],  // right arm
    [-0.25, 1.34, -0.25, 0.50, 0.50, 0.50],  // head
];

// Append one box (part) to the geometry buffers: 36 vertices (6 faces) rotated by
// yaw around the vertical axis and translated to the avatar's world position,
// with the colour tile mapped onto each face and a uniform per-vertex alpha.
function pushBox(vertices, uvArray, alphaArray, part, px, py, pz, cos, sin, tileUV, alpha) {
    var local = boxVertices(part[0], part[1], part[2], part[3], part[4], part[5]);
    for (var i = 0; i < local.length; i += 3) {
        var lx = local[i], ly = local[i + 1], lz = local[i + 2];
        vertices.push(px + lx * cos + lz * sin, py + ly, pz - lx * sin + lz * cos);
        alphaArray.push(alpha);
    }
    pushBoxUV(uvArray, tileUV);
}

// 36 vertices (Back, Front, Top, Bottom, Left, Right — same face order the UV
// mapping expects) for the box [x0,x0+sx] x [y0,y0+sy] x [z0,z0+sz].
function boxVertices(x0, y0, z0, sx, sy, sz) {
    var x1 = x0 + sx, y1 = y0 + sy, z1 = z0 + sz;
    return [
        x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y0, z1, x1, y1, z1, x0, y1, z1, // back
        x0, y0, z0, x0, y1, z0, x1, y1, z0, x0, y0, z0, x1, y1, z0, x1, y0, z0, // front
        x0, y1, z0, x0, y1, z1, x1, y1, z1, x0, y1, z0, x1, y1, z1, x1, y1, z0, // top
        x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z0, x1, y0, z1, x0, y0, z1, // bottom
        x1, y0, z0, x1, y1, z0, x1, y1, z1, x1, y0, z0, x1, y1, z1, x1, y0, z1, // left
        x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y0, z0, x0, y1, z1, x0, y1, z0, // right
    ];
}

// Map the colour tile across all six faces (two triangles each), matching the
// vertex order in boxVertices.
function pushBoxUV(uvArray, tileUV) {
    var planeUV = [tileUV[3], tileUV[0], tileUV[1], tileUV[2]];
    for (var i = 0; i < 6; i++) {
        var r = (i === 0 || i === 3 || i === 5) ? 0 : 3;
        uvArray.push(
            planeUV[(0 + r) % 4][0], planeUV[(0 + r) % 4][1],
            planeUV[(1 + r) % 4][0], planeUV[(1 + r) % 4][1],
            planeUV[(2 + r) % 4][0], planeUV[(2 + r) % 4][1],
            planeUV[(0 + r) % 4][0], planeUV[(0 + r) % 4][1],
            planeUV[(2 + r) % 4][0], planeUV[(2 + r) % 4][1],
            planeUV[(3 + r) % 4][0], planeUV[(3 + r) % 4][1]
        );
    }
}