// The editor's furniture: which panel sits where, and which ones have been
// pushed out into windows of their own.
//
// A panel is a titled box with a body. The body is a plain element declared in
// index.html and never replaced — app.js renders into it by reference, so it
// keeps working wherever the panel has been dragged to, including into another
// window. That is the whole trick: everything else here is moving one element
// between three kinds of parent.
//
// Docked order lives in the `ui_layout` meta key. Popped-out windows do not:
// a browser refuses window.open without a click behind it, so a layout that
// remembered them could not be restored at load anyway.

(function () {
  "use strict";

  const MIME = "application/x-lq-panel";
  const LAYOUT_KEY = "ui_layout";

  const panels = {};        // id -> {def, section, body, popup}
  let order = [];           // ids, in declaration order — the reset order
  let dragging = null;      // the panel being dragged, while it is being dragged
  let onLayout = function () {};

  const el = function (tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  function dockOf(name) {
    return document.getElementById("dock-" + name);
  }

  // ------------------------------------------------------------ building
  function build(def) {
    const section = el("section", "panel");
    section.dataset.panel = def.id;

    const head = el("header", "panel-head");
    head.draggable = true;
    head.appendChild(el("span", "panel-grip", "⠿"));
    head.appendChild(el("span", "panel-title", def.title));

    const pop = el("button", "panel-pop", "⧉");
    pop.title = "Open this in a window of its own";
    pop.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (panels[def.id].popup) popIn(def.id);
      else popOut(def.id);
    });
    head.appendChild(pop);

    const body = document.getElementById(def.body);
    const wrap = el("div", "panel-body");
    wrap.appendChild(body);

    section.appendChild(head);
    section.appendChild(wrap);
    bindDrag(section, head, def.id);
    return { def: def, section: section, body: body, pop: pop, popup: null };
  }

  // ------------------------------------------------------------ dragging
  // The panel moves as you drag rather than after you drop: the layout you are
  // about to get is the layout you are looking at, which beats guessing from a
  // marker line where a box of unknown height will land.
  function bindDrag(section, head, id) {
    head.addEventListener("dragstart", function (ev) {
      if (panels[id].popup) {
        ev.preventDefault();   // it isn't in a dock to be dragged around
        return;
      }
      dragging = id;
      section.classList.add("dragging");
      ev.dataTransfer.effectAllowed = "move";
      // The payload is never read — `types` is all a dragover handler is
      // allowed to see, and all it needs to tell a panel from a dropped file.
      ev.dataTransfer.setData(MIME, id);
    });
    head.addEventListener("dragend", function () {
      section.classList.remove("dragging");
      dragging = null;
      document.querySelectorAll(".dock.drop-into").forEach(function (d) {
        d.classList.remove("drop-into");
      });
      saveLayout();
      onLayout();
    });
  }

  function bindDock(dock) {
    dock.addEventListener("dragover", function (ev) {
      if (!dragging || ev.dataTransfer.types.indexOf(MIME) === -1) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      dock.classList.add("drop-into");
      const moving = panels[dragging].section;
      const before = nextPanelBelow(dock, ev.clientY, moving);
      if (before !== moving.nextSibling || moving.parentNode !== dock) {
        dock.insertBefore(moving, before);
      }
    });
    dock.addEventListener("dragleave", function (ev) {
      // Leaving for a child of the same dock is not leaving.
      if (dock.contains(ev.relatedTarget)) return;
      dock.classList.remove("drop-into");
    });
    dock.addEventListener("drop", function (ev) {
      if (!dragging || ev.dataTransfer.types.indexOf(MIME) === -1) return;
      ev.preventDefault();
      ev.stopPropagation();     // not a file drop; app.js must not read it
      dock.classList.remove("drop-into");
    });
  }

  // The first panel whose middle is below the pointer — insertBefore's
  // argument, and null for "put it at the end".
  function nextPanelBelow(dock, y, moving) {
    const others = Array.prototype.filter.call(
      dock.querySelectorAll(":scope > .panel"),
      function (p) { return p !== moving; });
    for (let i = 0; i < others.length; i++) {
      const box = others[i].getBoundingClientRect();
      if (y < box.top + box.height / 2) return others[i];
    }
    return null;
  }

  // ------------------------------------------------------------ layout
  // What is where, right now — for the tests and for anyone poking at it from
  // the console. A popped-out panel is in neither dock.
  function currentLayout() {
    const out = { left: [], right: [], out: [] };
    ["left", "right"].forEach(function (name) {
      Array.prototype.forEach.call(dockOf(name).querySelectorAll(":scope > .panel"),
        function (p) { out[name].push(p.dataset.panel); });
    });
    order.forEach(function (id) { if (panels[id].popup) out.out.push(id); });
    return out;
  }

  function saveLayout() {
    const layout = { left: [], right: [] };
    order.forEach(function (id) {
      const p = panels[id];
      // Docked: where it actually is. Popped out: where it will come back to.
      const dock = p.popup ? p.home : p.section.parentNode.id.replace("dock-", "");
      const at = p.popup ? p.homeIndex : indexIn(p.section);
      layout[dock].push({ id: id, at: at });
    });
    ["left", "right"].forEach(function (name) {
      layout[name].sort(function (a, b) { return a.at - b.at; });
      layout[name] = layout[name].map(function (row) { return row.id; });
    });
    window.Storage.setMeta(LAYOUT_KEY, layout);
  }

  function indexIn(section) {
    return Array.prototype.indexOf.call(section.parentNode.children, section);
  }

  function place(layout) {
    ["left", "right"].forEach(function (name) {
      const dock = dockOf(name);
      (layout[name] || []).forEach(function (id) {
        if (panels[id] && !panels[id].popup) dock.appendChild(panels[id].section);
      });
    });
    // Anything the saved layout didn't mention — a panel added since it was
    // written — goes to the dock it was declared in rather than nowhere.
    order.forEach(function (id) {
      const p = panels[id];
      if (!p.popup && !p.section.parentNode) dockOf(p.def.dock).appendChild(p.section);
    });
  }

  function defaultLayout() {
    const layout = { left: [], right: [] };
    order.forEach(function (id) { layout[panels[id].def.dock].push(id); });
    return layout;
  }

  // ------------------------------------------------------------ popping out
  function popOut(id) {
    const p = panels[id];
    if (p.popup) return;
    const box = p.section.getBoundingClientRect();
    const w = window.open("panel.html?panel=" + encodeURIComponent(id),
      "lq_panel_" + id,
      "width=" + Math.max(300, Math.round(box.width) + 30)
      + ",height=" + Math.min(900, Math.max(420, Math.round(box.height) + 60)));
    if (!w) {
      window.alert("The browser blocked that window. Allow pop-ups for this "
        + "page and try again — the panel is still here in the meantime.");
      return;
    }
    // Remembered now, while the panel is still in a dock: this is where "put it
    // back" puts it back.
    p.home = p.section.parentNode.id.replace("dock-", "");
    p.homeIndex = indexIn(p.section);
    p.popup = w;

    whenReady(w, function () {
      const mount = w.document.getElementById("popped-mount");
      if (!mount) return;
      w.document.title = p.def.title + " — Amy's Level Editor";
      // Adopted, not copied: the same element, with its listeners and whatever
      // app.js last drew into it, now living in the other window. Rendering
      // keeps working because app.js holds the element, not a selector.
      mount.appendChild(w.document.adoptNode(p.section));
      p.section.classList.add("popped");
      p.pop.textContent = "⇤";
      p.pop.title = "Put this back in the editor";
      onLayout();
    });

    watchForClose(id, w);
    saveLayout();
    onLayout();
  }

  // The page may not have parsed yet when window.open returns.
  function whenReady(w, fn) {
    if (w.document && w.document.getElementById("popped-mount")) {
      fn();
      return;
    }
    w.addEventListener("load", function () { fn(); });
  }

  // Two ways a popped-out panel can die: the button inside it, or the window's
  // own close box. The second one is why this polls — pagehide is sent, but a
  // window torn down by the OS doesn't always get to send it.
  function watchForClose(id, w) {
    const timer = setInterval(function () {
      if (!panels[id].popup || panels[id].popup !== w) {
        clearInterval(timer);
        return;
      }
      if (w.closed) {
        clearInterval(timer);
        popIn(id, true);
      }
    }, 500);
  }

  function popIn(id, alreadyClosed) {
    const p = panels[id];
    if (!p.popup) return;
    const w = p.popup;
    p.popup = null;
    // Adopting it home before the window goes away — a closed window's
    // document is gone, and with it anything still inside it.
    document.adoptNode(p.section);
    p.section.classList.remove("popped");
    p.pop.textContent = "⧉";
    p.pop.title = "Open this in a window of its own";
    const dock = dockOf(p.home || p.def.dock);
    const at = dock.querySelectorAll(":scope > .panel")[p.homeIndex];
    dock.insertBefore(p.section, at || null);
    if (!alreadyClosed) {
      try { w.close(); } catch (err) { /* already gone */ }
    }
    saveLayout();
    onLayout();
  }

  // Whether there is anything for Reset UI to undo. Order counts, not just
  // which dock a panel is in — two panels swapped is a layout somebody chose.
  function isDefault() {
    const now = currentLayout();
    if (now.out.length) return false;
    const def = defaultLayout();
    return ["left", "right"].every(function (name) {
      return now[name].join(",") === def[name].join(",");
    });
  }

  function reset() {
    order.forEach(function (id) { if (panels[id].popup) popIn(id); });
    place(defaultLayout());
    saveLayout();
    onLayout();
  }

  // A panel that has been popped out lives in another document, so a
  // `document.querySelectorAll` in app.js would walk straight past it.
  function roots() {
    const out = [document];
    order.forEach(function (id) {
      const w = panels[id].popup;
      if (w && !w.closed && w.document) out.push(w.document);
    });
    return out;
  }

  async function init(defs) {
    defs.forEach(function (def) {
      panels[def.id] = build(def);
      panels[def.id].home = def.dock;
      panels[def.id].homeIndex = 0;
      order.push(def.id);
    });
    ["left", "right"].forEach(function (name) { bindDock(dockOf(name)); });

    const saved = await window.Storage.getMeta(LAYOUT_KEY, null);
    place(saved && saved.left && saved.right ? saved : defaultLayout());

    // The popped-out window says when it is going away. `popIn` clears `popup`
    // before it closes one itself, so the goodbye from a window we closed on
    // purpose falls out here rather than running the return trip twice.
    window.addEventListener("message", function (ev) {
      const data = ev.data;
      if (!data || data.__lqPanel !== true) return;
      const p = panels[data.id];
      if (!p || !p.popup || ev.source !== p.popup) return;
      if (data.type === "closing") popIn(data.id, true);
    });

    // A window left open when the page reloads is orphaned — its panel is in
    // this new document, and the old one is showing an empty box.
    window.addEventListener("pagehide", function () {
      order.forEach(function (id) {
        const w = panels[id].popup;
        if (w && !w.closed) w.close();
      });
    });
  }

  window.Panels = {
    init: init,
    body: function (id) { return panels[id] && panels[id].body; },
    section: function (id) { return panels[id] && panels[id].section; },
    isOut: function (id) { return !!(panels[id] && panels[id].popup); },
    isDefault: isDefault,
    isDragging: function () { return !!dragging; },
    roots: roots,
    popOut: popOut,
    popIn: popIn,
    reset: reset,
    layout: currentLayout,
    onLayoutChange: function (fn) { onLayout = fn; },
  };
})();
