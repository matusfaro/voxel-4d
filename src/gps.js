/**
 * Updates position of the player onto the screen.
 *
 * @param game
 * @param terrain Terrain module
 */
exports.use = function (game, terrain) {

    // Update position on screen
    const xEl = document.getElementById('position-x')
    const yEl = document.getElementById('position-y')
    const zEl = document.getElementById('position-z')
    const wEl = document.getElementById('position-w')
    game.on('tick', function () {
        const playerPosition = game.playerPosition()
        yEl.innerHTML = playerPosition[1].toFixed(1)
        const pTransformed = terrain.pTransformer(playerPosition[0], playerPosition[2])
        xEl.innerHTML = pTransformed[0].toFixed(1)
        zEl.innerHTML = pTransformed[1].toFixed(1)
        wEl.innerHTML = pTransformed[2].toFixed(1)
    })

    // Show visual axis on screen
    // https://discourse.threejs.org/t/implementing-viewhelper-to-the-project/45947
    // game.scene.add(new game.THREE.AxesHelper(2000));
    // helper
    // const visualEl = document.getElementById('position-visual')
    // const helper = new ViewHelper.default(game.camera, visualEl);
    // game.on('tick', function () {
    //     helper.render(renderer);
    // })

    // TODO
    // const scene2 = new game.THREE.Scene();
    // const camera2 = new game.THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // game.scene2 = scene2;
    // game.camera2 = camera2;
    // game.renderer2 = new game.THREE.WebGLRenderer();
    // game.renderer2.setSize(150, 150);
    // visualEl.appendChild(game.renderer2.domElement);
    //
    // camera2.position.copy(game.camera.position);
    // camera2.position.sub(game.controls.center);
    // camera2.position.setLength(300);
    // camera2.lookAt(scene2.position);
    // game.on('tick', function () {
    //     game.renderer2.render(scene2, camera2);
    // })
}
