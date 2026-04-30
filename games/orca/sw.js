let gate_bindgen = (function(exports) {
    let script_src;
    if (typeof document !== 'undefined' && document.currentScript !== null) {
        script_src = new URL(document.currentScript.src, location.href).toString();
    }

    /**
     * Zeroes and removes the session slot.
     * @param {number} session_token
     */
    function gate_close_session(session_token) {
        wasm.gate_close_session(session_token);
    }
    exports.gate_close_session = gate_close_session;

    /**
     * Decrypts an asset. `ciphertext` is the raw ciphertext+tag bytes (without nonce prefix).
     * `nonce` is the 12-byte nonce passed separately.
     * Returns Some(plaintext) or None on failure.
     * @param {number} session_token
     * @param {Uint8Array} ciphertext
     * @param {Uint8Array} nonce
     * @returns {Uint8Array | undefined}
     */
    function gate_decrypt(session_token, ciphertext, nonce) {
        const ptr0 = passArray8ToWasm0(ciphertext, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray8ToWasm0(nonce, wasm.__wbindgen_malloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.gate_decrypt(session_token, ptr0, len0, ptr1, len1);
        let v3;
        if (ret[0] !== 0) {
            v3 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v3;
    }
    exports.gate_decrypt = gate_decrypt;

    /**
     * Validates hostname against ALLOWED_HOSTS, stores it, sets HOST_VALID.
     * Returns 1 = ok, 0 = rejected.
     * @param {string} hostname
     * @returns {number}
     */
    function gate_init(hostname) {
        const ptr0 = passStringToWasm0(hostname, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.gate_init(ptr0, len0);
        return ret;
    }
    exports.gate_init = gate_init;

    /**
     * Opens a session by finding the right wrapped-key segment for the current date
     * and attempting to unwrap the static asset key with the user-provided password.
     *
     * `wrapped_key` must be 727 bytes: 7-byte "YYYY-MM" start-month header followed by
     * 12 × 60-byte AES-GCM wrapped-key segments (one per consecutive month).
     * The gate reads the current date via JS, tries the ±1 month window against the
     * 12-month window, and accepts any password valid within that range.
     *
     * Returns slot index (>= 0) as session_token, or -1 on any failure.
     * @param {string} password
     * @param {string} game_name
     * @param {Uint8Array} wrapped_key
     * @returns {number}
     */
    function gate_open_session(password, game_name, wrapped_key) {
        const ptr0 = passStringToWasm0(password, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(game_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray8ToWasm0(wrapped_key, wasm.__wbindgen_malloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.gate_open_session(ptr0, len0, ptr1, len1, ptr2, len2);
        return ret;
    }
    exports.gate_open_session = gate_open_session;

    function __wbg_get_imports() {
        const import0 = {
            __proto__: null,
            __wbg___wbindgen_throw_5549492daedad139: function(arg0, arg1) {
                throw new Error(getStringFromWasm0(arg0, arg1));
            },
            __wbg_getFullYear_f02e49cd09a1771d: function(arg0) {
                const ret = arg0.getFullYear();
                return ret;
            },
            __wbg_getMonth_c09ce70493b4f5c3: function(arg0) {
                const ret = arg0.getMonth();
                return ret;
            },
            __wbg_new_0_e649c99e7382313f: function() {
                const ret = new Date();
                return ret;
            },
            __wbindgen_init_externref_table: function() {
                const table = wasm.__wbindgen_externrefs;
                const offset = table.grow(4);
                table.set(0, undefined);
                table.set(offset + 0, undefined);
                table.set(offset + 1, null);
                table.set(offset + 2, true);
                table.set(offset + 3, false);
            },
        };
        return {
            __proto__: null,
            "./gate_bg.js": import0,
        };
    }

    function getArrayU8FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
    }

    function getStringFromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return decodeText(ptr, len);
    }

    let cachedUint8ArrayMemory0 = null;
    function getUint8ArrayMemory0() {
        if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
            cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
        }
        return cachedUint8ArrayMemory0;
    }

    function passArray8ToWasm0(arg, malloc) {
        const ptr = malloc(arg.length * 1, 1) >>> 0;
        getUint8ArrayMemory0().set(arg, ptr / 1);
        WASM_VECTOR_LEN = arg.length;
        return ptr;
    }

    function passStringToWasm0(arg, malloc, realloc) {
        if (realloc === undefined) {
            const buf = cachedTextEncoder.encode(arg);
            const ptr = malloc(buf.length, 1) >>> 0;
            getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
            WASM_VECTOR_LEN = buf.length;
            return ptr;
        }

        let len = arg.length;
        let ptr = malloc(len, 1) >>> 0;

        const mem = getUint8ArrayMemory0();

        let offset = 0;

        for (; offset < len; offset++) {
            const code = arg.charCodeAt(offset);
            if (code > 0x7F) break;
            mem[ptr + offset] = code;
        }
        if (offset !== len) {
            if (offset !== 0) {
                arg = arg.slice(offset);
            }
            ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
            const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
            const ret = cachedTextEncoder.encodeInto(arg, view);

            offset += ret.written;
            ptr = realloc(ptr, len, offset, 1) >>> 0;
        }

        WASM_VECTOR_LEN = offset;
        return ptr;
    }

    let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    function decodeText(ptr, len) {
        return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
    }

    const cachedTextEncoder = new TextEncoder();

    if (!('encodeInto' in cachedTextEncoder)) {
        cachedTextEncoder.encodeInto = function (arg, view) {
            const buf = cachedTextEncoder.encode(arg);
            view.set(buf);
            return {
                read: arg.length,
                written: buf.length
            };
        };
    }

    let WASM_VECTOR_LEN = 0;

    let wasmModule, wasm;
    function __wbg_finalize_init(instance, module) {
        wasm = instance.exports;
        wasmModule = module;
        cachedUint8ArrayMemory0 = null;
        wasm.__wbindgen_start();
        return wasm;
    }

    async function __wbg_load(module, imports) {
        if (typeof Response === 'function' && module instanceof Response) {
            if (typeof WebAssembly.instantiateStreaming === 'function') {
                try {
                    return await WebAssembly.instantiateStreaming(module, imports);
                } catch (e) {
                    const validResponse = module.ok && expectedResponseType(module.type);

                    if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                        console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                    } else { throw e; }
                }
            }

            const bytes = await module.arrayBuffer();
            return await WebAssembly.instantiate(bytes, imports);
        } else {
            const instance = await WebAssembly.instantiate(module, imports);

            if (instance instanceof WebAssembly.Instance) {
                return { instance, module };
            } else {
                return instance;
            }
        }

        function expectedResponseType(type) {
            switch (type) {
                case 'basic': case 'cors': case 'default': return true;
            }
            return false;
        }
    }

    function initSync(module) {
        if (wasm !== undefined) return wasm;


        if (module !== undefined) {
            if (Object.getPrototypeOf(module) === Object.prototype) {
                ({module} = module)
            } else {
                console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
            }
        }

        const imports = __wbg_get_imports();
        if (!(module instanceof WebAssembly.Module)) {
            module = new WebAssembly.Module(module);
        }
        const instance = new WebAssembly.Instance(module, imports);
        return __wbg_finalize_init(instance, module);
    }

    async function __wbg_init(module_or_path) {
        if (wasm !== undefined) return wasm;


        if (module_or_path !== undefined) {
            if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
                ({module_or_path} = module_or_path)
            } else {
                console.warn('using deprecated parameters for the initialization function; pass a single object instead')
            }
        }

        if (module_or_path === undefined && script_src !== undefined) {
            module_or_path = script_src.replace(/\.js$/, "_bg.wasm");
        }
        const imports = __wbg_get_imports();

        if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
            module_or_path = fetch(module_or_path);
        }

        const { instance, module } = await __wbg_load(await module_or_path, imports);

        return __wbg_finalize_init(instance, module);
    }

    return Object.assign(__wbg_init, { initSync }, exports);
})({ __proto__: null });

let orca_bindgen = (function(exports) {
    let script_src;
    if (typeof document !== 'undefined' && document.currentScript !== null) {
        script_src = new URL(document.currentScript.src, location.href).toString();
    }

    /**
     * Returns the stored session token.
     * The SW calls gate.gate_decrypt(orca.game_get_session_token(), ct, nonce).
     * @returns {number}
     */
    function game_get_session_token() {
        const ret = wasm.game_get_session_token();
        return ret;
    }
    exports.game_get_session_token = game_get_session_token;

    /**
     * Stores the session token obtained from the gate. Returns 1.
     * @param {number} session_token
     * @returns {number}
     */
    function game_init(session_token) {
        const ret = wasm.game_init(session_token);
        return ret;
    }
    exports.game_init = game_init;

    function __wbg_get_imports() {
        const import0 = {
            __proto__: null,
            __wbindgen_init_externref_table: function() {
                const table = wasm.__wbindgen_externrefs;
                const offset = table.grow(4);
                table.set(0, undefined);
                table.set(offset + 0, undefined);
                table.set(offset + 1, null);
                table.set(offset + 2, true);
                table.set(offset + 3, false);
            },
        };
        return {
            __proto__: null,
            "./orca_bg.js": import0,
        };
    }

    let wasmModule, wasm;
    function __wbg_finalize_init(instance, module) {
        wasm = instance.exports;
        wasmModule = module;
        wasm.__wbindgen_start();
        return wasm;
    }

    async function __wbg_load(module, imports) {
        if (typeof Response === 'function' && module instanceof Response) {
            if (typeof WebAssembly.instantiateStreaming === 'function') {
                try {
                    return await WebAssembly.instantiateStreaming(module, imports);
                } catch (e) {
                    const validResponse = module.ok && expectedResponseType(module.type);

                    if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                        console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                    } else { throw e; }
                }
            }

            const bytes = await module.arrayBuffer();
            return await WebAssembly.instantiate(bytes, imports);
        } else {
            const instance = await WebAssembly.instantiate(module, imports);

            if (instance instanceof WebAssembly.Instance) {
                return { instance, module };
            } else {
                return instance;
            }
        }

        function expectedResponseType(type) {
            switch (type) {
                case 'basic': case 'cors': case 'default': return true;
            }
            return false;
        }
    }

    function initSync(module) {
        if (wasm !== undefined) return wasm;


        if (module !== undefined) {
            if (Object.getPrototypeOf(module) === Object.prototype) {
                ({module} = module)
            } else {
                console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
            }
        }

        const imports = __wbg_get_imports();
        if (!(module instanceof WebAssembly.Module)) {
            module = new WebAssembly.Module(module);
        }
        const instance = new WebAssembly.Instance(module, imports);
        return __wbg_finalize_init(instance, module);
    }

    async function __wbg_init(module_or_path) {
        if (wasm !== undefined) return wasm;


        if (module_or_path !== undefined) {
            if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
                ({module_or_path} = module_or_path)
            } else {
                console.warn('using deprecated parameters for the initialization function; pass a single object instead')
            }
        }

        if (module_or_path === undefined && script_src !== undefined) {
            module_or_path = script_src.replace(/\.js$/, "_bg.wasm");
        }
        const imports = __wbg_get_imports();

        if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
            module_or_path = fetch(module_or_path);
        }

        const { instance, module } = await __wbg_load(await module_or_path, imports);

        return __wbg_finalize_init(instance, module);
    }

    return Object.assign(__wbg_init, { initSync }, exports);
})({ __proto__: null });

