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
const parentDesc = adjectives[0].parentElement.parentElement; //h2
let index = 0;
function fade() {
    function showNextAdjective() {
        // Hide all adjectives
        adjectives.forEach(adjective => adjective.classList.remove('show'));

        // Show the next adjective
        adjectives[index].classList.add('show');

        // add class to parent of 0 index 'spaced' if index is not 3, otherwise remove it
        if (index !== 0) {
                setTimeout(() => {
                    parentDesc.classList.add('spaced');
                }, 1000);
            } else {
                parentDesc.classList.remove('spaced');
            }
        // Update the index for the next adjective
        index = (index + 1) % adjectives.length;

        // Call this function again after a delay
        setTimeout(showNextAdjective, 5000); // Change adjectives every 3 seconds
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
    const overlay = document.getElementById('popupOverlay');
    overlay.style.display = 'none';
    overlay.getElementsByTagName('iframe')[0].src = "/files/Resume2024.html"
});

// Close the popup when clicking outside the content
document.getElementById('popupOverlay').addEventListener('click', function (e) {
    if (e.target === this) {
        this.style.display = 'none';
    }
});
