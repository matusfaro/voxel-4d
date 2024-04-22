const ever = require('ever');
const ndarray = require('ndarray');
const {noise} = require("perlin");
const Voxel4dLocation = require("./voxel-4d-location");

function Voxel4DWorker(worker, opts) {
    this.worker = worker;
    this.chunkGenerationQueue = []
    this.location = new Voxel4dLocation()
    this.seed = opts.seed;
    this.width = opts.width;
    this.arrayElementSize = opts.arrayElementSize;
    this.arrayType = {1: Uint8Array, 2: Uint16Array, 4: Uint32Array}[opts.arrayElementSize];
    this.pad = opts.pad;
    this.floor = 0
    this.ceiling = 32
    this.divisorMountains = 50
    this.determineTexture = getDetermineTexture(
        this.ceiling,
        this.floor,
        opts.blockGrass,
        opts.blockObsidian,
        opts.blockDirt)
    noise.seed(opts.seed || 'foo')

    /**
     * Added or deleted blocks, indexed by chunk position then block index
     * @type {{[xzwKey]: {[y]: number}}} Given position of x-z-w axis, returns an object where given y-axis, gives the material number
     */
    this.blocks = {}

    return this;
};

Voxel4DWorker.prototype.setBlock = function (position, value) {
    const pTransformed = this.location.pTransformer(position[0], position[1], position[2])
    this.setBlockXyzw(pTransformed, value)
};

Voxel4DWorker.prototype.setBlockXyzw = function (position, value) {
    const key = position.join('|')
    this.blocks[key] = value
};

Voxel4DWorker.prototype.getBlockModified = function (pTransformed) {
    return this.blocks[pTransformed.join('|')]
};

Voxel4DWorker.prototype.generateChunk = function (position) {
    const self = this

    const buffer = new ArrayBuffer((this.width + this.pad) * (this.width + this.pad) * (this.width + this.pad) * this.arrayElementSize);
    const arrayType = this.arrayType
    const voxelsPadded = ndarray(new arrayType(buffer), [this.width + this.pad, this.width + this.pad, this.width + this.pad]);
    const h = this.pad >> 1;
    const chunk = voxelsPadded.lo(h, h, h).hi(this.width, this.width, this.width);

    var startX = position[0] * this.width
    var startY = position[1] * this.width
    var startZ = position[2] * this.width
    var perlinGenMountainCachePos
    var perlinGenMountainCacheVal
    pointsInside(startX, startY, startZ, this.width, function (x, y, z) {
        const pTransform = self.location.pTransformer(x, y, z)
        const xTransformed = pTransform[0]
        const yTransformed = pTransform[1]
        const zTransformed = pTransform[2]
        const wTransformed = pTransform[3]

        // Apply any user modifications
        const blockOverride = self.getBlockModified(pTransform)
        if (blockOverride !== undefined) {
            setBlock(chunk, self.width, x, y, z, blockOverride)
            return
        }

        // Generate mountains
        {
            // Cache value. If Y is constant, we don't need to re-generate this value for every Y in the chunk
            let perlinGenMountain
            let perlinGenMountainCacheKey = [xTransformed, zTransformed, wTransformed].join('|')
            if (perlinGenMountainCachePos === perlinGenMountainCacheKey) {
                perlinGenMountain = perlinGenMountainCacheVal
            } else {
                perlinGenMountain = noise.simplex3(xTransformed / self.divisorMountains, zTransformed / self.divisorMountains, wTransformed / self.divisorMountains)
                perlinGenMountainCacheVal = perlinGenMountain
                perlinGenMountainCachePos = perlinGenMountainCacheKey
            }
            const mountainPeak = ~~scale(perlinGenMountain, -0.5, 0.5, self.floor + 1, self.ceiling)
            if (mountainPeak >= yTransformed) {
                setBlock(chunk, self.width, x, y, z, self.determineTexture(xTransformed, yTransformed, zTransformed, wTransformed))
            }
        }
    })

    this.worker.postMessage({cmd: 'chunkGenerated', position: position, voxelBuffer: buffer}, [buffer]);
};

