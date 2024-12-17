const title = 'Bouncing Balls Demo with Merging';

import('floatingWindow').then(({ createFloatingWindow }) => {
    const { contentElement } = createFloatingWindow({
        rootElement: document.body,
        startDimensions: { width: 500, height: 500, top: 50, left: 50 },
        title,
        contentElement: document.createElement('div'),
    });

    // Minimal CSS for the floating window
    contentElement.style.cssText = `
        background: #111;
        position: relative;
        height: calc(100% - 30px);
        overflow: hidden;
        user-select: none;
    `;

    // Ball creation and tracking
    const balls = [];
    const createBall = (x, y, radius = 10, color = getRandomColor(), direction = {x: random(-3, 3), y: random(-3, 3)}) => {
        const ball = document.createElement('div');
        ball.style.cssText = `
            position: absolute;
            top: ${y - radius}px;
            left: ${x - radius}px;
            width: ${radius * 2}px;
            height: ${radius * 2}px;
            background: ${color};
            border-radius: 50%;
            pointer-events: none;
        `;
        contentElement.appendChild(ball);
        balls.push({ element: ball, x, y, vx: direction.x, vy: direction.y, radius, color });
    };

    // Utility functions
    const random = (min, max) => Math.random() * (max - min) + min;
    const getRandomColor = () =>
        `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;
    const lerp = (a, b, t) => Math.round(a + (b - a) * t); // Linear interpolation

    // Function to detect collision between two balls
    const checkCollision = (ballA, ballB) => {
        const dx = ballA.x - ballB.x;
        const dy = ballA.y - ballB.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance < ballA.radius + ballB.radius;
    };

    // Merge two balls into one
    const mergeBalls = (ballA, ballB) => {
        // Calculate the new position, size, and color
        const newRadius = Math.sqrt(ballA.radius * ballA.radius + ballB.radius * ballB.radius);
        const newX = (ballA.x + ballB.x) / 2;
        const newY = (ballA.y + ballB.y) / 2;

        // Average colors (simple RGB interpolation)
        const colorA = parseHSL(ballA.color);
        const colorB = parseHSL(ballB.color);
        const newHue = lerp(colorA.h, colorB.h, 0.5);
        const newColor = `hsl(${newHue}, 70%, 60%)`;

        // Remove old balls
        ballA.element.remove();
        ballB.element.remove();
        balls.splice(balls.indexOf(ballA), 1);
        balls.splice(balls.indexOf(ballB), 1);

        // direction weighted by radius
        const direction = {
            x: (ballA.vx * ballA.radius + ballB.vx * ballB.radius) / newRadius,
            y: (ballA.vy * ballA.radius + ballB.vy * ballB.radius) / newRadius
        };

        // Create the merged ball
        createBall(newX, newY, newRadius, newColor, direction);
    };

    // Parse HSL color to extract hue
    const parseHSL = (color) => {
        const match = color.match(/hsl\((\d+),\s*70%,\s*60%\)/);
        return { h: parseInt(match[1]) };
    };

    // Add click-to-create functionality
    contentElement.addEventListener('click', (e) => {
        const rect = contentElement.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        createBall(x, y, random(10, 30));
    });

    // Physics-like update loop with collision detection
    const updateBalls = () => {
        for (let i = 0; i < balls.length; i++) {
            const ballA = balls[i];

            // Update position
            ballA.x += ballA.vx;
            ballA.y += ballA.vy;

            // Bounce off walls
            if (ballA.x - ballA.radius < 0 || ballA.x + ballA.radius > contentElement.clientWidth) {
                ballA.vx *= -1;
            }
            if (ballA.y - ballA.radius < 0 || ballA.y + ballA.radius > contentElement.clientHeight) {
                ballA.vy *= -1;
            }

            // Apply position
            ballA.element.style.left = `${ballA.x - ballA.radius}px`;
            ballA.element.style.top = `${ballA.y - ballA.radius}px`;

            // Check for collisions with other balls
            for (let j = i + 1; j < balls.length; j++) {
                const ballB = balls[j];
                if (checkCollision(ballA, ballB)) {
                    mergeBalls(ballA, ballB);
                }
            }
        }
        requestAnimationFrame(updateBalls);
    };

    // Start animation
    updateBalls();
    createBall(150, 150, 20);
    createBall(250, 250, 30);
});
