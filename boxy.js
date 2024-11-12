// game.js

class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
    }

    init(data) {
        // Receive level data or set default level to 1
        this.currentLevel = data.level || 1;
    }

    preload() {
        // Load assets if any
    }

    create() {
        // Add a simple background color
        this.cameras.main.setBackgroundColor('#87CEEB'); // Sky blue color

        // Input Events
        this.cursors = this.input.keyboard.createCursorKeys();
        this.shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

        // Initialize Kinematics with current level
        this.kinematics = new Kinematics(this.currentLevel);

        // Create default ProjectileType
        this.projectileType = new ProjectileType(this, {
            size: { width: 10, height: 10 },
            shape: 'triangle',
            speed: 500,
            color: 0xffff00,
            cooldown: 200
        });

        // Create Level
        this.level = new Level(this, this.kinematics);

        // Create Player
        this.player = new Player(this, 100, 450, { maxHearts: 4 }, this.kinematics, this.projectileType);

        // Display level message
        this.levelText = this.add.text(
            this.cameras.main.width / 2,
            this.cameras.main.height / 2,
            'Level ' + this.currentLevel,
            { fontSize: '64px', fill: '#fff' }
        ).setOrigin(0.5);

        // Remove the message after 1.5 seconds
        this.time.delayedCall(1500, () => {
            this.levelText.destroy();
        }, [], this);
    }

    update(time, delta) {
        // Update Player
        this.player.update(this.cursors, this.shiftKey, time);
    }

    levelComplete() {
        // Increase level number
        this.currentLevel += 1;

        // Restart MainScene with new level data
        this.scene.restart({ level: this.currentLevel });
    }
}

// Kinematics Class
class Kinematics {
    static defaultBounceFactor = 0.2;
    static defaultStarFactor = 1; // Set defaultStarFactor to 1

    constructor(level = 1, options = {}) {
        this.level = level;
        this.bounceFactor = options.bounceFactor || Kinematics.defaultBounceFactor;
        this.starFactor = options.starFactor !== undefined ? options.starFactor : Kinematics.defaultStarFactor + (level - 1) * 2;

        // Jump properties
        this.maxJumpTime = options.maxJumpTime || 300; // Max jump duration in milliseconds
        this.jumpSpeed = options.jumpSpeed || -330; // Jump velocity
        this.gravityY = options.gravityY || 300;
    }
}

// ProjectileType Class
class ProjectileType {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.size = options.size || { width: 10, height: 10 };
        this.shape = options.shape || 'triangle'; // can be 'triangle', 'circle', etc.
        this.speed = options.speed || 500;
        this.color = options.color || 0xffff00;
        this.cooldown = options.cooldown || 500; // in milliseconds

        // Generate a unique texture key based on properties
        this.textureKey = 'projectile_' + this.shape + '_' + this.color.toString(16);

        // Generate texture if it doesn't exist
        if (!this.scene.textures.exists(this.textureKey)) {
            let graphics = this.scene.add.graphics({ fillStyle: { color: this.color } });
            if (this.shape === 'triangle') {
                graphics.fillTriangle(0, this.size.height, this.size.width / 2, 0, this.size.width, this.size.height);
            } else if (this.shape === 'circle') {
                graphics.fillCircle(this.size.width / 2, this.size.height / 2, this.size.width / 2);
            }
            // ... other shapes can be added here
            graphics.generateTexture(this.textureKey, this.size.width, this.size.height);
            graphics.destroy();
        }
    }
}

// Inventory Class
class Inventory {
    constructor() {
        this.items = {};
    }

    addItem(item, quantity = 1) {
        if (this.items[item]) {
            this.items[item] += quantity;
        } else {
            this.items[item] = quantity;
        }
    }

    getItemCount(item) {
        return this.items[item] || 0;
    }

    removeItem(item, quantity = 1) {
        if (this.items[item]) {
            this.items[item] -= quantity;
            if (this.items[item] <= 0) {
                delete this.items[item];
            }
        }
    }
}

