const title = 'To-Do List'; // Title for the floating window

import('floatingWindow').then(({ createFloatingWindow }) => {
    const { contentElement } = createFloatingWindow({
        rootElement: document.body,
        startDimensions: { width: 300, height: 400, top: 100, left: 100 },
        title,
        contentElement: document.createElement('div'),
    });

    // Inject HTML content
    contentElement.innerHTML = `
        <style>
            .todo-container {
                font-family: Arial, sans-serif;
                padding: 10px;
                box-sizing: border-box;
                height: 100%;
                display: flex;
                flex-direction: column;
            }
            .todo-input {
                display: flex;
                margin-bottom: 10px;
            }
            .todo-input input {
                flex: 1;
                padding: 5px;
                border: 1px solid #ccc;
                border-radius: 3px;
                margin-right: 5px;
            }
            .todo-input button {
                padding: 5px 10px;
                background-color: #4CAF50;
                color: white;
                border: none;
                border-radius: 3px;
                cursor: pointer;
            }
            .todo-input button:hover {
                background-color: #45a049;
            }
            .todo-list {
                list-style: none;
                padding: 0;
                margin: 0;
                flex: 1;
                overflow-y: auto;
            }
            .todo-list li {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 5px;
                border-bottom: 1px solid #eee;
            }
            .todo-list li button {
                background: none;
                border: none;
                color: red;
                font-size: 16px;
                cursor: pointer;
            }
        </style>
        <div class="todo-container">
            <div class="todo-input">
                <input type="text" placeholder="Enter a new task..." />
                <button>Add</button>
            </div>
            <ul class="todo-list"></ul>
        </div>
    `;

    // Select DOM elements
    const input = contentElement.querySelector('.todo-input input');
    const addButton = contentElement.querySelector('.todo-input button');
    const todoList = contentElement.querySelector('.todo-list');

    // Add Task Functionality
    const addTask = () => {
        const task = input.value.trim();
        if (!task) return;

        const listItem = document.createElement('li');
        listItem.innerHTML = `${task} <button>&times;</button>`;
        listItem.querySelector('button').addEventListener('click', () => listItem.remove());
        todoList.appendChild(listItem);

        input.value = '';
    };

    // Event Listeners
    addButton.addEventListener('click', addTask);
    input.addEventListener('keyup', (e) => e.key === 'Enter' && addTask());
});
