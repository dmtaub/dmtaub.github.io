// InputManager.js
import FallbackKeyboard from "./fallbackKeyboard.js";

function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent) ||
           ('ontouchstart' in window && navigator.maxTouchPoints > 0);
}

export default class InputManager {
    constructor(scene, virtualKeyboard) {
        this.scene = scene;
        this.cursors = this.scene.input.keyboard.createCursorKeys(); // Physical keyboard cursors
        // create virtual keyboard only if we're on mobile
        if (isMobileDevice()) {
            this.virtualKeyboard = new FallbackKeyboard(scene, {});
        } else {
            this.virtualKeyboard = {virtualKeys: {}};
        }
        this.shiftKey = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    }

    isLeftPressed() {
        return this.cursors.left.isDown || this.virtualKeyboard.virtualKeys.left;
    }

    isRightPressed() {
        return this.cursors.right.isDown || this.virtualKeyboard.virtualKeys.right;
    }

    isUpPressed() {
        return this.cursors.up.isDown || this.virtualKeyboard.virtualKeys.up;
    }

    isDownPressed() {
        return this.cursors.down.isDown || this.virtualKeyboard.virtualKeys.down;
    }

    isSpacePressed() {
        return this.cursors.space.isDown || this.virtualKeyboard.virtualKeys.space;
    }

    // only one that doesn't auto-repeat for now...
    isShiftPressed() {
        const shiftVal = Phaser.Input.Keyboard.JustDown(this.shiftKey) || this.virtualKeyboard.virtualKeys.shift;
        this.virtualKeyboard.virtualKeys.shift = false; // Reset shift key state after each press
        return shiftVal;
    }
}
