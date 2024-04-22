module.exports = function (game, position, positionFrequencyInMs) {
    return new VoxelMultiplayerEntity(game, position, positionFrequencyInMs);
};

function VoxelMultiplayerEntity(game, position, positionFrequencyInMs) {
    this.game = game
    this.position = position
    this.positionTime = Date.now()
    this.lastPosition = position
    this.positionFrequencyInMs = positionFrequencyInMs
}

VoxelMultiplayerEntity.prototype.move = function (position) {
    this.lastPosition = this.position
    this.position = position
    this.positionTime = Date.now()
}

VoxelMultiplayerEntity.prototype.getPosition = function () {
    const now = Date.now()
    if (now - this.positionTime > this.positionFrequencyInMs) {
        return this.position
    } else {
        const perc = (now - this.positionTime) / this.positionFrequencyInMs
        const x = this.lastPosition[0] + (this.position[0] - this.lastPosition[0]) * perc
        const y = this.lastPosition[1] + (this.position[1] - this.lastPosition[1]) * perc
        const z = this.lastPosition[2] + (this.position[2] - this.lastPosition[2]) * perc
        const w = this.lastPosition[3] + (this.position[3] - this.lastPosition[3]) * perc
        return [x, y, z, w]
    }
}
