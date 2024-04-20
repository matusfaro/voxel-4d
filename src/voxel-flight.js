module.exports = function (game, opts) {
    return new Fly(game, opts)
}

module.exports.pluginInfo = {
    loadAfter: ['voxel-keys']
}

function Fly(game, opts) {
    this.game = game
    this.physical = opts.physical || this.game.controls.target()
    if (!this.game) throw new Error('voxel-flight requires game parameter');
    if (!this.game.isClient) return;
    this.keys = game.plugins.get('voxel-keys');
    if (!this.keys) throw new Error('voxel-flight requires voxel-keys plugin');
    this.flySpeed = opts.flySpeed || 0.8

    this.enable()
}

Fly.prototype.enable = function () {
    var self = this
    var lastClick = 0

    this.keys.down.on('jump', this.onJumpDown = function () {
        if (Date.now() - lastClick <= 300) {
            self.toggleFlying()
            lastClick = 0
        } else {
            lastClick = Date.now()
        }
    });
}

Fly.prototype.disable = function () {
    if (this.flying) {
        this.stopFlying()
    }

    this.keys.down.removeListener('jump', this.onJumpDown);
}

Fly.prototype.startFlying = function () {
    var self = this
    this.flying = true
    this.physical.removeForce(this.game.gravity)
    this.game.on('tick', this.onGameTick = function (dt) {
        if (self.physical.atRestY() === -1) return self.stopFlying()
        self.physical.friction[0] = self.flySpeed
        self.physical.friction[1] = self.flySpeed
        self.physical.friction[2] = self.flySpeed
        self.physical.velocity[1] = 0
        if (self.game.controls.state['jump']) self.physical.velocity[1] += self.flySpeed
        if (self.game.controls.state['crouch']) self.physical.velocity[1] -= self.flySpeed
    })
}

Fly.prototype.stopFlying = function () {
    this.flying = false
    var physical = this.physical
    physical.subjectTo(this.game.gravity)
    this.game.removeListener('tick', this.onGameTick)
}

Fly.prototype.toggleFlying = function () {
    if (this.flying) {
        this.stopFlying()
    } else {
        this.startFlying()
    }
}
