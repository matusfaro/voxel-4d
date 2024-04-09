/**
 * license: BSD
 * https://github.com/max-mapper/voxel-perlin-terrain/blob/master/index.js
 */
var noise = require('perlin').noise

module.exports = function (seed) {
    let floor = 0
    let ceiling = 20
    let divisorClouds = 30
    let divisorMountains = 50
    let changeTexture = (ceiling - floor) / 3
    noise.seed(seed)
    return function generateChunk(position, width, pTransformer) {
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
                let n = noise.simplex2(xTransformed / divisorClouds, zTransformed / divisorClouds)
                if (n < -0.75) {
                    setBlock(chunk, x, startY, z, width, 4)
                }
            } else if (startY === 0) {
                // Generate mountains
                let n = noise.simplex3(xTransformed / divisorMountains, zTransformed / divisorMountains, wTransformed / divisorMountains)
                var y = ~~scale(n, -0.5, 0.5, floor + 1, ceiling)
                setMountain(chunk, x, y, z, width, startY, changeTexture)
            }
        })
        return chunk
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

function setMountain(chunk, x, maxY, z, width, startY, changeTexture) {
    for (let y = startY; y < maxY; y++) {
        setBlock(chunk, x, y, z, width,
            y === startY
                ? 2
                : (y > changeTexture ? 1 : 3))
    }
}

function setBlock(chunk, x, y, z, width, value) {
    var xidx = Math.abs((width + x % width) % width)
    var yidx = Math.abs((width + y % width) % width)
    var zidx = Math.abs((width + z % width) % width)
    var idx = xidx + yidx * width + zidx * width * width
    chunk[idx] = value
}
