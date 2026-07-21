/**
 * Starting scene: a house on the hilltop closest to spawn.
 *
 * The house lives entirely in the w=0 slice, so it is visible from the starting
 * dimension and disappears as you traverse W.
 *
 * Terrain height in the w=0 slice is the "mountainPeak" value from
 * voxel-4d-worker: ~~scale(simplex3(x/50, z/50, 0), -0.5, 0.5, 1, 32). The
 * hill centred on (8, 9) peaks at y=29 and is the nearest flat high ground to
 * the spawn point at (0, 30, 0) — about 12 blocks away, door facing spawn.
 */

// Building footprint (walls sit on these bounds, inclusive).
const X0 = 4, X1 = 12;
const Z0 = 5, Z1 = 13;

const GROUND_Y = 29;            // hilltop height under the footprint
const FOUNDATION_Y = 22;        // below the lowest terrain in the terrace (24), so it always meets ground
const FLOOR_Y = GROUND_Y + 1;   // 30
const WALL_Y0 = FLOOR_Y + 1;    // 31
const WALL_Y1 = FLOOR_Y + 4;    // 34
const CEILING_Y = FLOOR_Y + 5;  // 35

const DOOR_X = 8;               // door in the north wall (z=Z0), facing spawn
const RIDGE_Z = (Z0 + Z1) / 2;  // 9
const ROOF_RISE = 4;

// Roof is a gable running along X: it peaks over the ridge and falls to the eaves.
function roofY(z) {
    return CEILING_Y + (ROOF_RISE - Math.abs(z - RIDGE_Z));
}

exports.setScene = function (registry, setBlock) {
    const mat = materials(registry);

    box(setBlock, [X0 - 1, FOUNDATION_Y, Z0 - 1], [X1 + 1, GROUND_Y, Z1 + 1], mat.foundation);
    box(setBlock, [X0, FLOOR_Y, Z0], [X1, FLOOR_Y, Z1], mat.floor);

    // Walls, then hollow out the interior.
    box(setBlock, [X0, WALL_Y0, Z0], [X1, WALL_Y1, Z1], mat.wall);
    box(setBlock, [X0 + 1, WALL_Y0, Z0 + 1], [X1 - 1, WALL_Y1, Z1 - 1], mat.air);

    corners(setBlock, mat.pillar);
    windows(setBlock, mat.glass);
    box(setBlock, [DOOR_X, WALL_Y0, Z0], [DOOR_X, WALL_Y0 + 1, Z0], mat.air);

    box(setBlock, [X0, CEILING_Y, Z0], [X1, CEILING_Y, Z1], mat.wall);
    roof(setBlock, mat);
};

function materials(registry) {
    const wall = require4d(registry, 'stoneBrick');
    return {
        air: 0,
        wall: wall,
        foundation: wall,
        pillar: require4d(registry, 'stoneBrickCarved', wall),
        floor: require4d(registry, 'woolBrown', wall),
        roof: require4d(registry, 'woolRed', wall),
        glass: require4d(registry, 'glass', wall),
    };
}

// Blocks come from plugins that may be disabled (voxel-land is, for example),
// so fall back rather than building a house out of `undefined`.
function require4d(registry, name, fallback) {
    const index = registry.getBlockIndex(name);
    if (index !== undefined) return index;
    if (fallback !== undefined) return fallback;
    throw new Error('level: required block not registered: ' + name);
}

function corners(setBlock, material) {
    [[X0, Z0], [X0, Z1], [X1, Z0], [X1, Z1]].forEach(function (c) {
        box(setBlock, [c[0], WALL_Y0, c[1]], [c[0], WALL_Y1, c[1]], material);
    });
}

function windows(setBlock, material) {
    const y0 = WALL_Y0 + 1, y1 = WALL_Y0 + 2;
    const openings = [
        [6, Z0], [10, Z0],              // north wall (door takes x=8)
        [6, Z1], [8, Z1], [10, Z1],     // south wall
        [X0, 7], [X0, 11],              // west wall
        [X1, 7], [X1, 11],              // east wall
    ];
    openings.forEach(function (o) {
        box(setBlock, [o[0], y0, o[1]], [o[0], y1, o[1]], material);
    });
}

function roof(setBlock, mat) {
    for (var z = Z0; z <= Z1; z++) {
        const top = roofY(z);
        // Overhanging eaves on the gable ends.
        box(setBlock, [X0 - 1, top, z], [X1 + 1, top, z], mat.roof);
        // Fill the triangular gable walls below the slope. Empty at the eaves,
        // where the roof already sits on the ceiling.
        if (top - 1 < CEILING_Y + 1) continue;
        box(setBlock, [X0, CEILING_Y + 1, z], [X0, top - 1, z], mat.wall);
        box(setBlock, [X1, CEILING_Y + 1, z], [X1, top - 1, z], mat.wall);
    }
}

function box(setBlock, from, to, material) {
    for (var x = Math.min(from[0], to[0]); x <= Math.max(from[0], to[0]); x++) {
        for (var y = Math.min(from[1], to[1]); y <= Math.max(from[1], to[1]); y++) {
            for (var z = Math.min(from[2], to[2]); z <= Math.max(from[2], to[2]); z++) {
                setBlock([x, y, z, 0], material);
            }
        }
    }
}