// Level Class
class Level {
    constructor(scene, kinematics, platformData = [], spikeData = []) {
        this.scene = scene;
        this.kinematics = kinematics;
        this.platforms = scene.physics.add.staticGroup();
        this.spikes = scene.physics.add.staticGroup();
        this.stars = scene.physics.add.group();

        this.inventory = new Inventory(); // Level inventory, empty for now

        // Default platform positions
        this.defaultPlatforms = [
            { x: 400, y: 568, width: 800, height: 64, color: 0x228B22 }, // Ground
            { x: 600, y: 400, width: 150, height: 32, color: 0x8B4513 }, // Platform 1
            { x: 50, y: 250, width: 150, height: 32, color: 0x8B4513 },  // Platform 2
            { x: 750, y: 220, width: 150, height: 32, color: 0x8B4513 }   // Platform 3
        ];

        // Default spike positions
        this.defaultSpikes = [
            { x: 775, y: 540, width: 50, height: 28, color: 0x808080 } // Grey box on far right of ground
        ];

        // Use provided platform data or default
        this.platformData = platformData.length > 0 ? platformData : this.defaultPlatforms;
        this.spikeData = spikeData.length > 0 ? spikeData : this.defaultSpikes;

        // Create platforms and spikes
        this.createPlatforms();
        this.createSpikes();

        // Create stars (collectibles)
        this.createStars();
    }

    createPlatforms() {
        this.platformData.forEach(data => {
            let platform = this.scene.add.rectangle(data.x, data.y, data.width, data.height, data.color);
            this.scene.physics.add.existing(platform, true);
            this.platforms.add(platform);
        });
    }

    createSpikes() {
        this.spikeData.forEach(data => {
            let spike = this.scene.add.rectangle(data.x, data.y, data.width, data.height, data.color);
            this.scene.physics.add.existing(spike, true);
            this.spikes.add(spike);
        });
    }

    createStars() {
        // Generate stars based on starFactor from Kinematics
        let numberOfStars = this.kinematics.starFactor;
        for (let i = 0; i < numberOfStars; i++) {
            let x = Phaser.Math.Between(50, 750);
            let y = Phaser.Math.Between(50, 500);
            // Create stars as circles
            let star = this.scene.add.circle(x, y, 7, 0xffff00); // Yellow circle as star
            this.scene.physics.add.existing(star);
            star.body.setBounceY(Phaser.Math.FloatBetween(0.4, 0.8));
            this.stars.add(star);
        }

        // Store the initial number of stars
        this.totalStars = numberOfStars;

        // Collide stars with platforms so they land on them
        this.scene.physics.add.collider(this.stars, this.platforms);
    }

    getPlatforms() {
        return this.platforms;
    }

    getSpikes() {
        return this.spikes;
    }

    getStars() {
        return this.stars;
    }

    destroy() {
        this.platforms.clear(true, true);
        this.spikes.clear(true, true);
        this.stars.clear(true, true);
    }
}

// Player Class
class Player {
    constructor(scene, x = 100, y = 450, options = {}, kinematics, projectileType) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.kinematics = kinematics;
        this.projectileType = projectileType;

        this.maxHearts = options.maxHearts || 4;
        this.hearts = this.maxHearts; // Player starts with full health

        this.inventory = new Inventory(); // Player inventory

        // Create the player as a rectangle
        this.sprite = scene.add.rectangle(this.x, this.y, 32, 48, 0xff0000);
        scene.physics.add.existing(this.sprite);
        this.sprite.body.setBounce(this.kinematics.bounceFactor);
        this.sprite.body.setCollideWorldBounds(true);

        // Initialize gravity
        this.sprite.body.setGravityY(this.kinematics.gravityY);

        // Player properties
        this.facing = 'right';
        this.lastFired = 0;

        // Jump properties
        this.isJumping = false;
        this.jumpTime = 0;

        // Enable collision between the player and the platforms
        scene.physics.add.collider(this.sprite, scene.level.getPlatforms());

        // Collision with spikes
        scene.physics.add.overlap(this.sprite, scene.level.getSpikes(), this.hitSpike, null, this);

        // Collision with stars
        scene.physics.add.overlap(this.sprite, scene.level.getStars(), this.collectStar, null, this);

        // Group for projectiles
        this.projectiles = scene.physics.add.group();

        // Display hearts
        this.heartsGroup = scene.add.group();
        this.createHeartsDisplay();

