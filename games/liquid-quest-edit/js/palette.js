// Thin accessor over the generated palette.data.js, which is copied verbatim
// from the game's data/palette.json. Nothing here invents content — if a tile
// or entity is missing, add it to data/palette.json and re-run
// buildtools/gen_web_assets.py.
//
// The one exception is `layers`: the editor lets you add, tune and remove the
// background planes (see the Layers panel), and those edits are persisted
// separately and merged back in via `setLayers` on boot. `baseLayers` keeps the
// shipped list so the exporter can tell whether a data/palette.json needs to go
// in the zip.

(function () {
  "use strict";

  const DATA = window.PALETTE_DATA || { tiles: [], entities: [], categories: [] };

  const tilesById = {};
  DATA.tiles.forEach(function (t) { tilesById[t.id] = t; });

  const entitiesById = {};
  DATA.entities.forEach(function (e) { entitiesById[e.id] = e; });

  const decorById = {};
  (DATA.decor || []).forEach(function (item) { decorById[item.id] = item; });

  if (!Array.isArray(DATA.layers)) DATA.layers = [];
  // The list as shipped, frozen for comparison. Deep copy: the live array is
  // mutated in place by setLayers so every `Palette.layers` holder stays valid.
  const BASE_LAYERS = JSON.parse(JSON.stringify(DATA.layers));

  const layersById = {};
  function reindexLayers() {
    Object.keys(layersById).forEach(function (k) { delete layersById[k]; });
    DATA.layers.forEach(function (l) { layersById[l.id] = l; });
  }
  reindexLayers();

  function defaultDecorLayer() {
    const first = (DATA.layers || []).find(function (l) { return l.holds === "decor"; });
    return first ? first.id : null;
  }

  window.Palette = {
    raw: DATA,
    tiles: DATA.tiles,
    entities: DATA.entities,
    categories: DATA.categories || [],

    tile: function (id) { return tilesById[id] || null; },
    tileIsSolid: function (id) {
      const t = tilesById[id];
      return !!(t && t.solid);
    },
    tileAtlasColumn: function (id) {
      const t = tilesById[id];
      return t ? t.atlas_column : 0;
    },

    entity: function (id) { return entitiesById[id] || null; },
    entityIds: function () { return Object.keys(entitiesById); },
    label: function (id) {
      const e = entitiesById[id];
      return e ? e.label : id;
    },
    hint: function (id) {
      const e = entitiesById[id];
      return e ? (e.hint || "") : "";
    },
    icon: function (id) {
      const e = entitiesById[id];
      return e ? e.icon : null;
    },
    // The art for one *placed* entity, which can depend on its settings: a
    // Person is a chef or a blob or a mouse or a fly, and the grid should show
    // which. Falls back to the entity's plain icon, so this stays opt-in per
    // entity via icon_param / icon_by_value in palette.json.
    iconFor: function (id, params) {
      const e = entitiesById[id];
      if (!e) return null;
      if (e.icon_param && e.icon_by_value) {
        const value = (params || {})[e.icon_param];
        const art = e.icon_by_value[value];
        if (art) return art;
      }
      return e.icon;
    },
    isUnique: function (id) {
      const e = entitiesById[id];
      return !!(e && e.unique);
    },
    params: function (id) {
      const e = entitiesById[id];
      return e ? (e.params || {}) : {};
    },
    defaultParams: function (id) {
      const out = {};
      const params = window.Palette.params(id);
      Object.keys(params).forEach(function (k) {
        out[k] = params[k].default;
      });
      return out;
    },

    // ------------------------------------------------------------ layers
    // Which plane of the level a thing lives on. Blocks and Things are one
    // layer each — a tile is an [x,y,id] triple with nowhere to put a tag —
    // so only background props subdivide, and only those carry a `layer`.
    layers: DATA.layers,
    baseLayers: BASE_LAYERS,

    layer: function (id) { return layersById[id] || null; },
    layersHolding: function (holds) {
      return DATA.layers.filter(function (l) { return l.holds === holds; });
    },

    // Replace the whole layer list, in place, and rebuild the id index. Called
    // once on boot with the persisted list, and again after every edit in the
    // Layers panel. The array identity never changes, so anything holding
    // `Palette.layers` keeps working.
    setLayers: function (arr) {
      DATA.layers.length = 0;
      (arr || []).forEach(function (l) { DATA.layers.push(l); });
      reindexLayers();
    },

    // Whether the current layer list differs from the one this editor shipped
    // with — the exporter uses this to decide if data/palette.json belongs in
    // the zip.
    layersDifferFromShipped: function () {
      return JSON.stringify(DATA.layers) !== JSON.stringify(BASE_LAYERS);
    },
    // Where a thing goes when nothing says otherwise: the first layer that
    // holds its sort. Props placed before layers existed land on the near one.
    defaultLayerFor: function (holds) {
      if (holds === "decor") return defaultDecorLayer();
      const first = DATA.layers.find(function (l) { return l.holds === holds; });
      return first ? first.id : null;
    },

    // Which layer a prop is on. THE rule, and the only place it is written: a
    // prop with no `layer` of its own belongs to the first background layer.
    // The game says the same thing in PaletteRegistry.decor_parallax, and
    // saying it twice on this side is how a prop ends up ignoring its layer —
    // see docs/GOTCHAS.md, "One concept, one place".
    layerOf: function (item) {
      return (item && item.layer) || defaultDecorLayer();
    },
    // How far away a prop reads. Its layer decides, and only its layer: a prop
    // used to be able to carry its own, and every prop created before layers
    // silently did — which meant the layer never got a look in. A stray one on
    // an old item is ignored rather than honoured, so those props join the
    // layer they are on instead of being stuck at whatever was copied onto
    // them. The game applies the same rule in PaletteRegistry.decor_parallax.
    decorParallax: function (item) {
      const l = layersById[window.Palette.layerOf(item)];
      return l && l.parallax !== undefined ? Number(l.parallax) : 0.9;
    },

    // ------------------------------------------------------------ decor
    // Background props: placed in pixels, never collidable, never affect play.
    decor: DATA.decor || [],
    decorParams: DATA.decor_params || {},

    decorItem: function (id) { return decorById[id] || null; },
    hasDecor: function (id) { return !!decorById[id]; },
    decorLabel: function (id) {
      const item = decorById[id];
      return item ? item.label : id;
    },
    decorSprite: function (id) {
      const item = decorById[id];
      return item ? item.sprite : null;
    },
    defaultDecorParams: function () {
      const out = {};
      const params = DATA.decor_params || {};
      Object.keys(params).forEach(function (k) { out[k] = params[k].default; });
      return out;
    },

    // ------------------------------------------------------------ dialogue
    dialogueLineParams: DATA.dialogue_line_params || {},

    defaultDialogueLine: function () {
      const out = {};
      const params = DATA.dialogue_line_params || {};
      Object.keys(params).forEach(function (k) { out[k] = params[k].default; });
      return out;
    },

    // ------------------------------------------------------------ triggers
    // A param is a "trigger" if it wires entities to each other by flag name.
    // They're grouped separately in the inspector so the everyday settings
    // (how tough, how wide) don't get buried under wiring.
    isTriggerParam: function (key, spec) {
      return (spec && spec.type === "flag")
        || key === "requires_flag"
        || key.indexOf("sets_flag") === 0;
    },

    // Every flag name mentioned anywhere in a level, for autocomplete. Typing a
    // flag name twice and misspelling it once is the obvious way to lose an
    // afternoon, so the editor offers what already exists.
    knownFlags: function (doc) {
      const found = {};
      const note = function (v) {
        if (typeof v === "string" && v.trim()) found[v.trim()] = true;
      };
      (doc.entities || []).forEach(function (e) {
        Object.keys(e.params || {}).forEach(function (k) {
          const spec = (window.Palette.params(e.type) || {})[k];
          if (window.Palette.isTriggerParam(k, spec)) note(e.params[k]);
        });
        (e.params && e.params.dialogue ? e.params.dialogue : []).forEach(function (line) {
          note(line.when);
          note(line.unless);
          note(line.set);
        });
      });
      return Object.keys(found).sort();
    },

    // Entities grouped for the palette rail, in the order the JSON lists them.
    byCategory: function () {
      const groups = [];
      const seen = {};
      (DATA.categories || []).forEach(function (c) {
        seen[c.id] = { id: c.id, label: c.label, items: [] };
        groups.push(seen[c.id]);
      });
      DATA.entities.forEach(function (e) {
        const cat = e.category || "other";
        if (!seen[cat]) {
          seen[cat] = { id: cat, label: cat, items: [] };
          groups.push(seen[cat]);
        }
        seen[cat].items.push(e);
      });
      return groups.filter(function (g) { return g.items.length > 0; });
    },
  };
})();
