// fallbackKeyboard.js
const buttonColor = 0x666666;

class FallbackKeyboard {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.keys = options.keys || ['LEFT', 'RIGHT', 'UP', 'DOWN', 'SPACE', 'SHIFT']; // Default keys
        this.keySize = options.keySize || { width: 50, height: 50 }; // Size of each key
        this.margin = options.margin || 10; // Space between keys
        this.position = options.position || { x: 50, y: 568 }; // Starting position for keyboard
        this.keyPositions = options.keyPositions || {
            LEFT: { x: 0, y: 0 },
            RIGHT: { x: 1, y: 0 },
            UP: { x: 12, y: 0 },
            DOWN: { x: 3, y: 0 },
            SPACE: { x: 4, y: 0, hidden: true },
            SHIFT: { x: 11, y: 0 }
        }
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
        this.scene.input.addPointer(3);
        // Listen for virtual keyboard events and update the virtual key state
        Object.keys(this.virtualKeys).forEach((key) => {
            const button = this.buttons[key.toUpperCase()].button;
            if (!button) return;
            button
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
        // default to starting position
        let xPos = startX;
        let yPos = startY;

        // Loop through each key in the keys array and create a button for each
        this.keys.forEach((key, index) => {
            // if the key is in the keyPositions object, use the specified position
            if (this.keyPositions[key]) {
                if (this.keyPositions[key].hidden) {
                    this.buttons[key] = { button: null, label: null};
                    return;
                }
                xPos = startX + this.keyPositions[key].x * (this.keySize.width + this.margin);
                yPos = startY - this.keyPositions[key].y * (this.keySize.height + this.margin);
            } else {
                // otherwise, base on index and margin
                xPos = startX + index * (this.keySize.width + this.margin);
                // if row it too wide, move up to previous row
                if (xPos > this.scene.sys.game.config.width - this.keySize.width) { 
                    xPos = startX;
                    yPos = startY - this.keySize.height + this.margin;
                } else {
                    yPos = startY;
                }
            }

            // Create the key button
            const button = this.scene.add.rectangle(xPos, yPos, this.keySize.width, this.keySize.height, buttonColor);
            button.setInteractive();

            // Display the key label
            const label = this.scene.add.text(xPos, yPos, key, { fontSize: '16px', fill: '#ffffff' }).setOrigin(0.5);

            // Store the button and label in the buttons object with the key name as the identifier
            this.buttons[key] = { button, label };
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

