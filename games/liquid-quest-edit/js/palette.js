// Thin accessor over the generated palette.data.js, which is copied verbatim
// from the game's data/palette.json. Nothing here invents content — if a tile
// or entity is missing, add it to data/palette.json and re-run
// buildtools/gen_web_assets.py.

(function () {
  "use strict";

  const DATA = window.PALETTE_DATA || { tiles: [], entities: [], categories: [] };

  const tilesById = {};
  DATA.tiles.forEach(function (t) { tilesById[t.id] = t; });

  const entitiesById = {};
  DATA.entities.forEach(function (e) { entitiesById[e.id] = e; });

  const decorById = {};
  (DATA.decor || []).forEach(function (item) { decorById[item.id] = item; });

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
      Object.keys(params).forEach(function (k) {
        out[k] = params[k].default;
      });
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
