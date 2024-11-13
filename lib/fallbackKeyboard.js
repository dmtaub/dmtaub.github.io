// fallbackKeyboard.js

class FallbackKeyboard {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.keys = options.keys || ['LEFT', 'RIGHT', 'UP', 'DOWN', 'SPACE', 'SHIFT']; // Default keys
        this.keySize = options.keySize || { width: 50, height: 50 }; // Size of each key
        this.margin = options.margin || 10; // Space between keys
        this.position = options.position || { x: 100, y: 400 }; // Starting position for keyboard

        // Holds references to each key button
        this.buttons = {};

        // Create the keyboard
        this.createKeyboard();
    }

    createKeyboard() {
        const { x: startX, y: startY } = this.position;
        let xPos = startX;
        let yPos = startY;

        // Loop through each key in the keys array and create a button for each
        this.keys.forEach((key) => {
            // Create the key button
            const button = this.scene.add.rectangle(xPos, yPos, this.keySize.width, this.keySize.height, 0x888888);
            button.setInteractive();

            // Display the key label
            const label = this.scene.add.text(xPos, yPos, key, { fontSize: '16px', fill: '#ffffff' }).setOrigin(0.5);

            // Store the button and label in the buttons object with the key name as the identifier
            this.buttons[key] = { button, label };

            // Add input event listeners to simulate key press and release
            button.on('pointerdown', () => this.simulateKeyPress(key, true));
            button.on('pointerup', () => this.simulateKeyPress(key, false));

            // Calculate the next button position
            xPos += this.keySize.width + this.margin;

            // If the keyboard row is too wide, start a new row
            if (xPos > this.scene.sys.game.config.width - this.keySize.width) {
                xPos = startX;
                yPos += this.keySize.height + this.margin;
            }
        });
    }

    simulateKeyPress(key, isDown) {
        // Map the key name to Phaser's input keys (example: LEFT becomes LEFT)
        const mappedKey = this.getPhaserKey(key);

        if (mappedKey) {
            if (isDown) {
                this.scene.input.keyboard.emit('keydown', mappedKey);
            } else {
                this.scene.input.keyboard.emit('keyup', mappedKey);
            }
        }
    }

    getPhaserKey(key) {
        // Map custom keys to Phaser key codes
        const keyMapping = {
            'LEFT': 'LEFT',
            'RIGHT': 'RIGHT',
            'UP': 'UP',
            'DOWN': 'DOWN',
            'SPACE': 'SPACE',
            'SHIFT': 'SHIFT'
        };
        return keyMapping[key] || null;
    }

    // Destroy the virtual keyboard elements
    destroy() {
        Object.values(this.buttons).forEach(({ button, label }) => {
            button.destroy();
            label.destroy();
        });
        this.buttons = {};
    }
}

export default FallbackKeyboard;

