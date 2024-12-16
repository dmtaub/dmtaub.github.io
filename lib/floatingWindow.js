

export function createFloatingWindow({
    title = 'Floating Window Default',
    rootElement = document.body,
    startDimensions = { width: 400, height: 300, top: 50, left: 50 },
    contentElement = null,
    onTitleChange = (newTitle) => {
        console.log(`Title updated to: ${newTitle}`);
        // Notify the hosting page to update the `const title` line
        const updateEvent = new CustomEvent('update-title', { detail: { newTitle } });
        document.dispatchEvent(updateEvent);
    }
}) {
    let myId = title.toLowerCase().replace(/\s/g, '-'); // ID for canvas element
    onTitleChange(myId); // Notify the hosting page of the initial title

    if (document.getElementById(myId)) {
        throw new Error(`Element with ID '${myId}' already exists!`);
        // todo: catch this and display in indicator
    }

    // Create the main container
    const container = document.createElement('div');
    Object.assign(container.style, {
        position: 'absolute',
        width: `${startDimensions.width}px`,
        height: `${startDimensions.height}px`,
        top: `${startDimensions.top}px`,
        left: `${startDimensions.left}px`,
        border: '1px solid black',
        boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        resize: 'both',
        overflow: 'hidden',
    });
    rootElement.appendChild(container);

    // Create the title bar
    const titleBar = document.createElement('div');
    Object.assign(titleBar.style, {
        background: '#333',
        color: '#fff',
        padding: '5px',
        cursor: 'move',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
    });
    container.appendChild(titleBar);

    // Title text
    const titleText = document.createElement('span');
    titleText.textContent = title;
    titleText.contentEditable = false;
    titleText.style.outline = 'none';
    titleText.style.flexGrow = '1';
    titleBar.appendChild(titleText);

    titleText.addEventListener('dblclick', () => {
        titleText.style.cursor = 'text';
        titleText.contentEditable = true;
        titleText.focus();
    });

    titleText.addEventListener('blur', () => {
        titleText.style.cursor = 'move';
        titleText.contentEditable = false;
        myId = titleText.textContent.toLowerCase().replace(/\s/g, '-');
        if (onTitleChange) onTitleChange(myId);
        contentElement.id = myId;
    });
    // listen for Enter key to update title
    titleText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            titleText.blur();
        }
        if (e.key === 'Escape') {
            titleText.textContent = title;
            titleText.blur();
        }
    });

    // Control buttons
    const controlButtons = document.createElement('div');
    ['-', 'X'].forEach((symbol) => {
        const btn = document.createElement('button');
        btn.textContent = symbol;
        Object.assign(btn.style, {
            background: symbol === 'X' ? '#d00' : '#555',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            padding: '2px 6px',
            marginLeft: '5px',
        });
        controlButtons.appendChild(btn);
        btn.addEventListener('click', () => {
            if (symbol === '-') {
                container.classList.toggle('minimized');
                container.style.height = container.classList.contains('minimized') ? '30px' : `${startDimensions.height}px`;
                contentElement.style.display = container.classList.contains('minimized') ? 'none' : 'block';
            } else {
                container.remove();
            }
        });
    });
    titleBar.appendChild(controlButtons);

    // Content element (Canvas or other)
    if (!contentElement) {
        contentElement = document.createElement('canvas');
        contentElement.id = myId;
    }
    Object.assign(contentElement.style, {
        width: '100%',
        height: 'calc(100% - 30px)',
        display: 'block',
    });

    container.appendChild(contentElement);

    // Draggable feature
    let isDragging = false, offsetX, offsetY;
    titleBar.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - container.offsetLeft;
        offsetY = e.clientY - container.offsetTop;
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            container.style.left = `${e.clientX - offsetX}px`;
            container.style.top = `${e.clientY - offsetY}px`;
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
    });
    return { container, contentElement };
}

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
