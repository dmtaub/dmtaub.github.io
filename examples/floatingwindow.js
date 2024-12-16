const title = 'Draggable Window'; // Keep this assignment as first line if you want to update the in the UI automatically
const myId = title.toLowerCase().replace(/\s/g, '-'); // ID for canvas element
if (document.getElementById(myId)) {
    console.error(`Canvas ID '${myId}' already exists!`);
}
// Simplified floating window with editable title bar
const createFloatingWindow = (canvasId = null, onUpdateTitle = null) => {
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

    // Add editable title text
    const titleText = document.createElement('span');
    titleText.textContent = title;
    titleText.contentEditable = false;
    titleText.style.outline = 'none';
    titleText.style.flexGrow = '1';
    titleBar.appendChild(titleText);

    // set contentEditable to true to allow editing the title
    titleText.addEventListener('dblclick', () => {
        titleText.style.cursor = 'text';
        titleText.contentEditable = true;
        titleText.focus();
    });
    // Listen for changes to the title
    titleText.addEventListener('blur', () => {
        titleText.style.cursor = 'move';
        titleText.contentEditable = false;
        if (onUpdateTitle) {
            onUpdateTitle(titleText.textContent.trim());
        }
    });
    // listen for Enter key to update title
    titleText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            titleText.blur();
        }
    });
    // listen for Escape key to cancel title update
    titleText.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            titleText.textContent = title;
            titleText.blur();
        }
    });

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

    // Close functionality
    closeButton.addEventListener('click', () => {
        container.remove();
    });

    return canvas;
};

// Example of an `onUpdateTitle` function
const onUpdateTitle = (newTitle) => {
    console.log(`Title updated to: ${newTitle}`);

    // Notify the hosting page to update the `const title` line
    const updateEvent = new CustomEvent('update-title', { detail: { newTitle } });
    document.dispatchEvent(updateEvent);
};

// Usage
const canvas = createFloatingWindow(myId, onUpdateTitle);

document.addEventListener('update-title', (e) => {
    console.log(`pi.html received title update: ${e.detail.newTitle}`);
    const { newTitle } = e.detail;
    const fileList = droppedFiles || [];
    const updatedLine = `const title = '${newTitle}';`;

    // Find the file with the first line starting with 'const title ='
    const fileToUpdate = fileList.find(file => file.content.trim().startsWith('const title ='));
    if (fileToUpdate) {
        const lines = fileToUpdate.content.split('\n');
        lines[0] = updatedLine; // Update the first line
        fileToUpdate.content = lines.join('\n'); // Recombine the content
        fileToUpdate.name = `${newTitle}.js`; // Update the filename

        console.log(`Updated title in file: ${fileToUpdate.name}`);
        updateFileList(); // Refresh the file list in the UI
    } else {
        console.warn('No file found with a title line to update.');
    }
});
// fire one off to update the title in the hosting page
document.dispatchEvent(new CustomEvent('update-title', { detail: { newTitle: title } }));
