exports.setScene = function (game, setBlock) {
    // game.scene.fog = new game.THREE.Fog(0x000000, 10, 1000)

    addHouse(setBlock, -34, -15, -30, -20, 13)
}

function addHouse(setBlock, fromX, fromZ, toX, toZ, y) {
    addHollowBox(setBlock, [fromX, y, fromZ], [toX, y + 3, toZ], 6)
}

function addHollowBox(setBlock, from, to, material) {
    for (var x = Math.min(from[0], to[0]); x <= Math.max(from[0], to[0]); x++) {
        const isEdgeX = x === from[0] || x === to[0]
        for (var y = Math.min(from[1], to[1]); y <= Math.max(from[1], to[1]); y++) {
            const isEdgeY = y === from[1] || y === to[1]
            for (var z = Math.min(from[2], to[2]); z <= Math.max(from[2], to[2]); z++) {
                const isEdgeZ = z === from[2] || z === to[2]
                setBlock([x, y, z], (isEdgeX || isEdgeY || isEdgeZ) ? material : 0)
            }
        }
    }
}

function addBox(setBlock, from, to, material) {
    for (var x = Math.min(from[0], to[0]); x <= Math.max(from[0], to[0]); x++) {
        for (var y = Math.min(from[1], to[1]); y <= Math.max(from[1], to[1]); y++) {
            for (var z = Math.min(from[2], to[2]); z <= Math.max(from[2], to[2]); z++) {
                setBlock([x, y, z], material)
            }
        }
    }
}