var createGame = require('voxel-engine')
var highlight = require('voxel-highlight')
var player = require('voxel-player')
var extend = require('extend')
var fly = require('./src/voxel-fly')
var walk = require('./src/voxel-walk')
const terrain = require("./src/terrain");
const level = require("./src/level");
const gps = require("./src/gps");

module.exports = function (opts, setup) {
    setup = setup || defaultSetup
    var defaults = {
        generateChunks: false,
        chunkDistance: 2,
        texturePath: './textures/',
        materials: ['grass', 'obsidian', 'dirt', 'whitewool', 'crate', 'brick'],
        materialFlatColor: false,
        worldOrigin: [0, 0, 0],
        controls: {discreteFire: true}
    }
    opts = extend({}, defaults, opts || {})

    // setup the game
    var game = createGame(opts)
    var container = opts.container || document.body
    window.game = game // for debugging
    game.appendTo(container)
    if (game.notCapable()) return game

    var createPlayer = player(game)

    // create the player from a minecraft skin file and tell the
    // game to use it as the main player
    var avatar = createPlayer(opts.playerSkin || 'player.png')
    avatar.possess()
    avatar.yaw.position.set(2, 14, 4)

    setup(game, avatar)

    return game
}

function defaultSetup(game, avatar) {

    var makeFly = fly(game)
    var target = game.controls.target()
    target.moveTo(0.5, 32, 0.5)
    game.flyer = makeFly(target)

    // highlight blocks when you look at them, hold <Ctrl> for block placement
    var blockPosPlace, blockPosErase
    var hl = game.highlighter = highlight(game, {color: 0xff0000})
    hl.on('highlight', function (voxelPos) {
        blockPosErase = voxelPos
    })
    hl.on('remove', function (voxelPos) {
        blockPosErase = null
    })
    hl.on('highlight-adjacent', function (voxelPos) {
        blockPosPlace = voxelPos
    })
    hl.on('remove-adjacent', function (voxelPos) {
        blockPosPlace = null
    })

    // toggle between first and third person modes
    window.addEventListener('keydown', function (ev) {
        if (ev.keyCode === 'V'.charCodeAt(0)) avatar.toggle()
    })

    game.on('fire', function (target, state) {
        var position = blockPosPlace
        if (position) {
            game.createBlock(position, 6)
        } else {
            position = blockPosErase
            if (position) game.setBlock(position, 0)
        }
    })

    game.on('tick', function () {
        walk.render(target.playerSkin)
        var vx = Math.abs(target.velocity.x)
        var vz = Math.abs(target.velocity.z)
        if (vx > 0.001 || vz > 0.001) walk.stopWalking()
        else walk.startWalking()
    })

    level.setScene(game, terrain.setBlockModified)
    terrain.use(game)
    gps.use(game, terrain)
}
