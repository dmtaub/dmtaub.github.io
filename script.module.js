import { start } from './threejs_bounce.js';


export function showSection(sectionId) {
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        section.style.display = 'none';
    });
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.style.display = 'block';
    }
}
export function init(){
    // get default from data tag on body
    const initialSectionId = location.hash.substring(1) || document.body.dataset.defaultSection;
    showSection(initialSectionId);

    window.addEventListener('hashchange', () => {
        const sectionId = location.hash.substring(1);
        showSection(sectionId);
    });
}


const adjectives = document.querySelectorAll('.descriptive-text');
let index = 0;
function fade() {
    function showNextAdjective() {
        // Hide all adjectives
        adjectives.forEach(adjective => adjective.classList.remove('show'));

        // Show the next adjective
        adjectives[index].classList.add('show');

        // Update the index for the next adjective
        index = (index + 1) % adjectives.length;

        // Call this function again after a delay
        setTimeout(showNextAdjective, 4000); // Change adjectives every 3 seconds
    }

    // Start the cycle
    showNextAdjective();
}

// create bindings when first loaded
document.addEventListener('DOMContentLoaded', () => {
    init();
    start();
    fade();
});

// JavaScript to handle the popup
document.getElementById('resumeLink').addEventListener('click', function (e) {
    e.preventDefault();
    document.getElementById('popupOverlay').style.display = 'flex';
});

document.getElementById('popupClose').addEventListener('click', function () {
    document.getElementById('popupOverlay').style.display = 'none';
});

// Close the popup when clicking outside the content
document.getElementById('popupOverlay').addEventListener('click', function (e) {
    if (e.target === this) {
        this.style.display = 'none';
    }
});
