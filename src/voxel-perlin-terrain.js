/**
 * license: BSD
 * https://github.com/max-mapper/voxel-perlin-terrain/blob/master/index.js
 */
var noise = require('perlin').noise

module.exports = function (seed) {
    let floor = 0
    let ceiling = 32
    let divisorClouds = 30
    let divisorMountains = 50
    let determineTexture = getDetermineTexture(ceiling, floor)
    noise.seed(seed)
    return function generateChunk(game, position, width, pTransformer, getBlockModified) {
        game.voxels.voxelAtPosition(position)
        var startX = position[0] * width
        var startY = position[1] * width
        var startZ = position[2] * width
        var chunk = new Int8Array(width * width * width)
        pointsInside(startX, startZ, width, function (x, z) {
            const pTransform = pTransformer(x, z)
            const xTransformed = pTransform[0]
            const zTransformed = pTransform[1]
            const wTransformed = pTransform[2]
            if (startY === width) {
                // Generate clouds
                let n = noise.perlin3(xTransformed / divisorClouds, zTransformed / divisorClouds, wTransformed / divisorMountains)
                if (n < -0.45) {
                    setBlock(chunk, x, startY, z, width, 4)
                }
            } else if (startY === 0) {
                // Generate mountains
                let n = noise.simplex3(xTransformed / divisorMountains, zTransformed / divisorMountains, wTransformed / divisorMountains)
                var y = ~~scale(n, -0.5, 0.5, floor + 1, ceiling)
                setMountain(chunk, x, y, z, wTransformed, width, startY, determineTexture)
            }

            // Apply any user modifications
            const blockOverrides = getBlockModified(pTransform)
            Object.entries(blockOverrides || {}).forEach(function (row) {
                const y = row[0]
                if (y < startY || y >= startY + width) return
                const val = row[1]
                setBlock(chunk, x, y, z, width, val)
            })
        })
        return chunk
    }
}

function getDetermineTexture(ceiling, floor) {
    let dirtThreshold = (ceiling - floor) / 3
    const upper = 25;
    return function (x, y, z, w) {
        if (w !== 0) {
            const n = noise.simplex3(x, y, z, w)
            var n2 = ~~scale(n, -0.5, 0.5, 0, upper)
            if (n2 < Math.abs(w)) return 2
            if (n2 < (Math.abs(w) + 10)) return 3
        }
        return y === 0
            ? 2
            : (y > dirtThreshold ? 1 : 3)
    }
}

function pointsInside(startX, startY, width, func) {
    for (var x = startX; x < startX + width; x++)
        for (var y = startY; y < startY + width; y++)
            func(x, y)
}

function scale(x, fromLow, fromHigh, toLow, toHigh) {
    return (x - fromLow) * (toHigh - toLow) / (fromHigh - fromLow) + toLow
}

function setMountain(chunk, x, maxY, z, wTransformed, width, startY, determineTexture) {
    for (let y = startY; y < maxY; y++) {
        setBlock(chunk, x, y, z, width, determineTexture(x, y, z, wTransformed))
    }
}

function setBlock(chunk, x, y, z, width, value) {
    var xidx = Math.abs((width + x % width) % width)
    var yidx = Math.abs((width + y % width) % width)
    var zidx = Math.abs((width + z % width) % width)
    var idx = xidx + yidx * width + zidx * width * width
    chunk[idx] = value
}
