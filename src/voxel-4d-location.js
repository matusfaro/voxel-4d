const inherits = require('inherits')
const EventEmitter = require('events').EventEmitter

module.exports = function () {
    return new Voxel4DLocation();
};

var SQRT2_2 = Math.sqrt(2) / 2; // ~0.7071067811865476

// When true, each swap is a 45-degree rotation, so the view can rest at a
// diagonal between two axes (e.g. "x+w") and a full swap takes two presses.
// When false, each swap is a full 90-degree rotation: the two axes trade places
// outright, with no intermediate angle.
var HALF_STEP_SWAP = false;

/**
 * Known snap values for float drift prevention after rotations.
 */
var SNAP_VALUES = [0, 1, -1, SQRT2_2, -SQRT2_2, 0.5, -0.5];
var SNAP_TOLERANCE = 1e-10;

function Voxel4DLocation() {
    /**
     * 4x4 orthogonal basis matrix. Columns 0-2 define the visible hyperplane,
     * column 3 defines the hidden direction. Stored as [row][col].
     *
     * basisMatrix[i][j] means: to get 4D component i, multiply by visible-axis j's coordinate.
     * Column j = [basisMatrix[0][j], basisMatrix[1][j], basisMatrix[2][j], basisMatrix[3][j]]
     *
     * @type {number[][]}
     */
    this.basisMatrix = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1]
    ];

    /**
     * Origin in 4D space. Replaces the old offsets.
     * @type {number[]}
     */
    this.origin = [0, 0, 0, 0];

    /**
     * Integer count of 45-degree rotation steps (for display/snapping).
     * @type {number}
     */
    this.rotationStep = 0;
}

inherits(Voxel4DLocation, EventEmitter)

/**
 * Transform visible (x, y, z) to 4D coordinates.
 * Returns fractional 4D position: origin + x*col0 + y*col1 + z*col2
 */
Voxel4DLocation.prototype.pTransformer = function (x, y, z) {
    var b = this.basisMatrix;
    return [
        this.origin[0] + x * b[0][0] + y * b[0][1] + z * b[0][2],
        this.origin[1] + x * b[1][0] + y * b[1][1] + z * b[1][2],
        this.origin[2] + x * b[2][0] + y * b[2][1] + z * b[2][2],
        this.origin[3] + x * b[3][0] + y * b[3][1] + z * b[3][2]
    ];
};

/**
 * Transform visible (x, y, z) to snapped integer 4D coordinates.
 * Used for block lookup/placement where we need integer keys.
 */
Voxel4DLocation.prototype.pTransformerSnapped = function (x, y, z) {
    var p = this.pTransformer(x, y, z);
    return [
        Math.round(p[0]),
        Math.round(p[1]),
        Math.round(p[2]),
        Math.round(p[3])
    ];
};

/**
 * Inverse transform: 4D (x, y, z, w) to visible (x, y, z).
 * Uses transpose since matrix is orthogonal.
 * Returns null if the hidden component magnitude > 0.5 (not in this slice).
 */
Voxel4DLocation.prototype.pUntransformer = function (x, y, z, w) {
    var dx = x - this.origin[0];
    var dy = y - this.origin[1];
    var dz = z - this.origin[2];
    var dw = w - this.origin[3];

    var b = this.basisMatrix;

    // Hidden component = dot product with column 3
    var hidden = dx * b[0][3] + dy * b[1][3] + dz * b[2][3] + dw * b[3][3];

    if (Math.abs(hidden) > 0.5) {
        return null;
    }

    return [
        dx * b[0][0] + dy * b[1][0] + dz * b[2][0] + dw * b[3][0],
        dx * b[0][1] + dy * b[1][1] + dz * b[2][1] + dw * b[3][1],
        dx * b[0][2] + dy * b[1][2] + dz * b[2][2] + dw * b[3][2]
    ];
};

/**
 * Special untransformer that allows for a brief view of an entity crossing your dimension.
 * Uses tolerance of 1.5 instead of 0.5 for entity visibility across slices.
 */
