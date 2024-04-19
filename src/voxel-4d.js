'use strict';

const ndarray = require('ndarray');
const terrain = require("./voxel-perlin-terrain");

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

    /**
     * Keeps track of which axes are visible.
     * <p>
     * e.g. value of [x, y, w] means that z-axis is now the w-axis.
     *
     * @type {string[]}
     */
    this.currentPlaneAxis = ['x', 'y', 'z'];
    /**
     * Non-visible axis.
     * <p>
     * This is the missing axis from currentPlaneAxis. It is not currently shown and is always constant unless swapped again.
     * @type {string}
     */
    this.otherPlaneAxis = 'w';
    /**
     * Offsets to apply to x,y,z,w axes.
     * <p>
     * This is used to for properly aligning the world during axes swap. (Instead of moving the player)
     * @type {{x: number, y: number, z: number, w: number}}
     */
    this.offsets = {
        x: 0,
        y: 0,
        z: 0,
        w: 0
    }
    /**
     * Added or deleted blocks, indexed by chunk position then block index
     * @type {{[xzwKey]: {[y]: number}}} Given position of x-z-w axis, returns an object where given y-axis, gives the material number
     */
    this.blocks = {}

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

    this.generateChunk = terrain(
        this.game,
        'foo',
        blockGrass,
        blockObsidian,
        blockDirt)

    // Chunk loading
    this.game.voxels.on('missingChunk', this.onMissingChunk = this.missingChunk.bind(this));

    // Keep track of added/deleted blocks
    this.game.on('setBlock', this.onSetBlock = this.setBlock.bind(this));

    // Key bindings
    this.keys.down.on('dimension axis switch', this.onDimensionAxisSwitch = this.onPressChangeAxis.bind(this));
    this.keys.down.on('dimension increment', this.onDimensionIncrement = function () {
        self.onPressConstantIncrement(+1)
    });
    this.keys.down.on('dimension decrement', this.onDimensionDecrement = function () {
        self.onPressConstantIncrement(-1)
    });
};

Voxel4D.prototype.disable = function () {
    this.game.removeListener('setBlock', this.onSetBlock);
    this.game.voxels.removeListener('missingChunk', this.onMissingChunk);
    this.keys.down.removeListener('dimension axis switch', this.onDimensionAxisSwitch);
    this.keys.down.removeListener('dimension increment', this.onDimensionIncrement);
    this.keys.down.removeListener('dimension decrement', this.onDimensionDecrement);
};

// API

Voxel4D.prototype.setBlock = function (pos, val, old) {
    const pTransformed = this.pTransformer(pos[0], pos[1], pos[2])
    const key = pTransformed.join('|')
    this.blocks[key] = val
};

Voxel4D.prototype.getBlockModified = function (pTransformed) {
    return this.blocks[pTransformed.join('|')]
};

Voxel4D.prototype.missingChunk = function (position) {
    var width = this.game.chunkSize;
    var pad = this.game.chunkPad;
    var arrayType = this.game.arrayType;
    const voxelsPadded = ndarray(
        new arrayType(new ArrayBuffer((width + pad) * (width + pad) * (width + pad) * arrayType.BYTES_PER_ELEMENT)),
        [width + pad, width + pad, width + pad])
    var h = pad >> 1;
    var voxels = voxelsPadded.lo(h, h, h).hi(width, width, width);

    this.generateChunk(voxels, position, width, this.pTransformer.bind(this), this.getBlockModified.bind(this))

    const chunk = voxelsPadded
    chunk.position = position
    this.game.showChunk(chunk)
}

Voxel4D.prototype.onPressChangeAxis = function () {
    const playerPosition = this.game.playerPosition()

    // Figure out which axis to swap
    const yaw = this.game.controls.target().yaw.rotation.y
    const pitch = this.game.controls.target().pitch.rotation.x
    const facingAxis = this.getLookDirection(yaw, pitch)
    const swapAxis = facingAxis === 'y' ? 'y' : (facingAxis === 'x' ? 'z' : 'x')

    // Show blue planes
    // TODO convert from THREEJS to webgl
    // showPlane(this.game, facingAxis, 'left', playerPosition)
    // showPlane(this.game, facingAxis, 'right', playerPosition)

    // Swap axis values first
    const swapVirtualAxisFrom = this.currentPlaneAxis[xyzwAxisToIndex[swapAxis]]
    const swapVirtualAxisTo = this.otherPlaneAxis
    const swapAxisPlayerPosition = Math.floor(playerPosition[xyzwAxisToIndex[swapAxis]])
    this.offsets[swapVirtualAxisFrom] += swapAxisPlayerPosition
    this.offsets[swapVirtualAxisTo] -= swapAxisPlayerPosition

    // Swap axis
    let tempAxis = this.otherPlaneAxis;
    this.otherPlaneAxis = this.currentPlaneAxis[xyzwAxisToIndex[swapAxis]];
    this.currentPlaneAxis[xyzwAxisToIndex[swapAxis]] = tempAxis;

    this.reloadAllChunks()

    // Set block underneath the player
    // let blockUnderneathPlayerPosition = [playerPosition[0], playerPosition[1] - 1, playerPosition[2]];
    // while (blockUnderneathPlayerPosition[1] > -10 && game.getBlock(blockUnderneathPlayerPosition) === 0) {
    //     // Keep looking for a block
    //     blockUnderneathPlayerPosition[1] -= 1;
    // }
    // game.setBlock(blockUnderneathPlayerPosition, 2)
}

Voxel4D.prototype.onPressConstantIncrement = function (increment) {

    this.offsets[this.otherPlaneAxis] += increment

    this.reloadAllChunks(game)
}

Voxel4D.prototype.reloadAllChunks = function () {
    var self = this
    Object.values(this.game.voxels.chunks).forEach(function (chunk) {
        // TODO try out emit to see if performance improves
        // game.voxels.emit('missingChunk', chunk.position)
        self.missingChunk(chunk.position)
    })
}

Voxel4D.prototype.showPlane = function (facingAxis, moveDirection, playerPosition) {
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

const xyzwAxisToIndex = {
    x: 0,
    y: 1,
    z: 2,
    w: 3
}

Voxel4D.prototype.pTransformer = function (x, y, z) {
    const xyzwTransformed = [
        this.offsets.x,
        this.offsets.y,
        this.offsets.z,
        this.offsets.w,
    ];
    xyzwTransformed[xyzwAxisToIndex[this.currentPlaneAxis[0]]] += x
    xyzwTransformed[xyzwAxisToIndex[this.currentPlaneAxis[1]]] += y
    xyzwTransformed[xyzwAxisToIndex[this.currentPlaneAxis[2]]] += z
    return xyzwTransformed
}
