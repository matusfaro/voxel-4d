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
        var startX = position[0] * width
        var startY = position[1] * width
        var startZ = position[2] * width
        var chunk = new Int8Array(width * width * width)
        var perlinGenMountainCachePos
        var perlinGenMountainCacheVal
        pointsInside(startX, startY, startZ, width, function (x, y, z) {
            const pTransform = pTransformer(x, y, z)
            const xTransformed = pTransform[0]
            const yTransformed = pTransform[1]
            const zTransformed = pTransform[2]
            const wTransformed = pTransform[3]

            // Apply any user modifications
            const blockOverride = getBlockModified(pTransform)
            if (blockOverride !== undefined) {
                setBlock(chunk, x, y, z, width, blockOverride)
                return
            }

            // Generate clouds
            if (startY >= width) {
                const perlinGen = noise.perlin3(xTransformed / divisorClouds, yTransformed * (divisorClouds), zTransformed / divisorClouds)
                if (perlinGen < -0.70) {
                    setBlock(chunk, x, y, z, width, 4)
                }
            }

            // Generate mountains
            {
                // Cache value. If Y is constant, we don't need to re-generate this value for every Y in the chunk
                let perlinGenMountain
                let perlinGenMountainCacheKey = [xTransformed, zTransformed, wTransformed].join('|')
                if (perlinGenMountainCachePos === perlinGenMountainCacheKey) {
                    perlinGenMountain = perlinGenMountainCacheVal
                } else {
                    perlinGenMountain = noise.simplex3(xTransformed / divisorMountains, zTransformed / divisorMountains, wTransformed / divisorMountains)
                    perlinGenMountainCacheVal = perlinGenMountain
                    perlinGenMountainCachePos = perlinGenMountainCacheKey
                }
                const mountainPeak = ~~scale(perlinGenMountain, -0.5, 0.5, floor + 1, ceiling)
                if (mountainPeak >= yTransformed) {
                    setBlock(chunk, x, y, z, width, determineTexture(xTransformed, yTransformed, zTransformed, wTransformed))
                }
            }
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

function pointsInside(startX, startY, startZ, width, func) {
    for (let x = startX; x < startX + width; x++)
        for (let z = startZ; z < startZ + width; z++)
            for (let y = startY; y < startY + width; y++)
                func(x, y, z)
}

function scale(x, fromLow, fromHigh, toLow, toHigh) {
    return (x - fromLow) * (toHigh - toLow) / (fromHigh - fromLow) + toLow
}

function setBlock(chunk, x, y, z, width, value) {
    var xidx = Math.abs((width + x % width) % width)
    var yidx = Math.abs((width + y % width) % width)
    var zidx = Math.abs((width + z % width) % width)
    var idx = xidx + yidx * width + zidx * width * width
    chunk[idx] = value
}
