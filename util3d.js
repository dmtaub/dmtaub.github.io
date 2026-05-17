/* ── util3d.js ─────────────────────────────────────────────────────────────────
   Shared Three.js / WebGL utilities.  ES module — import in <script type="module">.

   watchContextLoss(renderer, options) → controller
     Attaches webglcontextlost / webglcontextrestored listeners and surfaces a
     per-frame check for silent drops (Safari sometimes skips the event entirely).

     Options:
       onFallback()   — called after `timeout` ms with no restoration; show your
                        error UI here
       onRestored()   — called when the context comes back (default: location.reload)
       timeout        — ms to wait before giving up  (default: 4000)

     Returns:
       .check()       — call at the top of every animate frame; returns true if the
                        context is currently lost (stop the loop and return)
       .reattach(r)   — after creating a replacement renderer on context-restore,
                        pass the new renderer so .check() targets it and its canvas
                        gets fresh listeners

   pauseWhenHidden(onHide, onShow)
     Pauses the render loop when the document tab becomes hidden and resumes when
     it comes back.  Reduces GPU pressure — Safari is far less likely to reclaim
     a context that isn't actively rendering.

   probeWebGL() → boolean
     Cheap pre-flight check.  Safari can refuse to hand out a GL context (or
     return a pre-lost one) when the GPU is under pressure; calling this before
     `new THREE.WebGLRenderer(...)` lets you bail out cleanly instead of crashing
     deep inside the constructor.

   showContextLostOverlay()
     Reveals a `#context-lost` overlay element on the page if present.  The
     element is markup-only — see coin.html / index.html for the markup + CSS.
─────────────────────────────────────────────────────────────────────────────── */

export function watchContextLoss(renderer, {
    onFallback,
    onRestored,
    timeout = 4000,
} = {}) {
    let _r = renderer;
    let _timer = null;

    const _fallback = () => { _timer = null; onFallback?.(); };
    const _restored = () => {
        clearTimeout(_timer);
        _timer = null;
        if (onRestored) onRestored(); else location.reload();
    };

    function _wire(r) {
        r.domElement.addEventListener('webglcontextlost', e => {
            e.preventDefault(); // required to allow restoration
            if (!_timer) _timer = setTimeout(_fallback, timeout);
        }, false);
        r.domElement.addEventListener('webglcontextrestored', _restored, false);
    }

    _wire(_r);

    return {
        /** Returns true if the context is currently lost. Call at the top of animate(). */
        check() {
            if (_r.getContext().isContextLost()) {
                if (!_timer) _timer = setTimeout(_fallback, timeout);
                return true;
            }
            return false;
        },
        /** After recreating the renderer on context-restore, call this so the new
         *  canvas gets listeners and .check() targets the right context. */
        reattach(newRenderer) {
            _r = newRenderer;
            _wire(newRenderer);
        },
    };
}

export function pauseWhenHidden(onHide, onShow) {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) onHide(); else onShow();
    });
}

export function probeWebGL() {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    return !!gl && !gl.isContextLost?.();
}

export function showContextLostOverlay() {
    document.getElementById('context-lost')?.classList.add('show');
}
