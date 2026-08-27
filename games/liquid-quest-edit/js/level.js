// The level model. Mirrors scripts/level/LevelData.gd exactly — same JSON, same
// validation rules — so a level exported here drops straight into the game.
//
// Tiles live in a Map keyed "x,y" while editing (fast lookup, fast paint) and
// serialise back to the sparse [[x, y, id], ...] array the game reads.

(function () {
  "use strict";

  const FORMAT_VERSION = 1;
  const TILE = 32;
  const T_EMPTY = 0;

  function key(x, y) {
    return x + "," + y;
  }

  class LevelDoc {
    constructor(data) {
      data = data || {};
      this.format_version = data.format_version || FORMAT_VERSION;
      this.id = data.id || "new_meal";
      this.name = data.name || "New Meal";
      this.tile_size = data.tile_size || TILE;
      this.width = data.width || 60;
      this.height = data.height || 24;
      this.theme = data.theme || "kitchen";
      this.background_top = data.background_top || "#3a4463";
      this.background_bottom = data.background_bottom || "#171a26";
      this.par_time = data.par_time === undefined ? 180 : data.par_time;
      // Editor-only, stripped on export: marks a meal that is designed but has
      // no level file yet, so the manifest can keep listing it.
      this.planned = !!data.planned;

      this.tiles = new Map();
      (data.tiles || []).forEach(function (t) {
        if (Array.isArray(t) && t.length >= 3) this.tiles.set(key(t[0], t[1]), t[2] | 0);
      }, this);

      // Background props. Pixel positions, not tile coords — see palette.json.
      this.decor = (data.decor || []).map(function (d) {
        return Object.assign({}, d, { x: Number(d.x) || 0, y: Number(d.y) || 0 });
      });

      this.entities = (data.entities || []).map(function (e) {
        return {
          type: e.type,
          x: e.x | 0,
          y: e.y | 0,
          params: Object.assign({}, e.params || {}),
        };
      });

      // Anything this version doesn't know about is carried through untouched,
      // so a level survives the format growing new fields.
      const known = ["format_version", "id", "name", "tile_size", "width", "height",
        "theme", "background_top", "background_bottom", "par_time", "tiles",
        "entities", "decor", "planned"];
      this._extra = {};
      Object.keys(data).forEach(function (k) {
        if (known.indexOf(k) === -1) this._extra[k] = data[k];
      }, this);
    }

    // ------------------------------------------------------------ tiles
    getTile(x, y) {
      const v = this.tiles.get(key(x, y));
      return v === undefined ? T_EMPTY : v;
    }

    setTile(x, y, id) {
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) return false;
      const k = key(x, y);
      if (id === T_EMPTY) {
        return this.tiles.delete(k);
      }
      if (this.tiles.get(k) === id) return false;
      this.tiles.set(k, id);
      return true;
    }

    // ------------------------------------------------------------ entities
    addEntity(type, x, y, params) {
      const e = { type: type, x: x | 0, y: y | 0, params: Object.assign({}, params || {}) };
      this.entities.push(e);
      return e;
    }

    entitiesAt(x, y) {
      return this.entities.filter(function (e) {
        return e.x === x && e.y === y;
      });
    }

    removeEntity(entity) {
      const i = this.entities.indexOf(entity);
      if (i >= 0) {
        this.entities.splice(i, 1);
        return true;
      }
      return false;
    }

    // ------------------------------------------------------------ decor
    addDecor(type, x, y, params) {
      const item = Object.assign(
        { type: type, x: x, y: y }, window.Palette.defaultDecorParams(), params || {});
      this.decor.push(item);
      return item;
    }

    removeDecor(item) {
      const i = this.decor.indexOf(item);
      if (i >= 0) {
        this.decor.splice(i, 1);
        return true;
      }
      return false;
    }

    removeEntitiesAt(x, y) {
      const before = this.entities.length;
      this.entities = this.entities.filter(function (e) {
        return !(e.x === x && e.y === y);
      });
      return before - this.entities.length;
    }

    findEntity(type) {
      return this.entities.find(function (e) {
        return e.type === type;
      }) || null;
    }

    countEntity(type) {
      return this.entities.filter(function (e) { return e.type === type; }).length;
    }

    // ------------------------------------------------------------ validation
    // Same rules as LevelData.validate() in GDScript. Returned as friendly
    // objects because the editor shows these to a 10-year-old, not a compiler.
    validate() {
      const problems = [];
      if (!this.findEntity("player_spawn")) {
        problems.push({
          level: "error", code: "no_spawn",
          text: "There's no Start. Drop one where you want to begin.",
        });
      }
      if (this.countEntity("player_spawn") > 1) {
        problems.push({
          level: "error", code: "many_spawns",
          text: "There's more than one Start. Keep just one.",
        });
      }
      if (!this.findEntity("level_exit") && !this.findEntity("boss_arena")) {
        problems.push({
          level: "error", code: "no_ending",
          text: "There's no way to finish. Add an Exit or a Boss Arena.",
        });
      }
      if (this.tiles.size === 0) {
        problems.push({
          level: "error", code: "no_ground",
          text: "There's nothing to stand on yet. Paint some Counter.",
        });
      }

      this.decor.forEach(function (d) {
        // An imported picture isn't in the palette — it's named by file. A
        // level can legitimately arrive on a machine that doesn't have the
        // picture, so that's a warning about what to do, not "unknown thing".
        if (d.type === "image") {
          const lib = window.ImageLibrary;
          const id = lib ? lib.idFromSprite(d.sprite) : "";
          if (!id) {
            problems.push({
              level: "error", code: "picture_no_file",
              text: "There's a background picture that doesn't say which file it is.",
            });
          } else if (lib && !lib.has(id)) {
            problems.push({
              level: "warn", code: "picture_missing",
              text: "The picture \"" + id + "\" isn't in this browser. Add it again "
                + "under Background to see it — the level still remembers where it goes.",
            });
          }
          return;
        }
        if (!window.Palette.hasDecor(d.type)) {
          problems.push({
            level: "error", code: "unknown_decor",
            text: "Don't know what background thing a \"" + d.type + "\" is.",
          });
        }
      });

      const known = window.Palette.entityIds();
      this.entities.forEach(function (e) {
        if (e.type !== "player_spawn" && known.indexOf(e.type) === -1) {
          problems.push({
            level: "error", code: "unknown_entity",
            text: "Don't know what a \"" + e.type + "\" is.",
          });
        }
      });

      // Triggers: a "waits for" name that nothing ever sets is a level that
      // silently never opens. This is the single most likely way to build a
      // broken level once triggers exist, so it gets a real check.
      const setFlags = {};
      const waitFlags = [];
      this.entities.forEach(function (e) {
        const specs = window.Palette.params(e.type) || {};
        Object.keys(e.params || {}).forEach(function (k) {
          const v = e.params[k];
          if (typeof v !== "string" || !v.trim()) return;
          if (k.indexOf("sets_flag") === 0) setFlags[v.trim()] = true;
          else if (k === "requires_flag") {
            waitFlags.push({ flag: v.trim(), who: window.Palette.label(e.type) });
          }
          void specs;
        });
        ((e.params || {}).dialogue || []).forEach(function (line) {
          if (line.set && String(line.set).trim()) setFlags[String(line.set).trim()] = true;
          ["when", "unless"].forEach(function (key) {
            if (line[key] && String(line[key]).trim()) {
              waitFlags.push({ flag: String(line[key]).trim(), who: "a line of dialogue" });
            }
          });
        });
      });
      waitFlags.forEach(function (w) {
        // global/ names are set by the game itself (global/chef_freed), so they
        // can't be checked from inside one level.
        if (w.flag.indexOf("global/") === 0) return;
        if (!setFlags[w.flag]) {
          problems.push({
            level: "warn", code: "dangling_trigger",
            text: "Nothing ever triggers \"" + w.flag + "\", so "
              + w.who + " will never show up.",
          });
        }
      });

      this.entities.forEach(function (e) {
        ((e.params || {}).dialogue || []).forEach(function (line, i) {
          if (!String(line.text || "").trim()) {
            problems.push({
              level: "warn", code: "empty_dialogue",
              text: window.Palette.label(e.type) + " has a line " + (i + 1)
                + " with no words in it.",
            });
          }
          if (line.give_kind && line.give_kind !== "none"
              && !String(line.give_id || "").trim()) {
            problems.push({
              level: "warn", code: "give_nothing",
              text: window.Palette.label(e.type) + " gives a " + line.give_kind
                + " but doesn't say which one.",
            });
          }
        });
      });

      // Warnings: things that are legal but almost certainly a mistake.
      const spawn = this.findEntity("player_spawn");
      if (spawn && this.getTile(spawn.x, spawn.y) !== T_EMPTY) {
        problems.push({
          level: "warn", code: "spawn_in_wall",
          text: "The Start is inside a block. You'd be stuck.",
        });
      }
      if (spawn && !this._hasFloorBelow(spawn.x, spawn.y)) {
        problems.push({
          level: "warn", code: "spawn_over_nothing",
          text: "There's no floor under the Start. You'd fall forever.",
        });
      }
      this.entities.forEach(function (e) {
        if (e.x < 0 || e.y < 0 || e.x >= this.width || e.y >= this.height) {
          problems.push({
            level: "warn", code: "outside",
            text: "A " + window.Palette.label(e.type) + " is outside the level.",
          });
        }
      }, this);

      return problems;
    }

    _hasFloorBelow(x, y) {
      for (let probe = y + 1; probe < this.height; probe++) {
        const t = this.getTile(x, probe);
        if (t !== T_EMPTY && window.Palette.tileIsSolid(t)) return true;
      }
      return false;
    }

    // ------------------------------------------------------------ serialise
    toJSON() {
      const tiles = [];
      this.tiles.forEach(function (id, k) {
        const parts = k.split(",");
        tiles.push([parseInt(parts[0], 10), parseInt(parts[1], 10), id]);
      });
      // Sorted so a re-export produces a stable diff in git.
      tiles.sort(function (a, b) {
        return a[0] - b[0] || a[1] - b[1];
      });

      const out = {
        format_version: this.format_version,
        id: this.id,
        name: this.name,
        tile_size: this.tile_size,
        width: this.width,
        height: this.height,
        theme: this.theme,
        background_top: this.background_top,
        background_bottom: this.background_bottom,
        par_time: this.par_time,
        tiles: tiles,
        entities: this.entities.map(function (e) {
          return { type: e.type, x: e.x, y: e.y, params: Object.assign({}, e.params) };
        }),
        decor: this.decor.map(function (d) {
          // Rounded: sub-pixel placement is noise in a diff and invisible on screen.
          return Object.assign({}, d, {
            x: Math.round(d.x * 10) / 10,
            y: Math.round(d.y * 10) / 10,
          });
        }),
      };
      Object.keys(this._extra).forEach(function (k) {
        out[k] = this._extra[k];
      }, this);
      return out;
    }

    // Full state for the undo stack and for storage. Includes editor-only bits.
    snapshot() {
      const s = this.toJSON();
      s.planned = this.planned;
      return s;
    }

    clone() {
      return new LevelDoc(JSON.parse(JSON.stringify(this.snapshot())));
    }

    // The text written into levels/<id>.json.
    exportText() {
      return JSON.stringify(this.toJSON(), null, "\t") + "\n";
    }
  }

  // Ids have to be safe as filenames and as Godot keys.
  function slugify(text) {
    return String(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "meal";
  }

  window.LevelDoc = LevelDoc;
  window.LevelUtil = { slugify: slugify, TILE: TILE, T_EMPTY: T_EMPTY };
})();
