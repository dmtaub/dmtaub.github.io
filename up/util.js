/* ── Util page shared JS ─────────────────────────────────────────────────────
   Theme toggle wiring. Pair with the inline FOUC-prevention script:
     <body><script>if(localStorage.getItem('theme')==='dark')document.body.classList.add('dark');</script>
   and a button with id="themeToggle" in the page.
   ────────────────────────────────────────────────────────────────────────── */
(function () {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    function setDark(dark, save) {
        document.body.classList.toggle('dark', dark);
        if (save) localStorage.setItem('theme', dark ? 'dark' : 'light');
        btn.textContent = dark ? '🌙' : '☀';
    }
    setDark(document.body.classList.contains('dark'));
    btn.addEventListener('click', () => setDark(!document.body.classList.contains('dark'), true));
})();
