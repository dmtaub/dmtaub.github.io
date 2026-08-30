// The editing surface: tools, pointer handling, pan/zoom, undo/redo.
//
// Deliberately mouse-and-touch first with no typing anywhere in the build loop —
// pick a thing from the rail, drag on the grid. Typing only ever happens in the
// inspector, and only for things that genuinely are text.

(function () {
  "use strict";

  const TILE = 32;
  // The layer picker's first entry, and where the editor starts. Not a plane —
  // nothing is ever placed *on* it and nothing carries it as its `layer` — but
  // a view of every plane at once: nothing is faded, anything can be picked,
  // and a box catches whatever is inside it whichever plane it belongs to.
  // Deliberately not in data/palette.json: the game reads that file, and a
  // layer there means a parallax and a draw order, which this has neither of.
  const ALL_LAYERS = "all";
  const MAX_UNDO = 60;
  // How far the pointer may wander and still count as a click rather than a drag.
  const CLICK_SLOP = 3;

  class Editor {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.camera = new window.Render.Camera();
      this.doc = new window.LevelDoc();
      this.brush = { kind: "move" };
      // The editor works one plane at a time. The active layer decides what a
      // click or a box can catch and what a brush puts down; everything else is
      // drawn faded and left alone, so you can see your bearings without
      // picking up the scenery by accident. See palette.json "layers".
      this.activeLayer = ALL_LAYERS;
      // What's picked, however much of it: blocks by cell, entities and props by
      // identity. One truth — `selected` below is derived from it, never set —
      // because two of them would disagree on the paths nobody tests.
      this.selection = { tiles: [], entities: [], decor: [] };
      this._marquee = null;      // world-pixel rect while the box is being dragged
      this.hover = null;         // tile coords
      this.hoverPx = null;       // world pixels, for free-positioned decor
      this.showGrid = true;
      // Off-layer things are faded by default so they can't be mistaken for
      // something you can edit. Flip this on to see them at full strength —
      // handy for lining a plane up against the ones in front of or behind it.
      this.showOtherLayers = false;
      // Preview looks at the level the way the game does — parallax and all —
      // and edits nothing. See onPreview for what the page does around it.
      this.preview = false;

      this._undo = [];
      this._redo = [];
      this._strokeOpen = false;
      this._painted = null;
      this._panning = false;
      // The selection being carried by Move: blocks are lifted out of the level
      // at the first real movement and put back down on release, so dragging
      // across other blocks doesn't smear.
      this._moving = null;
      this._pressAt = null;      // where a Select press started, to tell click from drag
      this._spaceDown = false;
      this._pointerDown = false;
      this._changedThisPress = false;
      // Lets a run of keystrokes in one inspector field be one undo step.
      this._undoTag = null;

      this.onChange = function () {};
      this.onSelect = function () {};
      this.onSelectionChanged = function () {};
      this.onLayer = function () {};
      this.onPreview = function () {};

      this._bind();
      this.resize();
    }

    // ------------------------------------------------------------ selection
    // The inspector can only ever show one thing's settings, so it asks for one
    // thing. Derived rather than stored: a selection of exactly one entity or
    // prop is that thing, and anything else — nothing, a block, a crowd — isn't.
    get selected() {
      const s = this.selection;
      if (s.tiles.length || s.entities.length + s.decor.length !== 1) return null;
      return s.entities[0] || s.decor[0];
    }

    setSelection(tiles, entities, decor) {
      this.selection = {
        tiles: tiles || [], entities: entities || [], decor: decor || [],
      };
      // A new selection ends whatever the inspector was in the middle of, so
      // the next keystroke starts its own undo step rather than joining the
      // last field's.
      this._undoTag = null;
      this.onSelect(this.selected);
      this.onSelectionChanged(this.selectionCount());
    }

    // One entity or prop, the way clicking a single thing has always worked.
    selectOnly(obj) {
      if (!obj) return this.setSelection([], [], []);
      const isDecor = (this.doc.decor || []).indexOf(obj) !== -1;
      return this._pickHit({ kind: isDecor ? "decor" : "entity", item: obj });
    }

    clearSelection() {
      if (!this.hasSelection()) {
        this._undoTag = null;   // setSelection would have done this
        return false;
      }
      this.setSelection([], [], []);
      return true;
    }

    hasSelection() {
      return this.selectionCount() > 0;
    }

    selectionCount() {
      const s = this.selection;
      return s.tiles.length + s.entities.length + s.decor.length;
    }

    // True when every picked thing is the same sort of thing — the case where
    // editing them all at once means something.
    selectionKind() {
      const s = this.selection;
      const groups = [s.tiles.length && "tile", s.entities.length && "entity",
        s.decor.length && "decor"].filter(Boolean);
      if (groups.length !== 1) return null;
      const items = s.entities.length ? s.entities : s.decor.length ? s.decor : null;
      if (!items) return { kind: "tile", type: null, items: s.tiles };
      const type = items[0].type;
      if (items.some(function (i) { return i.type !== type; })) return null;
      return { kind: groups[0], type: type, items: items };
    }

    // ------------------------------------------------------------ layers
    setLayer(id) {
      if (!id || id === this.activeLayer) return false;
      this.activeLayer = id;
      // What was picked lives on the layer you just left.
      this._marquee = null;
      this.clearSelection();
      this.onLayer(id);
      this.draw();
      return true;
    }

    // Every plane at once — see ALL_LAYERS.
    isAllLayers() {
      return this.activeLayer === ALL_LAYERS;
    }

    // What sort of thing the active layer holds: "tile", "entity" or "decor".
    // Null on All, which holds all three — every caller pairs this with
    // isAllLayers() rather than treating null as "nothing".
    layerHolds() {
      const l = window.Palette.layer(this.activeLayer);
      return l ? l.holds : null;
    }

    // Is this thing on the layer being worked on? Blocks and entities are one
    // layer each, so they answer on their sort alone; props answer on their own
    // `layer`, defaulting to the near one for props placed before layers.
    onActiveLayer(kind, item) {
      if (this.isAllLayers()) return true;
      const holds = this.layerHolds();
      if (kind !== holds) return false;
      if (kind !== "decor") return true;
      return window.Palette.layerOf(item) === this.activeLayer;
    }

    // ------------------------------------------------------------ document
    setDoc(doc, opts) {
      // Anything half-done belongs to the document being replaced. A block still
      // being carried would otherwise be put down in the new one on release,
      // painting a stray block into a level that never had it.
      this._abandonGesture();
      this.doc = doc;
      this.setSelection([], [], []);
      this._undo = [];
      this._redo = [];
      if (!opts || opts.recenter !== false) this.frameLevel();
      this.draw();
    }

    frameLevel() {
      // Fit the whole level on screen — a 232-tile level really does need to
      // zoom out a long way — then centre it vertically so it isn't pinned to
      // the top of an otherwise empty stage.
      const rect = this.canvas.getBoundingClientRect();
      const fitX = rect.width / (this.doc.width * TILE + 64);
      const fitY = rect.height / (this.doc.height * TILE + 64);
      this.camera.zoom = Math.min(1, Math.max(0.08, Math.min(fitX, fitY)));
      const levelW = this.doc.width * TILE;
      const levelH = this.doc.height * TILE;
      this.camera.x = (levelW - rect.width / this.camera.zoom) / 2;
      this.camera.y = (levelH - rect.height / this.camera.zoom) / 2;
    }

    // ------------------------------------------------------------ undo/redo
    pushUndo() {
      this._undo.push(JSON.stringify(this.doc.snapshot()));
      if (this._undo.length > MAX_UNDO) this._undo.shift();
      this._redo.length = 0;
      this._undoTag = null;
    }

    // One step per field, not one per keystroke. The inspector types into a
    // value character by character; without this, undoing a name typed into the
    // group panel would take it back one letter at a time.
    pushUndoFor(tag) {
      if (tag && this._undoTag === tag) return false;
      this.pushUndo();
      this._undoTag = tag || null;
      return true;
    }

    undo() {
      if (!this._undo.length) return false;
      this._abandonGesture();
      this._redo.push(JSON.stringify(this.doc.snapshot()));
      const state = this._undo.pop();
      this.doc = new window.LevelDoc(JSON.parse(state));
      this.setSelection([], [], []);
      this.draw();
      this.onChange();
      return true;
    }

    redo() {
      if (!this._redo.length) return false;
      this._abandonGesture();
      this._undo.push(JSON.stringify(this.doc.snapshot()));
      const state = this._redo.pop();
      this.doc = new window.LevelDoc(JSON.parse(state));
      this.setSelection([], [], []);
      this.draw();
      this.onChange();
      return true;
    }

    // Drop everything a press was in the middle of, without applying it. Used
    // wherever this.doc is about to be swapped out from under a drag.
    _abandonGesture() {
      this._moving = null;
      this._pressAt = null;
      this._strokeOpen = false;
      this._painted = null;
      this._changedThisPress = false;
      this._marquee = null;
      // The selection holds the actual entity and decor objects. Undo rebuilds
      // the document from JSON, so holding on to them would leave the highlight
      // pointing at things that are no longer in the level.
      this.clearSelection();
    }

    canUndo() { return this._undo.length > 0; }
    canRedo() { return this._redo.length > 0; }

    // ------------------------------------------------------------ tools
    setBrush(brush) {
      // Reaching for a tool is as clear a way of saying "done looking" as
      // pressing the button again.
      if (this.preview) this.setPreview(false);
      this.brush = brush;
      this.canvas.style.cursor =
        brush.kind === "select" || brush.kind === "move" ? "default" : "crosshair";
      // Select and Move are two halves of one job — pick things, then shift
      // them — so switching between those two keeps what's picked. Reaching for
      // anything else means you're done with it.
      if (brush.kind !== "select" && brush.kind !== "move") {
        this._marquee = null;
        this.clearSelection();
      }
      this.draw();
    }

    applyAt(tx, ty, additive) {
      const b = this.brush;
      if (b.kind === "tile") {
        return this.doc.setTile(tx, ty, additive ? b.id : 0);
      }
      if (b.kind === "erase") {
        // On a plane, rubs out only what that plane holds, so sweeping the
        // eraser over a wall doesn't take the scenery in front of it with it.
        // On All there is no such plane and the eraser is omnivorous — that is
        // what picking All says you want, and an eraser that did nothing there
        // would be worse than one that takes everything under it.
        const all = this.isAllLayers();
        const holds = this.layerHolds();
        let hit = false;
        if (all || holds === "tile") hit = this.doc.setTile(tx, ty, 0) || hit;
        if (all || holds === "entity") {
          hit = this.doc.removeEntitiesAt(tx, ty) > 0 || hit;
        }
        return hit;   // props are rubbed out by the direct hit in _paintCell
      }
      if (b.kind === "decor") {
        // Decor is placed where the pointer is, not snapped to the grid — it's
        // scenery, and making Amy fight a grid to nudge a plant would be silly.
        //
        // An imported picture carries its file and its own pixel size onto the
        // item; the palette's own props get theirs from the art, which the
        // editor always has.
        const extra = b.id === "image"
          ? { sprite: b.sprite, w: b.w, h: b.h, scale: b.scale }
          : {};
        // Stamped with the layer it was dropped on: that is what decides how
        // far away it reads, and what can pick it up again later. All isn't a
        // plane and can't be stamped, so a prop dropped there goes to the
        // default one — reaching for a prop normally moves you off All first
        // (layerForBrush), which is the path that actually runs.
        extra.layer = this.isAllLayers()
          ? window.Palette.defaultLayerFor("decor")
          : this.activeLayer;
        const item = this.doc.addDecor(
          b.id, this._lastWorld[0], this._lastWorld[1], extra);
        this.selectOnly(item);
        return true;
      }
      if (b.kind === "entity") {
        // Unique entities move rather than duplicate — you can only have one
        // Start, and dropping a second should mean "actually, put it here".
        if (window.Palette.isUnique(b.id)) {
          const existing = this.doc.findEntity(b.id);
          if (existing) {
            existing.x = tx;
            existing.y = ty;
            return true;
          }
        }
        const e = this.doc.addEntity(b.id, tx, ty, window.Palette.defaultParams(b.id));
        this.selectOnly(e);
        return true;
      }
      return false;
    }

    // ------------------------------------------------------------ pointer
    _bind() {
      const c = this.canvas;
      c.addEventListener("pointerdown", this._onDown.bind(this));
      c.addEventListener("pointermove", this._onMove.bind(this));
      window.addEventListener("pointerup", this._onUp.bind(this));
      c.addEventListener("pointerleave", function () {
        this.hover = null;
        this.draw();
      }.bind(this));
      c.addEventListener("wheel", this._onWheel.bind(this), { passive: false });
      c.addEventListener("contextmenu", function (ev) { ev.preventDefault(); });

      window.addEventListener("keydown", function (ev) {
        if (ev.code === "Space") this._spaceDown = true;
      }.bind(this));
      window.addEventListener("keyup", function (ev) {
        if (ev.code === "Space") this._spaceDown = false;
      }.bind(this));
      window.addEventListener("resize", this.resize.bind(this));

      // The canvas box also moves for reasons the window never hears about: a
      // dock filling up or emptying, a panel popping out, the hint bar growing
      // a second line. Each of those leaves the backing store sized for the box
      // it used to have, and the grid drawn into it comes out the wrong shape —
      // which is what an editor opening with squashed tiles was. Guarded on the
      // size actually differing, so re-measuring can't chase its own tail.
      if (window.ResizeObserver) {
        const self = this;
        new window.ResizeObserver(function () {
          const r = self.canvas.getBoundingClientRect();
          const was = self._cssSize;
          if (!was || Math.abs(was[0] - r.width) > 0.5
              || Math.abs(was[1] - r.height) > 0.5) {
            self.resize();
          }
        }).observe(this.canvas);
      }
    }

    _localPoint(ev) {
      const rect = this.canvas.getBoundingClientRect();
      return [ev.clientX - rect.left, ev.clientY - rect.top];
    }

    // ------------------------------------------------------------ preview
    setPreview(on) {
      this.preview = !!on;
      this._strokeOpen = false;
      this._marquee = null;
      this._pressAt = null;
      // Put down anything mid-move before the selection goes: otherwise the
      // blocks stay lifted out of the level and are simply gone.
      this._dropMoved();
      // Unconditionally, not clearSelection(): the panel has to be redrawn into
      // (or out of) its "having a look" form even when nothing was picked.
      this.setSelection([], [], []);
      this.hover = null;
      this.canvas.style.cursor = this.preview ? "grab" : "crosshair";
      this.onPreview(this.preview);
      this.draw();
    }

    _onDown(ev) {
      this.canvas.setPointerCapture(ev.pointerId);
      this._pointerDown = true;
      this._marqueeErase = false;
      this._changedThisPress = false;
      this._undoTag = null;
      const p = this._localPoint(ev);
      const tile = this.camera.toTile(p[0], p[1]);
      this._lastWorld = this.camera.toWorld(p[0], p[1]);
      this._lastPointer = p;

      // In preview the whole surface is a window you look through: drag to move
      // the camera, and nothing edits.
      if (this.preview) {
        this._panning = true;
        this.canvas.style.cursor = "grabbing";
        return;
      }

      // Right mouse, middle mouse, or space held all pan the camera — the same
      // "look around" gesture the Look tool gives you, available in every mode.
      if (ev.button === 1 || ev.button === 2 || this._spaceDown) {
        this._panning = true;
        this.canvas.style.cursor = "grabbing";
        return;
      }

      // Select is one gesture with two meanings, decided on release: a click
      // picks the one thing under it, a drag boxes everything it covers. Both
      // edit nothing, so neither spends an undo step.
      if (this.brush.kind === "select") {
        this._beginMarquee(p);
        return;
      }

      // Move shifts whatever is picked. Pressing on something that isn't picked
      // picks just that first, so moving one thing is still one gesture. Pressing
      // on blank space falls back to Select's box — drag out a selection, then a
      // second drag on it moves it.
      if (this.brush.kind === "move") {
        const hit = this._thingAt(tile, p);
        if (!hit) {
          this._beginMarquee(p);
          return;
        }
        if (!this._isPicked(hit)) this._pickHit(hit);
        this._beginMove(tile);
        this.draw();
        return;
      }

      // Remove drags a stroke when it starts on something; starting on blank
      // space boxes a selection instead and removes the whole lot on release.
      if (this.brush.kind === "erase" && !this._thingAt(tile, p)) {
        this._marqueeErase = true;
        this._beginMarquee(p);
        return;
      }

      this.pushUndo();
      this._strokeOpen = true;
      this._eraseStroke = false;
      this._painted = new Set();
      this._paintCell(tile);
    }

    // ------------------------------------------------------------ marquee
    _beginMarquee(p) {
      this._pressAt = [p[0], p[1]];
      this._marquee = { from: [this._lastWorld[0], this._lastWorld[1]],
                        to: [this._lastWorld[0], this._lastWorld[1]] };
    }

    // Everything the box touches, in one go: blocks by the cells it covers,
    // entities by the cell they stand on, props by where they were placed.
    // A prop is caught by its centre rather than its picture, so a big
    // background image doesn't get swept up by a box drawn well clear of it.
    _commitMarquee() {
      const m = this._marquee;
      this._marquee = null;
      if (!m) return;

      const minX = Math.min(m.from[0], m.to[0]);
      const maxX = Math.max(m.from[0], m.to[0]);
      const minY = Math.min(m.from[1], m.to[1]);
      const maxY = Math.max(m.from[1], m.to[1]);

      const x0 = Math.max(0, Math.floor(minX / TILE));
      const x1 = Math.min(this.doc.width - 1, Math.floor(maxX / TILE));
      const y0 = Math.max(0, Math.floor(minY / TILE));
      const y1 = Math.min(this.doc.height - 1, Math.floor(maxY / TILE));

      // On a plane, only ever one sort of thing: the box works on the active
      // layer, so a wall and the window in front of it can no longer arrive in
      // the same selection by accident. On All they can, and should — a mixed
      // selection moves as one unit (see _moveTo).
      const all = this.isAllLayers();
      const holds = this.layerHolds();
      const tiles = [];
      if (all || holds === "tile") {
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            if (this.doc.getTile(x, y) !== 0) tiles.push([x, y]);
          }
        }
      }

      const entities = !(all || holds === "entity") ? [] : this.doc.entities.filter(function (e) {
        return e.x >= x0 && e.x <= x1 && e.y >= y0 && e.y <= y1;
      });

      const self = this;
      const decor = !(all || holds === "decor") ? [] : (this.doc.decor || []).filter(function (item) {
        return self.onActiveLayer("decor", item)
          && item.x >= minX && item.x <= maxX && item.y >= minY && item.y <= maxY;
      });

      this.setSelection(tiles, entities, decor);
      this.draw();
    }

    // Remove everything the box caught, as one undo step.
    deleteSelection() {
      if (!this.hasSelection()) return false;
      const s = this.selection;
      this.pushUndo();
      const doc = this.doc;
      s.tiles.forEach(function (t) { doc.setTile(t[0], t[1], 0); });
      s.entities.forEach(function (e) { doc.removeEntity(e); });
      s.decor.forEach(function (d) { doc.removeDecor(d); });
      this.clearSelection();
      this.draw();
      this.onChange();
      return true;
    }

    // ------------------------------------------------------------ picking
    // Entities are on the grid and sit in front, so they win a tie; blocks are
    // behind everything, so they come last. Otherwise clicking a plant that
    // happens to sit over a wall would pick up the wall.
    _thingAt(tile, screenPoint) {
      // On a plane only that plane answers. On All they all do, in the order
      // above: whichever is in front wins, so clicking a plant that happens to
      // sit over a wall picks the plant.
      const all = this.isAllLayers();
      const holds = this.layerHolds();
      if (all || holds === "entity") {
        const e = this._entityAt(tile);
        if (e) return { kind: "entity", item: e };
        if (!all) return null;
      }
      if (all || holds === "decor") {
        const d = window.Render.decorAt(this.doc, this.camera, screenPoint,
          this.onActiveLayer.bind(this, "decor"));
        if (d) return { kind: "decor", item: d };
        if (!all) return null;
      }
      if ((all || holds === "tile") && this.doc.getTile(tile[0], tile[1]) !== 0) {
        return { kind: "tile", item: [tile[0], tile[1]] };
      }
      return null;
    }

    _isPicked(hit) {
      const s = this.selection;
      if (hit.kind === "entity") return s.entities.indexOf(hit.item) !== -1;
      if (hit.kind === "decor") return s.decor.indexOf(hit.item) !== -1;
      return s.tiles.some(function (t) {
        return t[0] === hit.item[0] && t[1] === hit.item[1];
      });
    }

    _pickHit(hit) {
      if (hit.kind === "entity") return this.setSelection([], [hit.item], []);
      if (hit.kind === "decor") return this.setSelection([], [], [hit.item]);
      return this.setSelection([hit.item], [], []);
    }

    // ------------------------------------------------------------ moving
    // Everything picked shifts together. Blocks are lifted out of the level for
    // the duration rather than moved cell by cell, so dragging a shape across a
    // wall doesn't chew a channel through it — and so a shape shifted one cell
    // sideways doesn't eat its own tail.
    //
    // Nothing is disturbed and no undo step is spent until it actually moves,
    // so pressing on a wall and letting go stays a click.

    // `tile` is the press's own cell, never `hover`: hover is only updated by
    // pointermove, so a fresh press would begin from wherever the pointer
    // happened to be last and every delta would be off by that much.
    _beginMove(tile) {
      const doc = this.doc;
      this._moving = {
        lifted: false,
        fromTile: [tile[0], tile[1]],
        fromWorld: [this._lastWorld[0], this._lastWorld[1]],
        tileDelta: [0, 0],
        pixelDelta: [0, 0],
        tiles: this.selection.tiles.map(function (t) {
          return { x: t[0], y: t[1], id: doc.getTile(t[0], t[1]) };
        }),
        entities: this.selection.entities.map(function (e) {
          return { item: e, x: e.x, y: e.y };
        }),
        decor: this.selection.decor.map(function (d) {
          return { item: d, x: d.x, y: d.y };
        }),
      };
    }

    _moveTo(tile, world) {
      const m = this._moving;
      const dx = tile[0] - m.fromTile[0];
      const dy = tile[1] - m.fromTile[1];
      const px = world[0] - m.fromWorld[0];
      const py = world[1] - m.fromWorld[1];

      // A prop on its own is free-positioned and follows the pointer itself.
      // But a prop moving *with* blocks has to travel exactly as far as they
      // do, or the group comes apart: drag a window and the wall behind it two
      // and a half cells and the blocks snap three while the window keeps the
      // half, leaving it sixteen pixels out of the hole it was sitting in.
      const snapped = m.tiles.length > 0 || m.entities.length > 0;
      const moved = dx !== m.tileDelta[0] || dy !== m.tileDelta[1]
        || (!snapped && (px !== m.pixelDelta[0] || py !== m.pixelDelta[1]));
      if (!moved) return false;

      if (!m.lifted) {
        this.pushUndo();
        const doc = this.doc;
        // Every block out before any goes back in — see the note above.
        m.tiles.forEach(function (t) { doc.setTile(t.x, t.y, 0); });
        m.lifted = true;
      }
      m.tileDelta = [dx, dy];
      m.pixelDelta = [px, py];
      const propDx = snapped ? dx * TILE : px;
      const propDy = snapped ? dy * TILE : py;
      m.entities.forEach(function (e) {
        e.item.x = e.x + dx;
        e.item.y = e.y + dy;
      });
      m.decor.forEach(function (d) {
        d.item.x = d.x + propDx;
        d.item.y = d.y + propDy;
      });
      return true;
    }

    // Put the moved selection down where it now is. A move that would carry any
    // block off the level is refused outright and everything goes back where it
    // started — the group moves as one, so a prop that would have been fine on
    // its own comes back too. Dropping into nowhere shouldn't be how you delete
    // something, and there's a Remove for that.
    _dropMoved() {
      const m = this._moving;
      this._moving = null;
      if (!m || !m.lifted) return false;

      const doc = this.doc;
      const dx = m.tileDelta[0];
      const dy = m.tileDelta[1];
      const fits = m.tiles.every(function (t) {
        const x = t.x + dx;
        const y = t.y + dy;
        return x >= 0 && y >= 0 && x < doc.width && y < doc.height;
      });

      if (!fits) {
        m.tiles.forEach(function (t) { doc.setTile(t.x, t.y, t.id); });
        m.entities.forEach(function (e) { e.item.x = e.x; e.item.y = e.y; });
        m.decor.forEach(function (d) { d.item.x = d.x; d.item.y = d.y; });
        return true;
      }

      // Whatever was already standing where the blocks land is written over,
      // which is what dragging one block onto another has always done.
      m.tiles.forEach(function (t) { doc.setTile(t.x + dx, t.y + dy, t.id); });
      this.setSelection(
        m.tiles.map(function (t) { return [t.x + dx, t.y + dy]; }),
        m.entities.map(function (e) { return e.item; }),
        m.decor.map(function (d) { return d.item; }));
      return true;
    }

    _onMove(ev) {
      const p = this._localPoint(ev);
      const tile = this.camera.toTile(p[0], p[1]);
      const world = this.camera.toWorld(p[0], p[1]);
      const changedHover = !this.hover || this.hover[0] !== tile[0] || this.hover[1] !== tile[1];
      this.hover = tile;
      this.hoverPx = world;
      this._lastWorld = world;

      if (this._panning && this._lastPointer) {
        this.camera.x -= (p[0] - this._lastPointer[0]) / this.camera.zoom;
        this.camera.y -= (p[1] - this._lastPointer[1]) / this.camera.zoom;
        this._lastPointer = p;
        this.draw();
        return;
      }
      this._lastPointer = p;

      if (this._marquee && this._pointerDown) {
        this._marquee.to = [world[0], world[1]];
        this.draw();
        return;
      }

      if (this._moving && this._pointerDown) {
        if (this._moveTo(tile, world)) this.draw();
        return;
      }

      if (this._strokeOpen) {
        this._paintCell(tile);
        return;
      }

      if (changedHover) this.draw();
    }

    _onUp() {
      // Select closes before anything else looks at the press: it edits
      // nothing, so none of the "was this an edit?" bookkeeping applies to it.
      // Which of its two meanings this press had is decided here, by how far
      // the pointer travelled.
      if (this._marquee) {
        const from = this._pressAt;
        const to = this._lastPointer;
        const dragged = !from || !to
          || Math.abs(to[0] - from[0]) > CLICK_SLOP
          || Math.abs(to[1] - from[1]) > CLICK_SLOP;
        this._pressAt = null;
        if (dragged) {
          this._commitMarquee();
        } else {
          this._marquee = null;
          const tile = this.camera.toTile(to[0], to[1]);
          const hit = this._thingAt(tile, to);
          if (hit) this._pickHit(hit); else this.clearSelection();
          this.draw();
        }
        // Remove on blank space: box it, then remove the boxful at once.
        if (this._marqueeErase && this.hasSelection()) this.deleteSelection();
        this._marqueeErase = false;
        this._pointerDown = false;
        this._panning = false;
        return;
      }
      const droppedBlock = this._dropMoved();
      // _changedThisPress rather than _strokeOpen: placing an entity or a prop
      // closes the stroke as it lands (one per press, no smearing), so a stroke
      // that is already shut is exactly the case that still needs saving.
      const wasEditing = this._changedThisPress || this._strokeOpen || droppedBlock;
      this._changedThisPress = false;
      this._pointerDown = false;
      if (this._panning) {
        this.canvas.style.cursor = this.preview ? "grab"
          : (this.brush.kind === "select" || this.brush.kind === "move"
              ? "default" : "crosshair");
      }
      this._panning = false;
      this._strokeOpen = false;
      this._painted = null;
      if (droppedBlock) this.draw();
      if (wasEditing) this.onChange();
    }

    _paintCell(tile) {
      const k = tile[0] + "," + tile[1];
      if (this._painted && this._painted.has(k)) return;
      if (this._painted) this._painted.add(k);

      let changed;
      if (this._eraseStroke) {
        const all = this.isAllLayers();
        const holds = this.layerHolds();
        const removedTile = (all || holds === "tile")
          && this.doc.setTile(tile[0], tile[1], 0);
        const removedEnt = (all || holds === "entity")
          && this.doc.removeEntitiesAt(tile[0], tile[1]) > 0;
        // Only remove decor on a direct hit; a wide eraser sweep shouldn't take
        // out a window three tiles away just because its sprite is big.
        let removedDecor = false;
        if ((all || holds === "decor") && this._lastPointer) {
          const hit = window.Render.decorAt(this.doc, this.camera, this._lastPointer,
            this.onActiveLayer.bind(this, "decor"));
          if (hit) removedDecor = this.doc.removeDecor(hit);
        }
        changed = removedTile || removedEnt || removedDecor;
      } else {
        changed = this.applyAt(tile[0], tile[1], true);
        // Entities and decor are placed once per press, not smeared along a drag.
        if (this.brush.kind === "entity" || this.brush.kind === "decor") {
          this._strokeOpen = false;
        }
      }
      if (changed) {
        this._changedThisPress = true;
        this.draw();
      }
    }

    _entityAt(tile) {
      // Last drawn wins, so clicking picks the thing on top.
      for (let i = this.doc.entities.length - 1; i >= 0; i--) {
        const e = this.doc.entities[i];
        if (e.x === tile[0] && e.y === tile[1]) return e;
      }
      return null;
    }

    _onWheel(ev) {
      ev.preventDefault();
      const p = this._localPoint(ev);
      const before = this.camera.toWorld(p[0], p[1]);
      const factor = ev.deltaY < 0 ? 1.15 : 1 / 1.15;
      this.camera.zoom = Math.min(3, Math.max(0.08, this.camera.zoom * factor));
      const after = this.camera.toWorld(p[0], p[1]);
      // Keep the point under the cursor fixed while zooming.
      this.camera.x += before[0] - after[0];
      this.camera.y += before[1] - after[1];
      this.draw();
    }

    zoomBy(factor) {
      const rect = this.canvas.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const before = this.camera.toWorld(cx, cy);
      this.camera.zoom = Math.min(3, Math.max(0.08, this.camera.zoom * factor));
      const after = this.camera.toWorld(cx, cy);
      this.camera.x += before[0] - after[0];
      this.camera.y += before[1] - after[1];
      this.draw();
    }

    // ------------------------------------------------------------ paint
    resize() {
      const rect = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
      this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this._cssSize = [rect.width, rect.height];
      this.draw();
    }

    draw() {
      if (!window.Render.isReady()) return;
      const size = this._cssSize || [this.canvas.width, this.canvas.height];
      const fakeCanvas = { width: size[0], height: size[1] };
      window.Render.draw(this.ctx, fakeCanvas, this.doc, this.camera, {
        grid: this.showGrid,
        showOtherLayers: this.showOtherLayers,
        hover: this.hover,
        hoverPx: this.hoverPx,
        brush: this.brush,
        selected: this.selected,
        selection: this.selection,
        onLayer: this.onActiveLayer.bind(this),
        marquee: this._marquee,
        preview: this.preview,
        moving: this._moving && this._moving.lifted ? this._moving : null,
      });
    }
  }

  Editor.ALL_LAYERS = ALL_LAYERS;
  window.Editor = Editor;
})();
