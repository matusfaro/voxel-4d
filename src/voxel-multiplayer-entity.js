module.exports = function (game, position) {
    return new VoxelMultiplayerEntity(game, position);
};

function VoxelMultiplayerEntity(game, position) {
    this.game = game
    this.position = position
}

VoxelMultiplayerEntity.prototype.move = function (position) {
    this.position = position
}

VoxelMultiplayerEntity.prototype.getPosition = function () {
    return this.position
}
