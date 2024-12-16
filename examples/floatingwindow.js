const title = 'Draggable Window'; // Keep this assignment as first line if you want to update the in the UI automatically

// using library at lib/floatingWindow.js
import('floatingWindow').then(({ createFloatingWindow }) => {
    const { container, contentElement } = createFloatingWindow({
        rootElement: document.body,
        startDimensions: { width: 500, height: 400, top: 100, left: 100 },
        title,
    });
    console.log(container, contentElement);
});
