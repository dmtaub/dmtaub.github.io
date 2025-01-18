// bounce_2d.js
// Manages the HTML UI and the floating secondary camera window (draggable).

/**
 * Injects a style element that includes all necessary CSS for the UI and the
 * floating camera container. This is called once to set up styling.
 */
function setupUIStyle() {
    const style = document.createElement('style');
    style.textContent = `
      /* General UI styles */
      .ui-row {
        display: flex;
        justify-content: left;
        margin-top: 10px;
        gap: 10px;
      }
      .ui-button {
        width: 175px;
        height: 45px;
        background-color: rgba(255, 255, 255, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        border: 2px solid #ccc;
        line-height: 1;
        border-radius: 5px;
        user-select: none;
        font-family: sans-serif;
      }
      .ui-button:hover {
        border-color: #888;
      }
  
      /* Floating container for secondary camera */
      .floating-container {
        position: absolute;
        border: 2px solid white;
        background-color: #222;
        z-index: 1000;
        display: none; /* hidden by default */
      }
      .floating-titlebar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background-color: #444;
        color: #fff;
        font-family: sans-serif;
        padding: 5px;
        cursor: move; /* indicate draggable area */
        user-select: none;
      }
      .floating-close-button {
        cursor: pointer;
      }
    `;
    document.head.appendChild(style);
  }
  
  /**
   * Ensures the CSS for UI is inserted once. Exposed for convenience in main code.
   */
  export function setupCSS() {
    setupUIStyle();
  }
  
  /**
   * Creates a row of UI buttons within the main container.
   * @param {HTMLElement} container - The parent container (usually .interactive).
   * @param {Array<[string, Function]>} buttonDefs - An array of [label, callback].
   */
  export function addUI(container, buttonDefs) {
    if (!container) {
      console.warn("No container found for UI.");
      return;
    }
    const rowDiv = document.createElement('div');
    rowDiv.classList.add('ui-row');
    container.appendChild(rowDiv);
  
    for (const [label, callback] of buttonDefs) {
      const button = document.createElement('div');
      button.classList.add('ui-button');
      button.innerText = label;
      button.addEventListener('click', callback);
      rowDiv.appendChild(button);
    }
  }
  
  /**
   * Creates a floating container with a title bar and close button. The container
   * is initially placed directly over the main canvas. The title bar can be used
   * to drag the container around (click and drag).
   *
   * @param {string} title - Text displayed in the title bar.
   * @param {HTMLElement} targetElement - The element (like the main .interactive) we want to overlay.
   * @returns {HTMLDivElement} The floating container element.
   */
  export function createFloatingContainer(title = 'Secondary Camera', targetElement) {
    // The outer container
    const secondaryContainer = document.createElement('div');
    secondaryContainer.classList.add('floating-container');
  
    // Title bar
    const titleBar = document.createElement('div');
    titleBar.classList.add('floating-titlebar');
  
    // Title text
    const titleSpan = document.createElement('span');
    titleSpan.innerText = title;
  
    // Close ("x") button
    const closeButton = document.createElement('span');
    closeButton.innerText = 'x';
    closeButton.classList.add('floating-close-button');
    closeButton.addEventListener('click', () => {
      secondaryContainer.style.display = 'none';
    });
  
    titleBar.appendChild(titleSpan);
    titleBar.appendChild(closeButton);
  
    // Insert the title bar
    secondaryContainer.appendChild(titleBar);
  
    // Position the container initially over the target element's bounding box
    if (targetElement) {
      const rect = targetElement.getBoundingClientRect();
      // We'll place the container in the top-left of that rectangle
      secondaryContainer.style.top = rect.top + 'px';
      secondaryContainer.style.left = rect.left + 'px';
    } else {
      // Fallback if no element is found
      secondaryContainer.style.top = '100px';
      secondaryContainer.style.left = '100px';
    }
  
    // By default, the container has 0 width/height until we add child content
    // We'll rely on the content inside (like a canvas) to expand it
  
    // Add drag handling
    makeDraggable(secondaryContainer, titleBar);
  
    return secondaryContainer;
  }
  
  /**
   * Makes an element draggable by its title bar. When the user presses and drags on
   * the title bar, we move the entire container around.
   *
   * @param {HTMLElement} container - The overall container we want to move.
   * @param {HTMLElement} titleBar - The 'handle' that initiates dragging.
   */
  function makeDraggable(container, titleBar) {
    let offsetX = 0; 
    let offsetY = 0;
    let isDragging = false;
  
    // Start dragging
    titleBar.addEventListener('mousedown', onPointerDown);
    titleBar.addEventListener('touchstart', onPointerDown, { passive: true });
  
    function onPointerDown(e) {
      e.preventDefault();
      isDragging = true;
  
      const isTouch = e.type === 'touchstart';
      const clientX = isTouch ? e.touches[0].clientX : e.clientX;
      const clientY = isTouch ? e.touches[0].clientY : e.clientY;
  
      // container offset in relation to where user clicked
      offsetX = clientX - container.offsetLeft;
      offsetY = clientY - container.offsetTop;
  
      document.addEventListener('mousemove', onPointerMove);
      document.addEventListener('mouseup', onPointerUp);
      document.addEventListener('touchmove', onPointerMove, { passive: false });
      document.addEventListener('touchend', onPointerUp);
    }
  
    function onPointerMove(e) {
      if (!isDragging) return;
  
      // Prevent default if touch
      e.preventDefault();
  
      const isTouch = e.type.includes('touch');
      const clientX = isTouch ? e.touches[0].clientX : e.clientX;
      const clientY = isTouch ? e.touches[0].clientY : e.clientY;
  
      container.style.left = (clientX - offsetX) + 'px';
      container.style.top = (clientY - offsetY) + 'px';
    }
  
    function onPointerUp() {
      isDragging = false;
      document.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('mouseup', onPointerUp);
      document.removeEventListener('touchmove', onPointerMove);
      document.removeEventListener('touchend', onPointerUp);
    }
  }
  