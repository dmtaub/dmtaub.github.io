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
let platforms;
let cursors;
let projectiles;
let shiftKey;

function preload () {
    // Load images or sprites here (if any)

    // this.load.image('sky', 'assets/sky.png');
    // this.load.image('ground', 'assets/platform.png');
    // this.load.image('star', 'assets/star.png');
    // this.load.image('bomb', 'assets/bomb.png');
    // this.load.spritesheet('dude', 'assets/dude.png', { frameWidth: 32, frameHeight: 48 });
}

function create () {
    // Add a simple background color
    this.cameras.main.setBackgroundColor('#87CEEB'); // Sky blue color

    // Create a group for platforms
    platforms = this.physics.add.staticGroup();

    // For shapes instead of sprites, we can draw rectangles
    // Ground
    let ground = this.add.rectangle(400, 568, 800, 64, 0x228B22); // Green rectangle
    this.physics.add.existing(ground, true);
    platforms.add(ground);

    // Platforms
    let platform1 = this.add.rectangle(600, 400, 150, 32, 0x8B4513); // Brown rectangle
    this.physics.add.existing(platform1, true);
    platforms.add(platform1);

    let platform2 = this.add.rectangle(50, 250, 150, 32, 0x8B4513);
    this.physics.add.existing(platform2, true);
    platforms.add(platform2);

    let platform3 = this.add.rectangle(750, 220, 150, 32, 0x8B4513);
    this.physics.add.existing(platform3, true);
    platforms.add(platform3);

    // Create the player using a simple shape
    player = this.add.rectangle(100, 450, 32, 48, 0xff0000); // Red rectangle
    this.physics.add.existing(player);
    player.body.setBounce(0.2);
    player.body.setCollideWorldBounds(true);

    // Initialize player's facing direction and last fired time
    player.facing = 'right'; // Default facing direction
    player.lastFired = 0;    // Timestamp of the last projectile fired

    // Enable collision between the player and the platforms
    this.physics.add.collider(player, platforms);

    // Input Events
    cursors = this.input.keyboard.createCursorKeys();
    shiftKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);

    // Create a group for projectiles
    projectiles = this.physics.add.group();

    // Create the triangle projectile texture
    let graphics = this.add.graphics({ fillStyle: { color: 0xffff00 } }); // Yellow color
    graphics.fillTriangle(0, 10, 5, 0, 10, 10); // Draw an upward-pointing triangle
    graphics.generateTexture('triangleProjectile', 10, 10);
    graphics.destroy();
}

function update () {
    // Reset player's horizontal velocity
    player.body.setVelocityX(0);

    // Movement controls
    if (cursors.left.isDown) {
        player.body.setVelocityX(-160);
        player.facing = 'left';
    }
    else if (cursors.right.isDown) {
        player.body.setVelocityX(160);
        player.facing = 'right';
    }

    // Jumping
    if (cursors.up.isDown && player.body.touching.down) {
        player.body.setVelocityY(-330);
    }

    // Firing projectiles when Shift key is pressed
    if (Phaser.Input.Keyboard.JustDown(shiftKey)) {
        // Implement a cooldown of 500ms
        if (this.time.now - player.lastFired > 500) {
            fireProjectile.call(this);
            player.lastFired = this.time.now;
        }
    }
}

function fireProjectile() {
    // Create the projectile at the player's position
    let x = player.x;
    let y = player.y;

    // Create an image from the pre-generated triangle texture
    let projectile = this.physics.add.image(x, y, 'triangleProjectile');
    projectile.setScale(1); // Adjust size if needed
    projectile.body.allowGravity = false; // Projectiles are not affected by gravity
    projectile.setCollideWorldBounds(false);

    // Set velocity based on the player's facing direction
    let speed = 500; // Adjust speed as desired
    if (player.facing === 'left') {
        projectile.setVelocityX(-speed);
    } else {
        projectile.setVelocityX(speed);
    }

    // Add the projectile to the projectiles group
    projectiles.add(projectile);

    // Destroy the projectile after 1 second
    this.time.delayedCall(1000, () => {
        projectile.destroy();
    });
}
