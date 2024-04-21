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

VoxelMultiplayerEntities.prototype.init = function () {
    this.glInited = true;
    this.shader = glShader(this.game.shell.gl,
        glslify("/* voxel-decals vertex shader */\
attribute vec3 position;\
attribute vec2 uv;\
\
uniform mat4 projection;\
uniform mat4 view;\
uniform mat4 model;\
varying vec2 vUv;\
\
void main() {\
  gl_Position = projection * view * model * vec4(position, 1.0);\
  vUv = uv;\
}", {inline: true}),

        glslify("/* voxel-decals fragment shader */\
precision highp float;\
\
uniform sampler2D texture;\
varying vec2 vUv;\
\
void main() {\
  gl_FragColor = texture2D(texture, vUv);\
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

    // texturing (textures loaded from voxel-stitch updateTexture event)
    var tileUV = self.stitchPlugin.getTextureUV('glass_green');
    if (!tileUV) throw new Error('failed to load decal texture');

    Object.values(this.entities).forEach(function (entity) {
        const positionXyz = self.voxel4d.location.pUntransformerWithShift(entity.position[0], entity.position[1], entity.position[2], entity.position[3]);
        if (!positionXyz) {
            return // this entity is in another dimension
        }

        const cube = getCube(positionXyz);

        vertices = vertices.concat(cube);

        // cover the texture tile over the two triangles forming a flat plane
        var planeUV = [
            tileUV[3],
            tileUV[0],
            tileUV[1],
            tileUV[2],
        ];

        for (let i = 0; i < 6; i++) {
            const r = (i === 0 || i === 3 || i === 5) ? 0 : 3

            uvArray.push(planeUV[(0 + r) % 4][0]);
            uvArray.push(planeUV[(0 + r) % 4][1]);
            uvArray.push(planeUV[(1 + r) % 4][0]);
            uvArray.push(planeUV[(1 + r) % 4][1]);
            uvArray.push(planeUV[(2 + r) % 4][0]);
            uvArray.push(planeUV[(2 + r) % 4][1]);

            uvArray.push(planeUV[(0 + r) % 4][0]);
            uvArray.push(planeUV[(0 + r) % 4][1]);
            uvArray.push(planeUV[(2 + r) % 4][0]);
            uvArray.push(planeUV[(2 + r) % 4][1]);
            uvArray.push(planeUV[(3 + r) % 4][0]);
            uvArray.push(planeUV[(3 + r) % 4][1]);
        }
    })

    var uv = new Float32Array(uvArray);

    var gl = this.game.shell.gl;

    var verticesBuf = createBuffer(gl, new Float32Array(vertices));
    var uvBuf = createBuffer(gl, uv);

    this.mesh = createVAO(gl, [
        {
            buffer: verticesBuf,
            size: 3
        },
        {
            buffer: uvBuf,
            size: 2
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

    this.shader.bind();
    this.shader.attributes.position.location = 0;
    this.shader.attributes.uv.location = 1;
    this.shader.uniforms.projection = this.shaderPlugin.projectionMatrix;
    this.shader.uniforms.view = this.shaderPlugin.viewMatrix;
    this.shader.uniforms.model = scratch0;

    if (this.stitchPlugin.texture) this.shader.uniforms.texture = this.stitchPlugin.texture.bind();

    this.mesh.bind();
    this.mesh.draw(gl.TRIANGLES, this.mesh.length);
    this.mesh.unbind();
}

function getCube(position) {
    const x = position[0];
    const y = position[1];
    const z = position[2];

    return [
        // Back face
        x, y, z + 1,
        x + 1, y, z + 1,
        x + 1, y + 1, z + 1,
        x, y, z + 1,
        x + 1, y + 1, z + 1,
        x, y + 1, z + 1,
        // Front face
        x, y, z,
        x, y + 1, z,
        x + 1, y + 1, z,
        x, y, z,
        x + 1, y + 1, z,
        x + 1, y, z,
        // Top face
        x, y + 1, z,
        x, y + 1, z + 1,
        x + 1, y + 1, z + 1,
        x, y + 1, z,
        x + 1, y + 1, z + 1,
        x + 1, y + 1, z,
        // Bottom face
        x, y, z,
        x + 1, y, z,
        x + 1, y, z + 1,
        x, y, z,
        x + 1, y, z + 1,
        x, y, z + 1,
        // Left face
        x + 1, y, z,
        x + 1, y + 1, z,
        x + 1, y + 1, z + 1,
        x + 1, y, z,
        x + 1, y + 1, z + 1,
        x + 1, y, z + 1,
        // Right face
        x, y, z,
        x, y, z + 1,
        x, y + 1, z + 1,
        x, y, z,
        x, y + 1, z + 1,
        x, y + 1, z,
    ]
}