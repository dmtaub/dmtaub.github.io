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
  // The game filling the editor window. A body class rather than an inline
  // style so the CSS keeps the whole rule in one place — see style.css.
  let expanded = false;
  // Only a game that has ticked at least once can be said to have stopped.
  // Otherwise an older build in play/ — one with no heartbeat in it — would be
  // reported as frozen for as long as it ran perfectly well.
  let everTicked = false;
  const log = [];

  // ------------------------------------------------------- the build itself
  // play/ is a *build*, not the code. It is rebuilt by hand, and nothing in the
  // test suites touches it — so a change to the game can be finished, green and
  // committed while Play still runs the version from last week, which looks
  // exactly like the fix not working. The dev server compares the export's date
  // against the game's source and answers here; the deployed site has no such
  // server, and a page that can't ask simply doesn't mention it.
  const BUILD_API = "api/game-build";
  let buildState = null;      // last answer from the server, or null
  let onBuildChange = function () {};

  function buildStatus() {
    return fetch(BUILD_API, { headers: { "Accept": "application/json" } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        buildState = data;
        onBuildChange();
        return data;
      })
      .catch(function () {
        buildState = null;    // no dev server: nothing to say, so say nothing
        onBuildChange();
        return null;
      });
  }

  function isStale() {
    return !!(buildState && buildState.stale);
  }

  // Runs the export and waits for it. Resolves true when play/ is current —
  // including when it already was — and false when the export failed, with the
  // reason in the game log where the rest of the game's output goes.
  function rebuild() {
    setStatus("Building the game… this takes about half a minute.");
    addLog("info", "--- rebuilding the game (buildtools/build_web.py) ---", true);
    return fetch(BUILD_API + "/rebuild", { method: "POST" })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (data === null) return false;
        buildState = data;
        onBuildChange();
        return waitForBuild();
      })
      .catch(function () { return false; });
  }

  function waitForBuild() {
    return new Promise(function (resolve) {
      const tick = function () {
        buildStatus().then(function (data) {
          if (data === null) {
            resolve(false);
            return;
          }
          if (data.building) {
            setTimeout(tick, 700);
            return;
          }
          (data.log || []).forEach(function (line) {
            addLog(data.failed ? "error" : "info", line, true);
          });
          if (data.failed) {
            setStatus("The game didn't build — see the log.");
            resolve(false);
            return;
          }
          addLog("info", "--- the game is up to date ---", true);
          resolve(true);
        });
      };
      tick();
    });
  }

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
      // A build older than the game's source gets rebuilt before it runs,
      // rather than quietly playing last week's game.
      if (isStale()) {
        showPanel();
        return rebuild().then(function (fresh) {
          if (!fresh) return false;
          return startFrame();
        });
      }
      return startFrame();
    });
  }

  // The panel, opened before the game exists, so a rebuild has somewhere to
  // report from. Splitting this out is what lets Play wait on a build first.
  function showPanel() {
    host = document.getElementById("playtest");
    host.hidden = false;
    statusEl = document.getElementById("playtest-status");
    onResize();
    onStateChange();
  }

  function startFrame() {
    return Promise.resolve().then(function () {
      showPanel();
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

  // Two different sizes, on purpose. Expand is the editor's own: the game fills
  // this window, and everything else the browser draws — tabs, address bar, the
  // other windows — stays where it is. Full screen is the browser's, for
  // actually playing. Either can be on without the other.
  function setExpanded(on) {
    on = !!on && !!frame;
    if (on === expanded) return;
    expanded = on;
    document.body.classList.toggle("play-expanded", expanded);
    // Going fixed takes the panel out of the stage's flex flow, so the grid
    // behind it grows to the full stage — and shrinks back on collapse. The
    // canvas is sized in pixels and has to be told, both ways.
    onResize();
    onStateChange();
  }

  function isFullscreen() {
    return !!host && document.fullscreenElement === host;
  }

  function toggleFullscreen() {
    if (!host || !frame) return;
    if (isFullscreen()) {
      document.exitFullscreen();
      return;
    }
    if (!host.requestFullscreen) {
      addLog("warn", "this browser won't do full screen here", true);
      return;
    }
    // Rejects rather than throwing — a browser can refuse this outright, and an
    // unhandled rejection in the console is a red herring later.
    host.requestFullscreen().catch(function (err) {
      addLog("warn", "full screen refused: " + (err && err.message || err), true);
    });
  }

  // Escape and F11 leave full screen without going through the button, so the
  // label has to follow the browser rather than the other way round.
  document.addEventListener("fullscreenchange", function () { onStateChange(); });

  function stop() {
    stopWatchdog();
    // Before the panel is hidden: a leftover class would bring the next Play
    // back expanded with no button saying so.
    setExpanded(false);
    if (isFullscreen()) document.exitFullscreen();
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
    setExpanded: setExpanded,
    isExpanded: function () { return expanded; },
    toggleFullscreen: toggleFullscreen,
    isFullscreen: isFullscreen,
    isStalled: function () { return stalled; },
    isWatched: function () { return everTicked; },
    log: function () { return log.slice(); },
    isReady: function () { return ready; },
    isBuilt: function () { return built; },
    buildStatus: buildStatus,
    buildState: function () { return buildState; },
    isStale: isStale,
    rebuild: rebuild,
    onBuildChange: function (fn) { onBuildChange = fn; },
    gamePath: GAME_PATH,
    onStateChange: function (fn) { onStateChange = fn; },
    onResize: function (fn) { onResize = fn; },
    providePayload: function (fn) { getPayload = fn; },
  };
})();
