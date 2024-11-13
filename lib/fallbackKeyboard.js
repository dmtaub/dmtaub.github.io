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


        // Initialize the state for virtual key presses
        this.virtualKeys = {
            left: false,
            right: false,
            up: false,
            down: false,
            space: false,
            shift: false
        };

        // Create the keyboard
        this.createKeyboard();
        // Set up virtual keyboard listeners
        this.initializeVirtualKeyListeners();
    }

    initializeVirtualKeyListeners() {
        // Listen for virtual keyboard events and update the virtual key state
        Object.keys(this.virtualKeys).forEach((key) => {
            this.buttons[key.toUpperCase()].button
                .on('pointerdown', () => this.virtualKeys[key] = true)
                .on('pointerup', () => this.virtualKeys[key] = false)
                .on('pointerout', () => this.virtualKeys[key] = false);
        });
        // call pointerout when leaving canvas
        document.querySelector('canvas').addEventListener('mouseleave', () => {
            Object.keys(this.virtualKeys).forEach((key) => {
                this.virtualKeys[key] = false;
            });
        });
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

            // Calculate the next button position
            xPos += this.keySize.width + this.margin;

            // If the keyboard row is too wide, start a new row
            if (xPos > this.scene.sys.game.config.width - this.keySize.width) {
                xPos = startX;
                yPos += this.keySize.height + this.margin;
            }
        });
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

