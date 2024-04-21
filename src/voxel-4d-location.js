module.exports = function () {
    return new Voxel4DLocation();
};

function Voxel4DLocation() {
    /**
     * Keeps track of which axes are visible.
     * <p>
     * e.g. value of [x, y, w] means that z-axis is now the w-axis.
     *
     * @type {string[]}
     */
    this.currentPlaneAxis = ['x', 'y', 'z'];

    /**
     * Non-visible axis.
     * <p>
     * This is the missing axis from currentPlaneAxis. It is not currently shown and is always constant unless swapped again.
     * @type {string}
     */
    this.otherPlaneAxis = 'w';

    /**
     * Offsets to apply to x,y,z,w axes.
     * <p>
     * This is used to for properly aligning the world during axes swap. (Instead of moving the player)
     * @type {{x: number, y: number, z: number, w: number}}
     */
    this.offsets = {
        x: 0,
        y: 0,
        z: 0,
        w: 0
    }
}

Voxel4DLocation.prototype.dimensionAxisSwitch = function (facingAxis, playerPosition) {
    const swapAxis = facingAxis === 'y' ? 'y' : (facingAxis === 'x' ? 'z' : 'x')

    // Swap axis values first
    const swapVirtualAxisFrom = this.currentPlaneAxis[this.xyzwAxisToIndex[swapAxis]]
    const swapVirtualAxisTo = this.otherPlaneAxis
    const swapAxisPlayerPosition = Math.floor(playerPosition[this.xyzwAxisToIndex[swapAxis]])
    this.offsets[swapVirtualAxisFrom] += swapAxisPlayerPosition
    this.offsets[swapVirtualAxisTo] -= swapAxisPlayerPosition

    // Swap axis
    let tempAxis = this.otherPlaneAxis;
    this.otherPlaneAxis = this.currentPlaneAxis[this.xyzwAxisToIndex[swapAxis]];
    this.currentPlaneAxis[this.xyzwAxisToIndex[swapAxis]] = tempAxis;
}

Voxel4DLocation.prototype.dimensionIncrement = function (increment) {
    this.offsets[this.otherPlaneAxis] += increment
}

Voxel4DLocation.prototype.xyzwAxisToIndex = {
    x: 0,
    y: 1,
    z: 2,
    w: 3
}

Voxel4DLocation.prototype.pTransformer = function (x, y, z) {
    const xyzwTransformed = [
        this.offsets.x,
        this.offsets.y,
        this.offsets.z,
        this.offsets.w,
    ];
    xyzwTransformed[this.xyzwAxisToIndex[this.currentPlaneAxis[0]]] += x
    xyzwTransformed[this.xyzwAxisToIndex[this.currentPlaneAxis[1]]] += y
    xyzwTransformed[this.xyzwAxisToIndex[this.currentPlaneAxis[2]]] += z
    return xyzwTransformed
}


Voxel4DLocation.prototype.pUntransformer = function (x, y, z, w) {
    const xyzwTransformed = [
        x - this.offsets.x,
        y - this.offsets.y,
        z - this.offsets.z,
        w - this.offsets.w,
    ];
    if (xyzwTransformed[this.xyzwAxisToIndex[this.otherPlaneAxis]] !== 0) {
        // this position is in another dimension
        return null
    }
    return [
        xyzwTransformed[this.xyzwAxisToIndex[this.currentPlaneAxis[0]]],
        xyzwTransformed[this.xyzwAxisToIndex[this.currentPlaneAxis[1]]],
        xyzwTransformed[this.xyzwAxisToIndex[this.currentPlaneAxis[2]]]
    ]
}

