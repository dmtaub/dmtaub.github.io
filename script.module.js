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
let _updateProjects = null;

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
        requestAnimationFrame(() => { if (_updateProjects) _updateProjects(); });
    } else if (wasInProjects) {
        document.body.classList.toggle('dark', _savedDark);
        const btn = document.getElementById('themeToggle');
        if (btn) btn.innerHTML = _savedDark
            ? '<span class="toggle-icon">🌙</span><span class="toggle-text"> Dark</span>'
            : '<span class="toggle-icon">☀</span><span class="toggle-text"> Light</span>';
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

    function setDark(dark, save = false) {
        document.body.classList.toggle('dark', dark);
        if (save) localStorage.setItem('theme', dark ? 'dark' : 'light');
        if (btn) {
            btn.innerHTML = dark
                ? '<span class="toggle-icon">🌙</span><span class="toggle-text"> Dark</span>'
                : '<span class="toggle-icon">☀</span><span class="toggle-text"> Light</span>';
        }
    }

    const saved = localStorage.getItem('theme');
    const prefersDark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    // Sync button text with current dark state (may already be set by showSection or inline script)
    setDark(document.body.classList.contains('dark') || prefersDark);

    if (btn) {
        btn.addEventListener('click', () => {
            setDark(!document.body.classList.contains('dark'), true);
            syncResumeTheme();
        });
    }

}

// ── Projects scroll-driven animation ────────────────────────────────────────
function initProjectsScroll() {
    const section = document.getElementById('projects');
    const entries = document.querySelectorAll('.project-entry');
    const images  = document.querySelectorAll('.project-image');
    if (!entries.length || !images.length) return;

    const imageMap = {};
    images.forEach(img => { imageMap[img.dataset.card] = img; });

    // Create mobile thumbnails
    const thumbMap = {};
    entries.forEach(entry => {
        const thumb = document.createElement('div');
        thumb.className = 'mobile-thumb';
        thumb.dataset.card = entry.dataset.card;
        entry.appendChild(thumb);
        thumbMap[entry.dataset.card] = thumb;

        thumb.addEventListener('click', () => {
            const overlay = document.createElement('div');
            overlay.className = 'thumb-lightbox';
            const img = document.createElement('div');
            img.className = 'thumb-lightbox-img';
            img.dataset.card = entry.dataset.card;
            const btn = document.createElement('button');
            btn.className = 'thumb-lightbox-close';
            btn.setAttribute('aria-label', 'Close');
            btn.textContent = '✕';
            btn.addEventListener('click', () => overlay.remove());
            overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
            const caption = imageMap[entry.dataset.card]?.querySelector('.project-image-caption');
            overlay.append(img, ...(caption ? [caption.cloneNode(true)] : []), btn);
            document.body.appendChild(overlay);
        });
    });

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

    let activeEntry = null;

    function update() {
        if (!section || section.style.display === 'none') return;
        const vh = window.innerHeight;
        const isMobile = window.innerWidth <= 700;

        if (isMobile) {
            entries.forEach(entry => {
                const thumb = thumbMap[entry.dataset.card];
                if (!thumb) return;
                const r = entry.getBoundingClientRect();
                // Grows in as the entry scrolls up into view from the bottom
                const t = easeOut(clamp((vh - r.top) / (vh * 0.75), 0, 1));
                thumb.style.opacity = (t * 0.92).toFixed(3);
                thumb.style.transform = `scale(${(0.72 + 0.28 * t).toFixed(3)})`;
            });
            return;
        }

        // Desktop: find entry whose center is closest to viewport center
        let best = null, bestDist = Infinity;
        entries.forEach(entry => {
            const r = entry.getBoundingClientRect();
            if (r.bottom < 0 || r.top > vh) return;
            const dist = Math.abs(r.top + r.height / 2 - vh / 2);
            if (dist < bestDist) { bestDist = dist; best = entry; }
        });

        entries.forEach(entry => {
            const img = imageMap[entry.dataset.card];
            if (!img) return;
            const side = entry.dataset.side;

            if (entry !== best) {
                img.style.opacity = '0';
                img.style.transform = side === 'left'
                    ? 'translateX(-55px) scale(0.88)'
                    : 'translateX(55px) scale(0.88)';
                if (entry.classList.contains('active')) entry.classList.remove('active');
                return;
            }

            const r = entry.getBoundingClientRect();
            const entryCenter = r.top + r.height / 2;
            const distFromCenter = Math.abs(entryCenter - vh / 2);
            const t = easeOut(clamp(1 - distFromCenter / (vh * 0.65), 0, 1));

            img.style.opacity = t.toFixed(3);
            const tx = (side === 'left' ? -1 : 1) * (55 * (1 - t));
            const scale = 0.88 + 0.12 * t;
            const ty = ((entryCenter - vh / 2) / vh) * 28;
            img.style.transform = `translateX(${tx.toFixed(1)}px) translateY(${ty.toFixed(1)}px) scale(${scale.toFixed(3)})`;
            img.style.backgroundPositionY = `calc(50% + ${(ty * 0.6).toFixed(1)}px)`;

            if (entry !== activeEntry) {
                if (activeEntry) activeEntry.classList.remove('active');
                entry.classList.add('active');
                activeEntry = entry;
            }
        });
    }

    _updateProjects = update;
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
}

document.addEventListener('DOMContentLoaded', initProjectsScroll);
