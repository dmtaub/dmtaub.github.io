// game.js

import InputManager from './lib/inputManager.js';

// import fallbackKeyboard
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

        // Initialize Kinematics with current level
        this.kinematics = new Kinematics(this.currentLevel);

        // Create default ProjectileType
        this.projectileType = new ProjectileType(this, {
            size: { width: 10, height: 10 },
            shape: 'triangle',
            speed: 500,
            color: 0xffff00,
            cooldown: 200, // default cooldown set to 200 milliseconds
            recoilForce: 100 // how much to recoil
        });

        // Create Level
        this.level = new Level(this, this.kinematics);

        // Input Events
        this.inputManager = new InputManager(this, this.virtualKeyboard);


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

        // Set up collision for stars colliding with projectiles
        this.physics.add.collider(this.level.getStars(), this.player.projectiles);
    }

    update(time, delta) {
        // Update Player
        this.player.update(this.inputManager, this.shiftKey, time);
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

        // Player speed properties - impacts movement and jump
        this.weightSlowFactor = options.weightSlowFactor || 0.05; // Default weight slow factor
        this.minPlayerSpeed = options.minPlayerSpeed || 0.5; // Minimum player speed
        this.maxPlayerSpeed = options.maxPlayerSpeed || 1.2; // Maximum player speed

        // Jump properties
        this.maxJumpTime = options.maxJumpTime || 300; // Max jump duration in milliseconds
        this.jumpSpeed = options.jumpSpeed || -330; // Jump velocity
        this.gravityY = options.gravityY || 300;

        // Default item bounce values [x, y]
        this.defaultItemBounce = options.defaultItemBounce || { x: 0.8, y: 0.8 };
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
        this.cooldown = options.cooldown || 200; // default cooldown set to 200 milliseconds
        this.recoilForce = options.recoilForce || 100; // how much to recoil

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
        this.totalWeight = 0; // Add totalWeight property
    }

    addItem(item, quantity = 1, weight = 0) {
        if (this.items[item]) {
            this.items[item].quantity += quantity;
        } else {
            this.items[item] = { quantity: quantity, weight: weight };
        }
        // Update total weight
        this.totalWeight += weight * quantity;
    }

    getItemCount(item) {
        return this.items[item] ? this.items[item].quantity : 0;
    }

    removeItem(item, quantity = 1) {
        if (this.items[item]) {
            this.items[item].quantity -= quantity;
            // Update total weight
            this.totalWeight -= this.items[item].weight * quantity;
            if (this.items[item].quantity <= 0) {
                delete this.items[item];
            }
        }
    }

    getTotalWeight() {
        return this.totalWeight;
    }
}

// Level Class
class Level {
    constructor(scene, kinematics, wallData = [], platformData = [], spikeData = []) {
        this.scene = scene;
        this.kinematics = kinematics;
        this.walls = scene.physics.add.staticGroup();
        this.platforms = scene.physics.add.staticGroup();
        this.spikes = scene.physics.add.staticGroup();
        this.stars = scene.physics.add.group();

        this.inventory = new Inventory(); // Level inventory, empty for now

        // Default wall positions
        this.defaultWalls = [
            { x: 400, y: 568, width: 800, height: 64, color: 0x228B22, name: "ground" }, // Ground (wall)
            { x: 600, y: 400, width: 150, height: 32, color: 0x8B4513 }, // Wall 1
            { x: 50, y: 250, width: 150, height: 32, color: 0x8B4513 },  // Wall 2
            { x: 750, y: 220, width: 150, height: 32, color: 0x8B4513 }   // Wall 3
        ];

        // Default platform positions
        this.defaultPlatforms = [
            { x: 400, y: 350, width: 200, height: 16, color: 0x800080 } // Purple platform
        ];

        // Default spike positions
        this.defaultSpikes = [
            { x: 775, y: 540, width: 50, height: 28, color: 0x808080 } // Grey box on far right of ground
        ];

        // Use provided data or default
        this.wallData = wallData.length > 0 ? wallData : this.defaultWalls;
        this.platformData = platformData.length > 0 ? platformData : this.defaultPlatforms;
        this.spikeData = spikeData.length > 0 ? spikeData : this.defaultSpikes;

        // Create walls, platforms, and spikes
        this.createWalls();
        this.createPlatforms();
        this.createSpikes();

        // Create stars (collectibles)
        this.createStars();


        // Colliders with friction control
        scene.physics.add.collider(this.getStars(), this.getWalls(), (star, wall) => {
            star.body.setFriction(wall.friction || 0, wall.friction || 0); // Use wall friction if defined
        });

        scene.physics.add.collider(this.getStars(), this.getPlatforms(), (star, platform) => {
            star.body.setFriction(platform.friction || 0, platform.friction || 0); // Use platform friction if defined
        });

        scene.physics.add.collider(this.getStars(), this.getSpikes(), (star, spike) => {
            star.body.setFriction(spike.friction || 0, spike.friction || 0); // Use spike friction if defined
        });
    }

