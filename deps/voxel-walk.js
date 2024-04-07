/**
 * From https://github.com/danfinlay/voxel-walk/blob/master/index.js
 */
/**
 * The MIT License (MIT)
 *
 * Copyright (c) [2015] [Daniel Jamal Finlay]
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

var walkSpeed = 1.0
var startedWalking = 0.0
var stoppedWalking = 0.0
var walking = false
var acceleration = 1.0

exports.render = function (skin) {
    var time = Date.now() / 1000
    if (walking && time < startedWalking + acceleration) {
        walkSpeed = (time - startedWalking) / acceleration
    }
    if (!walking && time < stoppedWalking + acceleration) {
        walkSpeed = -1 / acceleration * (time - stoppedWalking) + 1
    }

    skin.head.rotation.y = Math.sin(time * 1.5) / 3 * walkSpeed
    skin.head.rotation.z = Math.sin(time) / 2 * walkSpeed

    skin.rightArm.rotation.z = 2 * Math.cos(0.6662 * time * 10 + Math.PI) * walkSpeed
    skin.rightArm.rotation.x = 1 * (Math.cos(0.2812 * time * 10) - 1) * walkSpeed
    skin.leftArm.rotation.z = 2 * Math.cos(0.6662 * time * 10) * walkSpeed
    skin.leftArm.rotation.x = 1 * (Math.cos(0.2312 * time * 10) + 1) * walkSpeed

    skin.rightLeg.rotation.z = 1.4 * Math.cos(0.6662 * time * 10) * walkSpeed
    skin.leftLeg.rotation.z = 1.4 * Math.cos(0.6662 * time * 10 + Math.PI) * walkSpeed
}

exports.startWalking = function () {
    var now = Date.now() / 1000
    walking = true
    if (stoppedWalking + acceleration > now) {
        var progress = now - stoppedWalking;
        startedWalking = now - (stoppedWalking + acceleration - now)
    } else {
        startedWalking = Date.now() / 1000
    }
}
exports.stopWalking = function () {
    var now = Date.now() / 1000
    walking = false
    if (startedWalking + acceleration > now) {
        stoppedWalking = now - (startedWalking + acceleration - now)
    } else {
        stoppedWalking = Date.now() / 1000
    }
}
exports.isWalking = function () {
    return walking
}

exports.setAcceleration = function (newA) {
    acceleration = newA
}