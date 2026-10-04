/* ── Util page shared components ─────────────────────────────────────────────
   Vanilla-JS custom elements. Load with <script src="./util.js"> (non-module).

   <theme-toggle [labels]>
     Self-contained toggle button. Applies/removes body.dark and persists the
     choice to localStorage. Broadcasts a 'themechange' CustomEvent on document
     so multiple instances stay in sync.
     labels — append a " Dark"/" Light" <span> after the emoji (used by the
              main site's nav-pill style; the span is hidden on mobile)

   <fullscreen-toggle>
     Enters/exits browser fullscreen for the whole page (Esc also exits).
     Hides itself where the Fullscreen API is unavailable (e.g. iPhone Safari).

   <page-topbar back="href" back-label="text" title="text" subtitle="text" fullscreen status-banner>
     Renders a .topbar row (back-link + theme-toggle), then optionally a
     page heading and a status banner. Attributes:
       back          — href for the back link  (default: "./")
       back-label    — link text              (default: "← Utils")
       title         — page heading           (omit to skip)
       subtitle      — muted subheading       (omit to skip)
       fullscreen    — add a <fullscreen-toggle> beside the theme toggle
       status-banner — include a loading/error banner; exposes on the element:
                         el.showStatus(msg, isErr)  show message (+ spinner if !isErr)
                         el.showStatus(null)        same as hideStatus
                         el.hideStatus()            hide the banner

   FOUC prevention — keep this at the start of every util page's <body>:
     <body class="dark"><script>
       if(localStorage.getItem('theme')==='light')document.body.classList.remove('dark');
     </script>
   ─────────────────────────────────────────────────────────────────────────── */

// ── Shared Theme helper ──────────────────────────────────────────────────────
const Theme = (() => {
    const isDark = () => document.body.classList.contains('dark');
    const set = (dark, save = true) => {
        document.body.classList.toggle('dark', dark);
        if (save) localStorage.setItem('theme', dark ? 'dark' : 'light');
        document.dispatchEvent(new CustomEvent('themechange', { detail: { dark } }));
    };
    return { isDark, set, toggle: () => set(!isDark()) };
})();

// ── <theme-toggle> ───────────────────────────────────────────────────────────
if (!customElements.get('theme-toggle')) {
    customElements.define('theme-toggle', class extends HTMLElement {
        connectedCallback() {
            this.classList.add('theme-toggle');
            this.setAttribute('role', 'button');
            this.setAttribute('tabindex', '0');
            this.style.cursor = 'pointer';
            this._sync();
            this.addEventListener('click', () => Theme.toggle());
            this.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); Theme.toggle(); }
            });
            document.addEventListener('themechange', () => this._sync());
        }
        _sync() {
            const dark = Theme.isDark();
            if (this.hasAttribute('labels')) {
                this.innerHTML = dark ? '🌙<span> Dark</span>' : '☀<span> Light</span>';
            } else {
                this.textContent = dark ? '🌙' : '☀';
            }
            this.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
            this.setAttribute('aria-label', this.title);
        }
    });
}

// ── <fullscreen-toggle> ──────────────────────────────────────────────────────
if (!customElements.get('fullscreen-toggle')) {
    const d = document, el = d.documentElement;
    const active = () => !!(d.fullscreenElement || d.webkitFullscreenElement);
    // Unprefixed API, falling back to webkit for older iPad Safari.
    const toggle = () => Promise.resolve(active()
        ? (d.exitFullscreen || d.webkitExitFullscreen).call(d)
        : (el.requestFullscreen || el.webkitRequestFullscreen).call(el)).catch(() => {});
    const ICON_ENTER = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9"/></svg>';
    const ICON_EXIT  = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 1v4H1M13 5H9V1M9 13V9h4M1 9h4v4"/></svg>';
    customElements.define('fullscreen-toggle', class extends HTMLElement {
        connectedCallback() {
            if (!(d.fullscreenEnabled || d.webkitFullscreenEnabled)) { this.hidden = true; return; }
            this.classList.add('fullscreen-toggle');
            this.setAttribute('role', 'button');
            this.setAttribute('tabindex', '0');
            this.style.cursor = 'pointer';
            this._sync();
            this.addEventListener('click', toggle);
            this.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
            });
            d.addEventListener('fullscreenchange', () => this._sync());
            d.addEventListener('webkitfullscreenchange', () => this._sync());
        }
        _sync() {
            const on = active();
            this.innerHTML = on ? ICON_EXIT : ICON_ENTER;
            this.title = on ? 'Exit fullscreen (Esc)' : 'Fullscreen';
            this.setAttribute('aria-label', this.title);
            this.setAttribute('aria-pressed', on);
        }
    });
}

// ── <page-topbar> ────────────────────────────────────────────────────────────
if (!customElements.get('page-topbar')) {
    customElements.define('page-topbar', class extends HTMLElement {
        connectedCallback() {
            const back      = this.getAttribute('back')       ?? './';
            const label     = this.getAttribute('back-label') ?? '← Utils';
            const title     = this.getAttribute('title')      ?? '';
            const subtitle  = this.getAttribute('subtitle')   ?? '';
            const hasBanner = this.hasAttribute('status-banner');
            const toggles   = this.hasAttribute('fullscreen')
                ? '<span class="topbar-actions"><fullscreen-toggle></fullscreen-toggle><theme-toggle></theme-toggle></span>'
                : '<theme-toggle></theme-toggle>';
            this.style.display = 'block';
            this.innerHTML =
                `<div class="topbar"><a class="back-link" href="${back}">${label}</a>${toggles}</div>` +
                (title     ? `<h1 class="page-title">${title}</h1>`       : '') +
                (subtitle  ? `<p class="page-subtitle">${subtitle}</p>`   : '') +
                (hasBanner ? `<div class="status-banner" style="display:none"><span class="spinner"></span><span></span></div>` : '');
            if (hasBanner) {
                this._b  = this.querySelector('.status-banner');
                this._bs = this._b.querySelector('.spinner');
                this._bm = this._b.querySelector('span:last-child');
            }
        }
        // showStatus(msg, isErr) — unified entry point; falsy msg → hide
        showStatus(msg, isErr = false) {
            if (!this._b) return;
            if (!msg) { this._b.style.display = 'none'; return; }
            this._bm.textContent = msg;
            this._bs.style.display = isErr ? 'none' : '';
            this._b.classList.toggle('err', isErr);
            this._b.style.display = 'flex';
        }
        hideStatus() { if (this._b) this._b.style.display = 'none'; }
    });
}
