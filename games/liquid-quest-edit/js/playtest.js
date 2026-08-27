// Playing the level you are looking at, without exporting anything.
//
// The game is a Godot web export in play/, beside this page — same origin, so
// the level goes straight across with postMessage. The game side of the
// conversation is scripts/autoload/PlaytestBridge.gd.
//
// Protocol and ordering: docs/PLAYTEST_BRIDGE.md

(function () {
  "use strict";

  // Where build_web.py puts the export. Relative, so it works on the deployed
  // site and from a local start-editor.py alike.
  const GAME_PATH = "play/index.html";
  // Long enough that painting a wall doesn't restart the game on every tile.
  const PUSH_DELAY = 700;
  // The game ticks once a second. Miss three and it has stopped — a wedged
  // Godot build keeps its last frame on screen and looks exactly like a
  // running one, which is a bad way to spend an afternoon.
  const SILENCE_MS = 3200;
  // Enough log to see what happened before it stopped, not enough to grow.
  const LOG_LINES = 300;

  let frame = null;
  let host = null;
  let statusEl = null;
  let ready = false;          // the game has booted and said hello
  let built = null;           // null = not checked yet, then true/false
  let pushTimer = null;
  let live = true;
  // Decides whether "Start again" resends the level or just says "start again".
  // A level with pictures in it is megabytes.
  let dirty = false;
  let onStateChange = function () {};
  let getPayload = function () { return null; };
  let onResize = function () {};
  let lastTick = 0;
  let watchdog = null;
  let stalled = false;
  // Only a game that has ticked at least once can be said to have stopped.
  // Otherwise an older build in play/ — one with no heartbeat in it — would be
  // reported as frozen for as long as it ran perfectly well.
  let everTicked = false;
  const log = [];

  // Asked on the first press, not at load: a missing build is a 404, and a 404
  // in the console of an editor that is working fine is a red herring.
  function check() {
    if (built !== null) return Promise.resolve(built);
    return fetch(GAME_PATH, { method: "HEAD" })
      .then(function (res) { built = res.ok; return built; })
      .catch(function () { built = false; return built; });
  }

  function isPlaying() { return !!frame; }

  function start() {
    return check().then(function (ok) {
      if (!ok) {
        onStateChange();
        return false;
      }
      if (frame) {
        replay();
        return true;
      }
      host = document.getElementById("playtest");
      host.hidden = false;
      statusEl = document.getElementById("playtest-status");
      setStatus("Starting the game…");

      frame = document.createElement("iframe");
      frame.id = "playtest-frame";
      frame.title = "The game";
      // A cache-buster: an old wasm served from cache after a rebuild is a very
      // confusing thing to debug.
      frame.src = GAME_PATH + "?lq=" + Date.now();
      frame.allow = "autoplay; fullscreen; gamepad";
      frame.addEventListener("load", captureConsole);
      document.getElementById("playtest-body").appendChild(frame);
      ready = false;
      // The grid just lost half the stage, and it draws to a fixed-size canvas.
      onResize();
      onStateChange();
      return true;
    });
  }

  // Godot prints to the browser console — engine errors included. Reading it
  // here means the game's own output is in front of whoever is playing rather
  // than behind a devtools panel.
  function captureConsole() {
    let win;
    try {
      win = frame.contentWindow;
    } catch (err) {
      return;   // not same-origin; nothing to read
    }
    ["log", "info", "warn", "error"].forEach(function (level) {
      const original = win.console[level];
      win.console[level] = function () {
        const text = Array.prototype.map.call(arguments, String).join(" ");
        addLog(level, text);
        original.apply(win.console, arguments);
      };
    });
    win.addEventListener("error", function (ev) {
      addLog("error", ev.message || String(ev.error || "error"));
    });
  }

  // `ours` marks a note the editor wrote about the game, rather than something
  // the game said. Those don't rewrite the status line — the caller has just
  // put something more useful there.
  function addLog(level, text, ours) {
    log.push({ level: level, text: text, at: new Date() });
    if (log.length > LOG_LINES) log.shift();
    const box = document.getElementById("playtest-log");
    if (box) {
      const line = document.createElement("div");
      line.className = "log-line log-" + level;
      line.textContent = text;
      box.appendChild(line);
      while (box.childElementCount > LOG_LINES) box.removeChild(box.firstChild);
      box.scrollTop = box.scrollHeight;
    }
    if (level === "error") {
      const details = document.getElementById("playtest-log-wrap");
      if (details) details.open = true;
      if (!ours) setStatus("The game reported an error — see the log");
    }
  }

  // Nothing heard for a few seconds means the game is wedged, not idle.
  function startWatchdog() {
    stopWatchdog();
    lastTick = Date.now();
    watchdog = setInterval(function () {
      if (!frame || !ready || !everTicked) return;
      // A hidden page stops painting, and Godot's main loop runs off the
      // browser's animation frames — so "no ticks" while this tab is in the
      // background means the browser paused it, not that the game died.
      if (document.hidden) {
        lastTick = Date.now();
        return;
      }
      const silent = Date.now() - lastTick;
      if (silent > SILENCE_MS && !stalled) {
        stalled = true;
        setStatus("The game stopped responding (" + Math.round(silent / 1000)
          + "s). Its last words are in the log.");
        addLog("error", "--- no heartbeat for " + Math.round(silent / 1000) + "s ---", true);
      }
    }, 1000);
  }

  function stopWatchdog() {
    if (watchdog) clearInterval(watchdog);
    watchdog = null;
    stalled = false;
    everTicked = false;
  }

  function stop() {
    stopWatchdog();
    if (pushTimer) {
      clearTimeout(pushTimer);
      pushTimer = null;
    }
    if (frame && frame.parentNode) frame.parentNode.removeChild(frame);
    frame = null;
    ready = false;
    if (host) host.hidden = true;
    onResize();
    onStateChange();
  }

  // Send the level as it stands. Called on Play, on Replay, and — when "update
  // as I build" is on — a moment after any change.
  function push() {
    if (!frame || !ready) return;
    const payload = getPayload();
    if (!payload) return;
    frame.contentWindow.postMessage(
      { __lq: true, type: "level", level: payload.level, images: payload.images }, "*");
    dirty = false;
    setStatus("Playing " + (payload.level.name || payload.level.id));
  }

  function pushSoon() {
    dirty = true;
    if (!frame || !live) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushTimer = null;
      push();
    }, PUSH_DELAY);
  }

  function replay() {
    if (!frame || !ready) return;
    if (dirty) {
      push();
      return;
    }
    frame.contentWindow.postMessage({ __lq: true, type: "restart" }, "*");
    setStatus("Started again");
  }

  function setLive(on) {
    live = !!on;
    if (live) pushSoon();
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  // The game talks back: "ready" once it has booted, "playing" when it has
  // built a level, "problem" when it couldn't.
  window.addEventListener("message", function (ev) {
    const data = ev.data;
    if (!data || data.__lq !== true) return;
    if (!frame || ev.source !== frame.contentWindow) return;

    if (data.type === "ready") {
      ready = true;
      startWatchdog();
      push();
      onStateChange();
    } else if (data.type === "tick") {
      everTicked = true;
      lastTick = Date.now();
      if (stalled) {
        stalled = false;
        setStatus("The game is answering again");
      }
    } else if (data.type === "problem") {
      setStatus("The game couldn't read that level: " + data.message);
      addLog("error", "couldn't read that level: " + data.message);
    }
  });

  window.Playtest = {
    check: check,
    start: start,
    stop: stop,
    replay: replay,
    push: push,
    pushSoon: pushSoon,
    setLive: setLive,
    isLive: function () { return live; },
    isPlaying: isPlaying,
    isStalled: function () { return stalled; },
    isWatched: function () { return everTicked; },
    log: function () { return log.slice(); },
    isReady: function () { return ready; },
    isBuilt: function () { return built; },
    gamePath: GAME_PATH,
    onStateChange: function (fn) { onStateChange = fn; },
    onResize: function (fn) { onResize = fn; },
    providePayload: function (fn) { getPayload = fn; },
  };
})();
