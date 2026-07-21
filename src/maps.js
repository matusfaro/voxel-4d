'use strict';

/**
 * Map registry: the set of selectable world generators.
 *
 * Shared by the main thread (for names / ids / the switch UI) and the chunk
 * worker (which actually runs the generators). Each generator is a pure function
 * of the 4D position (x, y, z, w), so worlds are deterministic, infinite, and —
 * crucially — vary along the hidden W axis: traversing W (R/F) or swapping an
 * axis into W (E) changes what you see.
 *
 * A generator is built from a `make(ctx)` factory so it can close over the
 * resolved block-id palette. `ctx = { blocks, noise }` where `blocks` maps block
 * NAME -> engine block id (resolved on the main thread; the worker only knows
 * ids). `generate(p, col)` returns a block id, or 0 for air, where:
 *   p   = { x, y, z, w,        // snapped integer 4D coords
 *           fx, fy, fz, fw,    // fractional 4D coords (for continuous noise)
 *           pure }             // true when visible-y maps purely to 4D-y
 *   col = per-column memo object, reset by the worker whenever (visible x,z)
 *         changes (the loop runs y innermost), for cheap column-wise caching.
 */

const {noise} = require('perlin');

// ---- shared helpers -------------------------------------------------------

function scale(x, fromLow, fromHigh, toLow, toHigh) {
    return (x - fromLow) * (toHigh - toLow) / (fromHigh - fromLow) + toLow;
}

function mod(a, b) {
    return ((a % b) + b) % b;
}

// Deterministic 32-bit integer hash of its integer arguments (FNV-style with
// avalanche). Lets generators derive stable per-lot / per-cell randomness with
// no extra Perlin calls and no stored state.
function hash() {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < arguments.length; i++) {
        h ^= (arguments[i] | 0);
        h = Math.imul(h, 16777619) >>> 0;
        h ^= h >>> 13;
    }
    h ^= h >>> 15;
    return h >>> 0;
}

// ---- map 0: Terrain (existing mountain generator, moved verbatim) ---------

function makeTerrain(ctx) {
    const FLOOR = 0, CEILING = 32, DIV = 50;
    const dirtThreshold = (CEILING - FLOOR) / 3;
    const UPPER = 25;
    const B = ctx.blocks;

    function determineTexture(x, y, z, w) {
        if (w !== 0) {
            // NB: perlin.simplex3 ignores a 4th arg; W-dependence is via |w|.
            const n = ctx.noise.simplex3(x, y, z);
            const n2 = ~~scale(n, -0.5, 0.5, 0, UPPER);
            if (n2 < Math.abs(w)) return B.obsidian;
            if (n2 < Math.abs(w) + 10) return B.dirt;
        }
        return y === 0
            ? B.obsidian
            : (y > dirtThreshold ? B.grass : B.dirt);
    }

    return function generateTerrain(p, col) {
        // Mountain height depends only on 4D x,z,w. When visible-y maps purely to
        // 4D-y those inputs are constant down a column, so memoize per column.
        var peak = col.peak;
        if (peak === undefined || !p.pure) {
            peak = ~~scale(
                ctx.noise.simplex3(p.fx / DIV, p.fz / DIV, p.fw / DIV),
                -0.5, 0.5, FLOOR + 1, CEILING);
            if (p.pure) col.peak = peak;
        }
        if (peak >= p.y) {
            return determineTexture(p.x, p.y, p.z, p.w);
        }
        return 0;
    };
}

// ---- map 1: City (the 4D centrepiece) -------------------------------------

