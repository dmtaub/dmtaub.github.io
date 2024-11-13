// InputManager.js

export default class InputManager {
    constructor(scene, virtualKeyboard) {
        this.scene = scene;
        this.cursors = this.scene.input.keyboard.createCursorKeys(); // Physical keyboard cursors
        // this.shiftKey = this.scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

        this.virtualKeyboard = virtualKeyboard;

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

    isShiftPressed() {
        return this.cursors.shift.isDown || this.virtualKeys.shift;
    }
}
