let title = 'Draggable Window';

// Simplified floating window with a draggable title bar, close, minimize icons, and canvas
const createFloatingWindow = (canvasId = null) => {
    // Create the main container
    const container = document.createElement('div');
    container.style.position = 'absolute';
    container.style.top = '50px';
    container.style.left = '50px';
    container.style.width = '400px';
    container.style.height = '400px';
    container.style.border = '1px solid black';
    container.style.boxShadow = '0px 4px 8px rgba(0, 0, 0, 0.2)';
    container.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';
    container.style.resize = 'both';
    container.style.overflow = 'hidden';
    document.body.appendChild(container);

    // Create the title bar
    const titleBar = document.createElement('div');
    titleBar.style.background = '#333';
    titleBar.style.color = '#fff';
    titleBar.style.padding = '10px';
    titleBar.style.cursor = 'move';
    titleBar.style.display = 'flex';
    titleBar.style.justifyContent = 'space-between';
    titleBar.style.alignItems = 'center';
    container.appendChild(titleBar);

    // Add title text
    const titleText = document.createElement('span');
    titleText.textContent = title;
    titleBar.appendChild(titleText);

    // Add minimize and close buttons
    const controlButtons = document.createElement('div');
    controlButtons.style.display = 'flex';
    controlButtons.style.gap = '5px';

    const minimizeButton = document.createElement('button');
    minimizeButton.textContent = '-';
    minimizeButton.style.background = '#555';
    minimizeButton.style.color = '#fff';
    minimizeButton.style.border = 'none';
    minimizeButton.style.cursor = 'pointer';
    minimizeButton.style.padding = '2px 6px';
    minimizeButton.style.borderRadius = '3px';
    controlButtons.appendChild(minimizeButton);

    const closeButton = document.createElement('button');
    closeButton.textContent = 'X';
    closeButton.style.background = '#d00';
    closeButton.style.color = '#fff';
    closeButton.style.border = 'none';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '2px 6px';
    closeButton.style.borderRadius = '3px';
    controlButtons.appendChild(closeButton);

    titleBar.appendChild(controlButtons);

    // Create the canvas
    const canvas = document.createElement('canvas');
    if (canvasId) canvas.id = canvasId;
    canvas.style.width = '100%';
    canvas.style.height = 'calc(100% - 40px)'; // Adjust for title bar height
    canvas.style.display = 'block';
    container.appendChild(canvas);

    // Make the window draggable
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    titleBar.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = parseInt(container.style.left, 10);
        initialTop = parseInt(container.style.top, 10);
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        container.style.left = `${initialLeft + dx}px`;
        container.style.top = `${initialTop + dy}px`;
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });

    // Minimize functionality
    let isMinimized = false;
    minimizeButton.addEventListener('click', () => {
        if (isMinimized) {
            canvas.style.display = 'block';
            container.style.height = '400px';
        } else {
            canvas.style.display = 'none';
            container.style.height = '40px'; // Title bar height
        }
        isMinimized = !isMinimized;
    });

    // Close functionality with explicit cleanup
    closeButton.addEventListener('click', () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        container.remove(); // Removes the element and its children
    });

    return canvas;
};

// Usage
const canvas = createFloatingWindow('myCanvas');
// The `canvas` can now be used for rendering content, e.g., using WebGL or 2D contexts.