        // Display star count
        this.starText = scene.add.text(20, 50, 'Stars: 0', { fontSize: '16px', fill: '#000' });
        this.starText.setScrollFactor(0);
    }

    createHeartsDisplay() {
        // Clear any existing hearts
        this.heartsGroup.clear(true, true);

        // Create heart shapes
        for (let i = 0; i < this.maxHearts; i++) {
            let heartColor = 0xff0000; // Red
            let x = 20 + i * 20; // Spacing between hearts
            let y = 20;

            // Use half-heart if necessary
            if (i < Math.floor(this.hearts)) {
                // Full heart
                let heart = this.scene.add.rectangle(x, y, 16, 16, heartColor);
                this.heartsGroup.add(heart);
            } else if (i < this.hearts) {
                // Half heart
                let heart = this.scene.add.rectangle(x, y, 8, 16, heartColor);
                this.heartsGroup.add(heart);
            } else {
                // Empty heart (gray)
                let emptyHeartColor = 0x808080; // Gray
                let heart = this.scene.add.rectangle(x, y, 16, 16, emptyHeartColor);
                this.heartsGroup.add(heart);
            }
        }

        // Set hearts to be fixed to the camera
        this.heartsGroup.children.each(heart => {
            heart.setScrollFactor(0);
        });
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

        // Check if player is on the ground
        const isOnGround = this.sprite.body.blocked.down || this.sprite.body.touching.down;

        // Variable Jumping
        if (cursors.up.isDown) {
            if (isOnGround) {
                // Start jump
                this.isJumping = true;
                this.jumpTime = 0;
                this.sprite.body.setVelocityY(this.kinematics.jumpSpeed);
            } else if (this.isJumping && this.jumpTime < this.kinematics.maxJumpTime) {
                // Continue jumping
                this.sprite.body.setVelocityY(this.kinematics.jumpSpeed);
                this.jumpTime += this.scene.game.loop.delta;
            } else {
                // Max jump time reached
                this.isJumping = false;
            }
        } else {
            // Stop jumping if up key is released
            this.isJumping = false;
        }

        // Accelerated fall
        if (cursors.down.isDown && !isOnGround) {
            this.sprite.body.setGravityY(this.kinematics.gravityY * 2); // Increase gravity
        } else {
            this.sprite.body.setGravityY(this.kinematics.gravityY); // Normal gravity
        }

        // Firing projectiles when Shift key is pressed
        if (Phaser.Input.Keyboard.JustDown(shiftKey)) {
            if (time - this.lastFired > this.projectileType.cooldown) {
                this.fireProjectile();
                this.lastFired = time;
            }
        }
    }

    fireProjectile() {
        // Create the projectile at the player's position
        let x = this.sprite.x;
        let y = this.sprite.y;

        // Create a new projectile using the projectileType
        let projectile = new Projectile(this.scene, x, y, this.facing, this.projectileType);
        this.projectiles.add(projectile.sprite);
    }

    hitSpike(playerSprite, spike) {
        // Reduce health by 0.5
        this.hearts -= 0.5;

        // Ensure health does not go below zero
        if (this.hearts < 0) this.hearts = 0;

        // Update hearts display
        this.createHeartsDisplay();

        // Check if player is dead
        if (this.hearts <= 0) {
            // Handle player death
            this.scene.scene.start('GameOverScene');
        }
    }

    collectStar(playerSprite, star) {
        // Destroy the star
        star.destroy();

        // Increment star count in inventory
        this.inventory.addItem('stars', 1);

        // Update star text
        let starCount = this.inventory.getItemCount('stars');
        this.starText.setText('Stars: ' + starCount);

        // Check if all stars have been collected
        if (starCount >= this.scene.level.totalStars) {
            // Level complete
            this.scene.levelComplete();
        }
    }

    destroy() {
        this.sprite.destroy();
        this.projectiles.clear(true, true);
        this.heartsGroup.clear(true, true);
        this.starText.destroy();
    }
}

// Projectile Class
class Projectile {
    constructor(scene, x, y, direction, projectileType) {
        this.scene = scene;
        this.x = x;
        this.y = y;
        this.direction = direction;
        this.type = projectileType;

        // Create the projectile
        this.sprite = scene.physics.add.image(this.x, this.y, this.type.textureKey);
        this.sprite.setScale(1);
        this.sprite.body.allowGravity = false;
        this.sprite.body.setCollideWorldBounds(false);

        // Set velocity based on direction and speed from projectileType
        let speed = this.type.speed;
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
}

// GameOverScene Class
class GameOverScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameOverScene' });
    }

    preload() {
        // Load assets if any
    }

    create() {
        // Add a simple background color
        this.cameras.main.setBackgroundColor('#000000'); // Black background

        // Display "Game Over" text
        this.add.text(400, 200, 'Game Over', { fontSize: '64px', fill: '#fff' }).setOrigin(0.5);

        // Create "Try Again" button
        let tryAgainButton = this.add.text(400, 300, 'Try Again', { fontSize: '32px', fill: '#fff', backgroundColor: '#ff0000' })
            .setOrigin(0.5)
            .setInteractive();

        tryAgainButton.on('pointerdown', () => {
            // Restart the MainScene with level 1
            this.scene.start('MainScene', { level: 1 });
        });
    }
}

// Configuration and game initialization moved to the bottom as per user request
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
    scene: [MainScene, GameOverScene]
};

const game = new Phaser.Game(config);
