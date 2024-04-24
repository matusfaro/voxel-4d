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

    this.voxelMultiplayer = this.game.plugins.get('voxel-multiplayer');
    if (!this.voxelMultiplayer) throw new Error('voxel-gps requires voxel-multiplayer plugin');

    this.xEl = document.getElementById('position-x')
    if (!this.xEl) throw Error('Cannot find element by id position-x')
    this.yEl = document.getElementById('position-y')
    if (!this.yEl) throw Error('Cannot find element by id position-y')
    this.zEl = document.getElementById('position-z')
    if (!this.zEl) throw Error('Cannot find element by id position-z')
    this.wEl = document.getElementById('position-w')
    if (!this.wEl) throw Error('Cannot find element by id position-w')

    this.containerEl = document.getElementById('position-others')
    if (!this.containerEl) throw Error('Cannot find element by id position-others')

    this.playerToEl = {}
    this.playerToPosition = {}

    this.enable();
}

VoxelGps.prototype.enable = function () {
    this.game.on('tick', this.onTick = this.update.bind(this))
    this.voxel4d.location.on('dimensionAxisSwitch', this.onDimensionAxisSwitch = this.dimensionAxisSwitch.bind(this))
    this.voxelMultiplayer.on('playerAdded', this.onPlayerAdded = this.playerAdded.bind(this))
    this.voxelMultiplayer.on('playerMove', this.onPlayerMove = this.playerMove.bind(this))
    this.voxelMultiplayer.on('playerRemoved', this.onPlayerRemoved = this.playerRemoved.bind(this))
};

VoxelGps.prototype.disable = function () {
    this.game.removeListener('tick', this.onTick);
    this.voxel4d.location.removeListener('dimensionAxisSwitch', this.onDimensionAxisSwitch);
    this.voxelMultiplayer.removeListener('playerAdded', this.onPlayerAdded);
    this.voxelMultiplayer.removeListener('playerMove', this.onPlayerMove);
    this.voxelMultiplayer.removeListener('playerRemoved', this.onPlayerRemoved);
};

// API

VoxelGps.prototype.update = function () {
    const playerPosition = this.game.playerPosition()
    const playerPositionXyzw = this.voxel4d.location.pTransformer(playerPosition[0], playerPosition[1], playerPosition[2])
    if (this.lastPlayerPosition && this.lastPlayerPosition[0] === playerPositionXyzw[0] && this.lastPlayerPosition[1] === playerPositionXyzw[1] && this.lastPlayerPosition[2] === playerPositionXyzw[2] && this.lastPlayerPosition[3] === playerPositionXyzw[3]) {
        return
    }
    this.lastPlayerPosition = playerPositionXyzw
    this.xEl.innerHTML = playerPositionXyzw[0].toFixed(1)
    this.yEl.innerHTML = playerPositionXyzw[1].toFixed(1)
    this.zEl.innerHTML = playerPositionXyzw[2].toFixed(1)
    this.wEl.innerHTML = playerPositionXyzw[3].toFixed(1)

    this.refreshOtherPlayers()
};

VoxelGps.prototype.dimensionAxisSwitch = function (currentPlaneAxis, otherPlaneAxis) {
    this.xEl.parentNode?.classList.remove('position-locked')
    this.yEl.parentNode?.classList.remove('position-locked')
    this.zEl.parentNode?.classList.remove('position-locked')
    this.wEl.parentNode?.classList.remove('position-locked')

    this[`${otherPlaneAxis}El`]?.parentNode?.classList.add('position-locked')
};

VoxelGps.prototype.playerAdded = function (id, color, playerPosition) {
    if (!this.playerToEl[id]) {
        const el = document.createElement('div')
        el.classList.add('position-player')
        el.style.color = color
        this.playerToEl[id] = el
        this.containerEl.appendChild(el)
    }

    this.playerMove(id, playerPosition)
};

VoxelGps.prototype.refreshOtherPlayers = function () {
    for (const id in this.playerToPosition) {
        this.playerMove(id, this.playerToPosition[id])
    }
};

VoxelGps.prototype.playerMove = function (id, playerPosition) {
    const el = this.playerToEl[id]
    if (!el) {
        return
    }
    this.playerToPosition[id] = playerPosition

    const playerMePosition = this.game.playerPosition()
    const playerMePositionXyzw = this.voxel4d.location.pTransformer(playerMePosition[0], playerMePosition[1], playerMePosition[2])

    const distance = Math.sqrt(
        Math.pow(playerMePositionXyzw[0] - playerPosition[0], 2) +
        Math.pow(playerMePositionXyzw[1] - playerPosition[1], 2) +
        Math.pow(playerMePositionXyzw[2] - playerPosition[2], 2) +
        Math.pow(playerMePositionXyzw[3] - playerPosition[3], 2)
    )

    el.innerHTML = distance.toFixed(1)
};

VoxelGps.prototype.playerRemoved = function (id, color, position) {
    const el = this.playerToEl[id]
    if (el) {
        el.remove()
        delete this.playerToEl[id]
    }
};
