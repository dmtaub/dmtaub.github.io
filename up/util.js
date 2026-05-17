/* ── Util page shared components ─────────────────────────────────────────────
   Vanilla-JS custom elements. Load with <script src="./util.js"> (non-module).

   <theme-toggle [labels]>
     Self-contained toggle button. Applies/removes body.dark and persists the
     choice to localStorage. Broadcasts a 'themechange' CustomEvent on document
     so multiple instances stay in sync.
     labels — append a " Dark"/" Light" <span> after the emoji (used by the
              main site's nav-pill style; the span is hidden on mobile)

   <page-topbar back="href" back-label="text" title="text" subtitle="text" status-banner>
     Renders a .topbar row (back-link + theme-toggle), then optionally a
     page heading and a status banner. Attributes:
       back          — href for the back link  (default: "./")
       back-label    — link text              (default: "← Utils")
       title         — page heading           (omit to skip)
       subtitle      — muted subheading       (omit to skip)
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

// ── <page-topbar> ────────────────────────────────────────────────────────────
if (!customElements.get('page-topbar')) {
    customElements.define('page-topbar', class extends HTMLElement {
        connectedCallback() {
            const back      = this.getAttribute('back')       ?? './';
            const label     = this.getAttribute('back-label') ?? '← Utils';
            const title     = this.getAttribute('title')      ?? '';
            const subtitle  = this.getAttribute('subtitle')   ?? '';
            const hasBanner = this.hasAttribute('status-banner');
            this.style.display = 'block';
            this.innerHTML =
                `<div class="topbar"><a class="back-link" href="${back}">${label}</a><theme-toggle></theme-toggle></div>` +
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
