// Canvas drawing. Uses the game's own art (base64-embedded by
// buildtools/gen_web_assets.py), so what Amy builds looks like what she plays.

(function () {
  "use strict";

  const TILE = 32;
  const images = {};
  let ready = false;

  function loadAll() {
    const data = window.ART_DATA || {};
    const names = Object.keys(data);
    return Promise.all(names.map(function (name) {
      return new Promise(function (resolve) {
        const img = new Image();
        img.onload = function () { images[name] = img; resolve(); };
        img.onerror = function () { resolve(); };   // draw a fallback box instead
        img.src = data[name];
      });
    })).then(function () { ready = true; });
  }

  // The camera maps world pixels to screen pixels.
  class Camera {
    constructor() {
      this.x = 0;
      this.y = 0;
      this.zoom = 1;
    }
    toScreen(wx, wy) {
      return [(wx - this.x) * this.zoom, (wy - this.y) * this.zoom];
    }
    toWorld(sx, sy) {
      return [sx / this.zoom + this.x, sy / this.zoom + this.y];
    }
    toTile(sx, sy) {
      const w = this.toWorld(sx, sy);
      return [Math.floor(w[0] / TILE), Math.floor(w[1] / TILE)];
    }
  }

  function drawSprite(ctx, name, cx, cy, zoom) {
    const img = images[name];
    if (!img) {
      ctx.fillStyle = "#8a90a8";
      ctx.fillRect(cx - 10 * zoom, cy - 10 * zoom, 20 * zoom, 20 * zoom);
      return;
    }
    const w = img.width * zoom;
    const h = img.height * zoom;
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  }

  function drawTileAt(ctx, tileId, sx, sy, zoom) {
    const atlas = images["tiles"];
    const col = window.Palette.tileAtlasColumn(tileId);
    const size = TILE * zoom;
    if (!atlas) {
      ctx.fillStyle = "#926842";
      ctx.fillRect(sx, sy, size, size);
      return;
    }
    ctx.drawImage(atlas, col * TILE, 0, TILE, TILE, sx, sy, size, size);
  }

  // ---------------------------------------------------------------- main draw
  function draw(ctx, canvas, doc, camera, opts) {
    opts = opts || {};
    const zoom = camera.zoom;
    const w = canvas.width;
    const h = canvas.height;

    // Background gradient, matching what Level.gd builds in game.
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, doc.background_top);
    grad.addColorStop(1, doc.background_bottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Everything outside the level bounds is dimmed, so the edges are obvious.
    // Preview is meant to look like the game, so it skips that.
    const originScreen = camera.toScreen(0, 0);
    const levelW = doc.width * TILE * zoom;
    const levelH = doc.height * TILE * zoom;
    if (!opts.preview) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, 0, w, h);
      ctx.clearRect(originScreen[0], originScreen[1], levelW, levelH);
      ctx.fillStyle = grad;
      ctx.fillRect(originScreen[0], originScreen[1], levelW, levelH);
      ctx.restore();
    }

    // In the game, parallax is measured from where the camera is looking —
    // its centre — while camera.x/y here is the top-left corner of the view.
    const cameraCentre = opts.preview
      ? [camera.x + w / (2 * zoom), camera.y + h / (2 * zoom)]
      : null;

    // Decor first: it is background, and it must never hide a block you placed.
    (doc.decor || []).forEach(function (item) {
      drawDecor(ctx, item, camera, item === opts.selected, cameraCentre);
    });

    // Visible tile range only — a 232x24 level is 5500 cells and we redraw on
    // every mouse move.
    const topLeft = camera.toTile(0, 0);
    const bottomRight = camera.toTile(w, h);
    const x0 = Math.max(0, topLeft[0] - 1);
    const y0 = Math.max(0, topLeft[1] - 1);
    const x1 = Math.min(doc.width - 1, bottomRight[0] + 1);
    const y1 = Math.min(doc.height - 1, bottomRight[1] + 1);

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = doc.getTile(x, y);
        if (t === 0) continue;
        const s = camera.toScreen(x * TILE, y * TILE);
        drawTileAt(ctx, t, s[0], s[1], zoom);
      }
    }

    if (opts.grid !== false && zoom >= 0.6 && !opts.preview) {
      drawGrid(ctx, camera, doc, x0, y0, x1, y1);
    }

    doc.entities.forEach(function (e) {
      drawEntity(ctx, e, camera, e === opts.selected);
    });

    // A block being dragged is lifted out of the level for the duration, so
    // draw it under the cursor — otherwise it vanishes while you carry it.
    if (opts.carrying) {
      const s = camera.toScreen(opts.carrying.tile[0] * TILE, opts.carrying.tile[1] * TILE);
      ctx.save();
      ctx.globalAlpha = 0.85;
      drawTileAt(ctx, opts.carrying.id, s[0], s[1], zoom);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 2;
      ctx.strokeRect(s[0] + 0.5, s[1] + 0.5, TILE * zoom - 1, TILE * zoom - 1);
      ctx.restore();
    }

    if (opts.hover && opts.brush && !opts.preview && !opts.carrying) {
      if (opts.brush.kind === "decor" && opts.hoverPx) {
        drawDecorGhost(ctx, camera, opts.hoverPx, opts.brush);
      } else if (opts.brush.kind !== "decor") {
        drawBrushGhost(ctx, camera, opts.hover, opts.brush);
      }
    }

    if (!opts.preview) drawBounds(ctx, originScreen, levelW, levelH);
  }

  // A prop's picture: either one of the game's own, or one Amy imported.
  function decorImage(item) {
    if (item.type === "image") {
      return window.ImageLibrary
        ? window.ImageLibrary.element(window.ImageLibrary.idFromSprite(item.sprite))
        : null;
    }
    return images[window.Palette.decorSprite(item.type)] || null;
  }

  // Where a prop sits once parallax is taken into account. Mirrors Decor.gd
  // exactly, including its prop-anchored form: a prop is where it was placed
  // whenever the camera is looking at it, and drifts only as you move away.
  // Any other formula and the preview would disagree with the game, which is
  // the only thing the preview is for.
  function parallaxOffset(item, cameraCentre) {
    const p = item.parallax === undefined ? 0.9 : Number(item.parallax);
    if (!cameraCentre || p === 1) return [0, 0];
    return [(cameraCentre[0] - item.x) * (1 - p), (cameraCentre[1] - item.y) * (1 - p)];
  }

  // Sizes/positions here are the single definition of a decor item's footprint,
  // shared with hit-testing below so what you click is exactly what you see.
  //
  // Imported pictures record their own pixel size on the item, so a level
  // opened on a machine that doesn't have the picture still shows a placeholder
  // the right shape and still picks where you'd expect.
  function decorRect(item, camera, cameraCentre) {
    const img = decorImage(item);
    const scale = (Number(item.scale) || 1) * camera.zoom;
    const natural = img
      ? [img.width, img.height]
      : [Number(item.w) || 32, Number(item.h) || 32];
    const w = natural[0] * scale;
    const h = natural[1] * scale;
    const drift = parallaxOffset(item, cameraCentre);
    const centre = camera.toScreen(item.x + drift[0], item.y + drift[1]);
    return { x: centre[0] - w / 2, y: centre[1] - h / 2, w: w, h: h, img: img };
  }

  function drawDecor(ctx, item, camera, selected, cameraCentre) {
    const r = decorRect(item, camera, cameraCentre);
    ctx.save();
    if (item.tint && item.tint !== "#ffffff") {
      ctx.globalAlpha = 0.999;   // keeps the tint path off the fast opaque path
    }
    if (r.img) {
      if (item.flip) {
        ctx.translate(r.x + r.w, r.y);
        ctx.scale(-1, 1);
        ctx.drawImage(r.img, 0, 0, r.w, r.h);
      } else {
        ctx.drawImage(r.img, r.x, r.y, r.w, r.h);
      }
    } else if (item.type === "image") {
      // The level knows this picture by name but the bytes aren't in this
      // browser. Draw the space it takes up rather than nothing, so the level
      // still reads and the picture can be brought back in.
      ctx.fillStyle = "rgba(74,84,112,0.45)";
      ctx.fillRect(r.x, r.y, r.w, r.h);
      ctx.strokeStyle = "#e2586f";
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.setLineDash([]);
      ctx.fillStyle = "#f0d3d8";
      ctx.font = "12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("picture missing", r.x + r.w / 2, r.y + r.h / 2);
    } else {
      ctx.fillStyle = "#4a5470";
      ctx.fillRect(r.x, r.y, r.w, r.h);
    }
    ctx.restore();

    if (selected) {
      ctx.save();
      ctx.strokeStyle = "#8fd0f5";
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
      ctx.restore();
    }
  }

  // Topmost first, so clicking picks the one drawn last.
  function decorAt(doc, camera, screenPoint) {
    const list = doc.decor || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const r = decorRect(list[i], camera);
      if (screenPoint[0] >= r.x && screenPoint[0] <= r.x + r.w
          && screenPoint[1] >= r.y && screenPoint[1] <= r.y + r.h) {
        return list[i];
      }
    }
    return null;
  }

  function drawGrid(ctx, camera, doc, x0, y0, x1, y1) {
    const zoom = camera.zoom;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x++) {
      const s = camera.toScreen(x * TILE, y0 * TILE);
      const e = camera.toScreen(x * TILE, (y1 + 1) * TILE);
      ctx.moveTo(Math.round(s[0]) + 0.5, s[1]);
      ctx.lineTo(Math.round(e[0]) + 0.5, e[1]);
    }
    for (let y = y0; y <= y1 + 1; y++) {
      const s = camera.toScreen(x0 * TILE, y * TILE);
      const e = camera.toScreen((x1 + 1) * TILE, y * TILE);
      ctx.moveTo(s[0], Math.round(s[1]) + 0.5);
      ctx.lineTo(e[0], Math.round(e[1]) + 0.5);
    }
    ctx.stroke();

    // A heavier line every 10 tiles, so you can judge distance while building.
    ctx.strokeStyle = "rgba(255,255,255,0.16)";
    ctx.beginPath();
    for (let x = x0; x <= x1 + 1; x++) {
      if (x % 10 !== 0) continue;
      const s = camera.toScreen(x * TILE, y0 * TILE);
      const e = camera.toScreen(x * TILE, (y1 + 1) * TILE);
      ctx.moveTo(Math.round(s[0]) + 0.5, s[1]);
      ctx.lineTo(Math.round(e[0]) + 0.5, e[1]);
    }
    ctx.stroke();
    ctx.restore();
    void zoom;
  }

  function drawBounds(ctx, origin, w, h) {
    ctx.save();
    ctx.strokeStyle = "rgba(216,178,122,0.8)";
    ctx.lineWidth = 2;
    ctx.strokeRect(origin[0], origin[1], w, h);
    ctx.restore();
  }

  // Entities whose footprint is bigger than one tile draw that footprint, so
  // you can see what you are actually placing.
  function drawEntity(ctx, e, camera, selected) {
    const zoom = camera.zoom;
    const centre = camera.toScreen(e.x * TILE + TILE / 2, e.y * TILE + TILE / 2);
    const params = e.params || {};

    if (e.type === "rope_anchor" && (params.rope_length | 0) > 0) {
      const bottom = camera.toScreen(
        e.x * TILE + TILE / 2, (e.y + (params.rope_length | 0)) * TILE + TILE / 2);
      ctx.save();
      ctx.strokeStyle = "#d8b27a";
      ctx.lineWidth = Math.max(1, 3 * zoom);
      ctx.beginPath();
      ctx.moveTo(centre[0], centre[1]);
      ctx.lineTo(bottom[0], bottom[1]);
      ctx.stroke();
      ctx.restore();
    }

    if (e.type === "breakable_wall") {
      const tw = Math.max(1, params.tiles_wide | 0);
      const th = Math.max(1, params.tiles_tall | 0);
      const topLeft = camera.toScreen(
        (e.x - (tw - 1) / 2) * TILE, (e.y - (th - 1) / 2) * TILE);
      for (let iy = 0; iy < th; iy++) {
        for (let ix = 0; ix < tw; ix++) {
          drawTileAt(ctx, 4, topLeft[0] + ix * TILE * zoom,
            topLeft[1] + iy * TILE * zoom, zoom);
        }
      }
      ctx.save();
      ctx.strokeStyle = "rgba(20,18,24,0.9)";
      ctx.lineWidth = Math.max(1, 2 * zoom);
      ctx.beginPath();
      ctx.moveTo(topLeft[0] + tw * TILE * zoom * 0.3, topLeft[1]);
      ctx.lineTo(topLeft[0] + tw * TILE * zoom * 0.6, topLeft[1] + th * TILE * zoom * 0.5);
      ctx.lineTo(topLeft[0] + tw * TILE * zoom * 0.35, topLeft[1] + th * TILE * zoom);
      ctx.stroke();
      ctx.restore();
    } else if (e.type === "boss_arena") {
      const aw = Math.max(1, params.width_tiles | 0) * TILE * zoom;
      const ah = Math.max(1, params.height_tiles | 0) * TILE * zoom;
      ctx.save();
      ctx.strokeStyle = "rgba(226,88,111,0.85)";
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(centre[0] - aw / 2, centre[1] - ah / 2, aw, ah);
      ctx.fillStyle = "rgba(226,88,111,0.08)";
      ctx.fillRect(centre[0] - aw / 2, centre[1] - ah / 2, aw, ah);
      ctx.restore();
    } else if (e.type === "hazard_spill") {
      const sw = Math.max(1, params.width_tiles | 0);
      const img = images["hazard_spill"];
      for (let i = 0; i < sw; i++) {
        const cx = camera.toScreen(
          (e.x + i - (sw - 1) / 2) * TILE + TILE / 2, e.y * TILE + TILE / 2);
        if (img) {
          ctx.drawImage(img, cx[0] - img.width * zoom / 2,
            cx[1] - img.height * zoom / 2, img.width * zoom, img.height * zoom);
        }
      }
    }

    const icon = window.Palette.iconFor(e.type, params);
    if (icon && icon !== "stone_block" && e.type !== "hazard_spill") {
      drawSprite(ctx, icon, centre[0], centre[1], zoom);
    }

    if (e.type === "player_spawn") {
      ctx.save();
      ctx.fillStyle = "#8fd0f5";
      ctx.font = Math.round(10 * Math.max(1, zoom)) + "px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("START", centre[0], centre[1] - 22 * zoom);
      ctx.restore();
    }

    if (selected) {
      ctx.save();
      ctx.strokeStyle = "#ffd166";
      ctx.lineWidth = 2;
      const pad = 20 * zoom;
      ctx.strokeRect(centre[0] - pad, centre[1] - pad, pad * 2, pad * 2);
      ctx.restore();
    }
  }

  function drawBrushGhost(ctx, camera, tile, brush) {
    const zoom = camera.zoom;
    const s = camera.toScreen(tile[0] * TILE, tile[1] * TILE);
    ctx.save();
    ctx.globalAlpha = 0.55;
    if (brush.kind === "tile") {
      drawTileAt(ctx, brush.id, s[0], s[1], zoom);
    } else if (brush.kind === "entity") {
      const icon = window.Palette.icon(brush.id);
      if (icon) drawSprite(ctx, icon, s[0] + TILE * zoom / 2, s[1] + TILE * zoom / 2, zoom);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = brush.kind === "erase" ? "#e2586f" : "#ffd166";
    ctx.lineWidth = 2;
    ctx.strokeRect(s[0] + 0.5, s[1] + 0.5, TILE * zoom - 1, TILE * zoom - 1);
    ctx.restore();
  }

  function drawDecorGhost(ctx, camera, worldPoint, brush) {
    const ghost = {
      type: brush.id,
      sprite: brush.sprite,
      x: worldPoint[0],
      y: worldPoint[1],
      scale: brush.scale === undefined ? 1 : brush.scale,
    };
    ctx.save();
    ctx.globalAlpha = 0.55;
    drawDecor(ctx, ghost, camera, false);
    ctx.restore();
    const r = decorRect(ghost, camera);
    ctx.save();
    ctx.strokeStyle = "#8fd0f5";
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    ctx.restore();
  }

  window.Render = {
    loadAll: loadAll,
    decorAt: decorAt,
    decorRect: decorRect,
    decorImage: decorImage,
    Camera: Camera,
    draw: draw,
    images: images,
    isReady: function () { return ready; },
    TILE: TILE,
  };
})();