    createWalls() {
        this.wallData.forEach(data => {
            let wall = this.scene.add.rectangle(data.x, data.y, data.width, data.height, data.color);
            wall.name = data.name || "";
            this.scene.physics.add.existing(wall, true);
            this.walls.add(wall);
        });
    }

    createPlatforms() {
        this.platformData.forEach(data => {
            // Create platform with rounded edges using Graphics
            let graphics = this.scene.add.graphics();
            graphics.fillStyle(data.color, 1);
            graphics.fillRoundedRect(0, 0, data.width, data.height, 10); // radius 10

            // Generate texture from graphics
            let textureKey = 'platform_' + data.x + '_' + data.y;
            graphics.generateTexture(textureKey, data.width, data.height);
            graphics.destroy();

            // Create sprite from texture
            let platform = this.scene.add.image(data.x, data.y, textureKey).setOrigin(0.5, 0.5);
            this.scene.physics.add.existing(platform, true);
            this.platforms.add(platform);

            // Ensure physics body matches the visual size
            platform.body.setSize(data.width, data.height);
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
            let y = Phaser.Math.Between(50, 300);

            // Create stars as circles
            let star = this.scene.add.circle(x, y, 7, 0xffff00); // Yellow circle as star
            this.scene.physics.add.existing(star);
            this.stars.add(star);

            // Set bounce and ensure no friction or damping
            star.body.setBounce(this.kinematics.defaultItemBounce.x, this.kinematics.defaultItemBounce.y);
            star.body.setCollideWorldBounds(true);

            // Random initial velocity for more dynamic interaction
            star.body.setVelocity(Phaser.Math.Between(-100, 100), Phaser.Math.Between(-100, 100)); // Random initial velocity
        }

        // Store the initial number of stars
        this.totalStars = numberOfStars;

        // Collide stars with walls and platforms so they land on them
        this.scene.physics.add.collider(this.stars, this.walls, this.starWallCollision, null, this);
        this.scene.physics.add.collider(this.stars, this.platforms);

        // Enable stars to collide with each other
        this.scene.physics.add.collider(this.stars, this.stars);
    }

    starWallCollision(star, wall) {
        // Reduce star's velocity when colliding with walls or ground
        star.body.velocity.x *= 0.9; // Lose 10% speed on X-axis
        star.body.velocity.y *= 0.9; // Lose 10% speed on Y-axis

        // If the wall is the ground, reduce more speed
        if (wall.name == "ground") {
            star.body.velocity.x *= 0.5; // Lose additional speed on ground
            star.body.velocity.y *= 0.5;
        }
    }

    getWalls() {
        return this.walls;
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
        this.walls.clear(true, true);
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

        // Movement speed
        this.baseSpeed = 160;

        // Enable collision between the player and the walls
        scene.physics.add.collider(this.sprite, scene.level.getWalls());

        // Collision with platforms (one-way)
        scene.physics.add.collider(this.sprite, scene.level.getPlatforms(), null, this.platformCollisionCallback, this);

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

    platformCollisionCallback(playerSprite, platform) {
        // Only collide when the player is falling (moving downwards)
        return playerSprite.body.velocity.y >= 0;
    }

    update(inputManager, shiftKey, time) {
        // Calculate current speed and jump speed based on inventory weight
        let totalWeight = this.inventory.getTotalWeight();
        let speedFactor = 1 - totalWeight * this.kinematics.weightSlowFactor; // Adjust as needed
        speedFactor = Phaser.Math.Clamp(speedFactor, this.kinematics.minPlayerSpeed, this.kinematics.maxPlayerSpeed); // Minimum 50% speed
        let currentSpeed = this.baseSpeed * speedFactor;
        let currentJumpSpeed = this.kinematics.jumpSpeed * speedFactor;

        // Reset player's horizontal velocity
        this.sprite.body.setVelocityX(0);

        // Movement controls
        if (inputManager.isLeftPressed()) {
            this.sprite.body.setVelocityX(-currentSpeed);
            this.facing = 'left';
        } else if (inputManager.isRightPressed()) {
            this.sprite.body.setVelocityX(currentSpeed);
            this.facing = 'right';
        }

        // Check if player is on the ground
        const isOnGround = this.sprite.body.blocked.down || this.sprite.body.touching.down;

        // Variable Jumping
        if (inputManager.isUpPressed() || inputManager.isSpacePressed()) {
            if (isOnGround) {
                // Start jump
                this.isJumping = true;
                this.jumpTime = 0;
                this.sprite.body.setVelocityY(currentJumpSpeed);
            } else if (this.isJumping && this.jumpTime < this.kinematics.maxJumpTime) {
                // Continue jumping
                this.sprite.body.setVelocityY(currentJumpSpeed);
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
        if (inputManager.isDownPressed() && !isOnGround) {
            this.sprite.body.setGravityY(this.kinematics.gravityY * 2); // Increase gravity
        } else {
            this.sprite.body.setGravityY(this.kinematics.gravityY); // Normal gravity
        }

        // Firing projectiles when Shift key is pressed
        if (inputManager.isShiftPressed()) {
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
        projectile.init();

        // Apply recoil to player
        let recoilForce = projectile.type.recoilForce; // Around 100 for default projectile
        // adjust recoil force based on inventory weight, clamp to 0
        recoilForce -= this.inventory.getTotalWeight();
        recoilForce = Math.max(recoilForce, 0);

        if (this.facing === 'left') {
            this.sprite.body.velocity.x += recoilForce;
        } else {
            this.sprite.body.velocity.x -= recoilForce;
        }
    }

    hitSpike(playerSprite, spike) {
        // Reduce health by 0.5
        this.hearts -= 0.5;

        // Ensure health does not go below zero
        if (this.hearts < 0) this.hearts = 0;

        // Update hearts display
        this.createHeartsDisplay();

        // Apply recoil to player
        let recoilForceY = 200; // Adjust as needed
        let recoilForceX = 300; // Adjust as needed
        if (this.sprite.body.touching.left) {
            this.sprite.body.velocity.x = recoilForceX;
        } else if (this.sprite.body.touching.right) {
            this.sprite.body.velocity.x = -recoilForceX;
        }
        this.sprite.body.velocity.y = -recoilForceY; // Knock back upwards

        // Check if player is dead
        if (this.hearts <= 0) {
            // Handle player death
            this.scene.scene.start('GameOverScene');
        }
    }

    collectStar(playerSprite, star) {
        // Destroy the star
        star.destroy();

        // Assume each star has a weight of 1
        let itemWeight = 1;

        // Increment star count in inventory
        this.inventory.addItem('stars', 1, itemWeight);

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
    }

    init() {
        // Set velocity based on direction and speed from projectileType
        let speed = this.type.speed;
        if (this.direction === 'left') {
            this.sprite.setVelocityX(-speed);
        } else {
            this.sprite.setVelocityX(speed);
        }

        // Destroy after 1 second
        this.scene.time.delayedCall(1000, () => {
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

// Configuration and game initialization
const config = {
    type: Phaser.AUTO,
    scale: {
        mode: Phaser.Scale.FIT,
    },
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

// set scale on load
setTimeout(() => {
    game.scale.setParentSize(window.innerWidth, window.innerHeight);
}, 100);

// export as module
export default game;