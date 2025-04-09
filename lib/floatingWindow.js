const defaultTitleChangeHandler = (newTitle, oldTitle) => {
    if (newTitle === oldTitle) return;
    console.log(`Title updated from: ${oldTitle}`);
    console.log(`Title updated to: ${newTitle}`);
    // Notify the hosting page to update the `const title` line
    const updateEvent = new CustomEvent('update-title', { detail: { newTitle, oldTitle } });
    document.dispatchEvent(updateEvent);
}

export class FloatingWindow {
    myId = undefined;
    container = undefined;
    constructor(
        title = 'Floating Window From Class ',
        contentElement = document.createElement('div'),
        startDimensions = { width: 200, height: 200, top: 50, left: 50 },
        onTitleChange = defaultTitleChangeHandler,
        callbacks = {})
    {
        this.title = title;
        this.contentElement = contentElement;
        this.startDimensions = startDimensions;
        this.onTitleChange = onTitleChange;
        this.callbacks = callbacks || {}; // Store callbacks

        this.myId = title.toLowerCase().replace(/\s/g, '-'); // ID for canvas element
        if (onTitleChange) {
            onTitleChange(this.myId, this.myId); // Notify the hosting page of the initial title
            if(contentElement) contentElement.id = this.myId; // set initial id
        }

        if (document.getElementById(this.myId)) {
            throw new Error(`Element with ID '${this.myId}' already exists!`);
            // todo: catch this and display in indicator
        }
        this.createMainContainer({ title, rootElement: document.body, startDimensions, contentElement, onTitleChange });
    }
    recreate(top, left, content, title = null) {
        const startDimensions = { ...this.startDimensions, top, left };
        const contentElement = content || this.contentElement;
        this.createMainContainer({ title: title || this.title, rootElement: document.body, startDimensions, contentElement, onTitleChange: this.onTitleChange });
    }
    canvasToContainerSize(elt) {
        // set canvas size to match container size
        elt.width = this.startDimensions.width;
        elt.height = this.startDimensions.height - 30; // subtract title bar height
        elt.style.display = 'block';
    }
    createMainContainer({ title, rootElement, startDimensions, contentElement, onTitleChange }) {
        // Create the main container
        this.container = document.createElement('div');
        Object.assign(this.container.style, {
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
        rootElement.appendChild(this.container);

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
        this.container.appendChild(titleBar);

        // Title text
        const titleText = document.createElement('span');
        titleText.textContent = title;
        titleText.contentEditable = false;
        titleText.style.outline = 'none';
        titleText.style.flexGrow = '1';
        titleBar.appendChild(titleText);

        if (onTitleChange){
            titleText.addEventListener('dblclick', () => {
                titleText.style.cursor = 'text';
                titleText.contentEditable = true;
                titleText.focus();
            });

            titleText.addEventListener('blur', () => {
                titleText.style.cursor = 'move';
                titleText.contentEditable = false;
                this.myId = titleText.textContent.toLowerCase().replace(/\s/g, '-');
                if (onTitleChange) {
                    onTitleChange(this.myId, contentElement.id);
                    contentElement.id = this.myId;
                } else {
                    contentElement.id = this.myId;
                }
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
        }
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
                    this.container.classList.toggle('minimized');
                    if (this.container.classList.contains('minimized')) {
                        this.container.style.height = '30px';
                        contentElement.style.visibility = 'hidden';
                    } else {
                        this.container.style.height = `${startDimensions.height}px`;
                        contentElement.style.visibility = 'visible';
                        this.canvasToContainerSize(contentElement);
                    }
                    // Call minimize callback if provided
                    if (this.callbacks.onMinimize) {
                        this.callbacks.onMinimize(this.container.classList.contains('minimized'));
                    }
                } else { // 'X'
                    // Call onBeforeClose callback if provided
                    if (this.callbacks.onBeforeClose) {
                        const shouldClose = this.callbacks.onBeforeClose();
                        // If callback returns false explicitly, prevent closing
                        if (shouldClose === false) {
                            return;
                        }
                    }

                    // Call teardown/cleanup callback if provided
                    if (this.callbacks.onClose) {
                        this.callbacks.onClose();
                    }

                    this.container.remove();
                }
            });
        });
        titleBar.appendChild(controlButtons);

        // Content element (Canvas or other)
        if (!contentElement) {
            contentElement = document.createElement('canvas');
            contentElement.id = this.myId;
            this.canvasToContainerSize(contentElement);
            this.contentElement = contentElement;
        }

        this.container.appendChild(contentElement);

        // Draggable feature
        let isDragging = false, offsetX, offsetY;
        titleBar.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - this.container.offsetLeft;
            offsetY = e.clientY - this.container.offsetTop;
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                this.container.style.left = `${e.clientX - offsetX}px`;
                this.container.style.top = `${e.clientY - offsetY}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        // Call onOpen callback if provided
        if (this.callbacks.onOpen) {
            this.callbacks.onOpen(this.container);
        }
    }

}

export function createFloatingWindow({
    title = 'Floating Window Default',
    rootElement = document.body,
    startDimensions = { width: 400, height: 300, top: 50, left: 50 },
    contentElement = null,
    onTitleChange = defaultTitleChangeHandler,
    callbacks = {},
}) {
    const fw = new FloatingWindow(title, contentElement, startDimensions, onTitleChange, callbacks);
    return {container: fw.container, contentElement: fw.contentElement, window: fw};
}


// TODO: make this less special case-y
document.addEventListener('update-title', (e) => {
    console.log(`pi.html received title update: ${e.detail.newTitle}`);
    const { newTitle, oldTitle } = e.detail;
    const fileList = droppedFiles || [];
    const updatedLine = `const title = '${newTitle.replace(/-/g, ' ')}';`;
    // Find the file with the first line starting with 'const title =' - fabulously inefficient for now
    const fileToUpdate = fileList.find(file => file.content.trim().startsWith('const title = ') && file.content.toLowerCase().includes(oldTitle.replace(/-/g, ' ')));
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