Voxel4DLocation.prototype.pUntransformerWithShift = function (x, y, z, w) {
    var dx = x - this.origin[0];
    var dy = y - this.origin[1];
    var dz = z - this.origin[2];
    var dw = w - this.origin[3];

    var b = this.basisMatrix;

    // Hidden component = dot product with column 3
    var hidden = dx * b[0][3] + dy * b[1][3] + dz * b[2][3] + dw * b[3][3];

    // Visible components via transpose
    var vx = dx * b[0][0] + dy * b[1][0] + dz * b[2][0] + dw * b[3][0];
    var vy = dx * b[0][1] + dy * b[1][1] + dz * b[2][1] + dw * b[3][1];
    var vz = dx * b[0][2] + dy * b[1][2] + dz * b[2][2] + dw * b[3][2];

    return [vx, vy, vz, Math.abs(hidden)];
};

/**
 * Perform a 45-degree rotation in the plane spanned by an arbitrary visible-space
 * direction and the hidden direction (column 3).
 *
 * The perpDir vector defines which visible-space direction gets mixed with W.
 * For cardinal look directions this is a single axis (equivalent to old behavior).
 * For diagonal looks it's a combination of axes, so sideways movement maps to W.
 *
 * @param {number[]} perpDir - Unit vector in visible space [dx, dy, dz] defining the swap direction
 * @param {number[]} playerPosition - Player's current [x, y, z] position in visible space
 * @param {number} direction - +1 for forward 45° rotation, -1 for reverse
 */
Voxel4DLocation.prototype.dimensionAxisSwitch = function (perpDir, playerPosition, direction) {
    direction = direction || 1;
    var b = this.basisMatrix;
    var dx = perpDir[0], dy = perpDir[1], dz = perpDir[2];

    // The rotation fixes the block layer at d = f, so f must land on the layer
    // the player is standing in. Project the player's *block* rather than their
    // exact position: Math.floor(-t) !== -Math.floor(t), so projecting first
    // shifts the preserved layer one block over when perpDir points down-axis
    // (i.e. depending on which way the player happens to face).
    // Only axis-aligned swaps have a well-defined block layer; diagonal swaps
    // (FREE_AXIS_SWAP) keep the original slab-based pivot.
    var f;
    if (isAxisAligned(perpDir)) {
        f = dx * Math.floor(playerPosition[0]) +
            dy * Math.floor(playerPosition[1]) +
            dz * Math.floor(playerPosition[2]);
    } else {
        f = Math.floor(dx * playerPosition[0] + dy * playerPosition[1] + dz * playerPosition[2]);
    }

    // Step 1: Shift origin by f * d_4D (the combined 4D direction before rotation)
    for (var i = 0; i < 4; i++) {
        this.origin[i] += f * (dx * b[i][0] + dy * b[i][1] + dz * b[i][2]);
    }

    // Step 2: Rotate in the (d, hidden) plane by direction * pi/4 or pi/2
    // d_comp = component of each 4D row along the swap direction
    // The perpendicular visible components are unchanged
    var angle = direction * (HALF_STEP_SWAP ? Math.PI / 4 : Math.PI / 2);
    var cosA = Math.cos(angle);
    var sinA = Math.sin(angle);
    for (var i = 0; i < 4; i++) {
        var d_comp = dx * b[i][0] + dy * b[i][1] + dz * b[i][2];
        var h_comp = b[i][3];

        var new_d = cosA * d_comp + sinA * h_comp;
        var new_h = -sinA * d_comp + cosA * h_comp;
        var delta = new_d - d_comp;

        b[i][0] += dx * delta;
        b[i][1] += dy * delta;
        b[i][2] += dz * delta;
        b[i][3] = new_h;
    }

    // Step 3: Subtract f * new d_4D from origin (using updated basis)
    for (var i = 0; i < 4; i++) {
        this.origin[i] -= f * (dx * b[i][0] + dy * b[i][1] + dz * b[i][2]);
    }

    // Snap matrix entries to prevent float drift
    snapMatrix(b);

    // rotationStep counts 45-degree steps, so a full swap advances it by two.
    this.rotationStep = ((this.rotationStep + direction * (HALF_STEP_SWAP ? 1 : 2)) % 8 + 8) % 8;

    // Emit with axis labels for GPS display
    var labels = this.getAxisLabels();
    this.emit('dimensionAxisSwitch', labels.currentPlaneAxis, labels.otherPlaneAxis)
};

