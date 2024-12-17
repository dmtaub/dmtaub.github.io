const title = 'Bouncing Balls Demo';

import('floatingWindow').then(({ createFloatingWindow }) => {
    const { contentElement } = createFloatingWindow({
        title,
        rootElement: document.body,
        startDimensions: { width: 500, height: 500, top: 50, left: 50 },
        contentElement: document.createElement('div'),
    });

    // Minimal CSS for the floating window
    Object.assign(contentElement.style, {
        background: '#111',
        position: 'relative',
        height: 'calc(100% - 30px)',
        overflow: 'hidden',
        userSelect: 'none'
    });

    // Ball creation and tracking
    const balls = [];
    const random = (min, max) => Math.random() * (max - min) + min;
    const parseHSL = (color) => +color.match(/hsl\((\d+),/)[1]; // Extract hue
    const lerp = (a, b, t) => Math.round(a + (b - a) * t);
    const getRandomColor = () => `hsl(${Math.floor(random(0, 360))}, 70%, 60%)`;

    const createBall = (x, y, radius = 10, color = getRandomColor(), { x: vx = random(-3, 3), y: vy = random(-3, 3) } = {}) => {
        const ball = document.createElement('div');
        Object.assign(ball.style, {
            position: 'absolute',
            top: `${y - radius}px`,
            left: `${x - radius}px`,
            width: `${radius * 2}px`,
            height: `${radius * 2}px`,
            background: color,
            borderRadius: '50%',
            pointerEvents: 'none',
        });
        contentElement.appendChild(ball);
        balls.push({ element: ball.parentElement.lastChild, x, y, vx, vy, radius, color });
    };

    const checkCollision = (ballA, ballB) => Math.hypot(ballA.x - ballB.x, ballA.y - ballB.y) < ballA.radius + ballB.radius;

    const mergeBalls = (ballA, ballB) => {
        const newRadius = Math.hypot(ballA.radius, ballB.radius);
        const newHue = lerp(parseHSL(ballA.color), parseHSL(ballB.color), 0.5);
        const biggerBall = ballA.radius > ballB.radius ? ballA : ballB;
        createBall(
            biggerBall.x, biggerBall.y, newRadius,
            `hsl(${newHue}, 70%, 60%)`,
            { x: (ballA.vx * ballA.radius + ballB.vx * ballB.radius) / newRadius,
              y: (ballA.vy * ballA.radius + ballB.vy * ballB.radius) / newRadius }
        );
        balls.splice(balls.indexOf(ballA), 1)[0].element.remove();
        balls.splice(balls.indexOf(ballB), 1)[0].element.remove();
    };

    contentElement.addEventListener('click', ({ clientX: x, clientY: y }) => {
        const { left, top } = contentElement.getBoundingClientRect();
        createBall(x - left, y - top, random(10, 30));
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
    // start the update loop with two balls to start
    updateBalls();
    createBall(150, 150, 20);
    createBall(250, 250, 30);
});
