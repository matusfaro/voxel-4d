var createEngine = require('voxel-engine-stackgl')
var extend = require('extend')
const level = require("./src/level");
const gps = require("./src/gps");

const start = function () {
    createEngine({
        exposeGlobal: true, pluginLoaders: {
            'voxel-artpacks': require('voxel-artpacks'),
            'voxel-wireframe': require('voxel-wireframe'),
            'voxel-chunkborder': require('voxel-chunkborder'),
            'voxel-outline': require('voxel-outline'),
            'voxel-carry': require('voxel-carry'),
            'voxel-bucket': require('voxel-bucket'),
            'voxel-fluid': require('voxel-fluid'),
            'voxel-skyhook': require('voxel-skyhook'),
            'voxel-bedrock': require('voxel-bedrock'),
            'voxel-recipes': require('voxel-recipes'),
            'voxel-quarry': require('voxel-quarry'),
            'voxel-measure': require('voxel-measure'),
            'voxel-webview': require('voxel-webview'),
            'voxel-vr': require('voxel-vr'),
            'voxel-workbench': require('voxel-workbench'),
            'voxel-furnace': require('voxel-furnace'),
            'voxel-chest': require('voxel-chest'),
            'voxel-inventory-hotbar': require('voxel-inventory-hotbar'),
            'voxel-inventory-crafting': require('voxel-inventory-crafting'),
            'voxel-voila': require('voxel-voila'),
            'voxel-health': require('voxel-health'),
            'voxel-health-bar': require('voxel-health-bar'),
            //'voxel-health-fall': require('voxel-health-fall'); // TODO: after https://github.com/deathcap/voxel-health-fall/issues/1
            'voxel-food': require('voxel-food'),
            'voxel-scriptblock': require('voxel-scriptblock'),
            'voxel-sfx': require('voxel-sfx'),
            'voxel-flight': require('voxel-flight'),
            'voxel-gamemode': require('voxel-gamemode'),
            'voxel-sprint': require('voxel-sprint'),
            'voxel-decals': require('voxel-decals'),
            'voxel-mine': require('voxel-mine'),
            'voxel-harvest': require('voxel-harvest'),
            'voxel-use': require('voxel-use'),
            'voxel-reach': require('voxel-reach'),
            'voxel-pickaxe': require('voxel-pickaxe'),
            'voxel-hammer': require('voxel-hammer'),
            'voxel-wool': require('voxel-wool'),
            'voxel-pumpkin': require('voxel-pumpkin'),
            'voxel-blockdata': require('voxel-blockdata'),
            'voxel-glass': require('voxel-glass'),
            // 'voxel-land': require('voxel-land'),
            // 'voxel-flatland': require('voxel-flatland'),
            'voxel-4d': require('./src/voxel-4d'),
            'voxel-decorative': require('voxel-decorative'),
            'voxel-inventory-creative': require('voxel-inventory-creative'),
            // 'voxel-clientmc': require('voxel-clientmc');  // TODO: after published
            'voxel-console': require('voxel-console'),
            'voxel-commands': require('voxel-commands'),
            'voxel-drop': require('voxel-drop'),
            'voxel-zen': require('voxel-zen'),
            'camera-debug': require('camera-debug'),
            'voxel-plugins-ui': require('voxel-plugins-ui'),
            'voxel-fullscreen': require('voxel-fullscreen'),
            'voxel-keys': require('voxel-keys'),
            'kb-bindings-ui': require('kb-bindings-ui')
        }, pluginOpts: {
            'voxel-engine-stackgl': {
                appendDocument: true,
                exposeGlobal: true,  // for debugging

                lightsDisabled: true,
                arrayTypeSize: 2,  // arrayType: Uint16Array
                useAtlas: true,
                generateChunks: false,
                chunkSize: 16,
                chunkDistance: 2,
                removeDistance: 3,
                worldOrigin: [0, 0, 0],
                controls: {
                    discreteFire: false,
                    fireRate: 100, // ms between firing
                    jumpTimer: 25
                },
                keybindings: {
                    // voxel-engine defaults
                    'W': 'forward',
                    'A': 'left',
                    'S': 'backward',
                    'D': 'right',
                    '<up>': 'forward',
                    '<left>': 'left',
                    '<down>': 'backward',
                    '<right>': 'right',
                    '<mouse 1>': 'fire',
                    '<mouse 3>': 'firealt',
                    '<space>': 'jump',
                    '<shift>': 'crouch',
                    '<control>': 'alt',
                    '<tab>': 'sprint',

                    // 4d
                    'E': 'dimension axis switch',
                    'R': 'dimension increment',
                    'F': 'dimension decrement',

                    // our extras
                    'F5': 'pov',
                    'O': 'home',
                    'Q': 'inventory',

                    'T': 'console',
                    '/': 'console2',
                    '.': 'console3',

                    'P': 'packs',

                    'F1': 'zen'
                }
            },

            // built-in plugins
            'voxel-registry': {},
            'voxel-stitch': {
                artpacks: ['ProgrammerArt-ResourcePack.zip']
            },
            'voxel-shader': {
                //cameraFOV: 45,
                //cameraFOV: 70,
                cameraFOV: 90
                //cameraFOV: 110,
            },

            'voxel-mesher': {},
            'game-shell-fps-camera': {
                position: [0, -100, 0]
            },

            'voxel-artpacks': {},
            'voxel-wireframe': {},
            'voxel-chunkborder': {},
            'voxel-outline': {},
            'voxel-recipes': {},
            'voxel-quarry': {},
            'voxel-measure': {},
            'voxel-webview': {},
            'voxel-vr': {onDemand: true}, // has to be enabled after gl-init to replace renderer
            'voxel-carry': {},
            'voxel-bucket': {fluids: ['water', 'lava']},
            'voxel-fluid': {},
            //'voxel-virus': {materialSource: 'water', material: 'waterFlow', isWater: true}, // requires this.game.materials TODO: water
            'voxel-skyhook': {},
            'voxel-bedrock': {},
            'voxel-blockdata': {},
            'voxel-chest': {},
            'voxel-workbench': {},
            'voxel-furnace': {},
            'voxel-pickaxe': {},
            'voxel-hammer': {},
            'voxel-wool': {},
            'voxel-pumpkin': {},

            'voxel-glass': {},
            'voxel-decorative': {},
            'voxel-inventory-creative': {},
            //'voxel-clientmc': {url: 'ws://localhost:1234', onDemand: true}, // TODO

            // Replaced with 4d generation
            // 'voxel-land': {populateTrees: false, chunkSize: 16},
            // 'voxel-flatland': {block: 'bedrock'},
            'voxel-4d': {},

            'voxel-console': {},
            'voxel-commands': {},
            'voxel-drop': {},
            'voxel-zen': {},


            //'voxel-player': {image: 'player.png', homePosition: [2,14,4], homeRotation: [0,0,0]}, // three.js TODO: stackgl avatar
            'voxel-health': {},
            'voxel-health-bar': {},
            //'voxel-health-fall': {}, // requires voxel-player TODO: enable and test
            'voxel-food': {},
            'voxel-scriptblock': {},
            'voxel-sfx': {},
            'voxel-flight': {},
            'voxel-gamemode': {startMode: 'creative'},
            'voxel-sprint': {},
            'voxel-inventory-hotbar': {inventorySize: 10, wheelEnable: true},
            'voxel-inventory-crafting': {},
            'voxel-reach': {reachDistance: 8},
            'voxel-decals': {},
            // left-click hold to mine
            'voxel-mine': {
                instaMine: true,
                progressTexturesPrefix: 'destroy_stage_',
                progressTexturesCount: 9
            },
            // right-click to place block (etc.)
            'voxel-use': {},
            // handles 'break' event from voxel-mine (left-click hold breaks blocks), collects block and adds to inventory
            'voxel-harvest': {},
            'voxel-voila': {},
            'voxel-fullscreen': {},
            'voxel-keys': {},

            // the GUI window (built-in toggle with 'H')
            //'voxel-debug': {}, // heavily three.js dependent TODO: more debugging options for stackgl-based engine besides camera?
            'camera-debug': {}, // TODO: port from game-shell-fps-camera
            'voxel-plugins-ui': {},
            'kb-bindings-ui': {}
        }
    });
}
start()

const startOld = function (opts, setup) {
    setup = setup || defaultSetup
    var defaults = {
        generateChunks: false,
        texturePath: './textures/',
        materials: ['grass', 'obsidian', 'dirt', 'whitewool', 'crate', 'brick'],
        materialFlatColor: false,
        worldOrigin: [0, 0, 0],
        controls: {discreteFire: true},
        chunkDistance: 2,
        removeDistance: 3,
        chunkSize: terrain.chunkSize,
        fogDisabled: false,
        fogScale: 16,
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

    // TODO convert to plugin
    game.on('fire', function (target, state) {
        var position = blockPosPlace
        if (position) {
            game.createBlock(position, 6)
        } else {
            position = blockPosErase
            if (position) game.setBlock(position, 0)
        }
    })

    // TODO convert to plugin
    level.setScene(game, terrain.setBlockModified)
    // TODO convert to plugin
    gps.use(game, terrain)
}