/**
 * Reset the basis matrix to identity while preserving the player's 4D position.
 * Used when switching to a different swap axis to prevent non-45° angle combinations.
 *
 * @param {number[]} playerPosition - Player's current [x, y, z] in visible space
 */
Voxel4DLocation.prototype.resetBasisAtPlayer = function (playerPosition) {
    var px = playerPosition[0], py = playerPosition[1], pz = playerPosition[2];
    var b = this.basisMatrix;
    var o = this.origin;

    // Compute player's current 4D position
    var p4d = [
        o[0] + px * b[0][0] + py * b[0][1] + pz * b[0][2],
        o[1] + px * b[1][0] + py * b[1][1] + pz * b[1][2],
        o[2] + px * b[2][0] + py * b[2][1] + pz * b[2][2],
        o[3] + px * b[3][0] + py * b[3][1] + pz * b[3][2]
    ];

    // Reset basis to identity
    this.basisMatrix = [
        [1, 0, 0, 0],
        [0, 1, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 1]
    ];

    // Set origin so player's 4D position is preserved:
    // p4d = new_origin + (px, py, pz, 0)
    this.origin = [p4d[0] - px, p4d[1] - py, p4d[2] - pz, p4d[3]];

    this.rotationStep = 0;
};

/**
 * Move origin along the hidden direction (column 3).
 */
Voxel4DLocation.prototype.dimensionIncrement = function (increment) {
    var b = this.basisMatrix;
    for (var i = 0; i < 4; i++) {
        this.origin[i] += increment * b[i][3];
    }
};

/**
 * Get axis labels for display. Returns axis names when axis-aligned,
 * composite labels like "z+w" when at 45 degrees.
 */
Voxel4DLocation.prototype.getAxisLabels = function () {
    var b = this.basisMatrix;
    var axisNames = ['x', 'y', 'z', 'w'];
    var currentPlaneAxis = [];
    var otherPlaneAxis;

    // For each column (0-2 visible, 3 hidden), determine label
    for (var col = 0; col < 4; col++) {
        var components = [];
        for (var row = 0; row < 4; row++) {
            if (Math.abs(b[row][col]) > 0.3) {
                var sign = b[row][col] > 0 ? '+' : '-';
                components.push({ axis: axisNames[row], sign: sign, abs: Math.abs(b[row][col]) });
            }
        }
        var label;
        if (components.length === 1) {
            label = components[0].axis;
        } else {
            label = components.map(function (c) {
                return (c.sign === '-' ? '-' : '') + c.axis;
            }).join('+').replace(/\+\-/g, '-');
        }

        if (col < 3) {
            currentPlaneAxis.push(label);
        } else {
            otherPlaneAxis = label;
        }
    }

    return { currentPlaneAxis: currentPlaneAxis, otherPlaneAxis: otherPlaneAxis };
};

/**
 * Get the set of 4D axis names that the hidden direction touches.
 * Used by GPS display to know which axis indicators to highlight.
 */
Voxel4DLocation.prototype.getLockedAxes = function () {
    var b = this.basisMatrix;
    var axisNames = ['x', 'y', 'z', 'w'];
    var locked = [];
    for (var row = 0; row < 4; row++) {
        if (Math.abs(b[row][3]) > 0.3) {
            locked.push(axisNames[row]);
        }
    }
    return locked;
};

/**
 * True when the direction points along a single axis, i.e. exactly one
 * component is +/-1 and the rest are zero.
 */
function isAxisAligned(v) {
    return Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]) === 1 &&
        v.every(function (c) {
            return c === 0 || Math.abs(c) === 1;
        });
}

/**
 * Snap matrix entries near known values to prevent float drift.
 */
function snapMatrix(b) {
    for (var i = 0; i < 4; i++) {
        for (var j = 0; j < 4; j++) {
            for (var k = 0; k < SNAP_VALUES.length; k++) {
                if (Math.abs(b[i][j] - SNAP_VALUES[k]) < SNAP_TOLERANCE) {
                    b[i][j] = SNAP_VALUES[k];
                    break;
                }
            }
        }
    }
}
