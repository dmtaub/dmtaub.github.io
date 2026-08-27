// Pictures Amy brings in herself, to use as background scenery.
//
// A level holds a picture's name, never its bytes; the bytes live in their own
// store and are written into art/backgrounds/ on export. Everything here exists
// to keep those two apart.
//
// The whole path, and what happens when a picture goes missing:
// docs/BACKGROUND_PICTURES.md

(function () {
  "use strict";

  // Under a browser's per-record limits, and still big enough to look like a
  // photo. Past this the store fails in ways that are hard to explain.
  const MAX_BYTES = 6 * 1024 * 1024;
  // Where an imported picture lands inside the game's art folder. The exported
  // level names it as "backgrounds/<id>", which is what Godot loads.
  const PREFIX = "backgrounds/";
  // A newly imported picture lands about this wide: a 3000-pixel photo at 1:1
  // fills the level and reads as a bug rather than a background.
  const TARGET_WIDTH = 12 * 32;

  const records = {};      // id -> {id, name, data, w, h}
  const elements = {};     // id -> HTMLImageElement, once decoded

  function decode(record) {
    return new Promise(function (resolve) {
      const img = new Image();
      img.onload = function () {
        elements[record.id] = img;
        resolve(img);
      };
      img.onerror = function () { resolve(null); };
      img.src = record.data;
    });
  }

  function uniqueId(base) {
    let id = window.LevelUtil.slugify(base);
    let n = 2;
    while (records[id]) {
      id = window.LevelUtil.slugify(base) + "_" + n;
      n++;
    }
    return id;
  }

  function readAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(new Error("unreadable")); };
      reader.readAsDataURL(file);
    });
  }

  // Turn a data URL back into the bytes the ZIP writer wants.
  function dataUrlToBytes(dataUrl) {
    const comma = dataUrl.indexOf(",");
    const binary = window.atob(dataUrl.slice(comma + 1));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  }

  const ImageLibrary = {
    // Load everything already in the store and decode it, so the first draw
    // after boot has real pictures rather than placeholders.
    async init() {
      const rows = await window.Storage.listImages();
      rows.forEach(function (r) { records[r.id] = r; });
      await Promise.all(rows.map(decode));
      return rows.length;
    },

    list: function () {
      return Object.keys(records).sort().map(function (id) { return records[id]; });
    },

    has: function (id) { return !!records[id]; },
    record: function (id) { return records[id] || null; },
    element: function (id) { return elements[id] || null; },

    // "backgrounds/kitchen.jpg" <-> "kitchen". The level stores the long form,
    // extension and all, because that is the file the game loads out of art/;
    // everything in here uses the short one.
    idFromSprite: function (sprite) {
      const s = String(sprite || "");
      if (s.indexOf(PREFIX) !== 0) return "";
      return s.slice(PREFIX.length).replace(/\.[a-z0-9]+$/i, "");
    },
    spriteFor: function (id) {
      const r = records[id];
      return PREFIX + id + (r ? extensionFor(r) : ".png");
    },

    // Returns {ok, id, record, problem}. Never throws — this is driven by a
    // file picker, and every failure here has a sentence a child can read.
    async add(file) {
      if (!/^image\//.test(file.type || "")) {
        return { ok: false, problem: file.name + " isn't a picture." };
      }
      if (file.size > MAX_BYTES) {
        return {
          ok: false,
          problem: file.name + " is too big (" + Math.round(file.size / 1024 / 1024)
            + "MB). Pictures need to be under 6MB — make it smaller and try again.",
        };
      }

      let dataUrl;
      try {
        dataUrl = await readAsDataUrl(file);
      } catch (err) {
        return { ok: false, problem: "Couldn't read " + file.name + "." };
      }

      const id = uniqueId(file.name.replace(/\.[a-z0-9]+$/i, "") || "picture");
      const record = { id: id, name: file.name, data: dataUrl, w: 0, h: 0 };
      const img = await decode(record);
      if (!img) {
        return { ok: false, problem: file.name + " isn't a picture this browser can open." };
      }
      record.w = img.naturalWidth || img.width;
      record.h = img.naturalHeight || img.height;
      records[id] = record;

      const saved = await window.Storage.saveImage(record);
      return { ok: true, id: id, record: record, saved: saved };
    },

    async remove(id) {
      delete records[id];
      delete elements[id];
      await window.Storage.deleteImage(id);
    },

    // The scale that makes a newly placed picture a sensible size on the grid.
    startingScale: function (id) {
      const r = records[id];
      if (!r || !r.w) return 1;
      const s = TARGET_WIDTH / r.w;
      return Math.round(Math.min(1, Math.max(0.05, s)) * 1000) / 1000;
    },

    // Everything a level actually references, for export and for the "this
    // picture is missing" check.
    usedIn: function (doc) {
      const out = {};
      (doc.decor || []).forEach(function (item) {
        if (item.type !== "image") return;
        const id = ImageLibrary.idFromSprite(item.sprite);
        if (id) out[id] = true;
      });
      return Object.keys(out);
    },

    // {"backgrounds/x.png": "data:image/png;base64,..."} for everything a level
    // uses. This is what goes to the game when playing: the picture has no file
    // yet, so the bytes travel with the level.
    payloadFor: function (doc) {
      const out = {};
      (doc.decor || []).forEach(function (item) {
        if (item.type !== "image" || !item.sprite) return;
        const record = records[ImageLibrary.idFromSprite(item.sprite)];
        if (record) out[item.sprite] = record.data;
      });
      return out;
    },

    // [{name, bytes}] for the export ZIP. Skips ids whose bytes are gone.
    filesFor: function (ids) {
      const out = [];
      ids.forEach(function (id) {
        const r = records[id];
        if (!r) return;
        out.push({
          name: "art/" + PREFIX + id + extensionFor(r),
          bytes: dataUrlToBytes(r.data),
        });
      });
      return out;
    },

    PREFIX: PREFIX,
    MAX_BYTES: MAX_BYTES,
  };

  // Godot loads decor art as res://art/<sprite>.png, so a JPEG has to keep its
  // own extension and the level has to name it. Only PNG rides the plain path.
  function extensionFor(record) {
    return /^data:image\/(jpeg|jpg)/i.test(record.data) ? ".jpg" : ".png";
  }

  ImageLibrary.extensionFor = extensionFor;

  window.ImageLibrary = ImageLibrary;
})();
