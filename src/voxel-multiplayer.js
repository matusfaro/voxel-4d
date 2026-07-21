const inherits = require('inherits')
const EventEmitter = require('events').EventEmitter
const peerjsmesh = require("./lib/peerjs-mesh/mesh")
const VoxelMultiplayerEntity = require('./voxel-multiplayer-entity')
const throttle = require('lodash.throttle');
const {v4: uuidv4} = require('uuid');

module.exports = function (game, opts) {
    return new VoxelMultiplayer(game, opts);
};

module.exports.pluginInfo = {
    loadAfter: [
        'voxel-4d',
        'voxel-glass',
        'voxel-multiplayer-entities',
        'voxel-engine-stackgl', // For WebGL to be ready
    ]
}

function VoxelMultiplayer(game, opts) {
    this.game = game

    this.voxel4d = game.plugins.get('voxel-4d');
    if (!this.voxel4d) throw new Error('voxel-multiplayer requires voxel-4d plugin');

    this.glassPlugin = game.plugins.get('voxel-glass');
    if (!this.glassPlugin) throw new Error('voxel-multiplayer requires voxel-glass plugin');

    this.entities = this.game.plugins.get('voxel-multiplayer-entities');
    if (!this.entities) throw new Error('voxel-multiplayer requires voxel-multiplayer-entities');

    this.sidToPid = {}
    this.positionFrequencyInMs = opts.positionFrequencyInMs || 200;

    this.myColor = this.getRandomColor()

    // Per-player map (see plan): each peer picks its own map; we signal ours to
    // others and only interact with peers on the same map.
    this.currentMapId = this.voxel4d.currentMapId

    this.enable()
}

inherits(VoxelMultiplayer, EventEmitter)

VoxelMultiplayer.prototype.enable = function () {
    const self = this

    this.meshPid = uuidv4()

    this.mesh = peerjsmesh.mesh('matusfaro-voxel-4d', {
        log_id: this.meshPid,
        retry: Infinity,
        join_timeout: 10 * 1000,
        mesh_mode: 'host', // 'host' for centralized or 'full' for full mesh/mess
        initData: {
            pid: this.meshPid,
            pos: self.getPlayerPositionXyzw(),
            color: self.myColor,
            map: self.currentMapId
        }
    })
    this.mesh.on("initData", this.onInitData = function (sid, data) {
        self.sidToPid[sid] = data.pid
        const color = data.color || 'green'
        const entity = new VoxelMultiplayerEntity(self.game, data.pos, self.positionFrequencyInMs, color)
        entity.mapId = data.map || 0
        self.entities.addEntity(data.pid, entity)
        self.emit('playerAdded', data.pid, color, data.pos, entity.mapId)
    })
    this.mesh.on("data", this.onData = function (data) {
        const entity = self.entities.getEntity(data.pid)
        if (!entity) {
            return
        }
        if (data.cmd === 'move') {
            entity.move(data.pos)
            self.emit('playerMove', data.pid, data.pos)
        } else if (data.cmd === 'setBlock') {
            // Only apply edits made on the map we're currently in; edits on other
            // maps are ignored so different-map worlds stay coherent.
            if ((data.map || 0) === self.currentMapId) {
                self.voxel4d.setBlockXyzwAndReloadChunk(data.pos, data.val, self.currentMapId)
            }
        } else if (data.cmd === 'setMap') {
            entity.mapId = data.map
            self.emit('playerMapChanged', data.pid, data.map)
        }
    })
    this.mesh.on("peerdropped", this.onPeerdropped = function (sid, peerlist) {
        const pid = self.sidToPid[sid]
        if (!pid) {
            return
        }
        self.entities.removeEntity(pid)
        self.emit('playerRemoved', pid)
    })
    this.mesh.on("error", this.onError = function (msg) {
        console.error("PeerJS Mesh Error: " + msg)
    })
    // Keep track of added/deleted blocks
    this.game.on('setBlock', this.onSetBlock = function (position, value, old) {
        const pSnapped = self.voxel4d.location.pTransformerSnapped(position[0], position[1], position[2])
        self.mesh.send({
            pid: self.meshPid,
            cmd: 'setBlock',
            pos: pSnapped,
            val: value,
            map: self.currentMapId,
        })
    });

    // Signal our map to peers when we switch, so they can show it and scope
    // interaction. Also let the entities renderer know which map we're viewing.
    this.entities.setLocalMapId(this.currentMapId)
    this.voxel4d.on('mapSwitch', this.onMapSwitch = function (mapId) {
        self.currentMapId = mapId
        self.entities.setLocalMapId(mapId)
        self.mesh.send({pid: self.meshPid, cmd: 'setMap', map: mapId})
    });

    this.game.on('tick', this.onTickSendPosition = throttle(function () {
        const playerPositionXyzw = self.getPlayerPositionXyzw();
        if (this.lastPositionXyzw && this.lastPositionXyzw.every(function (value, index) {
            return value === playerPositionXyzw[index]
        })) {
            return // Skip if position hasn't changed
        }
        this.lastPositionXyzw = playerPositionXyzw

        self.mesh.send({
            pid: self.meshPid,
            cmd: 'move',
            pos: self.getPlayerPositionXyzw(),
        })
    }, this.positionFrequencyInMs));

    this.game.on('tick', this.onTickRender = this.render.bind(this))
}

VoxelMultiplayer.prototype.getPlayerPositionXyzw = function () {
    const playerPosition = this.game.playerPosition()
    return this.voxel4d.location.pTransformer(playerPosition[0], playerPosition[1], playerPosition[2])
}

VoxelMultiplayer.prototype.getRandomColor = function () {
    return this.glassPlugin.colors[Math.floor(Math.random() * this.glassPlugin.colors.length)]
}

VoxelMultiplayer.prototype.disable = function () {
    this.mesh.removeListener("initData", this.onInitData)
    this.mesh.removeListener("data", this.onData)
    this.mesh.removeListener("peerdropped", this.onPeerdropped)
    this.mesh.removeListener("error", this.onError)
    this.mesh.cleanup()

    this.game.removeListener('setBlock', this.onSetBlock);
    this.voxel4d.removeListener('mapSwitch', this.onMapSwitch);

    this.game.removeListener('tick', this.onTickSendPosition)
    this.game.removeListener('tick', this.onTickRender)

    this.entities.removeAllEntities()
}

VoxelMultiplayer.prototype.render = function () {
    this.entities.update()
    this.entities.render()
}