function makeCity(ctx) {
    const B = ctx.blocks;
    const N = ctx.noise;

    const P = 16;          // block period per lot (incl. road)
    const ROAD = 5;        // road + sidewalk width along two sides of each lot
    const SIDEWALK = 1;    // sidewalk ring width inside the road
    const SEA = 5;         // water fills terrain below this
    const CENTER = 10;     // lot-local centre of the building footprint

    const FACADES = [B.stoneBrick, B.blockIron, B.woolGray, B.woolWhite, B.stoneBrickMossy, B.blockCoal];
    const HOUSE_WALLS = [B.woolWhite, B.woolOrange, B.woolRed, B.stoneBrick, B.woolBrown];
    const HOUSE_ROOFS = [B.woolRed, B.stoneBrickCracked, B.woolBrown, B.blockCoal];

    // Rolling terrain height; shifts gently with W so the land itself breathes.
    function groundHeight(x, z, w) {
        const n = 10
            + 16 * N.simplex3(x / 90, z / 90, w / 45)
            + 6 * N.simplex3(x / 34 + 50, z / 34, w / 24);
        return Math.round(n);
    }

    // District field in 0..1 (low frequency, drifts with W):
    //   >0.72 downtown | 0.52..0.72 midtown | 0.30..0.52 residential | <0.30 park
    function districtValue(lotX, lotZ, w) {
        return 0.5 + N.simplex3(lotX / 6 + 20, lotZ / 6, w / 14);
    }

    // Describe everything about the column at (x,z) in W-slice w. Memoized per
    // column by the worker when the view is axis-aligned; recomputed otherwise.
    function describe(x, z, w) {
        const d = {ground: groundHeight(x, z, w)};
        const lx = mod(x, P), lz = mod(z, P);
        d.lx = lx; d.lz = lz;

        // Streets run along the two low-index edges of every lot.
        const roadX = lx < ROAD, roadZ = lz < ROAD;
        if (roadX || roadZ) {
            d.road = true;
            d.sidewalk = (lx >= ROAD - SIDEWALK && lx < ROAD && !roadZ) ||
                (lz >= ROAD - SIDEWALK && lz < ROAD && !roadX) ||
                (lx >= ROAD - SIDEWALK && lz >= ROAD - SIDEWALK && roadX && roadZ);
            // Crosswalk stripes across the intersection.
            d.crosswalk = roadX && roadZ && ((lx + lz) % 2 === 0);
            return d;
        }

        const lotX = Math.floor(x / P), lotZ = Math.floor(z / P);
        const val = districtValue(lotX, lotZ, w);
        const landmark = (hash(lotX, lotZ) % 7) === 0;   // ~14% persist across all W
        const wBand = Math.floor(w / 4);
        const h = hash(lotX, lotZ, landmark ? 0 : wBand);
        // Flat foundation pad = ground at the lot centre (so buildings aren't slanted).
        const base = groundHeight(lotX * P + CENTER, lotZ * P + CENTER, w);

        if (val < 0.30 || (h % 6) === 0) {               // park / plaza
            d.park = true; d.base = base;
            d.trees = parkTrees(lotX, lotZ, wBand, base);
            return d;
        }

        let style, height, halfWidth, setback = 999;
        if (val > 0.72) {                                // downtown high-rise
            style = 'tower';
            height = 22 + (h % 26);
            halfWidth = 4 + (h % 2);
            setback = 8;                                 // taper every 8 floors
        } else if (val > 0.52) {                         // midtown mid-rise
            style = 'block';
            height = 9 + (h % 12);
            halfWidth = 4 + (h % 2);
        } else {                                         // residential house
            style = 'house';
            height = 4;
            halfWidth = 2 + (h % 2);
        }
        if (!landmark && style !== 'house') {
            height += Math.floor(5 * N.simplex3(lotX + 7, lotZ + 3, w / 7)); // breathe with W
        }
        if (height < 4) height = 4;

        d.build = {
            style: style, base: base, height: height, top: base + height,
            halfWidth: halfWidth, setback: setback,
            facade: FACADES[h % FACADES.length],
            wall: HOUSE_WALLS[h % HOUSE_WALLS.length],
            roof: HOUSE_ROOFS[(h >> 3) % HOUSE_ROOFS.length],
            hasAntenna: style === 'tower' && (h & 2) === 0,
            seed: h,
        };
        return d;
    }

    // Up to 3 trees per park lot at hashed local positions.
    function parkTrees(lotX, lotZ, wBand, base) {
        const trees = [];
        const count = 1 + (hash(lotX, lotZ, 11) % 3);
        for (let i = 0; i < count; i++) {
            const th = hash(lotX, lotZ, wBand, i);
            const tx = ROAD + 1 + (th % (P - ROAD - 2));
            const tz = ROAD + 1 + ((th >> 8) % (P - ROAD - 2));
            trees.push({tx: tx, tz: tz, h: 3 + (th % 3), base: base});
        }
        return trees;
    }

    function halfWidthAt(b, y) {
        if (b.setback >= 999) return b.halfWidth;
        const level = Math.floor((y - b.base) / b.setback);
        return Math.max(2, b.halfWidth - level);         // taper as it rises
    }

    return function generateCity(p, col) {
        const y = p.y;
        var d;
        if (p.pure && col.desc !== undefined) d = col.desc;
        else { d = describe(p.x, p.z, p.w); if (p.pure) col.desc = d; }

        if (y <= 0) return B.obsidian;                   // bedrock floor

        // --- buildings ---
        if (d.build) {
            const b = d.build;
            if (y <= b.base) {
                if (inFootprint(b, d.lx, d.lz, b.base)) return b.facade || b.wall; // foundation pad
                // else: fall through to terrain/yard below
            } else if (b.style === 'house') {
                const v = houseBlock(b, d.lx, d.lz, y);
                if (v !== undefined) return v;
            } else {
                const v = towerBlock(b, d.lx, d.lz, y);
                if (v !== undefined) return v;
            }
        }

        // --- ground / streets / water ---
        if (y <= d.ground) return groundBlock(d, p, y);
        if (y <= SEA && d.ground < SEA) return B.water;  // lakes in the valleys

        // --- park trees (above ground) ---
        if (d.park && d.trees) {
            const v = treeBlock(d.trees, d.lx, d.lz, y);
            if (v !== undefined) return v;
        }
        return 0;
    };

    function inFootprint(b, lx, lz, y) {
        const hw = halfWidthAt(b, y);
        return Math.abs(lx - CENTER) <= hw && Math.abs(lz - CENTER) <= hw;
    }

    function towerBlock(b, lx, lz, y) {
        if (y > b.top) {
            if (b.hasAntenna && lx === CENTER && lz === CENTER && y <= b.top + 4) return B.blockIron;
            return undefined;
        }
        if (!inFootprint(b, lx, lz, y)) return undefined;
        const hw = halfWidthAt(b, y);
        const dx = Math.abs(lx - CENTER), dz = Math.abs(lz - CENTER);
        const perimeter = dx === hw || dz === hw;
        if (y === b.top) return b.facade;                    // roof cap
        if ((y - b.base) % 4 === 0) return b.facade;         // floor slabs / terraces
        if (perimeter) {
            const row = (y - b.base) % 4;
            if (row === 2 || row === 3) {                    // window band
                const lit = (hash(b.seed, lx, lz, y) % 5) === 0;
                return lit ? B.woolYellow : B.glass;
            }
            return b.facade;
        }
        return 0;                                             // hollow interior
    }

    function houseBlock(b, lx, lz, y) {
        const wallTop = b.base + b.height;
        const dx = Math.abs(lx - CENTER), dz = Math.abs(lz - CENTER);
        if (y <= wallTop) {
            if (dx > b.halfWidth || dz > b.halfWidth) return undefined;
            const perimeter = dx === b.halfWidth || dz === b.halfWidth;
            if (!perimeter) return (y === wallTop) ? b.wall : 0;   // interior / ceiling
            // door on one side at ground
            if (lx === CENTER && dz === b.halfWidth && y <= b.base + 2) return 0;
            if ((y - b.base) === 2 && (dx + dz) % 2 === 0) return B.glass; // a window
            return b.wall;
        }
        // hip roof: shrinks one block per level above the walls
        const r = y - wallTop;
        const hw = b.halfWidth - r;
        if (hw < 0) return undefined;
        if (dx <= hw && dz <= hw) return (dx === hw || dz === hw) ? b.roof : 0;
        return undefined;
    }

    function groundBlock(d, p, y) {
        if (y === d.ground) {
            if (d.road) {
                if (d.crosswalk) return B.woolWhite;
                if (d.sidewalk) return B.woolGray;
                return B.obsidian;                       // asphalt
            }
            return B.grass;                              // yards & parks
        }
        if (y > d.ground - 3) return B.dirt;
        return B.stoneBrickCracked;                      // deeper "rock"
    }

    function treeBlock(trees, lx, lz, y) {
        for (let i = 0; i < trees.length; i++) {
            const t = trees[i];
            const trunkTop = t.base + t.h;
            if (lx === t.tx && lz === t.tz && y > t.base && y <= trunkTop) return B.woolBrown;
            // leafy canopy blob around the top
            const dx = Math.abs(lx - t.tx), dz = Math.abs(lz - t.tz), dy = y - trunkTop;
            if (dy >= -1 && dy <= 1 && (dx + dz + Math.abs(dy)) <= 2) {
                return (dx + dz) % 2 === 0 ? B.woolGreen : B.woolLime;
            }
        }
        return undefined;
    }
}

