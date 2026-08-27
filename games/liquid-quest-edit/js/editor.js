// The editing surface: tools, pointer handling, pan/zoom, undo/redo.
//
// Deliberately mouse-and-touch first with no typing anywhere in the build loop —
// pick a thing from the rail, drag on the grid. Typing only ever happens in the
// inspector, and only for things that genuinely are text.

(function () {
  "use strict";

  const TILE = 32;
  const MAX_UNDO = 60;

  class Editor {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.camera = new window.Render.Camera();
      this.doc = new window.LevelDoc();
      this.brush = { kind: "tile", id: 1 };
      this.selected = null;
      this.hover = null;         // tile coords
      this.hoverPx = null;       // world pixels, for free-positioned decor
      this.showGrid = true;
      // Preview looks at the level the way the game does — parallax and all —
      // and edits nothing. See onPreview for what the page does around it.
      this.preview = false;

      this._undo = [];
      this._redo = [];
      this._strokeOpen = false;
      this._painted = null;
      this._panning = false;
      this._draggingEntity = null;
      this._draggingDecor = null;
      // A block being carried: lifted out of the level at pick-up and put back
      // down on release, so dragging it over other blocks doesn't smear.
      this._carrying = null;
      this._dragOffset = [0, 0];
      this._spaceDown = false;
      this._pointerDown = false;
      this._changedThisPress = false;

      this.onChange = function () {};
      this.onSelect = function () {};
      this.onPreview = function () {};

      this._bind();
      this.resize();
    }

    // ------------------------------------------------------------ document
    setDoc(doc, opts) {
      // Anything half-done belongs to the document being replaced. A block still
      // being carried would otherwise be put down in the new one on release,
      // painting a stray block into a level that never had it.
      this._abandonGesture();
      this.doc = doc;
      this.selected = null;
      this._undo = [];
      this._redo = [];
      if (!opts || opts.recenter !== false) this.frameLevel();
      this.draw();
      this.onSelect(null);
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
    }

    undo() {
      if (!this._undo.length) return false;
      this._abandonGesture();
      this._redo.push(JSON.stringify(this.doc.snapshot()));
      const state = this._undo.pop();
      this.doc = new window.LevelDoc(JSON.parse(state));
      this.selected = null;
      this.draw();
      this.onSelect(null);
      this.onChange();
      return true;
    }

    redo() {
      if (!this._redo.length) return false;
      this._abandonGesture();
      this._undo.push(JSON.stringify(this.doc.snapshot()));
      const state = this._redo.pop();
      this.doc = new window.LevelDoc(JSON.parse(state));
      this.selected = null;
      this.draw();
      this.onSelect(null);
      this.onChange();
      return true;
    }

    // Drop everything a press was in the middle of, without applying it. Used
    // wherever this.doc is about to be swapped out from under a drag.
    _abandonGesture() {
      this._carrying = null;
      this._strokeOpen = false;
      this._painted = null;
      this._draggingEntity = null;
      this._draggingDecor = null;
      this._changedThisPress = false;
    }

    canUndo() { return this._undo.length > 0; }
    canRedo() { return this._redo.length > 0; }

    // ------------------------------------------------------------ tools
    setBrush(brush) {
      // Reaching for a tool is as clear a way of saying "done looking" as
      // pressing the button again.
      if (this.preview) this.setPreview(false);
      this.brush = brush;
      this.canvas.style.cursor = brush.kind === "select" ? "default" : "crosshair";
      if (brush.kind !== "select") {
        this.selected = null;
        this.onSelect(null);
      }
      this.draw();
    }

    applyAt(tx, ty, additive) {
      const b = this.brush;
      if (b.kind === "tile") {
        return this.doc.setTile(tx, ty, additive ? b.id : 0);
      }
      if (b.kind === "erase") {
        const removedTile = this.doc.setTile(tx, ty, 0);
        const removedEntities = this.doc.removeEntitiesAt(tx, ty);
        return removedTile || removedEntities > 0;
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
          : null;
        const item = this.doc.addDecor(
          b.id, this._lastWorld[0], this._lastWorld[1], extra);
        this.selected = item;
        this.onSelect(item);
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
        this.selected = e;
        this.onSelect(e);
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
    }

    _localPoint(ev) {
      const rect = this.canvas.getBoundingClientRect();
      return [ev.clientX - rect.left, ev.clientY - rect.top];
    }

    // ------------------------------------------------------------ preview
    setPreview(on) {
      this.preview = !!on;
      this.selected = null;
      this._strokeOpen = false;
      this._draggingEntity = null;
      this._draggingDecor = null;
      this._dropCarried();
      this.hover = null;
      this.canvas.style.cursor = this.preview ? "grab" : "crosshair";
      this.onSelect(null);
      this.onPreview(this.preview);
      this.draw();
    }

    _onDown(ev) {
      this.canvas.setPointerCapture(ev.pointerId);
      this._pointerDown = true;
      this._changedThisPress = false;
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

      // Middle mouse, or space held, pans. Right mouse erases.
      if (ev.button === 1 || this._spaceDown) {
        this._panning = true;
        return;
      }

      if (ev.button === 2) {
        this.pushUndo();
        this._strokeOpen = true;
        this._painted = new Set();
        this._eraseStroke = true;
        this._paintCell(tile);
        return;
      }

      if (this.brush.kind === "select") {
        // Entities are on the grid and sit in front, so they win a tie; blocks
        // are behind everything, so they come last. Otherwise clicking a plant
        // that happens to sit over a wall would pick up the wall.
        const hitEntity = this._entityAt(tile);
        const hitDecor = hitEntity ? null : window.Render.decorAt(this.doc, this.camera, p);
        const hit = hitEntity || hitDecor;
        this.selected = hit;
        this.onSelect(hit);
        if (hitEntity) {
          this.pushUndo();
          this._draggingEntity = hitEntity;
        } else if (hitDecor) {
          this.pushUndo();
          this._draggingDecor = hitDecor;
          // Grab it where you clicked, so it doesn't jump to the cursor.
          this._dragOffset = [hitDecor.x - this._lastWorld[0], hitDecor.y - this._lastWorld[1]];
        } else {
          this._liftBlock(tile);
        }
        this.draw();
        return;
      }

      this.pushUndo();
      this._strokeOpen = true;
      this._eraseStroke = false;
      this._painted = new Set();
      this._paintCell(tile);
    }

    // ------------------------------------------------------------ block drag
    // Blocks move the same way background props do: pick one up, drag it, let
    // go. It is lifted out of the level while carried rather than moved cell by
    // cell, so dragging across a wall doesn't chew a channel through it.
    _liftBlock(tile) {
      const id = this.doc.getTile(tile[0], tile[1]);
      if (id === 0) return false;
      // Nothing is disturbed and no undo step is spent until the block actually
      // moves, so clicking a wall with Pick stays a click.
      this._carrying = {
        id: id, from: [tile[0], tile[1]], tile: [tile[0], tile[1]], lifted: false,
      };
      return true;
    }

    _carryTo(tile) {
      const c = this._carrying;
      if (c.tile[0] === tile[0] && c.tile[1] === tile[1]) return false;
      if (!c.lifted) {
        this.pushUndo();
        this.doc.setTile(c.from[0], c.from[1], 0);
        c.lifted = true;
      }
      c.tile = [tile[0], tile[1]];
      return true;
    }

    // Put a carried block down where it now is. One dragged off the edge lands
    // back where it started — dropping into nowhere shouldn't be how you delete
    // something, and there's a Rub Out for that.
    _dropCarried() {
      const c = this._carrying;
      this._carrying = null;
      if (!c || !c.lifted) return false;
      const inside = c.tile[0] >= 0 && c.tile[1] >= 0
        && c.tile[0] < this.doc.width && c.tile[1] < this.doc.height;
      const at = inside ? c.tile : c.from;
      this.doc.setTile(at[0], at[1], c.id);
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

      if (this._draggingEntity) {
        this._draggingEntity.x = tile[0];
        this._draggingEntity.y = tile[1];
        this.draw();
        return;
      }

      if (this._draggingDecor) {
        this._draggingDecor.x = world[0] + this._dragOffset[0];
        this._draggingDecor.y = world[1] + this._dragOffset[1];
        this.draw();
        return;
      }

      if (this._carrying && this._pointerDown) {
        if (this._carryTo(tile)) this.draw();
        return;
      }

      if (this._strokeOpen) {
        this._paintCell(tile);
        return;
      }

      if (changedHover) this.draw();
    }

    _onUp() {
      const droppedBlock = this._dropCarried();
      // _changedThisPress rather than _strokeOpen: placing an entity or a prop
      // closes the stroke as it lands (one per press, no smearing), so a stroke
      // that is already shut is exactly the case that still needs saving.
      const wasEditing = this._changedThisPress || this._strokeOpen
        || this._draggingEntity || this._draggingDecor || droppedBlock;
      this._changedThisPress = false;
      this._pointerDown = false;
      if (this._panning && this.preview) this.canvas.style.cursor = "grab";
      this._panning = false;
      this._strokeOpen = false;
      this._painted = null;
      this._draggingEntity = null;
      this._draggingDecor = null;
      if (droppedBlock) this.draw();
      if (wasEditing) this.onChange();
    }

    _paintCell(tile) {
      const k = tile[0] + "," + tile[1];
      if (this._painted && this._painted.has(k)) return;
      if (this._painted) this._painted.add(k);

      let changed;
      if (this._eraseStroke) {
        const removedTile = this.doc.setTile(tile[0], tile[1], 0);
        const removedEnt = this.doc.removeEntitiesAt(tile[0], tile[1]);
        // Only remove decor on a direct hit; a wide eraser sweep shouldn't take
        // out a window three tiles away just because its sprite is big.
        let removedDecor = false;
        if (this._lastPointer) {
          const hit = window.Render.decorAt(this.doc, this.camera, this._lastPointer);
          if (hit) removedDecor = this.doc.removeDecor(hit);
        }
        changed = removedTile || removedEnt > 0 || removedDecor;
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
        hover: this.hover,
        hoverPx: this.hoverPx,
        brush: this.brush,
        selected: this.selected,
        preview: this.preview,
        carrying: this._carrying && this._carrying.lifted ? this._carrying : null,
      });
    }
  }

  window.Editor = Editor;
})();
