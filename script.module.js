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

// ── Theme toggle + auto-dark on Projects ────────────────────────────────────
function initTheme() {
    const btn = document.getElementById('themeToggle');

    function setDark(dark) {
        document.body.classList.toggle('dark', dark);
        if (btn) {
            btn.innerHTML = dark
                ? '<span class="toggle-icon">🌙</span> Dark'
                : '<span class="toggle-icon">☀</span> Light';
        }
    }

    // Sync button text with current dark state (may already be set by showSection)
    setDark(document.body.classList.contains('dark'));

    if (btn) {
        btn.addEventListener('click', () => {
            setDark(!document.body.classList.contains('dark'));
        });
    }

}

// ── Projects horizontal scroll ──────────────────────────────────────────────
function initProjectsScroll() {
    const outer  = document.getElementById('projects-outer');
    const track  = document.getElementById('projects-track');
    const dots   = document.querySelectorAll('#projects-nav-dots .dot');
    const counter = document.getElementById('projects-counter');
    const bar    = document.getElementById('projects-progress-bar');
    const cards  = track ? track.querySelectorAll('.project-card') : [];
    const N = cards.length;
    if (!outer || !N) return;

    // Make the outer div tall enough: N screens of vertical scroll space
    outer.style.height = (N * 100) + 'vh';

    function update() {
        const rect = outer.getBoundingClientRect();
        const scrolled  = -rect.top;
        const maxScroll = outer.offsetHeight - window.innerHeight;
        const progress  = Math.max(0, Math.min(1, scrolled / maxScroll));

        // Shift track horizontally
        const maxTranslate = (N - 1) * window.innerWidth;
        track.style.transform = `translateX(${-progress * maxTranslate}px)`;

        // Active card index (snap to nearest)
        const activeIndex = Math.min(N - 1, Math.round(progress * (N - 1)));
        dots.forEach((dot, i) => dot.classList.toggle('active', i === activeIndex));
        if (counter) counter.textContent = `${activeIndex + 1} / ${N}`;
        if (bar) bar.style.width = (progress * 100) + '%';
    }

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();

    // Dot click → scroll to that card
    dots.forEach((dot, i) => {
        dot.addEventListener('click', () => {
            const target = outer.offsetTop + (i / (N - 1)) * (outer.offsetHeight - window.innerHeight);
            window.scrollTo({ top: target, behavior: 'smooth' });
        });
    });
}

document.addEventListener('DOMContentLoaded', initProjectsScroll);
