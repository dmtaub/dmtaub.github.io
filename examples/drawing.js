const title = 'Drawing Window'; // Keep this assignment as first line if you want to update the in the UI automatically

// using library at lib/floatingWindow.js
import('floatingWindow').then(({ createFloatingWindow }) => {
    const { container, contentElement } = createFloatingWindow({
        rootElement: document.body,
        startDimensions: { width: 500, height: 400, top: 100, left: 100 },
        title,
    });

    // contentElement is a canvas element, so allow drawing on it with mouse or touch
    const draw = (e) => {
        const ctx = contentElement.getContext('2d');
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(e.offsetX, e.offsetY, 5, 0, Math.PI * 2);
        ctx.fill();
    };
    const drawColors = () => {
        const ctx = contentElement.getContext('2d');
        const colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'black'];
        colors.forEach((color, index) => {
            ctx.fillStyle = color;
            // document: fillRect(xOff + i * spacing, y, width, height)
            ctx.fillRect(10 + index * 60, 10, 50, 50);
        });
    };
    // on resize, update canvas size
    const observer = new ResizeObserver((entries) => {
        const { width, height } = entries[0].contentRect;
        contentElement.width = width;
        contentElement.height = height - 30; // subtract title bar height
        drawColors();
    });
    observer.observe(container);

    const startDrawing = (e) => contentElement.addEventListener(e.type === 'mousedown' ? 'mousemove' : 'touchmove', draw);
    const stopDrawing = (e) => contentElement.removeEventListener(e.type === 'mouseup' ? 'mousemove' : 'touchmove', draw);
    ['mousedown', 'touchstart'].forEach( event => contentElement.addEventListener(event, startDrawing) );
    ['mouseup', 'touchend'].forEach( event => contentElement.addEventListener(event, stopDrawing) );
});
