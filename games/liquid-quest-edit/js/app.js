// Wires the editor to the page: palette rail, meal list, inspector, validation,
// autosave, import and export.

(function () {
  "use strict";

  const TILE = 32;
  let editor = null;
  let levels = [];          // [{id, name, order, planned, data}]
  let currentId = null;
  let saveTimer = null;
  // Which palette groups are folded away, by their stable key. Read once at
  // boot so the rail paints in the state it was left in rather than opening
  // everything and snapping shut a moment later.
  let foldedGroups = [];

  const $ = function (sel) { return document.querySelector(sel); };
  const el = function (tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  // ---------------------------------------------------------------- boot
  async function boot() {
    await window.Render.loadAll();
    const mode = await window.Storage.init();
    showStorageMode(mode);
    foldedGroups = await window.Storage.getMeta("folded_groups", []) || [];
    await window.ImageLibrary.init();
    await window.Layers.load();

    editor = new window.Editor($("#canvas"));
    editor.onChange = onDocChanged;
    editor.onSelect = renderInspector;
    editor.onSelectionChanged = onSelectionChanged;
    editor.onLayer = onLayerChanged;
    editor.onPreview = onPreviewChanged;

    // Handles for the browser tests in web_editor/test/. Harmless in normal use
    // and worth far more than keeping the module hermetic.
    window.__editor = editor;
    window.__revalidate = validate;
    window.__buildPalette = buildPalette;
    window.__renderMealList = renderMealList;

    // The furniture goes up before anything is drawn into it: every render
    // below writes into a panel body, and those bodies only have a home once
    // Panels has put them in one.
    await window.Panels.init([
      { id: "layers", title: "Layers", body: "layer-panel", dock: "left" },
      { id: "tools", title: "Tools", body: "tool-panel", dock: "left" },
      { id: "items", title: "Items", body: "palette", dock: "left" },
      { id: "meals", title: "Meals, in order", body: "meal-list", dock: "right" },
      { id: "inspector", title: "Details", body: "inspector", dock: "right" },
    ]);
    const onPanelLayout = function () {
      // A dock emptied, filled or resized moves the stage's edges, and the
      // canvas is sized in pixels. Same one-frame wait as the play panel.
      requestAnimationFrame(function () { editor.resize(); });
      refreshResetButton();
    };
    window.Panels.onLayoutChange(onPanelLayout);
    // Once now, because filling the docks is itself a layout change: the editor
    // measured its canvas in its constructor, when both docks were still empty
    // and `display: none`, so it took the full width of the window. Without
    // this the grid draws to a backing store half again as wide as the box it
    // is shown in — square tiles come out squashed until you resize the window.
    onPanelLayout();

    buildPalette();
    buildToolbar();
    bindKeys();
    bindImport();
    bindPictureImport();
    bindOpenProject();

    bindPlaytest();

    levels = await window.Storage.listLevels();
    if (!levels.length) {
      await seedFromBundledProject();
    }
    if (!levels.length) {
      await createLevel(starterLevel(), { silent: true });
    } else {
      const last = await window.Storage.getMeta("last_level", levels[0].id);
      await openLevel(levels.some(function (l) { return l.id === last; })
        ? last : levels[0].id);
    }
    renderMealList();
    validate();
  }

  function showStorageMode(mode) {
    const banner = $("#storage-banner");
    if (mode === "indexeddb") {
      banner.style.display = "none";
      return;
    }
    banner.style.display = "block";
    if (mode === "localstorage") {
      banner.className = "banner warn";
      banner.textContent =
        "Saving to simple browser storage, not the database. Your work is kept, "
        + "but there's less room. To get the full store, run start-editor "
        + "(see README) instead of opening the file directly.";
    } else {
      banner.className = "banner error";
      banner.textContent =
        "This browser won't let the page save anything. Your work will be LOST "
        + "when you close the tab — export often. Running start-editor (see "
        + "README) fixes this.";
    }
  }

  // A first level that is already valid, so nothing is broken on day one.
  function starterLevel() {
    const doc = new window.LevelDoc({
      id: "new_meal", name: "New Meal", width: 40, height: 20,
    });
    for (let x = 0; x < 40; x++) {
      for (let y = 15; y < 20; y++) doc.setTile(x, y, 1);
    }
    doc.addEntity("player_spawn", 3, 14, {});
    doc.addEntity("level_exit", 36, 14,
      Object.assign(window.Palette.defaultParams("level_exit"), { require_boss: false }));
    return doc;
  }

  // A brand-new browser gets the game's own meals rather than an empty list.
  // The editor already carries them (js/examples.data.js is generated from
  // levels/), and landing on real content — playable straight away — beats
  // landing on a blank floor and a Start.
  async function seedFromBundledProject() {
    const examples = window.EXAMPLE_LEVELS || {};
    const entries = (window.EXAMPLE_MANIFEST || {}).levels || [];
    if (!entries.length) return;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const data = examples[entry.id];
      // A meal in the manifest with no file is one that is designed but not
      // built; it belongs in the list, greyed out, exactly as in the game.
      const doc = new window.LevelDoc(data
        ? JSON.parse(JSON.stringify(data))
        : { id: entry.id, name: entry.name || entry.id });
      doc.name = entry.name || doc.name;
      doc.planned = !data || !!entry.planned;
      doc.id = window.LevelUtil.slugify(doc.id || doc.name);
      const record = {
        id: doc.id, name: doc.name, order: i,
        planned: doc.planned, data: doc.snapshot(),
      };
      await window.Storage.saveLevel(record);
      levels.push(record);
    }
    if (levels.length) await openLevel(levels[0].id);
  }

  // ---------------------------------------------------------------- playing
  // The game is a Godot web build in play/. js/playtest.js owns the iframe and
  // the conversation; this only decides what to send and what the buttons say.
  function bindPlaytest() {
    window.Playtest.providePayload(function () {
      return {
        level: editor.doc.toJSON(),
        images: window.ImageLibrary.payloadFor(editor.doc),
      };
    });
    window.Playtest.onStateChange(refreshPlayButton);
    window.Playtest.onBuildChange(refreshBuildNotice);
    // Asked once at boot and again whenever the game is played, because the
    // answer changes with every save to the game's source rather than with
    // anything the editor does.
    window.Playtest.buildStatus();
    window.Playtest.onResize(function () {
      // The canvas is sized in pixels, so it has to be told when the stage
      // splits. Deferred one frame: the layout hasn't happened yet.
      requestAnimationFrame(function () { editor.resize(); });
    });

    $("#btn-play").addEventListener("click", function () {
      if (window.Playtest.isPlaying()) {
        window.Playtest.stop();
        return;
      }
      if (editor.preview) editor.setPreview(false);
      window.Playtest.start().then(function (started) {
        if (started) return;
        modal("The game isn't built yet", function (body) {
          body.appendChild(el("p", null,
            "Playing needs the game itself, which isn't in this folder yet. "
            + "Someone with the project open needs to build it once:"));
          body.appendChild(el("pre", "code-line",
            "python3 buildtools/build_web.py"));
          body.appendChild(el("p", "muted",
            "Everything else in the editor works without it. On the website "
            + "the game is always there."));
        }, [{ label: "OK", primary: true }]);
      });
    });

    $("#btn-rebuild-game").addEventListener("click", function () {
      window.Playtest.rebuild().then(function () {
        window.Playtest.buildStatus();
      });
    });

    $("#btn-expand").addEventListener("click", function () {
      window.Playtest.setExpanded(!window.Playtest.isExpanded());
    });
    $("#btn-fullscreen").addEventListener("click", function () {
      window.Playtest.toggleFullscreen();
    });

    $("#btn-stop-play").addEventListener("click", function () { window.Playtest.stop(); });
    $("#btn-replay").addEventListener("click", function () { window.Playtest.replay(); });
    $("#chk-live").addEventListener("change", function () {
      window.Playtest.setLive($("#chk-live").checked);
    });

    refreshPlayButton();
  }

  // Nothing moved means nothing to put back — an enabled button that does
  // nothing is a button you learn to ignore.
  function refreshResetButton() {
    const btn = $("#btn-reset-ui");
    if (!btn || !window.Panels.isDefault) return;
    const asItWas = window.Panels.isDefault();
    btn.disabled = asItWas;
    btn.title = asItWas
      ? "Every panel is already where it started"
      : "Put every panel back where it started, windows and all";
  }

  // play/ is a build, and a build goes out of date on its own — nothing in the
  // editor makes it happen. Saying so beside Play is the difference between
  // "my change didn't work" and "I haven't built it yet". Absent a dev server
  // that can see the game's source, there is nothing to say and this stays
  // hidden, which is also the deployed site's case.
  function refreshBuildNotice() {
    const wrap = $("#build-stale");
    if (!wrap) return;
    const state = window.Playtest.buildState();
    const building = !!(state && state.building);
    wrap.hidden = !state || (!state.stale && !building);
    $("#build-stale-text").textContent = building
      ? "Building the game…"
      : "Game build is behind your changes";
    $("#btn-rebuild-game").disabled = building;
  }

  function refreshPlayButton() {
    const btn = $("#btn-play");
    const playing = window.Playtest.isPlaying();
    btn.textContent = playing ? "✕ Stop" : "▶ Play";
    btn.classList.toggle("on", playing);

    // The two sizes say what pressing them does now, not what they are: the
    // browser can leave full screen without the button being touched, so both
    // labels are read back off the state rather than toggled in the handler.
    const expanded = window.Playtest.isExpanded();
    const full = window.Playtest.isFullscreen();
    const expandBtn = $("#btn-expand");
    expandBtn.textContent = expanded ? "⤡ Shrink" : "⤢ Expand";
    expandBtn.classList.toggle("on", expanded);
    expandBtn.title = expanded
      ? "Give the grid its half of the window back"
      : "Fill the editor window with the game";
    const fullBtn = $("#btn-fullscreen");
    fullBtn.textContent = full ? "⛶ Leave full screen" : "⛶ Full screen";
    fullBtn.classList.toggle("on", full);
    fullBtn.title = full
      ? "Back to the editor window"
      : "Take over the whole screen — Esc comes back";

    if (window.Playtest.isBuilt() === false) {
      btn.title = "The game hasn't been built in this folder yet — "
        + "run buildtools/build_web.py.";
    } else {
      btn.title = playing ? "Back to building" : "Play this level, right here";
    }
  }

  // ---------------------------------------------------------------- palette
  // A group of placeable things that folds away and scrolls on its own, so a
  // long list of props doesn't push the blocks off the bottom of the rail.
  // Only these — Layers and Tools are short and always wanted, and folding
  // them would cost a click for nothing.
  //
  // `key` is stored, so it has to be something that survives: the category's
  // own id, not its label. Labels come out of palette.json and a relabel there
  // would quietly orphan what was folded.
  function foldableGroup(key, label) {
    const group = el("div", "pal-group pal-foldable");
    const head = el("button", "pal-title pal-fold");
    const caret = el("span", "pal-caret");
    head.appendChild(caret);
    head.appendChild(el("span", null, label));
    const items = el("div", "pal-items pal-scroll");
    group.appendChild(head);
    group.appendChild(items);

    function paint(folded) {
      group.classList.toggle("folded", folded);
      caret.textContent = folded ? "▸" : "▾";
      head.setAttribute("aria-expanded", folded ? "false" : "true");
      head.title = folded ? "Show " + label : "Fold " + label + " away";
    }
    paint(foldedGroups.indexOf(key) !== -1);

    head.addEventListener("click", function () {
      const folded = !group.classList.contains("folded");
      paint(folded);
      rememberFold(key, folded);
    });
    return { group: group, items: items };
  }

  function rememberFold(key, folded) {
    const at = foldedGroups.indexOf(key);
    if (folded && at === -1) foldedGroups.push(key);
    else if (!folded && at !== -1) foldedGroups.splice(at, 1);
    // Fire and forget: setMeta swallows its own failures, and a rail that
    // forgets a fold is not worth blocking a click over.
    window.Storage.setMeta("folded_groups", foldedGroups.slice());
  }

  // Landing on a brush inside a folded group would pick something invisible.
  function revealGroupOf(button) {
    const group = button && button.closest(".pal-foldable.folded");
    if (group) group.querySelector(".pal-fold").click();
  }

  // Tools, Layers and Items are three panels, and a rebuild has to refresh all
  // three: reaching for a brush can move you to another layer, and adding a
  // picture puts a new button in Items.
  function buildPalette(opts) {
    refreshLayersPanel();
    const moveBtn = buildToolsPanel();
    buildItemsPanel(opts, moveBtn);
  }

  function buildToolsPanel() {
    const tools = window.Panels.body("tools");
    tools.innerHTML = "";

    // All four are modes, not brushes: Look, Select, Move and Remove change
    // what dragging on the grid means rather than what it puts down. Nothing
    // in this panel is a thing you place, so nothing in it wears the square
    // brush tile the Items rail uses — one row shape, one meaning.
    //
    // Built here rather than in buildToolbar because the panel is emptied and
    // filled again — a listener bound once outside would die on the first
    // rebuild.
    const modeRow = el("div", "pal-modes");
    const lookBtn = el("button", "mode-btn");
    lookBtn.dataset.tool = "Look";
    lookBtn.id = "btn-preview";
    lookBtn.title = "Look at the level the way the game does, with the "
      + "background drifting behind you";
    lookBtn.addEventListener("click", function () {
      // A mode, not a toggle: pressing the one you are already in does
      // nothing, the same as pressing Move twice. You leave it by picking
      // another tool, or with Escape.
      if (!editor.preview) editor.setPreview(true);
    });
    const selectBtn = el("button", "mode-btn");
    selectBtn.dataset.tool = "Select";
    selectBtn.id = "btn-select";
    selectBtn.textContent = "⬚ Select";
    selectBtn.title = "Click a thing to pick it, or drag a box round part of the "
      + "level to pick everything inside it.";
    selectBtn.addEventListener("click", function () {
      selectBrush({ kind: "select" }, selectBtn);
    });
    modeRow.appendChild(lookBtn);
    modeRow.appendChild(selectBtn);

    let moveBtn = null;
    [
      { kind: "move", label: "Move", icon: "✥", hint: MOVE_HINT },
      { kind: "erase", label: "Remove", icon: "✕", hint: "Drag over blocks and things to remove them; drag from blank space to box a lot and remove it all." },
    ].forEach(function (t) {
      const b = el("button", "mode-btn");
      b.dataset.tool = t.label;
      b.textContent = t.icon + " " + t.label;
      b.title = t.hint;
      if (t.kind === "move") moveBtn = b;
      b.addEventListener("click", function () {
        selectBrush({ kind: t.kind }, b);
      });
      modeRow.appendChild(b);
    });
    tools.appendChild(modeRow);

    // A rebuild mid-look must not leave the button saying the opposite of what
    // the editor is doing.
    paintLookButton(editor.preview, lookBtn);
    return moveBtn;
  }

  function buildItemsPanel(opts, moveBtn) {
    const rail = window.Panels.body("items");
    rail.innerHTML = "";

    const blocks = foldableGroup("blocks", "Blocks");
    const blockRow = blocks.items;
    window.Palette.tiles.forEach(function (t) {
      const b = paletteButton(null, t.label, t.hint, { tile: t.id });
      b.addEventListener("click", function () {
        selectBrush({ kind: "tile", id: t.id }, b);
      });
      blockRow.appendChild(b);
    });
    rail.appendChild(blocks.group);

    const bg = foldableGroup("background", "Background");
    const bgRow = bg.items;
    window.Palette.decor.forEach(function (item) {
      const b = paletteButton(null, item.label, item.hint, { sprite: item.sprite });
      b.addEventListener("click", function () {
        selectBrush({ kind: "decor", id: item.id }, b);
      });
      bgRow.appendChild(b);
    });

    // Pictures Amy brought in herself sit in the same row as the game's own
    // props, because from where she's standing they are the same kind of thing.
    window.ImageLibrary.list().forEach(function (record) {
      const b = paletteButton(null, pictureLabel(record),
        "A picture you added. Click to drop it, then use Move to shift it.",
        { image: window.ImageLibrary.element(record.id) });
      b.classList.add("pal-picture");
      b.classList.add("pal-picture-" + record.id);
      b.addEventListener("click", function () {
        selectBrush(pictureBrush(record.id), b);
      });
      const forget = el("button", "pal-x", "✕");
      forget.title = "Take this picture out of the editor";
      forget.addEventListener("click", function (ev) {
        ev.stopPropagation();
        forgetPicture(record);
      });
      b.appendChild(forget);
      bgRow.appendChild(b);
    });

    const add = paletteButton("+", "Add a picture",
      "Use a picture from your computer as background scenery.", null);
    add.classList.add("pal-add");
    add.addEventListener("click", function () { $("#picture-input").click(); });
    bgRow.appendChild(add);

    rail.appendChild(bg.group);

    window.Palette.byCategory().forEach(function (group) {
      const g = foldableGroup(group.id, group.label);
      const row = g.items;
      group.items.forEach(function (item) {
        const b = paletteButton(null, item.label, item.hint, { sprite: item.icon });
        b.addEventListener("click", function () {
          selectBrush({ kind: "entity", id: item.id }, b);
        });
        row.appendChild(b);
      });
      rail.appendChild(g.group);
    });

    // Rebuilt after importing a picture: land on that picture rather than
    // dumping you back on the default brush mid-thought.
    if (opts && opts.selectPicture && window.ImageLibrary.has(opts.selectPicture)) {
      const btn = rail.querySelector(".pal-picture-" + opts.selectPicture);
      revealGroupOf(btn);
      selectBrush(pictureBrush(opts.selectPicture), btn);
      return;
    }

    // Default tool: Move. Landing on a brush means the first drag on the grid
    // builds something you didn't ask for; Move only ever picks and shifts what
    // is already there, so an accidental drag is harmless.
    selectBrush({ kind: "move" }, moveBtn);
  }

  // ---------------------------------------------------------------- layers
  // The Layers panel — the DOM half. What a layer edit actually means lives in
  // js/layers.js; see docs/LAYERS.md.

  function refreshLayersPanel() {
    const panel = window.Panels.body("layers");
    if (panel) buildLayersPanel(panel);
  }

  // Every meal's props, the live document standing in for its own record — so a
  // count or a reassignment covers the whole project, not just what's open.
  function allDecorDocs() {
    return levels.map(function (record) {
      return {
        name: record.name || record.id,
        decor: record.id === currentId
          ? editor.doc.decor
          : ((record.data && record.data.decor) || []),
        record: record,
      };
    });
  }

  function saveTouchedDocs(touched) {
    touched.forEach(function (d) {
      if (d.record.id === currentId) editor.onChange();
      else window.Storage.saveLevel(d.record);
    });
  }

  function buildLayersPanel(container) {
    container.innerHTML = "";
    // No heading of its own any more: the panel it sits in is called Layers.

    const row = el("div", "layer-row");
    const pick = el("select", "layer-pick");
    pick.id = "layer-pick";
    pick.title = "Which plane of the level you're working on. Everything on the "
      + "others is faded, and left alone. All works on every plane at once.";
    // All first, and not from palette.json: it isn't a plane the game knows
    // about, it's the view of every plane at once. See Editor.ALL_LAYERS.
    const allOpt = el("option", null, "All");
    allOpt.value = window.Editor.ALL_LAYERS;
    pick.appendChild(allOpt);
    window.Palette.layers.forEach(function (l) {
      const o = el("option", null, l.label);
      o.value = l.id;
      pick.appendChild(o);
    });
    pick.value = editor.activeLayer;
    pick.addEventListener("change", function () {
      // Picking All by hand is not a plane to be given back to, so it doesn't
      // count as a choice to protect.
      layerPickedByHand = pick.value !== window.Editor.ALL_LAYERS;
      editor.setLayer(pick.value);   // onLayerChanged rebuilds this panel
    });
    row.appendChild(pick);

    // Next to the picker because it's about the same thing: how the planes
    // you're not working on are shown. Ticked, they come up to full strength so
    // you can line this one up against them.
    const showOther = el("label", "layer-showother");
    const box = el("input");
    box.type = "checkbox";
    // On All there are no other layers to fade, so the tick has nothing to say:
    // it reads as already on, and can't be turned off. The editor's own flag is
    // left alone, so whatever it was set to comes back with the next plane.
    const onAll = editor.isAllLayers();
    box.checked = onAll || editor.showOtherLayers;
    box.disabled = onAll;
    showOther.title = onAll
      ? "Nothing is faded on All — every layer is already at full strength."
      : "Show the other layers at full opacity instead of faded.";
    box.addEventListener("change", function () {
      editor.showOtherLayers = box.checked;
      editor.draw();
    });
    showOther.appendChild(box);
    showOther.appendChild(document.createTextNode(" Show others"));
    row.appendChild(showOther);
    container.appendChild(row);

    const active = window.Palette.layer(editor.activeLayer);
    if (onAll) {
      container.appendChild(el("div", "layer-note",
        "Every plane at once. Nothing is faded, and a click or a box picks up "
        + "whatever it lands on — blocks, things and scenery together. "
        + "Pick a plane to work on just that one."));
    } else if (active && window.Layers.isEditable(active.id)) {
      container.appendChild(layerDepthEditor(active));
    } else if (active) {
      container.appendChild(el("div", "layer-note",
        active.label + " is a fixed layer \u2014 one plane for all your "
        + (active.holds === "tile" ? "blocks." : "things.")));
    }

    const add = el("button", "layer-add", "\uff0b New background layer");
    add.title = "Add another parallax plane behind the ones you have.";
    add.addEventListener("click", addLayer);
    container.appendChild(add);
  }

  // Generated from Layers.DEPTH_FIELDS, so a new knob is an entry there rather
  // than another hand-built input here.
  function layerDepthEditor(layer) {
    const wrap = el("div", "layer-depth");
    window.Layers.DEPTH_FIELDS.forEach(function (field) {
      const l = el("label", "layer-field");
      l.appendChild(el("span", "layer-field-label", field.label));
      const input = el("input");
      input.type = "number";
      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      input.step = field.step;
      input.value = layer[field.key];
      input.title = field.help;
      input.addEventListener("change", function () {
        const applied = window.Layers.setField(layer.id, field.key, input.value);
        input.value = applied === null ? layer[field.key] : applied;
        editor.draw();   // the preview reads parallax and z off the layer
      });
      l.appendChild(input);
      wrap.appendChild(l);
    });

    const del = el("button", "layer-delete", "Delete this layer");
    del.addEventListener("click", function () { deleteLayer(layer.id); });
    wrap.appendChild(del);
    return wrap;
  }

  function addLayer() {
    const name = (window.prompt("Name this background layer", "Background") || "").trim();
    if (!name) return;
    const layer = window.Layers.add(name);
    // Land on it, which also rebuilds the panel. If somehow already there,
    // rebuild anyway so the new option shows.
    if (!editor.setLayer(layer.id)) refreshLayersPanel();
  }

  function deleteLayer(id) {
    const layer = window.Palette.layer(id);
    if (!layer || !window.Layers.isEditable(id)) return;

    if (!window.Layers.canDelete(id)) {
      modal("Keep at least two", function (body) {
        body.appendChild(el("p", null,
          "The game needs at least two background layers, so props can sit at "
          + "different distances. Add another before removing this one."));
      }, [{ label: "OK", primary: true }]);
      return;
    }

    const fallback = window.Layers.nearest(id);
    const usage = window.Layers.usage(id, allDecorDocs());

    const doDelete = function () {
      saveTouchedDocs(window.Layers.reassign(id, fallback.id, allDecorDocs()));
      window.Layers.remove(id);
      // Or activeLayer dangles, layerHolds() goes null, and every tool
      // silently does nothing. The editor put you there, not you, so Select or
      // Move will hand All back rather than stranding you on a fallback.
      if (editor.activeLayer === id) {
        layerPickedByHand = false;
        editor.setLayer(fallback.id);
      }
      refreshLayersPanel();
      editor.draw();
    };

    if (usage.count === 0) { doDelete(); return; }

    modal("Delete \u201c" + layer.label + "\u201d?", function (body) {
      body.appendChild(el("p", null,
        usage.count + " background thing" + (usage.count === 1 ? " sits" : "s sit")
        + " on this layer, across " + usage.meals.length
        + " meal" + (usage.meals.length === 1 ? "" : "s")
        + ". Deleting it moves " + (usage.count === 1 ? "it" : "them")
        + " to \u201c" + fallback.label + "\u201d."));
      body.appendChild(el("p", "muted", usage.meals.join(", ")));
      body.appendChild(el("p", "modal-warn",
        "Removing a layer can't be undone \u2014 layers aren't part of a meal."));
    }, [
      { label: "Cancel" },
      { label: "Delete layer", danger: true, onClick: doDelete },
    ]);
  }

  // ---------------------------------------------------------------- pictures
  function pictureLabel(record) {
    const base = String(record.name || record.id).replace(/\.[a-z0-9]+$/i, "");
    return base.length > 16 ? base.slice(0, 15) + "…" : base;
  }

  // A picture is placed as a decor item of type "image": the palette doesn't
  // know it, so the item carries the file name and its own pixel size instead.
  function pictureBrush(id) {
    const record = window.ImageLibrary.record(id);
    return {
      kind: "decor",
      id: "image",
      sprite: window.ImageLibrary.spriteFor(id),
      w: record ? record.w : 32,
      h: record ? record.h : 32,
      scale: window.ImageLibrary.startingScale(id),
    };
  }

  function bindPictureImport() {
    const input = $("#picture-input");
    input.addEventListener("change", async function () {
      const files = Array.prototype.slice.call(input.files);
      input.value = "";
      const problems = [];
      let last = null;
      let unsaved = 0;
      for (let i = 0; i < files.length; i++) {
        const result = await window.ImageLibrary.add(files[i]);
        if (!result.ok) problems.push(result.problem);
        else {
          last = result.id;
          if (!result.saved) unsaved++;
        }
      }
      buildPalette(last ? { selectPicture: last } : null);
      if (problems.length) {
        modal("Couldn't use those", function (body) {
          problems.forEach(function (text) {
            body.appendChild(el("div", "file-line bad", "✕  " + text));
          });
        }, [{ label: "OK", primary: true }]);
      } else if (unsaved) {
        modal("Picture not saved", function (body) {
          body.appendChild(el("p", null,
            "The picture is here for now, but there wasn't room to keep it — "
            + "it'll be gone when you close the tab. Export before then, or use "
            + "a smaller picture."));
        }, [{ label: "OK", primary: true }]);
      } else if (last) {
        $("#hint").textContent =
          "Click on the grid to drop the picture. Use Move to shift it, Select to resize it.";
      }
    });
  }

  // Removing a picture from the editor leaves any level that used it holding
  // the name — the level still says where it goes, and re-adding the file puts
  // it back. Say that plainly rather than silently deleting scenery.
  function forgetPicture(record) {
    const usedHere = editor.doc.decor.filter(function (d) {
      return d.type === "image"
        && window.ImageLibrary.idFromSprite(d.sprite) === record.id;
    }).length;

    modal("Take out this picture?", function (body) {
      body.appendChild(el("p", null,
        "“" + (record.name || record.id) + "” will be removed from the "
        + "Background row and from this browser."));
      if (usedHere) {
        body.appendChild(el("p", "modal-warn",
          "This meal uses it " + usedHere + " time" + (usedHere === 1 ? "" : "s")
          + ". Those spots will show as “picture missing” until you add "
          + "the file again."));
      }
    }, [
      { label: "Keep it" },
      {
        label: "Take it out", danger: true,
        onClick: async function () {
          await window.ImageLibrary.remove(record.id);
          buildPalette();
          editor.draw();
          validate();
        },
      },
    ]);
  }

  // Each palette button draws its own art onto a little canvas, so the rail
  // shows exactly what will appear on the grid.
  function paletteButton(glyph, label, hint, art) {
    const b = el("button", "pal-btn");
    b.title = hint || label;
    const box = el("div", "pal-art");
    if (glyph) {
      box.appendChild(el("span", "pal-glyph", glyph));
    } else if (art) {
      const c = document.createElement("canvas");
      c.width = 36;
      c.height = 36;
      const ctx = c.getContext("2d");
      if (art.tile !== undefined) {
        const atlas = window.Render.images["tiles"];
        if (atlas) {
          ctx.drawImage(atlas, window.Palette.tileAtlasColumn(art.tile) * TILE, 0,
            TILE, TILE, 2, 2, 32, 32);
        }
      } else if (art.sprite || art.image) {
        const img = art.image || window.Render.images[art.sprite];
        if (img) {
          const scale = Math.min(32 / img.width, 32 / img.height, 1.2);
          const w = img.width * scale;
          const h = img.height * scale;
          ctx.drawImage(img, (36 - w) / 2, (36 - h) / 2, w, h);
        }
      }
      box.appendChild(c);
    }
    b.appendChild(box);
    b.appendChild(el("span", "pal-label", label));
    return b;
  }

  // Whether the plane you are on is one you chose from the picker, or one the
  // editor moved you to when you reached for a brush. Only the editor's own
  // moves are undone — see returnsToAll.
  let layerPickedByHand = false;

  // Select and Move place nothing, so they have no plane to need: reaching for
  // one gives All back. Remove is deliberately not in here — it destroys, and
  // silently widening an eraser from "blocks" to "everything under it" is the
  // exact surprise layers exist to prevent.
  function returnsToAll(brush) {
    return brush.kind === "select" || brush.kind === "move";
  }

  // Which plane a brush works on. Reaching for a Counter while looking at the
  // Background layer should take you to Blocks, not quietly do nothing.
  function layerForBrush(brush) {
    if (brush.kind === "tile") return window.Palette.defaultLayerFor("tile");
    if (brush.kind === "entity") return window.Palette.defaultLayerFor("entity");
    if (brush.kind === "decor") {
      // Already on a background layer? Stay there — that's the one being built.
      return editor.layerHolds() === "decor"
        ? editor.activeLayer : window.Palette.defaultLayerFor("decor");
    }
    return null;   // Select, Move and Remove work on whatever you're looking at
  }

  function selectBrush(brush, button) {
    const want = layerForBrush(brush);
    if (want) {
      // Only a plane change counts as the editor moving you: reaching for a
      // Counter while already on Blocks because you said so is not a move.
      if (editor.setLayer(want)) layerPickedByHand = false;
    } else if (returnsToAll(brush) && !layerPickedByHand
        && !editor.isAllLayers() && !editor.hasSelection()) {
      // Not while something is picked: that selection belongs to the plane it
      // was made on, and setLayer would drop it.
      editor.setLayer(window.Editor.ALL_LAYERS);
    }

    // Reaching for Remove with a boxful picked means the same thing as pressing
    // Del: rub that lot out. Before setBrush, which drops the selection — and
    // one step, so the same Ctrl+Z brings all of it back.
    const rubbedOut = brush.kind === "erase" && editor.hasSelection()
      && editor.deleteSelection();

    editor.setBrush(brush);   // which drops out of Look, if you were in it
    clearActiveButtons();
    if (button) {
      button.classList.add("active");
      activeBrushButton = button;
    }
    if (brush.kind === "select") {
      $("#hint").textContent = SELECT_HINT;
    } else if (brush.kind === "move") {
      $("#hint").textContent = MOVE_HINT;
    } else if (brush.kind === "erase") {
      $("#hint").textContent = rubbedOut
        ? "Removed. Ctrl+Z brings it back. Drag on the grid to remove more."
        : "Drag on the grid to remove things.";
    } else {
      const name = brush.kind === "entity"
        ? window.Palette.label(brush.id)
        : brush.kind === "decor"
        ? (brush.id === "image" ? "picture" : window.Palette.decorLabel(brush.id))
        : (window.Palette.tile(brush.id) || {}).label;
      $("#hint").textContent = brush.kind === "decor"
        ? "Click to drop a " + name + " anywhere — background things aren't on the grid. Use Move to drag it."
        : "Drag on the grid to place " + name + ".";
    }
  }

  // ---------------------------------------------------------------- toolbar
  function buildToolbar() {
    $("#btn-undo").addEventListener("click", function () { editor.undo(); refresh(); });
    $("#btn-redo").addEventListener("click", function () { editor.redo(); refresh(); });
    $("#btn-zoom-in").addEventListener("click", function () { editor.zoomBy(1.25); });
    $("#btn-zoom-out").addEventListener("click", function () { editor.zoomBy(0.8); });
    $("#btn-fit").addEventListener("click", function () {
      editor.frameLevel();
      editor.draw();
    });
    $("#btn-grid").addEventListener("click", function () {
      editor.showGrid = !editor.showGrid;
      $("#btn-grid").classList.toggle("on", editor.showGrid);
      editor.draw();
    });
    $("#btn-grid").classList.add("on");

    $("#btn-new").addEventListener("click", function () {
      const doc = starterLevel();
      doc.name = "New Meal";
      doc.id = uniqueId("new_meal");
      createLevel(doc);
    });
    $("#btn-duplicate").addEventListener("click", duplicateCurrent);
    $("#btn-example").addEventListener("click", addExample);

    $("#btn-export-all").addEventListener("click", exportEverything);

    $("#btn-new-project").addEventListener("click", newProject);

    $("#btn-reset-ui").addEventListener("click", function () {
      window.Panels.reset();
    });
    refreshResetButton();
  }

  // Preview isn't a play mode — nothing moves on its own and nothing can be
  // changed. It's here to answer one question you otherwise can't answer
  // without exporting: what does that background actually do when you walk?
  const SELECT_HINT =
    "Click a thing to pick it, or drag a box to pick everything inside. "
    + "Del removes what's picked.";
  const MOVE_HINT =
    "Click to select, drag empty space to box select, drag object to move, right drag to pan.";

  // The hint bar has to keep saying something true: "Del removes the lot" is a
  // lie the moment the box comes up empty or the lot has just been deleted.
  // Falls through to whatever the current tool said when nothing is picked and
  // the marquee isn't the tool — undo can clear a selection without meaning to
  // change what you were doing.
  function onSelectionChanged(count) {
    if (editor.preview) return;      // the looking hint owns the bar in there
    if (count > 0) {
      $("#hint").textContent = count + (count === 1 ? " thing" : " things")
        + " picked. Del removes the lot; Escape lets go.";
    } else if (editor.brush.kind === "select") {
      $("#hint").textContent = SELECT_HINT;
    }
  }

  // A brush can move you to another layer, so the picker follows the editor
  // rather than being the only place the choice is recorded.
  function onLayerChanged(id) {
    // The whole panel, not just the picker: the depth fields below it belong to
    // whichever layer is active, and a background layer has them while Blocks
    // and Things don't.
    refreshLayersPanel();
    const layer = window.Palette.layer(id);
    if (id === window.Editor.ALL_LAYERS) {
      $("#hint").textContent = "Working on every layer at once. Nothing is "
        + "faded, and anything can be picked up.";
    } else if (layer) {
      $("#hint").textContent = "Working on " + layer.label
        + ". Everything on the other layers is faded, and left alone.";
    }
    renderInspector();
  }

  // Re-queried rather than held: the button lives in the rail now, and the rail
  // is thrown away and rebuilt whenever the palette changes.
  //
  // It wears `active` like every other mode, and keeps its name whether or not
  // you are in it. It used to say "Done" and light up alongside whichever brush
  // you had before, which read as two tools being on at once.
  function paintLookButton(on, btn) {
    const b = btn || $("#btn-preview");
    if (!b) return;
    b.classList.toggle("active", on);
    b.textContent = "✋ Look";
  }

  // The button of whatever brush you were on, so leaving Look can put the
  // highlight back where it was. Held rather than looked up: an Items tile has
  // nothing on it that names the brush it carries.
  let activeBrushButton = null;

  function clearActiveButtons() {
    // Across every document: Tools and Items can be in windows of their own,
    // and a stale highlight in one of those is still a stale highlight.
    window.Panels.roots().forEach(function (root) {
      root.querySelectorAll(".pal-btn, .mode-btn").forEach(function (b) {
        b.classList.remove("active");
      });
    });
  }

  function onPreviewChanged(on) {
    document.body.classList.toggle("previewing", on);
    clearActiveButtons();
    paintLookButton(on);
    // Leaving Look puts you back on the tool you had, so the panel says what
    // the next drag will do rather than nothing at all.
    if (!on && activeBrushButton && activeBrushButton.isConnected) {
      activeBrushButton.classList.add("active");
    }
    $("#hint").textContent = on
      ? "Drag to look around the level — the background drifts the way it will "
        + "in the game. Scroll to zoom. Nothing here changes the level; pick "
        + "another tool, or press Escape, to carry on building."
      : "Pick something on the left, then drag on the grid.";
    renderInspector(null);
  }

  function bindKeys() {
    window.addEventListener("keydown", function (ev) {
      if (ev.target.tagName === "INPUT" || ev.target.tagName === "TEXTAREA") return;
      if (ev.key === "Escape" && editor.preview) {
        editor.setPreview(false);
        return;
      }
      if (editor.preview) return;   // nothing in here edits while you're looking
      const meta = ev.ctrlKey || ev.metaKey;
      if (meta && ev.key.toLowerCase() === "z" && !ev.shiftKey) {
        ev.preventDefault();
        editor.undo();
        refresh();
      } else if (meta && (ev.key.toLowerCase() === "y"
          || (ev.key.toLowerCase() === "z" && ev.shiftKey))) {
        ev.preventDefault();
        editor.redo();
        refresh();
      } else if (ev.key === "Escape" && editor.hasSelection()) {
        ev.preventDefault();
        editor.clearSelection();
        editor.draw();
      } else if (ev.key === "Delete" || ev.key === "Backspace") {
        // One path for one thing and for a boxful: the selection is the same
        // thing either way now.
        if (editor.hasSelection()) {
          ev.preventDefault();
          editor.deleteSelection();
        }
      }
    });
  }

  // ---------------------------------------------------------------- levels
  function uniqueId(base) {
    let id = window.LevelUtil.slugify(base);
    let n = 2;
    while (levels.some(function (l) { return l.id === id; })) {
      id = window.LevelUtil.slugify(base) + "_" + n;
      n++;
    }
    return id;
  }

  async function createLevel(doc, opts) {
    doc.id = uniqueId(doc.id || doc.name);
    const record = {
      id: doc.id,
      name: doc.name,
      order: levels.length,
      planned: !!doc.planned,
      data: doc.snapshot(),
    };
    await window.Storage.saveLevel(record);
    levels.push(record);
    if (!opts || !opts.silent) renderMealList();
    await openLevel(doc.id);
    renderMealList();
  }

  // The other end of "Open project": everything goes, and you start on one
  // empty meal. Destructive and irreversible — Ctrl+Z is per-meal — so it asks
  // first, in the same shape the open-a-project warning uses.
  //
  // Imported pictures survive it, exactly as they survive opening a project:
  // they are files off someone's computer that may not exist anywhere else,
  // and they are visible and deletable in the Background row. The background
  // planes don't — they are the project's own, so a new project gets the
  // standard ones back.
  function newProject() {
    modal("Start a new project?", function (body) {
      body.appendChild(el("p", null,
        "This clears all " + levels.length + " meal"
        + (levels.length === 1 ? "" : "s") + " and starts again with one empty "
        + "one. The background planes go back to the standard ones."));
      body.appendChild(el("p", "muted",
        "Pictures you imported stay in the editor — they're your files, and "
        + "nothing else here has a copy."));
      body.appendChild(el("p", "modal-warn",
        "There's no undo for this. Use \u201cSave project\u201d first if there's "
        + "anything here you want to keep."));
    }, [
      { label: "Cancel" },
      { label: "Clear it all", danger: true, onClick: startFreshProject },
    ]);
  }

  async function startFreshProject() {
    for (let i = 0; i < levels.length; i++) {
      await window.Storage.deleteLevel(levels[i].id);
    }
    levels = [];
    currentId = null;
    await window.Layers.forget();
    // A plane that no longer exists leaves activeLayer dangling, layerHolds()
    // null, and every tool silently doing nothing — the same trap as deleting
    // a layer by hand. Back to All, which always exists.
    if (editor.activeLayer !== window.Editor.ALL_LAYERS
        && !window.Palette.layer(editor.activeLayer)) {
      layerPickedByHand = false;
      editor.setLayer(window.Editor.ALL_LAYERS);
    }
    refreshLayersPanel();
    const doc = starterLevel();
    doc.name = "New Meal";
    doc.id = "new_meal";
    await createLevel(doc);
    $("#hint").textContent = "A new project, with one empty meal. Build away.";
  }

  async function openLevel(id) {
    const record = levels.find(function (l) { return l.id === id; })
      || await window.Storage.getLevel(id);
    if (!record) return;
    currentId = id;
    const doc = new window.LevelDoc(record.data);
    doc.planned = !!record.planned;
    editor.setDoc(doc);
    await window.Storage.setMeta("last_level", id);
    // Bumped so the browser tests can tell "the meal is open" from "the meal is
    // opening" — creating one opens it a second time, and anything placed in
    // between lands in the copy that is about to be replaced.
    window.__openSerial = (window.__openSerial || 0) + 1;
    renderMealList();
    renderInspector(null);
    validate();
    refresh();
  }

  async function duplicateCurrent() {
    const doc = editor.doc.clone();
    doc.name = doc.name + " copy";
    doc.id = uniqueId(doc.id + "_copy");
    await createLevel(doc);
  }

  async function addExample() {
    const examples = window.EXAMPLE_LEVELS || {};
    const names = Object.keys(examples);
    if (!names.length) {
      alert("No example levels were bundled with this editor.");
      return;
    }
    // Only one shipped level today; when there are more, ask which.
    const pick = names.length === 1 ? names[0]
      : window.prompt("Which example?\n" + names.join("\n"), names[0]);
    if (!pick || !examples[pick]) return;
    const doc = new window.LevelDoc(JSON.parse(JSON.stringify(examples[pick])));
    doc.name = doc.name + " (copy)";
    doc.id = uniqueId(doc.id + "_copy");
    await createLevel(doc);
  }

  async function deleteLevel(id) {
    const record = levels.find(function (l) { return l.id === id; });
    if (!record) return;
    if (!window.confirm("Delete \"" + record.name + "\"? This can't be undone.")) return;
    await window.Storage.deleteLevel(id);
    levels = levels.filter(function (l) { return l.id !== id; });
    levels.forEach(function (l, i) {
      l.order = i;
      window.Storage.saveLevel(l);
    });
    if (currentId === id) {
      if (levels.length) await openLevel(levels[0].id);
      else await createLevel(starterLevel(), { silent: true });
    }
    renderMealList();
  }

  async function moveLevel(id, delta) {
    const i = levels.findIndex(function (l) { return l.id === id; });
    const j = i + delta;
    if (i < 0 || j < 0 || j >= levels.length) return;
    const tmp = levels[i];
    levels[i] = levels[j];
    levels[j] = tmp;
    for (let k = 0; k < levels.length; k++) {
      levels[k].order = k;
      await window.Storage.saveLevel(levels[k]);
    }
    renderMealList();
  }

  function renderMealList() {
    // The rows only. The panel body also holds the buttons that make meals,
    // and they are markup rather than something rebuilt here — clearing the
    // whole body would take them with it.
    const list = $("#meal-rows");
    list.innerHTML = "";
    levels.forEach(function (record, i) {
      const row = el("div", "meal" + (record.id === currentId ? " current" : ""));

      const open = el("button", "meal-open");
      open.appendChild(el("span", "meal-num", String(i + 1)));
      open.appendChild(el("span", "meal-name", record.name));
      if (record.planned) open.appendChild(el("span", "meal-tag", "not built"));
      open.addEventListener("click", function () { openLevel(record.id); });
      row.appendChild(open);

      const actions = el("div", "meal-actions");
      const up = el("button", "mini", "↑");
      up.title = "Move earlier in the game";
      up.addEventListener("click", function () { moveLevel(record.id, -1); });
      const down = el("button", "mini", "↓");
      down.title = "Move later in the game";
      down.addEventListener("click", function () { moveLevel(record.id, 1); });
      const del = el("button", "mini danger", "🗑");
      del.title = "Delete this meal";
      del.addEventListener("click", function () { deleteLevel(record.id); });
      // A second line under the three little buttons, in the room the meal's
      // own name leaves when it wraps — which it usually does.
      const out = el("button", "mini meal-export", "Export");
      out.title = "Save this one meal as a .json file";
      out.addEventListener("click", function () { exportMeal(record); });
      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(del);
      actions.appendChild(out);
      row.appendChild(actions);

      list.appendChild(row);
    });
  }

  // ---------------------------------------------------------------- inspector
  // One undo step per field, not one per keystroke. Every inspector field opens
  // a step the first time it is touched and keeps using it while you carry on
  // typing into that same field; the tag is dropped when the selection changes
  // or the next gesture on the grid begins, so moving to another field — or to
  // another thing — starts a fresh step.
  //
  // Fields used to mutate with no undo step at all, which made typing in here
  // the one thing in the editor you couldn't take back.
  function editStep(tag) {
    editor.pushUndoFor("field:" + tag);
  }

  // Every panel ends with the same button; only its wording changes, and they
  // all go through the one delete path.
  function removeButton(label) {
    const b = el("button", "wide danger", label);
    b.addEventListener("click", function () { editor.deleteSelection(); });
    return b;
  }

  function isDecor(obj) {
    return !!obj && editor.doc.decor.indexOf(obj) !== -1;
  }

  // Reads the editor's selection rather than taking a thing: what the panel
  // shows depends on how much is picked, not just on which one thing is.
  function renderInspector() {
    const panel = window.Panels.body("inspector");
    panel.innerHTML = "";

    if (editor && editor.preview) {
      panel.appendChild(el("h2", null, "Having a look"));
      panel.appendChild(el("p", "muted",
        "Drag to move the camera. Background things drift by how far away you "
        + "set them — that drift is exactly what the game does."));
      panel.appendChild(el("p", "muted",
        "Nothing can be changed while you're looking. Press Escape, or pick a "
        + "tool on the left, to carry on building."));
      return;
    }

    const entity = editor ? editor.selected : null;

    // Anything picked that isn't one entity or prop — a crowd, or a single
    // block, which has no settings — gets the group panel. Without this a
    // picked block would silently show the level's own settings, as if nothing
    // were picked at all.
    if (editor && editor.hasSelection() && !entity) {
      renderGroupInspector(panel);
      return;
    }

    if (isDecor(entity)) {
      renderDecorInspector(panel, entity);
      return;
    }

    if (entity) {
      panel.appendChild(el("h2", null, window.Palette.label(entity.type)));
      const hint = window.Palette.hint(entity.type);
      if (hint) panel.appendChild(el("p", "muted", hint));
      panel.appendChild(field("Across", entity.x, "int", function (v) {
        editStep("x");
        entity.x = v | 0; editor.draw(); onDocChanged();
      }));
      panel.appendChild(field("Down", entity.y, "int", function (v) {
        editStep("y");
        entity.y = v | 0; editor.draw(); onDocChanged();
      }));

      const params = window.Palette.params(entity.type);
      const plain = [];
      const triggers = [];
      Object.keys(params).forEach(function (key) {
        if (params[key].type === "dialogue") return;   // gets its own panel
        (window.Palette.isTriggerParam(key, params[key]) ? triggers : plain).push(key);
      });

      const bindParam = function (key) {
        const spec = params[key];
        const value = entity.params[key] === undefined ? spec.default : entity.params[key];
        return field(spec.label || key, value, spec.type, function (v) {
          editStep("param:" + key);
          entity.params[key] = v;
          editor.draw();
          onDocChanged();
        }, spec);
      };

      plain.forEach(function (key) { panel.appendChild(bindParam(key)); });

      if (triggers.length) {
        panel.appendChild(el("h3", "sub-head", "Triggers"));
        panel.appendChild(el("p", "muted",
          "Triggers wire things together by name. One thing sets a name, another "
          + "waits for it. Start a name with global/ to share it between meals."));
        triggers.forEach(function (key) { panel.appendChild(bindParam(key)); });
      }

      if (params.dialogue) {
        panel.appendChild(params.dialogue.editor === "button"
          ? dialogueButton(entity, params.dialogue)
          : buildDialogueEditor(entity, params.dialogue));
      }

      panel.appendChild(removeButton("Remove this"));
      return;
    }

    // Nothing selected: the level's own settings.
    const doc = editor.doc;
    panel.appendChild(el("h2", null, "This Meal"));
    panel.appendChild(field("Name", doc.name, "string", function (v) {
      doc.name = v;
      const record = levels.find(function (l) { return l.id === currentId; });
      if (record) record.name = v;
      renderMealList();
      onDocChanged();
    }));
    panel.appendChild(field("Width (blocks)", doc.width, "int", function (v) {
      doc.width = Math.max(10, Math.min(1000, v | 0));
      editor.draw();
      onDocChanged();
    }));
    panel.appendChild(field("Height (blocks)", doc.height, "int", function (v) {
      doc.height = Math.max(8, Math.min(200, v | 0));
      editor.draw();
      onDocChanged();
    }));
    panel.appendChild(field("Sky colour", doc.background_top, "color", function (v) {
      doc.background_top = v; editor.draw(); onDocChanged();
    }));
    panel.appendChild(field("Deep colour", doc.background_bottom, "color", function (v) {
      doc.background_bottom = v; editor.draw(); onDocChanged();
    }));
    panel.appendChild(field("Designed but not built", doc.planned, "bool", function (v) {
      doc.planned = v;
      const record = levels.find(function (l) { return l.id === currentId; });
      if (record) record.planned = v;
      renderMealList();
      onDocChanged();
    }));

    panel.appendChild(el("p", "muted",
      "Saved as levels/" + window.LevelUtil.slugify(doc.id) + ".json"));
  }

  // ---------------------------------------------------------------- dialogue
  // A list of lines, each with optional conditions and one optional reward.
  // Conditions are what let one person say different things at different points
  // in the story without any code: line one sets a name, line two is marked
  // "unless" that name.
  // `rerender` is how a card redraws itself after add/move/delete. It is the
  // inspector's own redraw when the editor sits in the panel, and the modal's
  // when it doesn't — without it a line added inside the modal would rebuild
  // the panel behind it and never show up.
  function buildDialogueEditor(entity, spec, rerender) {
    spec = spec || {};
    const redraw = rerender || function () { renderInspector(entity); };
    if (!Array.isArray(entity.params.dialogue)) entity.params.dialogue = [];
    const lines = entity.params.dialogue;

    const box = el("div", "dialogue");
    box.appendChild(el("h3", "sub-head", spec.label || "What they say"));

    if (!lines.length) {
      box.appendChild(el("p", "muted", spec.empty_hint
        || "Nothing yet — they'll fall back to whatever they say by default."));
    }

    lines.forEach(function (line, index) {
      box.appendChild(dialogueLineCard(entity, line, index, redraw));
    });

    const add = el("button", "wide", "+ Add a line");
    add.addEventListener("click", function () {
      editor.pushUndo();
      lines.push(window.Palette.defaultDialogueLine());
      redraw();
      onDocChanged();
    });
    box.appendChild(add);
    return box;
  }

  // Dialogue behind a button rather than in the panel. Today the button opens
  // the same line editor in a modal; the plan is for it to open a dialogue-tree
  // editor (Yarn Spinner) instead — see docs/NEXT-STEPS.md.
  function dialogueButton(entity, spec) {
    if (!Array.isArray(entity.params.dialogue)) entity.params.dialogue = [];
    const count = entity.params.dialogue.length;

    const box = el("div", "dialogue");
    box.appendChild(el("h3", "sub-head", spec.label || "What it says"));
    box.appendChild(el("p", "muted", count
      ? (count === 1 ? "One line written." : count + " lines written.")
      : (spec.empty_hint || "Nothing written on it yet.")));

    const open = el("button", "wide", count ? "Change what it says…" : "Write what it says…");
    open.addEventListener("click", function () {
      openDialogueModal(entity, spec);
    });
    box.appendChild(open);
    return box;
  }

  function openDialogueModal(entity, spec) {
    modal(spec.label || "What it says", function (body) {
      // Redraw the panel behind as well as the modal: the button's summary
      // counts the lines, and the modal can also be left by Escape or by
      // clicking outside it, neither of which runs Done's handler.
      const draw = function (rebuiltFor) {
        body.innerHTML = "";
        body.appendChild(buildDialogueEditor(entity, spec, draw));
        if (rebuiltFor !== "first") renderInspector();
      };
      draw("first");
    }, [{ label: "Done", primary: true }]);
  }

  function dialogueLineCard(entity, line, index, rerender) {
    const redraw = rerender || function () { redraw(); };
    const lines = entity.params.dialogue;
    const card = el("div", "dlg-line");

    const head = el("div", "dlg-head");
    head.appendChild(el("span", "dlg-num", String(index + 1)));
    const spacer = el("span", "spacer");
    head.appendChild(spacer);

    const move = function (delta) {
      const to = index + delta;
      if (to < 0 || to >= lines.length) return;
      editor.pushUndo();
      const tmp = lines[index];
      lines[index] = lines[to];
      lines[to] = tmp;
      redraw();
      onDocChanged();
    };
    const up = el("button", "mini", "↑");
    up.title = "Say this earlier";
    up.addEventListener("click", function () { move(-1); });
    const down = el("button", "mini", "↓");
    down.title = "Say this later";
    down.addEventListener("click", function () { move(1); });
    const del = el("button", "mini danger", "🗑");
    del.title = "Delete this line";
    del.addEventListener("click", function () {
      editor.pushUndo();
      lines.splice(index, 1);
      redraw();
      onDocChanged();
    });
    head.appendChild(up);
    head.appendChild(down);
    head.appendChild(del);
    card.appendChild(head);

    const specs = window.Palette.dialogueLineParams;
    const set = function (key, value) {
      editStep("dlg:" + index + ":" + key);
      line[key] = value;
      onDocChanged();
    };

    // The words come first and get the most room; the wiring sits under a fold
    // so a simple line stays simple to write.
    if (specs.text) {
      card.appendChild(field(specs.text.label, line.text || "", "text",
        function (v) { set("text", v); }, specs.text));
    }

    const details = el("details", "dlg-extra");
    const summary = el("summary", null, _lineSummary(line));
    details.appendChild(summary);
    if (_lineHasWiring(line)) details.open = true;

    ["when", "unless", "set"].forEach(function (key) {
      if (!specs[key]) return;
      details.appendChild(field(specs[key].label, line[key] || "", "flag",
        function (v) { set(key, v); summary.textContent = _lineSummary(line); },
        specs[key]));
    });

    if (specs.give_kind) {
      details.appendChild(field(specs.give_kind.label, line.give_kind || "none",
        "enum", function (v) {
          set("give_kind", v);
          redraw();   // showing/hiding the id field
        }, specs.give_kind));
    }
    if (specs.give_id && line.give_kind && line.give_kind !== "none") {
      details.appendChild(field(specs.give_id.label, line.give_id || "", "string",
        function (v) { set("give_id", v); }, specs.give_id));
      const help = _giveHelp(line.give_kind);
      if (help) details.appendChild(el("p", "muted", help));
    }

    card.appendChild(details);
    return card;
  }

  function _lineHasWiring(line) {
    return !!(line.when || line.unless || line.set
      || (line.give_kind && line.give_kind !== "none"));
  }

  function _lineSummary(line) {
    const bits = [];
    if (line.when) bits.push("only if " + line.when);
    if (line.unless) bits.push("unless " + line.unless);
    if (line.set) bits.push("remembers " + line.set);
    if (line.give_kind && line.give_kind !== "none") {
      bits.push("gives a " + line.give_kind);
    }
    return bits.length ? bits.join(" · ") : "Conditions and rewards";
  }

  function _giveHelp(kind) {
    switch (kind) {
      case "recipe": return "A recipe id, like pretzel or fruit_chew.";
      case "cup": return "A cup id. Any name — it goes on the shelf.";
      case "shape": return "icicle, rope or drill.";
      case "liquid": return "water, coffee or orange_juice.";
    }
    return "";
  }

  // ------------------------------------------------------------ group panel
  // What a group of picked things has in common. Entities and props both carry
  // a {key: spec} params map, so one shape covers both — and adding a third
  // sort of thing later is a matter of returning its map here.
  function groupParams(group) {
    if (group.kind === "entity") {
      const params = window.Palette.params(group.type);
      const out = {};
      Object.keys(params).forEach(function (key) {
        // Dialogue is a whole editor of its own and is per-person by nature.
        // (Position isn't in here to exclude — the single-item panel adds its
        // Across/Down by hand. Moving a group is Move's job.)
        if (params[key].type !== "dialogue") out[key] = params[key];
      });
      return out;
    }
    if (group.kind === "decor" && group.type !== "image") {
      return window.Palette.decorParams;
    }
    return null;   // blocks have no settings; imported pictures differ per file
  }

  // "3 Counters, 2 Fruit Gummies, 1 Window" — what's actually picked, counted.
  function selectionTally() {
    const s = editor.selection;
    const counts = new Map();
    const bump = function (label) {
      counts.set(label, (counts.get(label) || 0) + 1);
    };
    s.tiles.forEach(function (t) {
      const tile = window.Palette.tile(editor.doc.getTile(t[0], t[1]));
      bump((tile && tile.label) || "Block");
    });
    s.entities.forEach(function (e) { bump(window.Palette.label(e.type)); });
    s.decor.forEach(function (d) {
      bump(d.type === "image" ? "Picture" : window.Palette.decorLabel(d.type));
    });
    return Array.from(counts, function (pair) {
      return { label: pair[0], count: pair[1] };
    }).sort(function (a, b) { return b.count - a.count; });
  }

  function renderGroupInspector(panel) {
    const count = editor.selectionCount();
    const group = editor.selectionKind();
    const params = group ? groupParams(group) : null;
    const keys = params ? Object.keys(params) : [];

    panel.appendChild(el("h2", null,
      count + (count === 1 ? " thing picked" : " things picked")));

    // Greyed out when there's nothing to set: the list is then a report of
    // what's picked, not a set of controls that happen to do nothing.
    const tally = el("div", "tally" + (keys.length ? "" : " tally-inert"));
    selectionTally().forEach(function (row) {
      const line = el("div", "tally-row");
      line.appendChild(el("span", "tally-count", String(row.count)));
      line.appendChild(el("span", "tally-label", row.label));
      tally.appendChild(line);
    });
    panel.appendChild(tally);

    if (!keys.length) {
      panel.appendChild(el("p", "muted", nothingToSetNote(group)));
    } else {
      panel.appendChild(el("p", "muted",
        "All the same sort of thing, so setting one of these sets all "
        + count + "."));
      keys.forEach(function (key) {
        panel.appendChild(groupField(group, key, params[key]));
      });
    }

    panel.appendChild(removeButton(
      "Remove " + (count === 1 ? "it" : "all " + count)));
  }

  // Why this selection has no settings to offer — the three ways that happens.
  function nothingToSetNote(group) {
    const tail = " Move shifts them; Del removes them.";
    if (!group) {
      return "These aren't all the same sort of thing, so there's nothing to set "
        + "on all of them at once." + tail;
    }
    if (group.kind === "tile") return "Blocks have no settings of their own." + tail;
    return "Nothing to set on these." + tail;
  }

  // One field standing for every member of the group. The value shown is the
  // first one's; where they disagree the label says so, and typing here makes
  // them agree — which is the point of the panel.
  //
  // Undo is per field, not per keystroke: `pushUndoFor` opens a step the first
  // time a field is touched and keeps using it until the selection changes or
  // the next gesture on the grid begins.
  function groupField(group, key, spec) {
    const first = group.items[0];
    const read = function (item) {
      return group.kind === "entity" ? item.params[key] : item[key];
    };
    const write = function (item, v) {
      if (group.kind === "entity") item.params[key] = v; else item[key] = v;
    };
    const value = read(first) === undefined ? spec.default : read(first);
    const mixed = group.items.some(function (i) { return read(i) !== read(first); });
    return field((spec.label || key) + (mixed ? " (mixed)" : ""),
      value, spec.type, function (v) {
        editor.pushUndoFor("group:" + group.kind + ":" + group.type + ":" + key);
        group.items.forEach(function (item) { write(item, v); });
        editor.draw();
        onDocChanged();
      }, spec);
  }

  function renderDecorInspector(panel, item) {
    const isPicture = item.type === "image";
    const pictureId = isPicture ? window.ImageLibrary.idFromSprite(item.sprite) : "";
    const record = isPicture ? window.ImageLibrary.record(pictureId) : null;

    panel.appendChild(el("h2", null, isPicture
      ? (record ? pictureLabel(record) : pictureId || "Picture")
      : window.Palette.decorLabel(item.type)));

    if (isPicture) {
      panel.appendChild(el("p", "muted",
        "A picture you added. It goes into the game as art/" + item.sprite + "."));
      if (!record) {
        panel.appendChild(el("p", "modal-warn",
          "The file isn't in this browser. Add it again under Background — "
          + "same picture, same name — and it comes back here."));
      }
    } else {
      const decorItem = window.Palette.decorItem(item.type);
      if (decorItem && decorItem.hint) panel.appendChild(el("p", "muted", decorItem.hint));
    }
    panel.appendChild(el("p", "muted",
      "A background thing. It's only for looks — you can walk straight through it."));
    const itemLayer = window.Palette.layer(
      item.layer || window.Palette.defaultLayerFor("decor"));
    if (itemLayer) {
      panel.appendChild(el("p", "muted",
        "On " + itemLayer.label + ". That's what sets how far away it is. To "
        + "put it at a different distance, move it to another layer."));
    }

    // Pixels, not tiles: this is the one thing in the editor that isn't snapped.
    panel.appendChild(field("Across (px)", Math.round(item.x), "int", function (v) {
      editStep("x");
      item.x = v; editor.draw(); onDocChanged();
    }));
    panel.appendChild(field("Down (px)", Math.round(item.y), "int", function (v) {
      editStep("y");
      item.y = v; editor.draw(); onDocChanged();
    }));

    const params = window.Palette.decorParams;
    Object.keys(params).forEach(function (key) {
      let spec = params[key];
      // A photo can be thousands of pixels across, so it lands at a fraction of
      // its own size and needs room to go smaller than a hand-drawn prop does.
      if (isPicture && key === "scale") {
        spec = Object.assign({}, spec, { min: 0.02, step: "0.01" });
      }
      const value = item[key] === undefined ? spec.default : item[key];
      panel.appendChild(field(spec.label || key, value, spec.type, function (v) {
        editStep("param:" + key);
        item[key] = v;
        editor.draw();
        onDocChanged();
      }, spec));
    });

    panel.appendChild(removeButton("Remove this"));
  }

  function finishField(label, control, extraClass) {
    const wrap = el("label", "field" + (extraClass ? " " + extraClass : ""));
    wrap.appendChild(el("span", "field-label", label));
    wrap.appendChild(control);
    return wrap;
  }

  function field(label, value, type, onInput, spec) {
    const wrap = el("label", "field");
    wrap.appendChild(el("span", "field-label", label));
    let input;

    if (type === "bool") {
      input = el("input");
      input.type = "checkbox";
      input.checked = !!value;
      input.addEventListener("change", function () { onInput(input.checked); });
    } else if (type === "enum") {
      input = el("select");
      (spec.options || []).forEach(function (opt) {
        const o = el("option", null, opt);
        o.value = opt;
        input.appendChild(o);
      });
      input.value = value;
      input.addEventListener("change", function () { onInput(input.value); });
    } else if (type === "flag") {
      input = el("input");
      input.type = "text";
      input.placeholder = "(nothing)";
      input.value = value === undefined || value === null ? "" : String(value);
      // Offer the names already used in this level rather than making people
      // remember them. A typo'd flag fails silently, which is the worst kind.
      const listId = "flags-" + Math.random().toString(36).slice(2, 8);
      const list = el("datalist");
      list.id = listId;
      window.Palette.knownFlags(editor.doc).forEach(function (flag) {
        const o = el("option");
        o.value = flag;
        list.appendChild(o);
      });
      input.setAttribute("list", listId);
      input.addEventListener("input", function () { onInput(input.value.trim()); });
      const wrapper = document.createDocumentFragment();
      wrapper.appendChild(input);
      wrapper.appendChild(list);
      const holder = el("span", "flag-field");
      holder.appendChild(wrapper);
      return finishField(label, holder);
    } else if (type === "text") {
      input = el("textarea");
      input.rows = 2;
      input.value = value === undefined || value === null ? "" : String(value);
      input.addEventListener("input", function () { onInput(input.value); });
      return finishField(label, input, "field-wide");
    } else if (type === "color") {
      input = el("input");
      input.type = "color";
      input.value = value;
      input.addEventListener("input", function () { onInput(input.value); });
    } else if (type === "int" || type === "float") {
      input = el("input");
      input.type = "number";
      if (spec && spec.min !== undefined) input.min = spec.min;
      if (spec && spec.max !== undefined) input.max = spec.max;
      if (type === "float") input.step = (spec && spec.step) || "0.1";
      input.value = value;
      input.addEventListener("input", function () {
        const v = type === "int" ? parseInt(input.value, 10) : parseFloat(input.value);
        if (!isNaN(v)) onInput(v);
      });
    } else {
      input = el("input");
      input.type = "text";
      input.value = value === undefined || value === null ? "" : String(value);
      input.addEventListener("input", function () { onInput(input.value); });
    }

    wrap.appendChild(input);
    return wrap;
  }

  // ---------------------------------------------------------------- validation
  // A column of the editor used to be spent saying "Ready to play." Now the
  // answer is one chip in the top bar and the working out is a hover away —
  // but the full list is still written out every time, because that list is
  // what the chip is a summary of.
  function validate() {
    const problems = editor.doc.validate();
    const box = $("#validation");
    box.innerHTML = "";
    if (!problems.length) {
      const ok = el("div", "check ok");
      ok.appendChild(el("span", "check-icon", "✓"));
      ok.appendChild(el("span", null, "Ready to play."));
      box.appendChild(ok);
      paintChecksChip("ok", "✓", "Ready to play");
      return;
    }
    problems.forEach(function (p) {
      const row = el("div", "check " + (p.level === "warn" ? "warn" : "bad"));
      row.appendChild(el("span", "check-icon", p.level === "warn" ? "!" : "✕"));
      row.appendChild(el("span", null, p.text));
      box.appendChild(row);
    });
    // The worst thing wrong is what the chip reports: a level with one thing
    // stopping it playing and three notes is not "3 notes".
    const bad = problems.filter(function (p) { return p.level !== "warn"; }).length;
    if (bad) paintChecksChip("bad", "✕", bad + (bad === 1 ? " problem" : " problems"));
    else paintChecksChip("warn", "!", problems.length
      + (problems.length === 1 ? " note" : " notes"));
  }

  function paintChecksChip(state, icon, text) {
    const chip = $("#checks-chip");
    chip.className = state;
    chip.textContent = icon + "  " + text;
    chip.title = "Checks — hover for the detail";
  }

  function refresh() {
    $("#btn-undo").disabled = !editor.canUndo();
    $("#btn-redo").disabled = !editor.canRedo();
    validate();
  }

  // Autosave, debounced — every stroke would otherwise be a database write.
  function onDocChanged() {
    refresh();
    // Playing? Then the level that just changed is the level being played.
    window.Playtest.pushSoon();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async function () {
      const record = levels.find(function (l) { return l.id === currentId; });
      if (!record) return;
      record.name = editor.doc.name;
      record.planned = editor.doc.planned;
      record.data = editor.doc.snapshot();
      const ok = await window.Storage.saveLevel(record);
      $("#save-state").textContent = ok ? "Saved" : "NOT SAVED — export now";
      $("#save-state").className = ok ? "saved" : "unsaved";
    }, 400);
    $("#save-state").textContent = "Saving…";
  }

  // ---------------------------------------------------------------- import
  function bindImport() {
    const input = $("#file-input");
    $("#btn-import").addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () {
      Array.prototype.forEach.call(input.files, readLevelFile);
      input.value = "";
    });

    // Drag a .json straight onto the page.
    const page = document.body;
    ["dragenter", "dragover"].forEach(function (evt) {
      page.addEventListener(evt, function (ev) {
        if (window.Panels.isDragging()) return;   // a panel, not a level file
        ev.preventDefault();
        page.classList.add("dropping");
      });
    });
    ["dragleave", "drop"].forEach(function (evt) {
      page.addEventListener(evt, function (ev) {
        ev.preventDefault();
        page.classList.remove("dropping");
      });
    });
    page.addEventListener("drop", function (ev) {
      const files = ev.dataTransfer && ev.dataTransfer.files;
      if (files) Array.prototype.forEach.call(files, readLevelFile);
    });
  }

  function readLevelFile(file) {
    if (!/\.json$/i.test(file.name)) return;
    const reader = new FileReader();
    reader.onload = async function () {
      let parsed;
      try {
        parsed = JSON.parse(reader.result);
      } catch (err) {
        alert("Couldn't read " + file.name + " — it isn't valid JSON.");
        return;
      }
      if (parsed.levels && !parsed.tiles) {
        alert("That looks like manifest.json, which lists the meals rather than "
          + "being one. Import the individual level files instead.");
        return;
      }
      const doc = new window.LevelDoc(parsed);
      doc.id = uniqueId(doc.id || file.name.replace(/\.json$/i, ""));
      await createLevel(doc);
    };
    reader.readAsText(file);
  }

  // ---------------------------------------------------------------- modal
  // A real modal rather than confirm(), because opening a project needs to show
  // a checklist of what was found and what's missing before you agree to it.
  function modal(title, buildBody, actions) {
    const back = el("div", "modal-back");
    const box = el("div", "modal");
    box.appendChild(el("h2", null, title));

    const body = el("div", "modal-body");
    buildBody(body);
    box.appendChild(body);

    const row = el("div", "modal-actions");
    actions.forEach(function (action) {
      const b = el("button", action.primary ? "primary" : (action.danger ? "danger" : ""),
        action.label);
      b.disabled = !!action.disabled;
      b.addEventListener("click", function () {
        close();
        if (action.onClick) action.onClick();
      });
      row.appendChild(b);
    });
    box.appendChild(row);

    back.appendChild(box);
    document.body.appendChild(back);

    function close() {
      if (back.parentNode) back.parentNode.removeChild(back);
      window.removeEventListener("keydown", onKey, true);
    }
    // Capture, and swallow the key: Escape is the editor's "drop what's picked"
    // as well, and closing a modal shouldn't also unpick what the modal was
    // about — the sign's dialogue button would land you back on the meal's own
    // settings with no way to see what you just wrote.
    function onKey(ev) {
      if (ev.key !== "Escape") return;
      ev.stopPropagation();
      close();
    }
    window.addEventListener("keydown", onKey, true);
    back.addEventListener("click", function (ev) {
      if (ev.target === back) close();
    });
    return close;
  }

  // ---------------------------------------------------------------- open project
  // Takes a manifest plus its level files, checks the set is complete, and only
  // then offers to replace everything. Half-importing a project would leave a
  // meal list pointing at levels that aren't there.
  function bindOpenProject() {
    const input = $("#project-input");
    $("#btn-open-project").addEventListener("click", function () { input.click(); });
    input.addEventListener("change", function () {
      readProjectFiles(Array.prototype.slice.call(input.files));
      input.value = "";
    });
  }

  function readProjectFiles(files) {
    // The zip "Save project" wrote is a whole project in one file — pictures
    // and layers included, which a folder of loose .json files can't carry. So
    // when there's a zip in the selection it *is* the selection.
    const zips = files.filter(function (f) { return /\.zip$/i.test(f.name); });
    if (zips.length > 1) {
      modal("Open a project", function (body) {
        body.appendChild(el("p", null,
          "That's " + zips.length + " project files. Open one at a time."));
      }, [{ label: "OK", primary: true }]);
      return;
    }
    if (zips.length === 1) {
      readProjectZip(zips[0], files.length - 1);
      return;
    }

    const jsons = files.filter(function (f) { return /\.json$/i.test(f.name); });
    if (!jsons.length) {
      modal("Open a project", function (body) {
        body.appendChild(el("p", null,
          "No .json or .zip files in that selection. Pick the zip that "
          + "\u201cSave project\u201d made, or the whole levels folder — "
          + "manifest.json and every level file together."));
      }, [{ label: "OK", primary: true }]);
      return;
    }

    Promise.all(jsons.map(readAsJson)).then(function (results) {
      const parsed = results.filter(function (r) { return r.data !== null; });
      const broken = results.filter(function (r) { return r.data === null; });
      analyseProject(parsed, broken);
    });
  }

  // Unpacking is by path, not by guesswork about the contents: the zip's own
  // layout says what each file is, and data/palette.json has a top-level
  // "tiles" array of its own that would otherwise read as a meal.
  async function readProjectZip(file, otherFiles) {
    let result;
    try {
      result = await window.Zip.read(await file.arrayBuffer());
    } catch (err) {
      result = { files: [], problems: ["Couldn't read " + file.name + "."] };
    }

    const parsed = [];
    const broken = [];
    const pictures = [];
    const problems = result.problems.slice();
    let paletteText = null;

    result.files.forEach(function (entry) {
      const name = entry.name.replace(/^\.\//, "");
      if (/(^|\/)__MACOSX\//.test(name) || /(^|\/)\._/.test(name)) return;
      const text = function () { return new TextDecoder("utf-8").decode(entry.bytes); };

      if (/(^|\/)data\/palette\.json$/.test(name)) {
        paletteText = text();
        return;
      }
      if (/\.json$/i.test(name)) {
        const short = name.split("/").pop();
        try {
          parsed.push({ name: short, data: JSON.parse(text()) });
        } catch (err) {
          broken.push({ name: short, data: null });
        }
        return;
      }
      const picture = pictureFromZip(name, entry.bytes);
      if (picture) pictures.push(picture);
      // Anything else — HOW-TO-INSTALL.txt, a stray file someone added — is
      // not the editor's to bring in, and saying so about a readme is noise.
    });

    if (otherFiles > 0) {
      problems.push("Only " + file.name + " was read — a project file already "
        + "holds the whole project, so the other " + otherFiles
        + " file(s) in that selection were ignored.");
    }
    analyseProject(parsed, broken, {
      pictures: pictures, paletteText: paletteText, problems: problems,
    });
  }

  // art/backgrounds/kitchen.png -> the id "kitchen", which is exactly what the
  // levels in the same zip name. Anything outside that folder is the game's own
  // art, which the editor generates rather than stores.
  //
  // Matched anywhere in the path, not just at the start: a zip re-made by
  // dragging the unpacked folder to "Compress" wraps everything in a folder of
  // its own, and that zip is still this project.
  function pictureFromZip(name, bytes) {
    const at = name.indexOf("art/" + window.ImageLibrary.PREFIX);
    if (at !== 0 && name.charAt(at - 1) !== "/") return null;
    const base = name.slice(at + ("art/" + window.ImageLibrary.PREFIX).length);
    const match = /^([^/]+)\.(png|jpe?g)$/i.exec(base);
    if (!match) return null;
    return {
      id: match[1],
      name: base,
      bytes: bytes,
      mime: /^jpe?g$/i.test(match[2]) ? "image/jpeg" : "image/png",
    };
  }

  function readAsJson(file) {
    return new Promise(function (resolve) {
      const reader = new FileReader();
      reader.onload = function () {
        try {
          resolve({ name: file.name, data: JSON.parse(reader.result) });
        } catch (err) {
          resolve({ name: file.name, data: null });
        }
      };
      reader.onerror = function () { resolve({ name: file.name, data: null }); };
      reader.readAsText(file);
    });
  }

  function analyseProject(parsed, broken, extra) {
    extra = extra || {};
    const pictures = extra.pictures || [];
    const problems = extra.problems || [];
    const manifests = parsed.filter(function (r) {
      return r.data && Array.isArray(r.data.levels) && !r.data.tiles;
    });
    // A level is a grid with a size. `tiles` alone isn't enough to go on:
    // data/palette.json has a top-level "tiles" array too — the five block
    // types — and picking that up as a meal builds a level out of nothing.
    const levelFiles = parsed.filter(function (r) {
      return r.data && Array.isArray(r.data.tiles)
        && typeof r.data.width === "number" && typeof r.data.height === "number";
    });

    const layers = layersFrom(extra.paletteText);

    // A zip nothing could be read out of gets the reader's own sentence, not
    // "there's no manifest": a project re-zipped by the computer's own Compress
    // command is deflated, and being told the manifest is missing from a file
    // that plainly contains one sends you looking in the wrong place.
    if (!parsed.length && problems.length) {
      modal("Open a project", function (body) {
        problems.forEach(function (line) {
          body.appendChild(el("div", "file-line bad", "\u2715  " + line));
        });
      }, [{ label: "OK", primary: true }]);
      return;
    }

    if (manifests.length === 0) {
      modal("Open a project", function (body) {
        problems.forEach(function (line) {
          body.appendChild(el("div", "file-line warn", "!  " + line));
        });
        body.appendChild(el("p", null,
          "There's no manifest.json in that selection. The manifest is the list "
          + "of meals and their order — without it there's no project to open."));
        body.appendChild(el("p", "muted",
          "Found " + levelFiles.length + " level file(s). To bring those in "
          + "individually, use \u201cOpen file\u2026\u201d instead."));
      }, [{ label: "OK", primary: true }]);
      return;
    }
    if (manifests.length > 1) {
      modal("Open a project", function (body) {
        body.appendChild(el("p", null,
          "That selection has " + manifests.length + " manifests in it. Pick the "
          + "levels folder from one project at a time."));
      }, [{ label: "OK", primary: true }]);
      return;
    }

    const manifest = manifests[0].data;
    const entries = manifest.levels || [];

    // Match by id, falling back to the filename in the manifest's path.
    const byId = {};
    levelFiles.forEach(function (r) {
      const id = (r.data.id || r.name.replace(/\.json$/i, ""));
      byId[id] = r;
    });

    const found = [];
    const missing = [];
    entries.forEach(function (entry) {
      if (entry.planned) return;   // by definition has no file yet
      const fromPath = String(entry.path || "").split("/").pop().replace(/\.json$/i, "");
      const match = byId[entry.id] || byId[fromPath];
      if (match) found.push({ entry: entry, file: match });
      else missing.push(entry);
    });

    const planned = entries.filter(function (e) { return e.planned; });
    const usedNames = found.map(function (f) { return f.file.name; });
    const extras = levelFiles.filter(function (r) {
      return usedNames.indexOf(r.name) === -1;
    });

    const complete = missing.length === 0 && found.length > 0;

    modal(complete ? "Open this project?" : "Some files are missing", function (body) {
      body.appendChild(checkRow(found.length > 0,
        found.length + " meal" + (found.length === 1 ? "" : "s") + " ready to open"));
      found.forEach(function (f) {
        body.appendChild(el("div", "file-line", "\u2713  " + (f.entry.name || f.entry.id)));
      });
      planned.forEach(function (e) {
        body.appendChild(el("div", "file-line muted",
          "\u2013  " + (e.name || e.id) + " (designed, not built \u2014 no file needed)"));
      });
      missing.forEach(function (e) {
        body.appendChild(el("div", "file-line bad",
          "\u2715  " + (e.name || e.id) + " \u2014 " + (e.path || "?") + " wasn't included"));
      });
      extras.forEach(function (r) {
        body.appendChild(el("div", "file-line warn",
          "!  " + r.name + " isn't in the manifest \u2014 it'll be added at the end"));
      });
      broken.forEach(function (r) {
        body.appendChild(el("div", "file-line bad",
          "\u2715  " + r.name + " isn't valid JSON"));
      });
      if (pictures.length) {
        body.appendChild(el("div", "file-line",
          "\u2713  " + (pictures.length === 1
            ? "1 picture comes with it"
            : pictures.length + " pictures come with it")));
      }
      if (layers) {
        body.appendChild(el("div", "file-line",
          "\u2713  its own background planes (" + layers.length + ")"));
      }
      problems.forEach(function (line) {
        body.appendChild(el("div", "file-line warn", "!  " + line));
      });

      if (complete) {
        body.appendChild(el("p", "modal-warn",
          "Opening this will delete everything currently in the editor and "
          + "replace it with these " + (found.length + extras.length) + " meals. "
          + "Export first if you haven't."));
      } else {
        body.appendChild(el("p", "modal-warn",
          "Nothing has been changed. Select the whole levels folder \u2014 "
          + "manifest.json and every level file together \u2014 and try again."));
      }
    }, complete
      ? [
          { label: "Cancel" },
          {
            label: "Replace everything", danger: true,
            onClick: function () {
              replaceProject(found, planned, extras, pictures, layers);
            },
          },
        ]
      : [{ label: "OK", primary: true }]);
  }

  function checkRow(ok, text) {
    const row = el("div", "check " + (ok ? "ok" : "bad"));
    row.appendChild(el("span", "check-icon", ok ? "\u2713" : "\u2715"));
    row.appendChild(el("span", null, text));
    return row;
  }

  // The layers out of an opened project's data/palette.json, or null when the
  // zip didn't carry one — which is the common case: it only goes in the zip
  // when the planes were changed away from the shipped ones.
  function layersFrom(text) {
    if (!text) return null;
    try {
      const data = JSON.parse(text);
      return Array.isArray(data.layers) && data.layers.length ? data.layers : null;
    } catch (err) {
      return null;
    }
  }

  async function replaceProject(found, planned, extras, pictures, layers) {
    // Wipe first, so a half-finished import can't leave a mix of two projects.
    for (let i = 0; i < levels.length; i++) {
      await window.Storage.deleteLevel(levels[i].id);
    }
    levels = [];
    currentId = null;

    // Manifest order is the game's order, so it is the editor's order too.
    const ordered = [];
    found.forEach(function (f) {
      ordered.push({ data: f.file.data, name: f.entry.name, planned: false });
    });
    planned.forEach(function (e) {
      ordered.push({ data: { id: e.id, name: e.name }, name: e.name, planned: true });
    });
    extras.forEach(function (r) {
      ordered.push({ data: r.data, name: r.data.name || r.name, planned: false });
    });

    for (let i = 0; i < ordered.length; i++) {
      const doc = new window.LevelDoc(ordered[i].data);
      doc.name = ordered[i].name || doc.name;
      doc.planned = ordered[i].planned;
      doc.id = window.LevelUtil.slugify(doc.id || doc.name);
      const record = {
        id: doc.id, name: doc.name, order: i,
        planned: doc.planned, data: doc.snapshot(),
      };
      await window.Storage.saveLevel(record);
      levels.push(record);
    }

    // Pictures land before the first meal is drawn, or a level that uses one
    // opens full of grey boxes and looks broken. Same id overwrites: the levels
    // arriving with them already name it.
    const pictureProblems = [];
    let restored = 0;
    let unsaved = 0;
    for (let i = 0; i < (pictures || []).length; i++) {
      const p = pictures[i];
      const outcome = await window.ImageLibrary.put(p.id, p.name, p.bytes, p.mime);
      if (!outcome.ok) {
        pictureProblems.push(outcome.problem);
        continue;
      }
      restored++;
      // Same as importing one by hand: it's here now, but the store had no room
      // to keep it, and saying nothing means it vanishes on the next reload.
      if (!outcome.saved) unsaved++;
    }

    const layersTaken = layers ? window.Layers.adopt(layers) : false;

    renderMealList();
    if (levels.length) await openLevel(levels[0].id);
    if (layersTaken) refreshLayersPanel();
    $("#hint").textContent = "Opened " + levels.length + " meals from the project."
      + (restored ? " " + restored + " picture" + (restored === 1 ? "" : "s")
        + " came with them." : "")
      + (layersTaken ? " Its background planes came too." : "");

    if (pictureProblems.length) {
      modal("Some pictures couldn't be opened", function (body) {
        pictureProblems.forEach(function (line) {
          body.appendChild(el("div", "file-line bad", "\u2715  " + line));
        });
        body.appendChild(el("p", "muted",
          "The meals opened anyway; anything that used those will draw as a "
          + "grey box until the picture is added under Background."));
      }, [{ label: "OK", primary: true }]);
    } else if (unsaved) {
      modal("Pictures not saved", function (body) {
        body.appendChild(el("p", null,
          unsaved + " of the project's pictures are here for now, but there "
          + "wasn't room to keep them — they'll be gone when you close the tab. "
          + "The meals themselves are saved."));
      }, [{ label: "OK", primary: true }]);
    }
  }

  // ---------------------------------------------------------------- export
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // One meal as one .json. Takes a record rather than reading the open one, so
  // a meal can be exported from the list without opening it first — but the
  // open meal's live document wins over its saved record, which may be a
  // second or two behind the last thing you did.
  function exportMeal(record) {
    const doc = record.id === currentId ? editor.doc : new window.LevelDoc(record.data);
    const name = window.LevelUtil.slugify(record.id) + ".json";
    download(new Blob([doc.exportText()], { type: "application/json" }), name);
    // One .json can't carry the pictures with it, so say so rather than letting
    // the meal land in the game full of missing scenery.
    const used = window.ImageLibrary.usedIn(doc).length;
    $("#hint").textContent = "Saved " + name + " — put it in the game's levels folder."
      + (used ? " This meal uses pictures; use \u201cSave project\u201d "
        + "to get those as well." : "");
  }

  // Preserve the hand-written manifest metadata (role, shapes_taught, ...) for
  // levels that already exist in the project; new meals get a minimal entry.
  function buildManifest() {
    const existing = {};
    ((window.EXAMPLE_MANIFEST || {}).levels || []).forEach(function (entry) {
      existing[entry.id] = entry;
    });
    return {
      format_version: 1,
      levels: levels.map(function (record) {
        const id = window.LevelUtil.slugify(record.id);
        const base = existing[id] ? JSON.parse(JSON.stringify(existing[id])) : {};
        base.id = id;
        base.name = record.name;
        base.path = "res://levels/" + id + ".json";
        if (record.planned) base.planned = true;
        else delete base.planned;
        return base;
      }),
    };
  }

  async function exportEverything() {
    const files = [];
    const pictures = {};
    for (let i = 0; i < levels.length; i++) {
      const record = levels[i];
      if (record.planned) continue;   // no file for a meal that isn't built
      const doc = record.id === currentId ? editor.doc : new window.LevelDoc(record.data);
      files.push({
        name: "levels/" + window.LevelUtil.slugify(record.id) + ".json",
        text: doc.exportText(),
      });
      // Every picture any meal uses goes in the same zip, under the art folder
      // the level names. A level that arrives without its pictures is a level
      // full of grey boxes, and that is a bad afternoon.
      window.ImageLibrary.usedIn(doc).forEach(function (id) { pictures[id] = true; });
    }
    const pictureIds = Object.keys(pictures);
    const missing = pictureIds.filter(function (id) {
      return !window.ImageLibrary.has(id);
    });
    window.ImageLibrary.filesFor(pictureIds).forEach(function (f) { files.push(f); });
    files.push({
      name: "levels/manifest.json",
      text: JSON.stringify(buildManifest(), null, "\t") + "\n",
    });
    // Only when the background layers have been changed here: the game reads
    // layers from data/palette.json, so a project with custom planes has to
    // carry the file. Untouched, it stays out of the zip and nothing to copy.
    const layersChanged = window.Palette.layersDifferFromShipped();
    if (layersChanged) {
      files.push({ name: "data/palette.json", text: window.Layers.paletteJsonText() });
    }
    files.push({ name: "HOW-TO-INSTALL.txt", text: installNote(layersChanged) });

    download(window.Zip.build(files), "amy-levels.zip");
    const pictureNote = pictureIds.length
      ? " It has " + (pictureIds.length - missing.length) + " picture"
        + (pictureIds.length - missing.length === 1 ? "" : "s")
        + " in it too — the art folder goes in the same way the levels do."
      : "";
    $("#hint").textContent =
      "Saved amy-levels.zip — unzip it over the game folder." + pictureNote
      + " See EXPORTING-TO-GODOT.md.";

    if (missing.length) {
      modal("Some pictures weren't included", function (body) {
        body.appendChild(el("p", null,
          "These are used in a meal but aren't in this browser, so they "
          + "couldn't go in the zip:"));
        missing.forEach(function (id) {
          body.appendChild(el("div", "file-line bad", "✕  " + id));
        });
        body.appendChild(el("p", "muted",
          "Everything else was saved. Add the files under Background and "
          + "export again to include them."));
      }, [{ label: "OK", primary: true }]);
    }
  }

  function installNote(hasPalette) {
    const paletteSteps = hasPalette ? [
      "3. If there's an art/ folder in the zip, copy that in too. It adds the",
      "   pictures to the game's art rather than replacing anything.",
      "4. Copy data/palette.json from this zip in too, replacing the old one.",
      "   It carries the background layers you added or changed.",
      "   Then, in a terminal in the project folder, run:",
      "       python3 buildtools/gen_web_assets.py",
      "   so the editor's copy of the palette matches. (run_tests.sh does this",
      "   for you, and fails until it's done.)",
      "5. Open the project in Godot 4.7 and press F5.",
    ] : [
      "3. If there's an art/ folder in the zip, copy that in too. It adds the",
      "   pictures to the game's art rather than replacing anything.",
      "4. Open the project in Godot 4.7 and press F5.",
    ];
    return [
      "Amy's Food Game — installing these levels",
      "=========================================",
      "",
      "This zip contains a levels/ folder, and an art/ folder if any meal uses",
      "a picture you imported" + (hasPalette
        ? ", plus a data/palette.json because you changed the background layers."
        : "."),
      "",
      "1. Find the game project folder (the one with project.godot in it).",
      "2. Copy the levels/ folder from this zip into it, replacing the old one.",
    ].concat(paletteSteps).concat([
      "",
      "manifest.json decides the order the meals appear in and which ones are",
      "playable. A meal marked \"planned\" is listed but greyed out, because it",
      "has no level file yet.",
      "",
      "Keep this file. \"Open project...\" in the editor takes it back whole -",
      "every meal, its pictures, and the background layers - so it is a backup",
      "and a way to move the work to another computer as well as an install.",
      "",
      "Full instructions with pictures: web_editor/EXPORTING-TO-GODOT.md",
      "",
    ]).join("\n");
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
