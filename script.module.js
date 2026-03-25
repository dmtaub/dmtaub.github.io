import { start, pause, resume } from './threejs_bounce.js';


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
    let manualOverride = false;

    function setDark(dark) {
        document.body.classList.toggle('dark', dark);
        if (btn) {
            btn.innerHTML = dark
                ? '<span class="toggle-icon">🌙</span> Dark'
                : '<span class="toggle-icon">☀</span> Light';
        }
    }

    // Start in light mode
    setDark(false);

    // Manual toggle — locks theme until user navigates away from projects
    if (btn) {
        btn.addEventListener('click', () => {
            manualOverride = true;
            setDark(!document.body.classList.contains('dark'));
        });
    }

    // Auto-switch when projects section enters/leaves viewport
    const projectsEl = document.getElementById('projects');
    if (projectsEl) {
        new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (!manualOverride) setDark(e.isIntersecting);
                if (!e.isIntersecting) manualOverride = false; // reset on exit
            });
        }, { threshold: 0.05 }).observe(projectsEl);
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
