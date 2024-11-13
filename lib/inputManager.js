// InputManager.js
import FallbackKeyboard from "./fallbackKeyboard.js";

export default class InputManager {
    constructor(scene, virtualKeyboard) {
        this.scene = scene;
        this.cursors = this.scene.input.keyboard.createCursorKeys(); // Physical keyboard cursors
        this.virtualKeyboard = new FallbackKeyboard(scene, {
            position: { x: 100, y: 568 },
        });
        this.shiftKey = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

        // Initialize the state for virtual key presses
        this.virtualKeys = {
            left: false,
            right: false,
            up: false,
            down: false,
            space: false,
            shift: false
        };

        // Set up virtual keyboard listeners
        this.initializeVirtualKeyListeners();
    }

    initializeVirtualKeyListeners() {
        // Listen for virtual keyboard events and update the virtual key state
        Object.keys(this.virtualKeys).forEach((key) => {
            this.virtualKeyboard.buttons[key.toUpperCase()].button
                .on('pointerdown', () => this.virtualKeys[key] = true)
                .on('pointerup', () => this.virtualKeys[key] = false);
        });
    }
    
    isLeftPressed() {
        return this.cursors.left.isDown || this.virtualKeys.left;
    }

    isRightPressed() {
        return this.cursors.right.isDown || this.virtualKeys.right;
    }

    isUpPressed() {
        return this.cursors.up.isDown || this.virtualKeys.up;
    }

    isDownPressed() {
        return this.cursors.down.isDown || this.virtualKeys.down;
    }

    isSpacePressed() {
        return this.cursors.space.isDown || this.virtualKeys.space;
    }

    // only one that doesn't auto-repeat for now...
    isShiftPressed() {
        const shiftVal = Phaser.Input.Keyboard.JustDown(this.shiftKey) || this.virtualKeys.shift;
        this.virtualKeys.shift = false; // Reset shift key state after each press
        return shiftVal;
    }
}
