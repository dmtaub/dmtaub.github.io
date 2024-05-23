
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
    window.addEventListener('hashchange', () => {
        const sectionId = location.hash.substring(1);
        showSection(sectionId);
    });
    document.addEventListener('DOMContentLoaded', () => {
        const initialSectionId = location.hash.substring(1) || 'interests';
        showSection(initialSectionId);
    });
}

window.
// create bindings when first loaded
init();