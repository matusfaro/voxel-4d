const peerjsmesh = require("@manishiitg/peerjs-mesh")

/** Session ID to Player ID */
const sidToPid = {}
const pidToPosition = {}
const pidToAvatar = {}

exports.connect = function (game, terrain) {

    const mesh = peerjsmesh.mesh('github.com/matusfaro/voxel-4d')

    mesh.on("initData", function (sid, data) {
        console.log('DEBUG initData', sid, data)
        sidToPid[data.pid] = sid
        createPlayer(game, data.pid)
        handleMessage(data)
    })

    mesh.on("data", function (data) {
        console.log('DEBUG data', data)
        handleMessage(terrain, data)
    })

    mesh.on("peerdropped", function (id, peerlist) {
        console.log('DEBUG peerdropped', id, peerlist)
        removePlayer(game, id)
    })

    mesh.on("error", function (msg) {
        console.error("PeerJS Mesh Error: " + msg)
    })
}

function handleMessage(terrain, msg) {
    pidToPosition[msg.pid] = msg.pos
}

function tick(game, terrain, mesh) {
// TODO
    // const pTransformed = terrain.pTransformer(playerPosition[0], playerPosition[2])

}

function createPlayer(game, pid) {
    var skinOpts = {}
    skinOpts.scale = new game.THREE.Vector3(0.04, 0.04, 0.04);
    var playerSkin = skin(game.THREE, img, skinOpts);
    var player = playerSkin.mesh;
    var physics = game.makePhysical(player);
    physics.playerSkin = playerSkin;

    player.position.set(0, 562, -20);
    game.scene.add(player);
    game.addItem(physics);

    physics.yaw = player;
    physics.pitch = player.head;
    physics.subjectTo(game.gravity);
    physics.blocksCreation = true;

    game.control(physics);

    physics.move = function (x, y, z) {
        var xyz = parseXYZ(x, y, z);
        physics.yaw.position.x += xyz.x;
        physics.yaw.position.y += xyz.y;
        physics.yaw.position.z += xyz.z;
    };

    physics.moveTo = function (x, y, z) {
        var xyz = parseXYZ(x, y, z);
        physics.yaw.position.x = xyz.x;
        physics.yaw.position.y = xyz.y;
        physics.yaw.position.z = xyz.z;
    };

    var pov = 1;
    physics.pov = function (type) {
        if (type === 'first' || type === 1) {
            pov = 1;
        } else if (type === 'third' || type === 3) {
            pov = 3;
        }
        physics.possess();
    };

    physics.toggle = function () {
        physics.pov(pov === 1 ? 3 : 1);
    };

    physics.possess = function () {
        if (possessed) possessed.remove(game.camera);
        var key = pov === 1 ? 'cameraInside' : 'cameraOutside';
        player[key].add(game.camera);
        possessed = player[key];
    };

    physics.position = physics.yaw.position;

    return physics;
}

function removePlayer(id) {

}
