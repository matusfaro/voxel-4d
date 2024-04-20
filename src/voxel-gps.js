'use strict';

module.exports = function (game, opts) {
    return new VoxelGps(game, opts);
};

module.exports.pluginInfo = {
    loadAfter: [
        'voxel-4d',
    ],
};

function VoxelGps(game, opts) {
    this.game = game;

    if (!this.game.isClient) return;

    this.voxel4d = this.game.plugins.get('voxel-4d');
    if (!this.voxel4d) throw new Error('voxel-gps requires voxel-4d plugin');

    this.xEl = document.getElementById('position-x')
    if (!this.xEl) throw Error('Cannot find element by id position-x')
    this.yEl = document.getElementById('position-y')
    if (!this.yEl) throw Error('Cannot find element by id position-y')
    this.zEl = document.getElementById('position-z')
    if (!this.zEl) throw Error('Cannot find element by id position-z')
    this.wEl = document.getElementById('position-w')
    if (!this.wEl) throw Error('Cannot find element by id position-w')

    this.enable();
}

VoxelGps.prototype.enable = function () {
    this.game.on('tick', this.onTick = this.update.bind(this))
};

VoxelGps.prototype.disable = function () {
    this.game.removeListener('tick', this.onTick);
};

// API

VoxelGps.prototype.update = function () {
    const playerPosition = this.game.playerPosition()
    const pTransformed = this.voxel4d.location.pTransformer(playerPosition[0], playerPosition[1], playerPosition[2])
    this.xEl.innerHTML = pTransformed[0].toFixed(1)
    this.yEl.innerHTML = pTransformed[1].toFixed(1)
    this.zEl.innerHTML = pTransformed[2].toFixed(1)
    this.wEl.innerHTML = pTransformed[3].toFixed(1)
};
