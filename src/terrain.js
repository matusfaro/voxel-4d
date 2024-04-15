var terrain = require('./voxel-perlin-terrain')

const chunkSize = 16
exports.chunkSize = chunkSize

/**
 * Keeps track of which axes are visible.
 * <p>
 * e.g. value of [x, y, w] means that z-axis is now the w-axis.
 *
 * @type {string[]}
 */
var currentPlaneAxis = ['x', 'y', 'z'];
/**
 * Non-visible axis.
 * <p>
 * This is the missing axis from currentPlaneAxis. It is not currently shown and is always constant unless swapped again.
 * @type {string}
 */
var otherPlaneAxis = 'w';
/**
 * Offsets to apply to x,z,w axes.
 * <p>
 * This is used to for properly aligning the world during axes swap. (Instead of moving the player)
 * @type {{w: number, x: number, z: number}}
 */
var offsets = {
    x: 0,
    y: 0,
    z: 0,
    w: 0
}
/**
 * Added or deleted blocks, indexed by chunk position then block index
 * @type {{[xzwKey]: {[y]: number}}} Given position of x-z-w axis, returns an object where given y-axis, gives the material number
 */
var blocks = {}

// Init terrain generator
var generateChunk = terrain('foo')

exports.use = function (game) {

    // Chunk loading
    game.voxels.on('missingChunk', function (p) {
        onMissingChunk(game, p)
    })

    // Keep track of added/deleted blocks
    game.on('setBlock', function (pos, val, old) {
        setBlockModified(pos, val)
    })

    // Toggle Axis change
    window.addEventListener('keydown', function (ev) {
        if (ev.keyCode === 'E'.charCodeAt(0)) onPressChangeAxis(game)
        if (ev.keyCode === 'R'.charCodeAt(0)) onPressConstantIncrement(game, +1)
        if (ev.keyCode === 'F'.charCodeAt(0)) onPressConstantIncrement(game, -1)
    })
}

function setBlockModified(pos, val) {
    const pTransformed = pTransformer(pos[0], pos[1], pos[2])
    const key = pTransformed.join('|')
    blocks[key] = val
}

exports.setBlockModified = setBlockModified

function getBlockModified(pTransformed) {
    return blocks[pTransformed.join('|')]
}

exports.getBlockModified = getBlockModified

function onMissingChunk(game, p) {

    // Generate chunk
    var voxels = generateChunk(game, p, chunkSize, pTransformer, getBlockModified)
    var chunk = {
        position: p,
        dims: [chunkSize, chunkSize, chunkSize],
        voxels: voxels
    }
    game.showChunk(chunk)
}

function onPressChangeAxis(game) {
    const playerPosition = game.playerPosition()

    // Figure out which axis to swap
    const yaw = game.controls.target().yaw.rotation.y
    const pitch = game.controls.target().pitch.rotation.x
    const facingAxis = getLookDirection(yaw, pitch)
    const swapAxis = facingAxis === 'y' ? 'y' : (facingAxis === 'x' ? 'z' : 'x')

    // Show blue planes
    showPlane(game, facingAxis, 'left', playerPosition)
    showPlane(game, facingAxis, 'right', playerPosition)

    // Swap axis values first
    const swapVirtualAxisFrom = currentPlaneAxis[xyzwAxisToIndex[swapAxis]]
    const swapVirtualAxisTo = otherPlaneAxis
    const swapAxisPlayerPosition = Math.floor(playerPosition[xyzwAxisToIndex[swapAxis]])
    offsets[swapVirtualAxisFrom] += swapAxisPlayerPosition
    offsets[swapVirtualAxisTo] -= swapAxisPlayerPosition

    // Swap axis
    let tempAxis = otherPlaneAxis;
    otherPlaneAxis = currentPlaneAxis[xyzwAxisToIndex[swapAxis]];
    currentPlaneAxis[xyzwAxisToIndex[swapAxis]] = tempAxis;

    reloadAllChunks(game)

    // Set block underneath the player
    // let blockUnderneathPlayerPosition = [playerPosition[0], playerPosition[1] - 1, playerPosition[2]];
    // while (blockUnderneathPlayerPosition[1] > -10 && game.getBlock(blockUnderneathPlayerPosition) === 0) {
    //     // Keep looking for a block
    //     blockUnderneathPlayerPosition[1] -= 1;
    // }
    // game.setBlock(blockUnderneathPlayerPosition, 2)
}

function onPressConstantIncrement(game, increment) {

    offsets[otherPlaneAxis] += increment

    reloadAllChunks(game)
}

function reloadAllChunks(game) {
    Object.values(game.voxels.chunks).forEach(function (chunk) {
        // TODO try out emit to see if performance improves
        // game.voxels.emit('missingChunk', chunk.position)
        onMissingChunk(game, chunk.position)
    })
}

function showPlane(game, facingAxis, moveDirection, playerPosition) {
    const THREE = game.THREE
    const scene = game.scene

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
    const planeAabb = game.playerAABB(position);
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
            game.removeListener('tick', onTick)
            scene.remove(plane);
        }
    }
    game.on('tick', onTick)
}

function getLookDirection(yaw, pitch) {
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

function pTransformer(x, y, z) {
    const xyzwTransformed = [
        offsets.x,
        offsets.y,
        offsets.z,
        offsets.w,
    ];
    xyzwTransformed[xyzwAxisToIndex[currentPlaneAxis[0]]] += x
    xyzwTransformed[xyzwAxisToIndex[currentPlaneAxis[1]]] += y
    xyzwTransformed[xyzwAxisToIndex[currentPlaneAxis[2]]] += z
    return xyzwTransformed
}

exports.pTransformer = pTransformer