// ---- map 2: Flat (sandbox) ------------------------------------------------

function makeFlat(ctx) {
    const B = ctx.blocks;
    const GY = 8;
    return function generateFlat(p) {
        if (p.y <= 0) return B.obsidian;
        if (p.y < GY) return B.dirt;
        if (p.y === GY) return B.grass;
        return 0;
    };
}

// ---- map 3: Sky Islands ---------------------------------------------------

function makeIslands(ctx) {
    const B = ctx.blocks;
    return function generateIslands(p) {
        // Island "presence" field; shifts with W so islands drift / fade.
        const field =
            ctx.noise.simplex3(p.fx / 28, p.fz / 28, p.fw / 18) +
            0.5 * ctx.noise.simplex3(p.fx / 13, p.fz / 13, p.fw / 9);
        if (field < 0.35) return 0;

        // Base altitude also drifts with W (offset seeds decorrelate the fields).
        const base = 40 + 22 * ctx.noise.simplex3(p.fx / 60 + 100, p.fz / 60, p.fw / 14);
        const thickness = 3 + Math.floor(10 * (field - 0.35));
        const dy = p.y - base;
        if (dy > 0 || dy < -thickness) return 0;

        if (dy > -1) return B.grass;      // top surface
        if (dy > -3) return B.dirt;
        return B.stoneBrick;              // underside
    };
}

