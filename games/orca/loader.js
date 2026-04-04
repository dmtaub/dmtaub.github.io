(async function () {
    // Determine game name from page's data-game attribute or default to 'orca'
    const gameName = document.body.dataset.game || 'orca';
    const STORAGE_KEY = `${gameName}_monthly_password`;

    // Service Workers require HTTPS (or localhost)
    if (!('serviceWorker' in navigator)) {
        showError('Service workers are not supported in this browser.');
        return;
    }

    // Register service worker with root scope
    let reg;
    try {
        reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch (err) {
        showError('Failed to register service worker: ' + err.message);
        return;
    }

    // Wait for SW to be active (handles both fresh install and already-active cases)
    await navigator.serviceWorker.ready;

    // Ensure we have an active controller; if not, reload so the SW can claim the page
    if (!navigator.serviceWorker.controller) {
        window.location.reload();
        return;
    }

    // Try stored password first (avoids prompt when user revisits within same month)
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        const result = await tryUnlock(gameName, stored);
        if (result.ok) {
            window.__assetPackMode = result.packMode === true;
            window.__secureMode = true;
            startGame(gameName);
            return;
        }
        // Password is stale (month rolled over or wrong); clear it
        localStorage.removeItem(STORAGE_KEY);
    }

    // Show password prompt
    showPasswordPrompt(async (password) => {
        const result = await tryUnlock(gameName, password);
        if (result.ok) {
            localStorage.setItem(STORAGE_KEY, password);
            window.__assetPackMode = result.packMode === true;
            window.__secureMode = true;
            hidePasswordPrompt();
            startGame(gameName);
        } else {
            shakePrompt();
        }
    });

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    /**
     * Sends the 'unlock' message to the Service Worker via a MessageChannel
     * so the reply is routed directly back to this port.
     */
    async function tryUnlock(gameName, password) {
        return new Promise((resolve) => {
            const channel = new MessageChannel();
            channel.port1.onmessage = (e) => {
                resolve(e.data ?? { ok: false });
            };
            navigator.serviceWorker.controller.postMessage(
                { type: 'unlock', password, gameName },
                [channel.port2]
            );
        });
    }

    /**
     * Injects the main game script. The SW intercepts the .enc fetch and
     * returns the decrypted bytes with the correct content-type.
     */
    function startGame(gameName) {
        const script = document.createElement('script');
        script.src = `./${gameName}/${gameName}.min.js.enc`;
        script.onerror = () => showError('Failed to load game script.');
        document.body.appendChild(script);
    }

    // -------------------------------------------------------------------------
    // UI
    // -------------------------------------------------------------------------

    function showPasswordPrompt(onSubmit) {
        // Remove existing overlay if any
        document.getElementById('pw-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'pw-overlay';
        overlay.style.cssText = [
            'position:fixed',
            'inset:0',
            'display:flex',
            'align-items:center',
            'justify-content:center',
            'background:#000',
            'z-index:9999',
        ].join(';');

        overlay.innerHTML = `
            <div style="text-align:center;color:#fff;font-family:monospace">
                <div style="margin-bottom:1em;font-size:1.2em">Enter access code</div>
                <input
                    id="pw-input"
                    type="password"
                    maxlength="8"
                    autocomplete="off"
                    style="
                        background:#111;
                        color:#fff;
                        border:1px solid #555;
                        padding:.5em;
                        font-size:1.2em;
                        width:8ch;
                        text-align:center;
                        letter-spacing:.2em;
                        outline:none;
                    "
                />
                <br><br>
                <button
                    id="pw-submit"
                    style="
                        background:#333;
                        color:#fff;
                        border:1px solid #555;
                        padding:.4em 1.2em;
                        font-family:monospace;
                        cursor:pointer;
                    "
                >
                    Enter
                </button>
            </div>
        `;

        document.body.appendChild(overlay);

        function submit() {
            const val = document.getElementById('pw-input').value.toLowerCase().trim();
            if (val.length === 0) return;
            onSubmit(val);
        }

        document.getElementById('pw-submit').addEventListener('click', submit);
        document.getElementById('pw-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submit();
        });

        // Auto-focus input
        setTimeout(() => document.getElementById('pw-input')?.focus(), 50);
    }

    function hidePasswordPrompt() {
        document.getElementById('pw-overlay')?.remove();
    }

    function shakePrompt() {
        const el = document.getElementById('pw-input');
        if (!el) return;
        el.style.borderColor = '#f55';
        el.value = '';
        el.focus();
        setTimeout(() => {
            el.style.borderColor = '#555';
        }, 1000);
    }

    function showError(msg) {
        document.body.innerHTML = `
            <div style="
                color:#f55;
                font-family:monospace;
                padding:2em;
                font-size:1em;
                background:#000;
                min-height:100vh;
                box-sizing:border-box;
            ">${msg}</div>
        `;
    }
})();
