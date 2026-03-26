import { start, pause, resume } from './threejs_bounce.js';

// ── Adjective cycling ────────────────────────────────────────────────────────
function initFade() {
    const adjectives = document.querySelectorAll('.descriptive-text');
    if (!adjectives.length) return;
    const h2 = adjectives[0].closest('h2');
    let index = 0;
    function showNext() {
        adjectives.forEach(a => a.classList.remove('show'));
        adjectives[index].classList.add('show');
        if (h2) h2.classList.toggle('spaced', index !== 0);
        index = (index + 1) % adjectives.length;
        setTimeout(showNext, 5000);
    }
    showNext();
}

// ── Scroll: shrink header (projects only) ───────────────────────────────────
function updateScrolled() {
    const projectsActive = document.getElementById('projects')?.style.display !== 'none';
    document.body.classList.toggle('scrolled', projectsActive && window.scrollY > 60);
}
function initScrollShrink() {
    window.addEventListener('scroll', updateScrolled, { passive: true });
}

let _savedDark = false;

export function showSection(sectionId) {
    const wasInProjects = document.body.classList.contains('projects-section');
    const sections = document.querySelectorAll('.section');
    sections.forEach(section => {
        section.style.display = 'none';
    });
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.style.display = 'block';
    }
    document.body.classList.toggle('projects-section', sectionId === 'projects');
    if (sectionId === 'projects') {
        _savedDark = document.body.classList.contains('dark');
        document.body.classList.add('dark');
    } else if (wasInProjects) {
        document.body.classList.toggle('dark', _savedDark);
        const btn = document.getElementById('themeToggle');
        if (btn) btn.innerHTML = _savedDark
            ? '<span class="toggle-icon">🌙</span> Dark'
            : '<span class="toggle-icon">☀</span> Light';
    }
    updateScrolled();
}
export function init(){
    // get default from data tag on body
    const initialSectionId = location.hash.substring(1) || document.body.dataset.defaultSection;
    showSection(initialSectionId);

    window.addEventListener('hashchange', () => {
        const sectionId = location.hash.substring(1);
        showSection(sectionId);
           // if hiding three.js "introduction" section, pause the animation
        if (sectionId === 'introduction') {
            resume()
        } else {
            pause()
        }
    });
}



// create bindings when first loaded
document.addEventListener('DOMContentLoaded', () => {
    init();
    initTheme();
    initFade();
    initScrollShrink();
    // get current hash
    const sectionId = location.hash.substring(1);
    // if showing the introduction section, start the animation
    if (!sectionId || sectionId === 'introduction') {
        start()
    }

});

function syncResumeTheme() {
    const iframe = document.querySelector('#popupOverlay iframe');
    if (!iframe) return;
    const dark = document.body.classList.contains('dark');
    iframe.contentWindow?.postMessage(dark ? 'dark' : 'light', '*');
}

// JavaScript to handle the popup
document.getElementById('resumeLink').addEventListener('click', function (e) {
    e.preventDefault();
    document.getElementById('popupOverlay').style.display = 'flex';
    const iframe = document.querySelector('#popupOverlay iframe');
    if (iframe) iframe.addEventListener('load', syncResumeTheme, { once: false });
    syncResumeTheme();
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

// ── Theme toggle + auto-dark on Projects ────────────────────────────────────
function initTheme() {
    const btn = document.getElementById('themeToggle');

    function setDark(dark) {
        document.body.classList.toggle('dark', dark);
        if (btn) {
            btn.innerHTML = dark
                ? '<span class="toggle-icon">🌙</span><span class="toggle-text"> Dark</span>'
                : '<span class="toggle-icon">☀</span><span class="toggle-text"> Light</span>';
        }
    }

    // Sync button text with current dark state (may already be set by showSection)
    setDark(document.body.classList.contains('dark'));

    if (btn) {
        btn.addEventListener('click', () => {
            setDark(!document.body.classList.contains('dark'));
            syncResumeTheme();
        });
    }

}

// ── Projects scroll spy ──────────────────────────────────────────────────────
function initProjectsScrollSpy() {
    const images  = document.querySelectorAll('.project-image');
    const entries = document.querySelectorAll('.project-entry');
    if (!entries.length || !images.length) return;

    const imageMap = {};
    images.forEach(img => { imageMap[img.dataset.card] = img; });

    function setActive(card) {
        images.forEach(img => img.classList.toggle('active', img.dataset.card === card));
    }

    const observer = new IntersectionObserver(observed => {
        observed.forEach(entry => {
            if (entry.isIntersecting) setActive(entry.target.dataset.card);
        });
    }, { rootMargin: '-40% 0px -40% 0px', threshold: 0 });

    entries.forEach(entry => observer.observe(entry));
}

document.addEventListener('DOMContentLoaded', initProjectsScrollSpy);