// ---- map 4: Tesseract Lattice ---------------------------------------------

function makeTesseract(ctx) {
    const B = ctx.blocks;
    const CELL = 8, R = 1;
    function nearMultiple(c) {
        const m = mod(c, CELL);
        return Math.min(m, CELL - m) <= R;
    }
    return function generateTesseract(p) {
        const nx = nearMultiple(p.x), ny = nearMultiple(p.y);
        const nz = nearMultiple(p.z), nw = nearMultiple(p.w);
        const cnt = nx + ny + nz + nw;
        if (cnt >= 4) return B.blockDiamond;   // lattice node
        if (cnt >= 3) {                         // strut along the one free axis
            if (!nx) return B.woolCyan;
            if (!ny) return B.woolLime;
            if (!nz) return B.woolMagenta;
            return B.glass;                     // free along W
        }
        return 0;
    };
}

// ---- registry -------------------------------------------------------------

const MAPS = [
    {id: 0, name: 'Terrain', seed: 'foo', make: makeTerrain},
    {id: 1, name: 'City', seed: 'city', make: makeCity},
    {id: 2, name: 'Flat', seed: 'flat', make: makeFlat},
    {id: 3, name: 'Sky Islands', seed: 'islands', make: makeIslands},
    {id: 4, name: 'Tesseract', seed: 'tesseract', make: makeTesseract},
];

// Every block NAME any generator needs. Resolved to ids on the main thread and
// passed to the worker as `ctx.blocks`. Unresolved names fall back (see caller).
const PALETTE = [
    'obsidian', 'dirt', 'grass', 'water',
    'stoneBrick', 'stoneBrickMossy', 'stoneBrickCracked', 'blockIron', 'blockCoal',
    'woolGray', 'woolWhite', 'woolCyan', 'woolLime', 'woolMagenta',
    'woolBrown', 'woolGreen', 'woolYellow', 'woolRed', 'woolOrange',
    'glass', 'blockDiamond',
];

module.exports = {MAPS, PALETTE, hash, scale, mod};