// Service Worker — secure asset delivery
// Loads gate.wasm (auth + decryption) and orca.wasm (session token holder).
// Intercepts .enc asset fetches and decrypts them on the fly.
//
// NOTE: this file is NOT served directly. scripts/bundle-sw.sh prepends the
// wasm-pack JS glue for gate and orca (with wasm_bindgen renamed to
// gate_bindgen / orca_bindgen) before this file, producing the final sw.js
// that is served. That eliminates importScripts entirely.
//
// gate_bindgen and orca_bindgen are therefore defined above this point
// in the bundled output.

// Base path of the SW's own directory — '' when served from domain root, '/games/orca' on subpath.
// All asset fetches are relative to this, so the same sw.js works at any mount point.
const swBase = self.location.pathname.replace(/\/[^/]+$/, '');

// State
let gateModule = null;  // populated after gate_bindgen(`${swBase}/gate_bg.wasm`) resolves
let orcaModule = null;  // populated after orca_bindgen(`${swBase}/{game}_bg.wasm`) resolves
let manifest = null;    // Map: relative-path → { id, nonce (Uint8Array) }
let sessionReady = false;
let activeGameName = null;  // set on unlock; used to rewrite Phaser asset paths

// Pack mode state (set on unlock when orca.pack is present)
let packBuffer = null;      // ArrayBuffer — the entire .pack file
let packIndex = null;       // Map: manifestKey → { offset, size } within the data section
let packDataOffset = 0;     // byte offset where the data section begins in packBuffer

