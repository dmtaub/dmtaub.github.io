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
      document.getElementById("playtest-body").appendChild(frame);
      ready = false;
      // The grid just lost half the stage, and it draws to a fixed-size canvas.
      onResize();
      onStateChange();
      return true;
    });
  }

  function stop() {
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
      push();
      onStateChange();
    } else if (data.type === "problem") {
      setStatus("The game couldn't read that level: " + data.message);
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
    isReady: function () { return ready; },
    isBuilt: function () { return built; },
    gamePath: GAME_PATH,
    onStateChange: function (fn) { onStateChange = fn; },
    onResize: function (fn) { onResize = fn; },
    providePayload: function (fn) { getPayload = fn; },
  };
})();
