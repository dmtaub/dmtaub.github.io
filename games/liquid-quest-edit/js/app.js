// Wires the editor to the page: palette rail, meal list, inspector, validation,
// autosave, import and export.

(function () {
  "use strict";

  const TILE = 32;
  let editor = null;
  let levels = [];          // [{id, name, order, planned, data}]
  let currentId = null;
  let saveTimer = null;

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
    await window.ImageLibrary.init();

    editor = new window.Editor($("#canvas"));
    editor.onChange = onDocChanged;
    editor.onSelect = renderInspector;
    editor.onPreview = onPreviewChanged;

    // Handles for the browser tests in web_editor/test/. Harmless in normal use
    // and worth far more than keeping the module hermetic.
    window.__editor = editor;
    window.__revalidate = validate;

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

    $("#btn-stop-play").addEventListener("click", function () { window.Playtest.stop(); });
    $("#btn-replay").addEventListener("click", function () { window.Playtest.replay(); });
    $("#chk-live").addEventListener("change", function () {
      window.Playtest.setLive($("#chk-live").checked);
    });

    refreshPlayButton();
  }

  function refreshPlayButton() {
    const btn = $("#btn-play");
    const playing = window.Playtest.isPlaying();
    btn.textContent = playing ? "✕ Stop" : "▶ Play";
    btn.classList.toggle("on", playing);
    if (window.Playtest.isBuilt() === false) {
      btn.title = "The game hasn't been built in this folder yet — "
        + "run buildtools/build_web.py.";
    } else {
      btn.title = playing ? "Back to building" : "Play this level, right here";
    }
  }

  // ---------------------------------------------------------------- palette
  function buildPalette(opts) {
    const rail = $("#palette");
    rail.innerHTML = "";

    const tools = el("div", "pal-group");
    tools.appendChild(el("div", "pal-title", "Tools"));
    const toolRow = el("div", "pal-items");
    [
      { kind: "select", label: "Pick", icon: "↖", hint: "Click a thing to change its settings, or drag it somewhere else." },
      { kind: "erase", label: "Rub Out", icon: "✕", hint: "Drag to remove blocks and things. Right-click does this too." },
    ].forEach(function (t) {
      const b = paletteButton(t.icon, t.label, t.hint, null);
      b.addEventListener("click", function () {
        selectBrush({ kind: t.kind }, b);
      });
      toolRow.appendChild(b);
    });
    tools.appendChild(toolRow);
    rail.appendChild(tools);

    const blocks = el("div", "pal-group");
    blocks.appendChild(el("div", "pal-title", "Blocks"));
    const blockRow = el("div", "pal-items");
    window.Palette.tiles.forEach(function (t) {
      const b = paletteButton(null, t.label, t.hint, { tile: t.id });
      b.addEventListener("click", function () {
        selectBrush({ kind: "tile", id: t.id }, b);
      });
      blockRow.appendChild(b);
    });
    blocks.appendChild(blockRow);
    rail.appendChild(blocks);

    const bg = el("div", "pal-group");
    bg.appendChild(el("div", "pal-title", "Background"));
    const bgRow = el("div", "pal-items");
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
        "A picture you added. Click to drop it, then use Pick to move it.",
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

    bg.appendChild(bgRow);
    rail.appendChild(bg);

    window.Palette.byCategory().forEach(function (group) {
      const g = el("div", "pal-group");
      g.appendChild(el("div", "pal-title", group.label));
      const row = el("div", "pal-items");
      group.items.forEach(function (item) {
        const b = paletteButton(null, item.label, item.hint, { sprite: item.icon });
        b.addEventListener("click", function () {
          selectBrush({ kind: "entity", id: item.id }, b);
        });
        row.appendChild(b);
      });
      g.appendChild(row);
      rail.appendChild(g);
    });

    // Rebuilt after importing a picture: land on that picture rather than
    // dumping you back on the default brush mid-thought.
    if (opts && opts.selectPicture && window.ImageLibrary.has(opts.selectPicture)) {
      const btn = rail.querySelector(".pal-picture-" + opts.selectPicture);
      selectBrush(pictureBrush(opts.selectPicture), btn);
      return;
    }

    // Default brush: the block you build everything out of.
    const groundBtn = rail.querySelectorAll(".pal-group")[1]
      .querySelector(".pal-btn");
    selectBrush({ kind: "tile", id: 1 }, groundBtn);
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
          "Click on the grid to drop the picture. Use Pick to move or resize it.";
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

  function selectBrush(brush, button) {
    editor.setBrush(brush);
    document.querySelectorAll(".pal-btn").forEach(function (b) {
      b.classList.remove("active");
    });
    if (button) button.classList.add("active");
    if (brush.kind === "select") {
      $("#hint").textContent =
        "Click something on the grid to change its settings. Drag to move it.";
    } else if (brush.kind === "erase") {
      $("#hint").textContent = "Drag on the grid to rub things out.";
    } else {
      const name = brush.kind === "entity"
        ? window.Palette.label(brush.id)
        : brush.kind === "decor"
        ? (brush.id === "image" ? "picture" : window.Palette.decorLabel(brush.id))
        : (window.Palette.tile(brush.id) || {}).label;
      $("#hint").textContent = brush.kind === "decor"
        ? "Click to drop a " + name + " anywhere — background things aren't on the grid. Use Pick to drag it."
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

    $("#btn-preview").addEventListener("click", function () {
      editor.setPreview(!editor.preview);
    });

    $("#btn-new").addEventListener("click", function () {
      const doc = starterLevel();
      doc.name = "New Meal";
      doc.id = uniqueId("new_meal");
      createLevel(doc);
    });
    $("#btn-duplicate").addEventListener("click", duplicateCurrent);
    $("#btn-example").addEventListener("click", addExample);

    $("#btn-export-one").addEventListener("click", exportCurrent);
    $("#btn-export-all").addEventListener("click", exportEverything);
  }

  // Preview isn't a play mode — nothing moves on its own and nothing can be
  // changed. It's here to answer one question you otherwise can't answer
  // without exporting: what does that background actually do when you walk?
  function onPreviewChanged(on) {
    document.body.classList.toggle("previewing", on);
    $("#btn-preview").classList.toggle("on", on);
    $("#btn-preview").textContent = on ? "Stop looking" : "Have a look";
    $("#hint").textContent = on
      ? "Drag to look around the level — the background drifts the way it will "
        + "in the game. Scroll to zoom. Nothing here changes the level."
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
      } else if (ev.key === "Delete" || ev.key === "Backspace") {
        if (editor.selected) {
          ev.preventDefault();
          editor.pushUndo();
          if (isDecor(editor.selected)) editor.doc.removeDecor(editor.selected);
          else editor.doc.removeEntity(editor.selected);
          editor.selected = null;
          editor.draw();
          renderInspector(null);
          onDocChanged();
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
    const list = $("#meal-list");
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
      actions.appendChild(up);
      actions.appendChild(down);
      actions.appendChild(del);
      row.appendChild(actions);

      list.appendChild(row);
    });
  }

  // ---------------------------------------------------------------- inspector
  function isDecor(obj) {
    return !!obj && editor.doc.decor.indexOf(obj) !== -1;
  }

  function renderInspector(entity) {
    const panel = $("#inspector");
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

    if (isDecor(entity)) {
      renderDecorInspector(panel, entity);
      return;
    }

    if (entity) {
      panel.appendChild(el("h2", null, window.Palette.label(entity.type)));
      const hint = window.Palette.hint(entity.type);
      if (hint) panel.appendChild(el("p", "muted", hint));
      panel.appendChild(field("Across", entity.x, "int", function (v) {
        entity.x = v | 0; editor.draw(); onDocChanged();
      }));
      panel.appendChild(field("Down", entity.y, "int", function (v) {
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
        panel.appendChild(buildDialogueEditor(entity));
      }

      const remove = el("button", "wide danger", "Remove this");
      remove.addEventListener("click", function () {
        editor.pushUndo();
        editor.doc.removeEntity(entity);
        editor.selected = null;
        editor.draw();
        renderInspector(null);
        onDocChanged();
      });
      panel.appendChild(remove);
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
  function buildDialogueEditor(entity) {
    if (!Array.isArray(entity.params.dialogue)) entity.params.dialogue = [];
    const lines = entity.params.dialogue;

    const box = el("div", "dialogue");
    box.appendChild(el("h3", "sub-head", "What they say"));

    if (!lines.length) {
      box.appendChild(el("p", "muted",
        "Nothing yet — they'll fall back to whatever they say by default."));
    }

    lines.forEach(function (line, index) {
      box.appendChild(dialogueLineCard(entity, line, index));
    });

    const add = el("button", "wide", "+ Add a line");
    add.addEventListener("click", function () {
      editor.pushUndo();
      lines.push(window.Palette.defaultDialogueLine());
      renderInspector(entity);
      onDocChanged();
    });
    box.appendChild(add);
    return box;
  }

  function dialogueLineCard(entity, line, index) {
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
      renderInspector(entity);
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
      renderInspector(entity);
      onDocChanged();
    });
    head.appendChild(up);
    head.appendChild(down);
    head.appendChild(del);
    card.appendChild(head);

    const specs = window.Palette.dialogueLineParams;
    const set = function (key, value) {
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
          renderInspector(entity);   // showing/hiding the id field
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

    // Pixels, not tiles: this is the one thing in the editor that isn't snapped.
    panel.appendChild(field("Across (px)", Math.round(item.x), "int", function (v) {
      item.x = v; editor.draw(); onDocChanged();
    }));
    panel.appendChild(field("Down (px)", Math.round(item.y), "int", function (v) {
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
        item[key] = v;
        editor.draw();
        onDocChanged();
      }, spec));
    });

    const remove = el("button", "wide danger", "Remove this");
    remove.addEventListener("click", function () {
      editor.pushUndo();
      editor.doc.removeDecor(item);
      editor.selected = null;
      editor.draw();
      renderInspector(null);
      onDocChanged();
    });
    panel.appendChild(remove);
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
  function validate() {
    const problems = editor.doc.validate();
    const box = $("#validation");
    box.innerHTML = "";
    if (!problems.length) {
      const ok = el("div", "check ok");
      ok.appendChild(el("span", "check-icon", "✓"));
      ok.appendChild(el("span", null, "Ready to play."));
      box.appendChild(ok);
      return;
    }
    problems.forEach(function (p) {
      const row = el("div", "check " + (p.level === "warn" ? "warn" : "bad"));
      row.appendChild(el("span", "check-icon", p.level === "warn" ? "!" : "✕"));
      row.appendChild(el("span", null, p.text));
      box.appendChild(row);
    });
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
      window.removeEventListener("keydown", onKey);
    }
    function onKey(ev) {
      if (ev.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
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
    const jsons = files.filter(function (f) { return /\.json$/i.test(f.name); });
    if (!jsons.length) {
      modal("Open a project", function (body) {
        body.appendChild(el("p", null,
          "No .json files in that selection. Pick the whole levels folder — "
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

  function analyseProject(parsed, broken) {
    const manifests = parsed.filter(function (r) {
      return r.data && Array.isArray(r.data.levels) && !r.data.tiles;
    });
    const levelFiles = parsed.filter(function (r) {
      return r.data && Array.isArray(r.data.tiles);
    });

    if (manifests.length === 0) {
      modal("Open a project", function (body) {
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
            onClick: function () { replaceProject(found, planned, extras); },
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

  async function replaceProject(found, planned, extras) {
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

    renderMealList();
    if (levels.length) await openLevel(levels[0].id);
    $("#hint").textContent = "Opened " + levels.length + " meals from the project.";
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

  function exportCurrent() {
    const doc = editor.doc;
    const name = window.LevelUtil.slugify(doc.id) + ".json";
    download(new Blob([doc.exportText()], { type: "application/json" }), name);
    // One .json can't carry the pictures with it, so say so rather than letting
    // the meal land in the game full of missing scenery.
    const used = window.ImageLibrary.usedIn(doc).length;
    $("#hint").textContent = "Saved " + name + " — put it in the game's levels folder."
      + (used ? " This meal uses pictures; use \u201cSave everything for the game\u201d "
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
    files.push({ name: "HOW-TO-INSTALL.txt", text: installNote() });

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

  function installNote() {
    return [
      "Amy's Food Game — installing these levels",
      "=========================================",
      "",
      "This zip contains a levels/ folder, and an art/ folder if any meal uses",
      "a picture you imported.",
      "",
      "1. Find the game project folder (the one with project.godot in it).",
      "2. Copy the levels/ folder from this zip into it, replacing the old one.",
      "3. If there's an art/ folder in the zip, copy that in too. It adds the",
      "   pictures to the game's art rather than replacing anything.",
      "4. Open the project in Godot 4.7 and press F5.",
      "",
      "manifest.json decides the order the meals appear in and which ones are",
      "playable. A meal marked \"planned\" is listed but greyed out, because it",
      "has no level file yet.",
      "",
      "Full instructions with pictures: web_editor/EXPORTING-TO-GODOT.md",
      "",
    ].join("\n");
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