// World data override: true when plaintext world/data files are present alongside the
// built output (level development). Probed once at unlock via regions.json sentinel.
// When active, world/data/** fetches pass through to the server instead of decrypting.
let worldDataOverride = false;

// Image extensions are handled in-page via decrypt_asset postMessage.
// The SW never decrypts these as fetch responses — doing so would expose them in DevTools Network tab.
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

// Non-image extensions that Phaser loads at runtime and need transparent .enc rewriting.
const PHASER_ASSET_EXTENSIONS = new Set([
    'dat', 'biome', 'legend', 'json', 'js',
]);

// Paths that must NOT be rewritten even if they match an asset extension.
const PASSTHROUGH_PATTERNS = [
    /\/sw\.js$/,
    /\/loader\.js$/,
    /gate\.js$/, /gate_bg\.wasm$/,
    /\/orca\.js$/, /orca_bg\.wasm$/,
    /\/wrapped_key\.bin$/,
    /\/orca\/manifest\.json$/,  // asset index — passthrough; presence signals world-data override
];

function isPassthrough(path) {
    return PASSTHROUGH_PATTERNS.some((re) => re.test(path));
}

function isPhaserAsset(path) {
    if (isPassthrough(path)) return false;
    const ext = path.split('.').pop().toLowerCase();
    return PHASER_ASSET_EXTENSIONS.has(ext);
}