Voxel4DWorker.prototype.dimensionAxisSwitch = function (facingAxis, playerPosition) {

    this.location.dimensionAxisSwitch(facingAxis, playerPosition)

    // Set block underneath the player
    // let blockUnderneathPlayerPosition = [playerPosition[0], playerPosition[1] - 1, playerPosition[2]];
    // while (blockUnderneathPlayerPosition[1] > -10 && game.getBlock(blockUnderneathPlayerPosition) === 0) {
    //     // Keep looking for a block
    //     blockUnderneathPlayerPosition[1] -= 1;
    // }
    // game.setBlock(blockUnderneathPlayerPosition, 2)
};

Voxel4DWorker.prototype.dimensionIncrement = function (increment) {
    this.location.dimensionIncrement(increment)
};

module.exports = function () {
    var self;
    ever(this).on('message', function (event) {
        if (event.data.cmd === 'configure') {
            self = new Voxel4DWorker(this, event.data.opts);
        } else if (event.data.cmd === 'discardQueuedChunkGeneration') {
            self.discardQueuedChunkGeneration();
        } else if (event.data.cmd === 'generateChunk') {
            self.queueGenerateChunk(event.data.position);
        } else if (event.data.cmd === 'setBlock') {
            self.setBlock(event.data.position, event.data.value);
        } else if (event.data.cmd === 'setBlockXyzw') {
            self.setBlockXyzw(event.data.position, event.data.value);
        } else if (event.data.cmd === 'dimensionAxisSwitch') {
            self.dimensionAxisSwitch(event.data.facingAxis, event.data.playerPosition);
        } else if (event.data.cmd === 'dimensionIncrement') {
            self.dimensionIncrement(event.data.increment);
        } else {
            console.error('Unknown message from main', event.data)
        }
    });
};

Voxel4DWorker.prototype.discardQueuedChunkGeneration = function () {
    this.chunkGenerationQueue = []
};

Voxel4DWorker.prototype.queueGenerateChunk = function (position) {
    const self = this
    this.chunkGenerationQueue.push(position)
    this.generateChunkWorkerStart()
};

Voxel4DWorker.prototype.generateChunkWorkerStart = function () {
    if (!this.generateChunkWorkerRunning) {
        this.generateChunkWorkerRunning = true
        setTimeout(this.generateChunkWorkerDo.bind(this), 1)
    }
};

Voxel4DWorker.prototype.generateChunkWorkerDo = function () {
    // Do work
    if (this.chunkGenerationQueue.length) {
        const position = this.chunkGenerationQueue.shift()
        this.generateChunk(position)
    }

    // Reschedule self or shutdown
    if (this.chunkGenerationQueue.length) {
        setTimeout(this.generateChunkWorkerDo.bind(this), 1)
    } else {
        this.generateChunkWorkerRunning = false
    }
};

function getDetermineTexture(
    ceiling,
    floor,
    blockGrass,
    blockObsidian,
    blockDirt,
) {
    let dirtThreshold = (ceiling - floor) / 3
    const upper = 25;
    return function (x, y, z, w) {
        if (w !== 0) {
            const n = noise.simplex3(x, y, z, w)
            var n2 = ~~scale(n, -0.5, 0.5, 0, upper)
            if (n2 < Math.abs(w)) return blockObsidian
            if (n2 < (Math.abs(w) + 10)) return blockDirt
        }
        return y === 0
            ? blockObsidian
            : (y > dirtThreshold ? blockGrass : blockDirt)
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

function setBlock(chunk, width, x, y, z, value) {
    var xidx = Math.abs((width + x % width) % width)
    var yidx = Math.abs((width + y % width) % width)
    var zidx = Math.abs((width + z % width) % width)
    chunk.set(xidx, yidx, zidx, value)
}
