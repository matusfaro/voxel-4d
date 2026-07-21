const ever = require('ever');
const ndarray = require('ndarray');
const {noise} = require("perlin");
const Voxel4dLocation = require("./voxel-4d-location");
const {MAPS} = require("./maps");

function Voxel4DWorker(worker, opts) {
    this.worker = worker;
    this.chunkGenerationQueue = []
    this.location = new Voxel4dLocation()
    this.width = opts.width;
    this.arrayElementSize = opts.arrayElementSize;
    this.arrayType = {1: Uint8Array, 2: Uint16Array, 4: Uint32Array}[opts.arrayElementSize];
    this.pad = opts.pad;

    // Block NAME -> engine id, resolved on the main thread (the worker can't reach
    // the registry). Shared context handed to every map generator.
    this.ctx = {blocks: opts.palette, noise: noise};

    // Build one generate() per map, each closing over the palette.
    this.generators = MAPS.map(function (m) { return m.make(this.ctx); }, this);

    /**
     * User/scene block overrides, kept PER MAP so switching maps doesn't leak
     * edits between worlds (and returning to a map restores them). Keyed by
     * snapped 4D position "x|y|z|w" -> block id. Overrides always win over
     * procedural generation.
     * @type {{[mapId]: {[xyzwKey]: number}}}
     */
    this.blocksByMap = {}

    this.setMap(opts.mapId || 0)

    return this;
};

/**
 * Select the active generator and reseed noise for it. Overrides are untouched
 * (stored per map). The main thread reloads chunks after this.
 */
Voxel4DWorker.prototype.setMap = function (mapId) {
    this.currentMapId = mapId;
    if (!this.blocksByMap[mapId]) this.blocksByMap[mapId] = {};
    noise.seed(MAPS[mapId].seed || 'foo');
};

Voxel4DWorker.prototype.setBlock = function (position, value) {
    var pSnapped = this.location.pTransformerSnapped(position[0], position[1], position[2])
    this.setBlockXyzw(pSnapped, value)
};

// mapId defaults to the current map; callers (e.g. remote edits, scene loading)
// may target a specific map.
Voxel4DWorker.prototype.setBlockXyzw = function (position, value, mapId) {
    if (mapId === undefined) mapId = this.currentMapId
    if (!this.blocksByMap[mapId]) this.blocksByMap[mapId] = {}
    this.blocksByMap[mapId][position.join('|')] = value
};

/**
 * @param {number[][]} blocks - array of [x, y, z, w, value]
 * @param {number} [mapId] - target map (defaults to current)
 */
Voxel4DWorker.prototype.setBlocksXyzw = function (blocks, mapId) {
    for (var i = 0; i < blocks.length; i++) {
        var b = blocks[i];
        this.setBlockXyzw([b[0], b[1], b[2], b[3]], b[4], mapId);
    }
};

Voxel4DWorker.prototype.getBlockModified = function (pSnapped) {
    return this.blocksByMap[this.currentMapId][pSnapped.join('|')]
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

    // Check if y-basis-vector is pure [0,1,0,0]: when so, varying visible-y does
    // not affect the 4D x,z,w a generator sees, enabling per-column memoization.
    var b = this.location.basisMatrix;
    var yAxisIsPure = b[0][1] === 0 && b[1][1] === 1 && b[2][1] === 0 && b[3][1] === 0;

    var generate = this.generators[this.currentMapId]
    // Reused per-voxel position object (avoids allocating one per voxel) and a
    // per-column memo the generator may cache into. The loop runs y innermost,
    // so `col` is reset whenever (visible x,z) changes.
    var p = {x: 0, y: 0, z: 0, w: 0, fx: 0, fy: 0, fz: 0, fw: 0, pure: yAxisIsPure}
    var col = {}
    var lastX, lastZ
    pointsInside(startX, startY, startZ, this.width, function (x, y, z) {
        if (x !== lastX || z !== lastZ) { col = {}; lastX = x; lastZ = z; }

        // Fractional transform for continuous noise; snapped for keys/logic.
        const pTransform = self.location.pTransformer(x, y, z)
        const pSnapped = self.location.pTransformerSnapped(x, y, z)

        // User/scene overrides always win over procedural generation.
        const blockOverride = self.getBlockModified(pSnapped)
        if (blockOverride !== undefined) {
            setBlock(chunk, self.width, x, y, z, blockOverride)
            return
        }

        p.x = pSnapped[0]; p.y = pSnapped[1]; p.z = pSnapped[2]; p.w = pSnapped[3];
        p.fx = pTransform[0]; p.fy = pTransform[1]; p.fz = pTransform[2]; p.fw = pTransform[3];
        const value = generate(p, col)
        if (value) {
            setBlock(chunk, self.width, x, y, z, value)
        }
    })

    this.worker.postMessage({cmd: 'chunkGenerated', position: position, voxelBuffer: buffer}, [buffer]);
};

Voxel4DWorker.prototype.syncLocationState = function (basisMatrix, origin) {
    for (var i = 0; i < 4; i++) {
        for (var j = 0; j < 4; j++) {
            this.location.basisMatrix[i][j] = basisMatrix[i][j];
        }
        this.location.origin[i] = origin[i];
    }
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
            self.setBlockXyzw(event.data.position, event.data.value, event.data.mapId);
        } else if (event.data.cmd === 'setBlocksXyzw') {
            self.setBlocksXyzw(event.data.blocks, event.data.mapId);
        } else if (event.data.cmd === 'reconfigure') {
            self.setMap(event.data.mapId);
        } else if (event.data.cmd === 'syncLocationState') {
            self.syncLocationState(event.data.basisMatrix, event.data.origin);
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

function pointsInside(startX, startY, startZ, width, func) {
    for (let x = startX; x < startX + width; x++)
        for (let z = startZ; z < startZ + width; z++)
            for (let y = startY; y < startY + width; y++)
                func(x, y, z)
}

function setBlock(chunk, width, x, y, z, value) {
    var xidx = Math.abs((width + x % width) % width)
    var yidx = Math.abs((width + y % width) % width)
    var zidx = Math.abs((width + z % width) % width)
    chunk.set(xidx, yidx, zidx, value)
}