// Take control immediately on install/activate
self.addEventListener('install', (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));

// Messages from page: { type: 'unlock', ... } or { type: 'decrypt_asset', encBytes: ArrayBuffer }
self.addEventListener('message', async (event) => {
    const msg = event.data;
    if (!msg) return;

    // Determine reply port: prefer MessageChannel port2, fall back to source client
    const replyPort = event.ports && event.ports[0] ? event.ports[0] : null;

    function reply(data, transfer) {
        if (replyPort) {
            replyPort.postMessage(data, transfer);
        } else {
            clients.get(event.source.id).then((client) => {
                if (client) client.postMessage(data, transfer);
            });
        }
    }

    // --- decrypt_asset: decrypt one image asset and return plaintext bytes.
    // Pack mode:     msg contains { manifestKey } — SW slices from in-memory pack, no network request.
    // Per-file mode: msg contains { encBytes }   — page fetched the .enc and transfers ciphertext here.
    // World override: if worldDataOverride and key is under world/data/, fetch plaintext directly. ---
    if (msg.type === 'decrypt_asset') {
        if (!sessionReady) {
            reply({ ok: false, reason: 'session not ready' });
            return;
        }
        try {
            // World data override — try serving plaintext file directly; fall back to pack
            // if the file isn't found. This lets a mod supply only the files it changes
            // while everything else is decrypted from orca.pack as normal.
            if (worldDataOverride && msg.manifestKey && msg.manifestKey.startsWith('world/data/')) {
                try {
                    const res = await fetch(`${swBase}/${msg.manifestKey}`, { cache: 'no-store' });
                    if (res.ok) {
                        const bytes = new Uint8Array(await res.arrayBuffer());
                        reply({ ok: true, bytes: bytes.buffer }, [bytes.buffer]);
                        return;
                    }
                    // Not found locally — fall through to pack decryption below.
                } catch {
                    // Network error — fall through to pack decryption below.
                }
            }

            let nonce, ciphertext;
            if (msg.manifestKey !== undefined && packIndex) {
                // Pack mode — look up blob in the in-memory pack
                const entry = packIndex.get(msg.manifestKey);
                if (!entry) {
                    reply({ ok: false, reason: 'not in pack index' });
                    return;
                }
                const blob = new Uint8Array(packBuffer, packDataOffset + entry.offset, entry.size);
                if (blob.length < 12 + 16) {
                    reply({ ok: false, reason: 'pack blob too short' });
                    return;
                }
                nonce      = blob.slice(0, 12);
                ciphertext = blob.slice(12);
            } else if (msg.encBytes !== undefined) {
                // Per-file mode — page fetched and transferred the ciphertext
                const encBytes = new Uint8Array(msg.encBytes);
                if (encBytes.length < 12 + 16) {
                    reply({ ok: false, reason: 'payload too short' });
                    return;
                }
                nonce      = encBytes.slice(0, 12);
                ciphertext = encBytes.slice(12);
            } else {
                reply({ ok: false, reason: 'missing manifestKey or encBytes' });
                return;
            }

            const sessionToken = orcaModule.game_get_session_token();
            const plaintext = gateModule.gate_decrypt(sessionToken, ciphertext, nonce);
            if (!plaintext) {
                reply({ ok: false, reason: 'decryption failed' });
                return;
            }
            reply({ ok: true, bytes: plaintext.buffer }, [plaintext.buffer]);
        } catch (err) {
            reply({ ok: false, reason: err.message || String(err) });
        }
        return;
    }

    if (msg.type !== 'unlock') return;

    const { password, gameName } = msg;

    try {
        // Initialise WASM modules on first use.
        // gate_bindgen / orca_bindgen are defined by the prepended glue in the bundle.
        if (!gateModule) {
            await gate_bindgen(`${swBase}/gate_bg.wasm`);
            gateModule = gate_bindgen;
        }
        if (!orcaModule) {
            await orca_bindgen(`${swBase}/${gameName}_bg.wasm`);
            orcaModule = orca_bindgen;
        }

        // Validate hostname with gate
        const hostname = self.location.hostname;
        if (gateModule.gate_init(hostname) !== 1) {
            reply({ type: 'unlock', ok: false, reason: 'domain' });
            return;
        }

        // Fetch wrapped_key.bin for this game
        const wrappedKeyRes = await fetch(`${swBase}/${gameName}/wrapped_key.bin`);
        if (!wrappedKeyRes.ok) {
            reply({ type: 'unlock', ok: false, reason: 'wrapped_key fetch failed' });
            return;
        }
        const wrappedKeyBytes = new Uint8Array(await wrappedKeyRes.arrayBuffer());

        // Open session in gate — the WASM reads the current date internally and handles
        // the ±1 month grace window. The SW just passes the bytes.
        const token = gateModule.gate_open_session(password, gameName, wrappedKeyBytes);
        if (token < 0) {
            reply({ type: 'unlock', ok: false, reason: 'auth' });
            return;
        }

        // Store token in orca
        orcaModule.game_init(token);
        sessionReady = true;
        activeGameName = gameName;

        // Check for world data override (level development).
        // Probes for <gameName>/manifest.json — a passthrough path that is never
        // intercepted by the fetch handler. Written by copy-world-dev alongside
        // plaintext world data files. When found, world/data/** fetches pass through
        // directly instead of being decrypted from the pack.
        worldDataOverride = await checkWorldDataOverride();
        if (worldDataOverride) {
            console.log('[SW] World data override active: serving plaintext world/data files');
        }

        // Try loading the asset pack; sets packBuffer/packIndex if present.
        // In pack mode, manifest.json is not needed — all assets are served from the pack.
        // Only fetch it as a fallback for per-file mode.
        const packMode = await tryLoadPack(gameName);
        if (!packMode) {
            const manifestRes = await fetch(`${swBase}/${gameName}/manifest.json`);
            if (!manifestRes.ok) {
                reply({ type: 'unlock', ok: false, reason: 'manifest fetch failed' });
                return;
            }
            const manifestData = await manifestRes.json();
            manifest = new Map(
                Object.entries(manifestData).map(([path, info]) => [
                    path,
                    { id: info.id, nonce: hexToBytes(info.nonce) },
                ])
            );
        }

        reply({ type: 'unlock', ok: true, packMode });
    } catch (err) {
        reply({ type: 'unlock', ok: false, reason: err.message || String(err) });
    }
});

