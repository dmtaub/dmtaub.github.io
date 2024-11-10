const speed = 220; // Player speed
// Create the main configuration for the Phaser game.
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

// Create the Phaser game instance.
const game = new Phaser.Game(config);

// Declare variables for player, platforms, cursors, and score elements.
let player;
let platforms;
let cursors;
let stars;
let score = 0;
let scoreText;

function preload() {
    // Load assets for the game.
    this.load.image('sky', 'assets/sky.png');        // Background image
    this.load.image('ground', 'assets/ground.png');  // Platform image
    this.load.image('star', 'assets/star.png');      // Collectible image
    this.load.spritesheet('dude', 'assets/dude.png', { frameWidth: 32, frameHeight: 48 });
}

function create() {
    // Add background
    this.add.image(0, 400, 'sky');

    // Create platforms group with physics
    platforms = this.physics.add.staticGroup();

    // Ground platform
    platforms.create(400, 568, 'ground').setScale(2).refreshBody();

    // Other platforms
    platforms.create(600, 400, 'ground');
    platforms.create(50, 250, 'ground');
    platforms.create(750, 220, 'ground');

    // Create player sprite
    player = this.physics.add.sprite(32, 48, 'dude').setScale(2);

    // Player physics properties
    player.setBounce(0.2);
    player.setCollideWorldBounds(true);

    // Player animations for left, turn, and right movement
    this.anims.create({
        key: 'left',
        frames: this.anims.generateFrameNumbers('dude', { start: 0, end: 2 }),
        frameRate: 10,
        repeat: -1
    });

    this.anims.create({
        key: 'turn',
        frames: [{ key: 'dude', frame: 3 }],
        frameRate: 20
    });

    this.anims.create({
        key: 'right',
        frames: this.anims.generateFrameNumbers('dude', { start: 4, end: 6 }),
        frameRate: 10,
        repeat: -1
    });

    // Enable player collision with platforms
    this.physics.add.collider(player, platforms);

    // Create cursors for player movement
    cursors = this.input.keyboard.createCursorKeys();

    // Create collectible stars group
    stars = this.physics.add.group({
        key: 'star',
        repeat: 10,
        setXY: { x: 12, y: 0, stepX: 70 }
    });

    stars.children.iterate(function (child) {
        child.setBounceY(Phaser.Math.FloatBetween(0.4, 0.8));
    });

    // Enable stars collision with platforms
    this.physics.add.collider(stars, platforms);

    // Collect stars
    this.physics.add.overlap(player, stars, collectStar, null, this);

    // Score text
    scoreText = this.add.text(16, 16, 'Score: 0', { fontSize: '32px', fill: '#000' });
}

function update() {
    // Player movement
    if (cursors.left.isDown) {
        player.setVelocityX(-speed);
        player.anims.play('left', true);
    } else if (cursors.right.isDown) {
        player.setVelocityX(speed);
        player.anims.play('right', true);
    } else {
        player.setVelocityX(0);
        player.anims.play('turn');
    }

    // Jump if player is touching the ground
    if (cursors.space.isDown && player.body.touching.down) {
        player.setVelocityY(330);
    }
}

// Collect star function
function collectStar(player, star) {
    star.disableBody(true, true);

    // Update score
    score += 10;
    scoreText.setText('Score: ' + score);

    // Add more stars if all are collected
    if (stars.countActive(true) === 0) {
        stars.children.iterate(function (child) {
            child.enableBody(true, child.x, 0, true, true);
        });
    }
}
