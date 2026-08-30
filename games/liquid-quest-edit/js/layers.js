// Adding, tuning and removing the background planes. The model only — the rail
// panel that drives it lives in app.js.
//
// Layers are global, not per-level: the game reads them from data/palette.json
// (PaletteRegistry), so an edit here is an edit to a file both sides share.
// That has three consequences this module exists to hold in one place:
//
//   persisted separately   not in the level, so not in doc.snapshot()
//   not undoable           for the same reason — the delete confirm says so
//   exported as palette    written into the zip when they differ from shipped
//
// See docs/LAYERS.md.

(function () {
  "use strict";

  const META_KEY = "editor_layers_v1";

  // The game wants props to be able to sit at different distances, and its own
  // suite checks for it (test/TestRunner.gd). Deleting past this is refused.
  const MIN_DECOR_LAYERS = 2;

  // A new plane starts behind everything, far enough back to read as further
  // away without landing on top of the layer before it.
  const NEW_LAYER_PARALLAX = 0.4;
  const NEW_LAYER_Z_STEP = 20;

  // What a background layer lets you set, and the rules for each. The panel is
  // generated from this list, so a new knob — a tint, a vertical drift, a blur
  // — is one entry here plus its use in the renderer, not another hand-built
  // input. Keep the keys matching data/palette.json exactly.
  const DEPTH_FIELDS = [
    {
      key: "parallax", label: "How far away",
      min: 0, max: 1, step: 0.05,
      help: "0 sticks to the camera (right in front of you). 1 is infinitely "
        + "far — it doesn't drift at all as you walk.",
    },
    {
      key: "z", label: "Draw order",
      step: 1, integer: true,
      help: "Lower numbers sit further back. A prop on a lower layer is drawn "
        + "behind the props on higher ones.",
    },
  ];

  function decorLayers() {
    return window.Palette.layersHolding("decor");
  }

  // Every prop in the project that sits on this layer — across all the meals,
  // not just the one open. Layers are global; a warning that counted only the
  // open meal would be wrong every time the props are somewhere else.
  //
  // `docs` is [{name, decor}], which the caller assembles because only it knows
  // which record the live editor document belongs to.
  function usage(id, docs) {
    let count = 0;
    const meals = [];
    docs.forEach(function (d) {
      let n = 0;
      (d.decor || []).forEach(function (item) {
        if (window.Palette.layerOf(item) === id) n++;
      });
      if (n > 0) { count += n; meals.push(d.name); }
    });
    return { count: count, meals: meals };
  }

  // Move every prop off `fromId` onto `toId`, and say which docs changed so the
  // caller can save them. The `layer` is written down explicitly even for props
  // that only belonged to `fromId` by the default rule — otherwise removing the
  // first background layer silently reparents them to whatever becomes first.
  function reassign(fromId, toId, docs) {
    const touched = [];
    docs.forEach(function (d) {
      let changed = false;
      (d.decor || []).forEach(function (item) {
        if (window.Palette.layerOf(item) === fromId) {
          item.layer = toId;
          changed = true;
        }
      });
      if (changed) touched.push(d);
    });
    return touched;
  }

  // Where a doomed layer's props should go: the background layer closest to it
  // in depth, so they move as short a distance as possible.
  function nearest(excludeId) {
    const target = Number((window.Palette.layer(excludeId) || {}).z || 0);
    return decorLayers()
      .filter(function (l) { return l.id !== excludeId; })
      .sort(function (a, b) {
        return Math.abs(Number(a.z) - target) - Math.abs(Number(b.z) - target);
      })[0] || null;
  }

  function uniqueId(name) {
    const base = window.LevelUtil.slugify(name) || "bg";
    const taken = {};
    window.Palette.layers.forEach(function (l) { taken[l.id] = true; });
    if (!taken[base]) return base;
    let n = 2;
    while (taken[base + "_" + n]) n++;
    return base + "_" + n;
  }

  // A layer set the editor can actually work in: both structural planes, and
  // enough background planes, each saying how far away it is.
  function usable(list) {
    if (!Array.isArray(list) || !list.length) return false;
    const holds = function (kind) {
      return list.some(function (l) { return l && l.holds === kind; });
    };
    const decorOk = list.filter(function (l) {
      return l && l.holds === "decor"
        && DEPTH_FIELDS.every(function (f) { return f.key in l; });
    }).length >= MIN_DECOR_LAYERS;
    return holds("tile") && holds("entity") && decorOk;
  }

  window.Layers = {
    META_KEY: META_KEY,
    MIN_DECOR_LAYERS: MIN_DECOR_LAYERS,
    DEPTH_FIELDS: DEPTH_FIELDS,

    usage: usage,
    reassign: reassign,
    nearest: nearest,
    decorLayers: decorLayers,

    // Only the background planes are editable here. Blocks and Things are one
    // plane each by definition — a tile is an [x,y,id] triple with nowhere to
    // put a layer tag — so the format carries them but the editor can't add or
    // remove them.
    isEditable: function (id) {
      const l = window.Palette.layer(id);
      return !!l && l.holds === "decor";
    },

    canDelete: function (id) {
      return window.Layers.isEditable(id)
        && decorLayers().length > MIN_DECOR_LAYERS;
    },

    // Restore the layers saved by a previous session. A save missing either
    // structural layer, or short of background planes, is from a broken state:
    // ignored rather than left to strand the editor with no tile plane.
    async load() {
      let saved = null;
      try {
        saved = await window.Storage.getMeta(META_KEY, null);
      } catch (err) {
        return false;
      }
      if (!usable(saved)) return false;
      window.Palette.setLayers(saved);
      return true;
    },

    // The layers out of an opened project's data/palette.json. Held to the same
    // bar as a restored session: a set with no tile plane is a broken set
    // whichever direction it arrived from.
    adopt: function (list) {
      if (!usable(list)) return false;
      window.Palette.setLayers(list);
      window.Layers.save();
      return true;
    },

    save: function () {
      window.Storage.setMeta(META_KEY, window.Palette.layers.map(function (l) {
        return Object.assign({}, l);
      }));
    },

    forget: function () {
      window.Palette.setLayers(
        JSON.parse(JSON.stringify(window.Palette.baseLayers)));
      return window.Storage.setMeta(META_KEY, null);
    },

    // New planes always go behind the ones that exist, never in front of the
    // first background layer: that one is the fallback for every prop with no
    // layer of its own, and displacing it would move props nobody touched.
    add: function (name) {
      const furthestZ = decorLayers().reduce(function (min, l) {
        return Math.min(min, Number(l.z));
      }, 0);
      const layer = {
        id: uniqueId(name),
        label: name,
        holds: "decor",
        parallax: NEW_LAYER_PARALLAX,
        z: furthestZ - NEW_LAYER_Z_STEP,
      };
      window.Palette.setLayers(window.Palette.layers.concat([layer]));
      window.Layers.save();
      return layer;
    },

    remove: function (id) {
      window.Palette.setLayers(window.Palette.layers.filter(function (l) {
        return l.id !== id;
      }));
      window.Layers.save();
    },

    // Coerced to what the field allows before it lands, so a typed-in 5 becomes
    // "infinitely far" rather than a parallax the game has no meaning for.
    setField: function (id, key, raw) {
      const layer = window.Palette.layer(id);
      const field = DEPTH_FIELDS.find(function (f) { return f.key === key; });
      if (!layer || !field) return null;
      let v = Number(raw);
      if (!isFinite(v)) return null;
      if (field.min !== undefined) v = Math.max(field.min, v);
      if (field.max !== undefined) v = Math.min(field.max, v);
      if (field.integer) v = Math.round(v);
      layer[key] = v;
      window.Palette.setLayers(window.Palette.layers.slice());
      window.Layers.save();
      return v;
    },

    // data/palette.json for the export zip. Only `layers` can have changed
    // here, so it is spliced into the file's own text — embedded verbatim by
    // gen_web_assets.py — rather than re-serialised whole. A full re-serialise
    // would turn every "46.0" into "46" and bury the real change in the diff.
    paletteJsonText: function () {
      const raw = window.PALETTE_JSON_TEXT;
      const block = JSON.stringify(window.Palette.layers, null, "\t")
        .split("\n")
        .map(function (line, i) { return i === 0 ? line : "\t" + line; })
        .join("\n");
      const LAYERS_BLOCK = /\t"layers": \[[\s\S]*?\n\t\]/;
      if (raw && LAYERS_BLOCK.test(raw)) {
        const replacement = "\t\"layers\": " + asciiEscape(block);
        return raw.replace(LAYERS_BLOCK, function () { return replacement; });
      }
      // A bundle generated before PALETTE_JSON_TEXT existed. The float churn is
      // ugly, but the layers are right.
      return asciiEscape(JSON.stringify(window.PALETTE_DATA, null, "\t")) + "\n";
    },
  };

  // Non-ASCII escaped the way Python's json.dump leaves it, so an em-dash in a
  // layer label matches the rest of the file.
  function asciiEscape(text) {
    let out = "";
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      out += code > 126 ? "\\u" + code.toString(16).padStart(4, "0") : text[i];
    }
    return out;
  }
})();
