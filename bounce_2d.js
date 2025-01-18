// bounce_2d.js
// Focuses on creating/managing the HTML UI and floating secondary canvas container.

// This function adds basic styling for UI elements.
export function setupCSS() {
  const style = document.createElement('style');
  style.textContent = `
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
  `;
  document.head.appendChild(style);
}

/**
 * Creates the UI row inside the main container, then populates it with multiple buttons.
 * @param {HTMLElement} container The main container (.interactive usually).
 * @param {Array<[string, Function]>} buttonDefs Array of [label, callback].
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
 * Creates a floating container with a title bar and a close button.
 * This is used to hold the secondary camera's preview canvas.
 * @param {string} title Text displayed in the title bar.
 */
export function createFloatingContainer(title = 'Secondary Camera') {
  // Outer container
  const secondaryContainer = document.createElement('div');
  secondaryContainer.style.position = 'absolute';
  secondaryContainer.style.top = '10px';
  secondaryContainer.style.left = '10px';
  secondaryContainer.style.width = 'auto';
  secondaryContainer.style.border = '2px solid white';
  secondaryContainer.style.backgroundColor = '#222';
  secondaryContainer.style.zIndex = '1000';
  secondaryContainer.style.display = 'none'; // hidden initially

  // Title bar
  const titleBar = document.createElement('div');
  titleBar.style.display = 'flex';
  titleBar.style.justifyContent = 'space-between';
  titleBar.style.alignItems = 'center';
  titleBar.style.backgroundColor = '#444';
  titleBar.style.color = '#fff';
  titleBar.style.fontFamily = 'sans-serif';
  titleBar.style.padding = '5px';

  const titleSpan = document.createElement('span');
  titleSpan.innerText = title;
  titleBar.appendChild(titleSpan);

  // Close ("x") button
  const closeButton = document.createElement('span');
  closeButton.innerText = 'x';
  closeButton.style.cursor = 'pointer';
  closeButton.addEventListener('click', () => {
    secondaryContainer.style.display = 'none';
  });
  titleBar.appendChild(closeButton);

  secondaryContainer.appendChild(titleBar);

  return secondaryContainer;
}
