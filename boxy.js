// game.js

const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 300 },
            debug: false
        }
    },
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

let player;
let level;
let cursors;
let shiftKey;

function preload() {
    // Load assets if any
}

function create() {
    // Add a simple background color (this was lost in prompt3)
    this.cameras.main.setBackgroundColor('#87CEEB'); // Sky blue color

    // Input Events
    cursors = this.input.keyboard.createCursorKeys();
    shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    // Create Level
    level = new Level(this);

    // Create Player
    player = new Player(this, 100, 450);

    // Create the triangle projectile texture
    Projectile.createProjectileTexture(this);
}

function update(time, delta) {
    // Update Player
    player.update(cursors, shiftKey, time);
}

class Level {
    constructor(scene, platformData = []) {
        this.scene = scene;

        this.platforms = scene.physics.add.staticGroup();

        // Default platform positions
        this.defaultPlatforms = [
            { x: 400, y: 568, width: 800, height: 64, color: 0x228B22 }, // Ground
            { x: 600, y: 400, width: 150, height: 32, color: 0x8B4513 }, // Platform 1
            { x: 50, y: 250, width: 150, height: 32, color: 0x8B4513 },  // Platform 2
            { x: 750, y: 220, width: 150, height: 32, color: 0x8B4513 }   // Platform 3
        ];

        // Use provided platform data or default
        this.platformData = platformData.length > 0 ? platformData : this.defaultPlatforms;

        // Create platforms
        this.createPlatforms();
    }

    createPlatforms() {
        this.platformData.forEach(data => {
            let platform = this.scene.add.rectangle(data.x, data.y, data.width, data.height, data.color);
            this.scene.physics.add.existing(platform, true);
            this.platforms.add(platform);
        });
    }

    getPlatforms() {
        return this.platforms;
    }

    destroy() {
        this.platforms.clear(true, true);
    }
}

class Player {
    constructor(scene, x = 100, y = 450) {
        this.scene = scene;
        this.x = x;
        this.y = y;

        // Create the player as a rectangle
        this.sprite = scene.add.rectangle(this.x, this.y, 32, 48, 0xff0000);
        scene.physics.add.existing(this.sprite);
        this.sprite.body.setBounce(0.2);
        this.sprite.body.setCollideWorldBounds(true);

        // Player properties
        this.facing = 'right';
        this.lastFired = 0;

        // Enable collision between the player and the platforms
        scene.physics.add.collider(this.sprite, level.getPlatforms());

        // Group for projectiles
        this.projectiles = scene.physics.add.group();
    }

    update(cursors, shiftKey, time) {
        // Reset player's horizontal velocity
        this.sprite.body.setVelocityX(0);

        // Movement controls
        if (cursors.left.isDown) {
            this.sprite.body.setVelocityX(-160);
            this.facing = 'left';
        } else if (cursors.right.isDown) {
            this.sprite.body.setVelocityX(160);
            this.facing = 'right';
        }

        // Jumping
        if (cursors.up.isDown && this.sprite.body.touching.down) {
            this.sprite.body.setVelocityY(-330);
        }

        // Firing projectiles when Shift key is pressed
        if (Phaser.Input.Keyboard.JustDown(shiftKey)) {
            // Implement a cooldown of 500ms
            if (time - this.lastFired > 500) {
                this.fireProjectile();
                this.lastFired = time;
            }
        }
    }

    fireProjectile() {
        // Create the projectile at the player's position
        let x = this.sprite.x;
        let y = this.sprite.y;

        // Create an image from the pre-generated triangle texture
        let projectile = new Projectile(this.scene, x, y, this.facing);
        this.projectiles.add(projectile.sprite);
    }

    destroy() {
        this.sprite.destroy();
        this.projectiles.clear(true, true);
    }
}

class Projectile {
    constructor(scene, x, y, direction) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.direction = direction;

        // Create the projectile
        this.sprite = scene.physics.add.image(this.x, this.y, 'triangleProjectile');
        this.sprite.setScale(1);
        this.sprite.body.allowGravity = false;
        this.sprite.setCollideWorldBounds(false);

        // Set velocity based on direction
        let speed = 500;
        if (this.direction === 'left') {
            this.sprite.setVelocityX(-speed);
        } else {
            this.sprite.setVelocityX(speed);
        }

        // Destroy after 1 second
        scene.time.delayedCall(1000, () => {
            this.sprite.destroy();
        });
    }

    static createProjectileTexture(scene) {
        // Create the triangle projectile texture if it doesn't exist
        if (!scene.textures.exists('triangleProjectile')) {
            let graphics = scene.add.graphics({ fillStyle: { color: 0xffff00 } }); // Yellow color
            graphics.fillTriangle(0, 10, 5, 0, 10, 10); // Draw an upward-pointing triangle
            graphics.generateTexture('triangleProjectile', 10, 10);
            graphics.destroy();
        }
    }
}