// Decrypts one asset from the in-memory pack and returns a Response synchronously.
// manifestKey: e.g. "world/data/main/world.dat"
// originalPath: used only for Content-Type inference, e.g. "/world/data/main/world.dat"
function decryptFromPackAsResponse(manifestKey, originalPath) {
    const entry = packIndex.get(manifestKey);
    if (!entry) return new Response('Not in pack', { status: 404 });
    const blob = new Uint8Array(packBuffer, packDataOffset + entry.offset, entry.size);
    if (blob.length < 12 + 16) return new Response('Pack blob too short', { status: 500 });
    const nonce = blob.slice(0, 12);
    const ciphertext = blob.slice(12);
    const sessionToken = orcaModule.game_get_session_token();
    const plaintext = gateModule.gate_decrypt(sessionToken, ciphertext, nonce);
    if (!plaintext) return new Response('Decryption failed', { status: 403 });
    return new Response(plaintext, {
        status: 200,
        headers: { 'Content-Type': inferContentType(originalPath) },
    });
}

// Intercept asset fetches when session is active
self.addEventListener('fetch', (event) => {
    if (!sessionReady) return;

    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    const path = url.pathname;

    // Direct .enc fetch (game bundle and other non-image assets)
    if (path.endsWith('.enc')) {
        const basePath = path.replace(/\.enc$/, '');
        const ext = basePath.split('.').pop().toLowerCase();
        if (IMAGE_EXTENSIONS.has(ext)) {
            // Image .enc files pass through as ciphertext for page-side decryption.
            return;
        }
        // Pack mode: serve from in-memory pack (no network request).
        if (packIndex) {
            const encPrefix = `${swBase}/${activeGameName}/`;
            const manifestKey = basePath.startsWith(encPrefix) ? basePath.slice(encPrefix.length) : basePath.replace(/^\/[^/]+\//, '');
            if (packIndex.has(manifestKey)) {
                event.respondWith(decryptFromPackAsResponse(manifestKey, basePath));
                return;
            }
        }
        event.respondWith(decryptAsset(event.request, path));
        return;
    }

    // Transparent rewrite: non-image Phaser asset request → <swBase>/<gameName>/path.enc
    // e.g. /world/data/main/world.dat → /orca/world/data/main/world.dat.enc  (at root)
    //   or /games/orca/world/data/main/world.dat → /games/orca/orca/world/data/main/world.dat.enc
    // Images are excluded — they are handled in-page.
    if (isPhaserAsset(path) && activeGameName) {
        // Strip the swBase prefix to get the path relative to the game's serve root.
        const relPath = swBase && path.startsWith(swBase) ? path.slice(swBase.length) : path;
        const manifestKey = relPath.replace(/^\//, '');

        // World data override: fetch directly from the filesystem, bypassing HTTP cache
        // so edited .dat files are picked up immediately. Fetches made from inside the
        // SW's fetch handler do not re-trigger this handler (SW is not a controlled client).
        if (worldDataOverride && manifestKey.startsWith('world/data/')) {
            event.respondWith(fetch(new Request(event.request, { cache: 'no-store' })));
            return;
        }

        // Pack mode: serve from in-memory pack — no rewrite, no network request.
        if (packIndex) {
            if (packIndex.has(manifestKey)) {
                event.respondWith(decryptFromPackAsResponse(manifestKey, path));
                return;
            }
        }
        const encPath = `${swBase}/${activeGameName}${relPath}.enc`;
        const encUrl = new URL(event.request.url);
        encUrl.pathname = encPath;
        event.respondWith(decryptAsset(new Request(encUrl.toString()), encPath));
    }
});

// Reads <gameName>/manifest.json — always present; build writes {"worldDataOverride":false},
// copy-world-dev overwrites with {"worldDataOverride":true}. Path is in PASSTHROUGH_PATTERNS
// so the SW never intercepts it. Returns true only when the flag is explicitly true.
async function checkWorldDataOverride() {
    try {
        const res = await fetch(`${swBase}/${activeGameName}/manifest.json`);
        if (!res.ok) return false;
        const data = await res.json();
        return data.worldDataOverride === true;
    } catch {
        return false;
    }
}

// Attempts to load /<gameName>/<gameName>.pack into memory.
// On success, populates packBuffer/packIndex/packDataOffset and returns true.
async function tryLoadPack(gameName) {
    try {
        const res = await fetch(`${swBase}/${gameName}/${gameName}.pack`);
        if (!res.ok) return false;
        const buf = await res.arrayBuffer();
        if (buf.byteLength < 16) return false;

        const magic = new TextDecoder().decode(new Uint8Array(buf, 0, 8));
        if (magic !== 'ORCAPACK') return false;

        const view = new DataView(buf);
        const indexLen = view.getUint32(12, true); // little-endian
        if (16 + indexLen > buf.byteLength) return false;

        const indexJson = new TextDecoder().decode(new Uint8Array(buf, 16, indexLen));
        const indexObj = JSON.parse(indexJson);
        packIndex = new Map(
            Object.entries(indexObj).map(([k, v]) => [k, { offset: Number(v.offset), size: Number(v.size) }])
        );
        packBuffer = buf;
        packDataOffset = 16 + indexLen;

        console.log(`[SW] Pack mode active: ${packIndex.size} assets, ${(buf.byteLength / 1024 / 1024).toFixed(2)} MB`);
        return true;
    } catch {
        return false;
    }
}

// Used by the fetch handler for non-image assets (dat, json, etc.) that still go through SW responses.
async function decryptAsset(request, encPath) {
    // Derive original filename from the .enc path
    const originalPath = encPath.replace(/\.enc$/, '');

    // Strip the leading <swBase>/<gameName>/ prefix to get the manifest key.
    // e.g. /orca/world/data/main/world.dat → world/data/main/world.dat  (at root)
    //   or /games/orca/orca/world/data/main/world.dat → world/data/main/world.dat
    const encPrefix = `${swBase}/${activeGameName}/`;
    const manifestKey = originalPath.startsWith(encPrefix)
        ? originalPath.slice(encPrefix.length)
        : originalPath.replace(/^\/[^/]+\//, '');

    if (!manifest || !manifest.has(manifestKey)) {
        return new Response('Asset not in manifest', { status: 404 });
    }

    let encRes;
    try {
        encRes = await fetch(request);
    } catch (err) {
        return new Response('Fetch failed: ' + err.message, { status: 502 });
    }
    if (!encRes.ok) return encRes;

    const encBytes = new Uint8Array(await encRes.arrayBuffer());

    // enc file format: nonce(12) || ciphertext+tag
    if (encBytes.length < 12 + 16) {
        return new Response('Encrypted asset too short', { status: 500 });
    }

    const nonce = encBytes.slice(0, 12);
    const ciphertext = encBytes.slice(12); // ciphertext + auth tag

    const sessionToken = orcaModule.game_get_session_token();
    const plaintext = gateModule.gate_decrypt(sessionToken, ciphertext, nonce);

    if (!plaintext) {
        return new Response('Decryption failed', { status: 403 });
    }

    const contentType = inferContentType(originalPath);
    return new Response(plaintext, {
        status: 200,
        headers: { 'Content-Type': contentType },
    });
}

function inferContentType(path) {
    if (path.endsWith('.png'))              return 'image/png';
    if (path.endsWith('.jpg') ||
        path.endsWith('.jpeg'))             return 'image/jpeg';
    if (path.endsWith('.gif'))              return 'image/gif';
    if (path.endsWith('.webp'))             return 'image/webp';
    if (path.endsWith('.svg'))              return 'image/svg+xml';
    if (path.endsWith('.js'))               return 'application/javascript';
    if (path.endsWith('.mjs'))              return 'application/javascript';
    if (path.endsWith('.json'))             return 'application/json';
    if (path.endsWith('.wasm'))             return 'application/wasm';
    if (path.endsWith('.css'))              return 'text/css';
    if (path.endsWith('.html'))             return 'text/html';
    if (path.endsWith('.mp3'))              return 'audio/mpeg';
    if (path.endsWith('.ogg'))              return 'audio/ogg';
    if (path.endsWith('.wav'))              return 'audio/wav';
    if (path.endsWith('.mp4'))              return 'video/mp4';
    if (path.endsWith('.webm'))             return 'video/webm';
    return 'application/octet-stream';
}

function hexToBytes(hex) {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < arr.length; i++) {
        arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return arr;
}
