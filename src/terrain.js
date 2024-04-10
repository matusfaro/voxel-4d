var terrain = require('./voxel-perlin-terrain')

var chunkSize = 32

var currentPlaneAxis = ['x', 'z'];
var otherPlaneAxis = 'w';
var offsets = {
    x: 0,
    z: 0,
    w: 0
}

// initialize your noise with a seed, floor height, ceiling height and scale factor
var generateChunk = terrain('foo')

function onMissingChunk(game, p) {

    // Generate chunk
    var voxels = generateChunk(p, chunkSize, getPTransformer())
    var chunk = {
        position: p,
        dims: [chunkSize, chunkSize, chunkSize],
        voxels: voxels
    }
    game.showChunk(chunk)
}

exports.onMissingChunk = onMissingChunk

exports.onPressChange = function (game) {
    const playerPosition = game.playerPosition()

    // Figure out which axis to swap
    const yaw = game.controls.target().yaw.rotation.y
    const facingAxis = getCardinalDirection(yaw)
    const swapAxis = facingAxis === 'x' ? 'z' : 'x'

    // Swap axis values first
    const swapVirtualAxisFrom = currentPlaneAxis[swapAxis === 'x' ? 0 : 1]
    const swapVirtualAxisTo = otherPlaneAxis
    const swapAxisPlayerPosition = Math.floor(playerPosition[swapAxis === 'x' ? 0 : 2])
    offsets[swapVirtualAxisFrom] += swapAxisPlayerPosition
    offsets[swapVirtualAxisTo] -= swapAxisPlayerPosition
    console.log('offsets', offsets)

    // Swap axis
    let tempAxis = otherPlaneAxis;
    otherPlaneAxis = currentPlaneAxis[swapAxis === 'x' ? 0 : 1];
    currentPlaneAxis[swapAxis === 'x' ? 0 : 1] = tempAxis;
    console.log('currentPlaneAxis', currentPlaneAxis)

    // Reload all chunks
    Object.values(game.voxels.chunks).forEach(function (chunk) {
        // TODO try out emit to see if performance improves
        // game.voxels.emit('missingChunk', chunk.position)
        onMissingChunk(game, chunk.position)
    })

    // Set block underneath the player
    let blockUnderneathPlayerPosition = [playerPosition[0], playerPosition[1] - 1, playerPosition[2]];
    while (blockUnderneathPlayerPosition[1] > -10 && game.getBlock(blockUnderneathPlayerPosition) === 0) {
        // Keep looking for a block
        blockUnderneathPlayerPosition[1] -= 1;
    }
    game.setBlock(blockUnderneathPlayerPosition, 2)

    // Show blue planes
    showPlane(game, facingAxis, 'left', playerPosition)
    showPlane(game, facingAxis, 'right', playerPosition)
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

function getCardinalDirection(yaw) {
    const normalizedYaw = (yaw + (2 * Math.PI)) % (2 * Math.PI);
    return Math.abs(Math.sin(normalizedYaw)) > Math.abs(Math.cos(normalizedYaw))
        // East/West
        ? 'x'
        // North/South
        : 'z'
}

function getPTransformer() {
    return function (x, z) {
        const xzwTransformed = [
            offsets.x,
            offsets.z,
            offsets.w,
        ];
        xzwTransformed[currentPlaneAxisToIndex(currentPlaneAxis[0])] += x
        xzwTransformed[currentPlaneAxisToIndex(currentPlaneAxis[1])] += z
        return xzwTransformed
    }
}

function currentPlaneAxisToIndex(axis) {
    if (axis === 'x') {
        return 0
    } else if (axis === 'z') {
        return 1
    } else if (axis === 'w') {
        return 2
    }
}

function axisToIndex(axis) {
    if (axis === 'x') {
        return 0
    } else if (axis === 'y') {
        return 1
    } else if (axis === 'z') {
        return 2
    }
}