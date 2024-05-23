
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
    const initialSectionId = location.hash.substring(1) || 'interests';
    showSection(initialSectionId);

    window.addEventListener('hashchange', () => {
        const sectionId = location.hash.substring(1);
        showSection(sectionId);
    });
}

// create bindings when first loaded
document.addEventListener('DOMContentLoaded', () => {
    init();
});