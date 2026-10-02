/* ==========================================================================
   RPGJS 2D Multi-Room World Map — MTG Overworld with Fantasy Building Sprites
   Version 4.0 — Rooms System, Pixel-Art Buildings, Interior Environments
   ========================================================================== */
(() => {
  "use strict";

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ──────────────────────────────────────────────────────────────────────────
     ROOM DEFINITIONS
     Each room has: id, name, icon, color, bg, enter/exit draw fn, panel html
  ────────────────────────────────────────────────────────────────────────── */
  const ROOM_DEFS = {
    arena:   { id: "arena",   name: "The Colosseum",      icon: "⚔️", color: "#ef4444", bg: "#0d0505" },
    builder: { id: "builder", name: "The Gardens",         icon: "🌱", color: "#38bdf8", bg: "#030d1a" },
    guilds:  { id: "guilds",  name: "The Tavern",          icon: "🍺", color: "#f59e0b", bg: "#0d0a00" },
    dao:     { id: "dao",     name: "The Bank",            icon: "🏦", color: "#fbbf24", bg: "#0d0b00" },
    dnd:     { id: "dnd",     name: "The Alchemist",       icon: "⚗️", color: "#c084fc", bg: "#06000d" },
    bazaar:  { id: "bazaar",  name: "The Marketplace",     icon: "⚖️", color: "#10b981", bg: "#00100a" },
    mirror:  { id: "mirror",  name: "Meditation Circle",   icon: "🔮", color: "#f472b6", bg: "#0d0008" },
    overworld: { id: "overworld", name: "Overworld", icon: "🗺️", color: "#d7b45c", bg: "#153322" },
  };

  /* ──────────────────────────────────────────────────────────────────────────
     INIT HOMEROOM — main entry point
  ────────────────────────────────────────────────────────────────────────── */
  function initHomeroom(container, options = {}) {
    if (!container) return null;
    const { user, me, onNavigate, onOpenSheet } = options;

    container.innerHTML = "";
    const mmoPlayers = window.mmoPlayers = window.mmoPlayers || new Map();
    let lastMmoSend = 0;
    container.classList.add("dfk-world-container");

    // Canvas layer
    const canvas = document.createElement("canvas");
    canvas.id = "dfk-world-canvas";
    canvas.className = "dfk-world-canvas";
    container.appendChild(canvas);

    // Room overlay (interior content panels)
    const roomOverlay = document.createElement("div");
    roomOverlay.id = "dfk-room-overlay";
    roomOverlay.className = "dfk-room-overlay";
    roomOverlay.hidden = true;
    container.appendChild(roomOverlay);

    // Transition veil
    const veil = document.createElement("div");
    veil.id = "dfk-veil";
    veil.className = "dfk-veil";
    veil.hidden = true;
    container.appendChild(veil);

    // HUD elements
    const playerCardEl = document.createElement("div");
    playerCardEl.id = "dfk-player-card";
    playerCardEl.className = "dfk-player-card";
    container.appendChild(playerCardEl);

    const topNavHud = document.createElement("div");
    topNavHud.id = "dfk-topright-hud";
    topNavHud.className = "dfk-topright-hud";
    container.appendChild(topNavHud);

    // Single Unified Bottom Menu: Buttons on bottom, chat right above
    const bottomDockEl = document.createElement("div");
    bottomDockEl.id = "dfk-bottom-dock";
    bottomDockEl.className = "dfk-bottom-dock";
    container.appendChild(bottomDockEl);

    // FFXI Combined Chat & Log Window (Top part of dock / chat right above)
    const ffxiChatEl = document.createElement("div");
    ffxiChatEl.id = "ffxi-chat-window";
    ffxiChatEl.className = "ffxi-window ffxi-overworld-chat";
    bottomDockEl.appendChild(ffxiChatEl);

    // Bottom Action & Navigation Hotbar (Bottom part of dock / buttons on bottom)
    const hotbarEl = document.createElement("div");
    hotbarEl.id = "dfk-bottom-hotbar";
    hotbarEl.className = "dfk-bottom-hotbar";
    bottomDockEl.appendChild(hotbarEl);

    const promptEl = document.createElement("div");
    promptEl.id = "dfk-prompt";
    promptEl.className = "homeroom-prompt";
    promptEl.hidden = true;
    container.appendChild(promptEl);

    const dialogEl = document.createElement("div");
    dialogEl.id = "dfk-dialog";
    dialogEl.className = "homeroom-dialog";
    dialogEl.hidden = true;
    container.appendChild(dialogEl);

    // Minimap
    const minimapEl = document.createElement("canvas");
    minimapEl.id = "dfk-minimap";
    minimapEl.className = "dfk-minimap";
    minimapEl.width = 160;
    minimapEl.height = 110;
    container.appendChild(minimapEl);
    const mmCtx = minimapEl.getContext("2d");

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    let viewW = 1200, viewH = 800;

    /* ── TMX TILEMAP ENGINE (Authentic 1280x800 homeroom.tmx + tiles/world.png) ── */
    const WORLD_MAP_W = 1280;
    const WORLD_MAP_H = 800;

    let camX = 0;
    let camY = 0;

    function updateCamera() {
      if (viewW >= WORLD_MAP_W) {
        camX = Math.round((WORLD_MAP_W - viewW) / 2);
      } else {
        camX = Math.max(0, Math.min(WORLD_MAP_W - viewW, Math.round(hero.x - viewW / 2)));
      }
      if (viewH >= WORLD_MAP_H) {
        camY = Math.round((WORLD_MAP_H - viewH) / 2);
      } else {
        camY = Math.max(0, Math.min(WORLD_MAP_H - viewH, Math.round(hero.y - viewH / 2)));
      }
    }

    // Default inline homeroom CSV data as instant synchronous fallback
    const HOMEROOM_TMX_CSV = [
      2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,
      2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
      2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
      2,1,1,2,2,2,2,2,2,2,2,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,1,1,2,
      2,1,1,2,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,2,1,1,2,
      2,1,1,2,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,2,1,1,2,
      2,1,1,2,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,2,1,1,2,
      2,1,1,2,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,2,1,1,2,
      2,1,1,2,2,2,2,2,2,2,2,2,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,1,1,2,
      2,1,1,1,1,1,1,1,1,1,2,2,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,2,2,1,1,1,1,1,1,1,1,2,
      2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
      2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
      2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,2,
      2,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,2,
      2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
      2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
      2,1,1,2,2,2,2,2,2,2,2,2,1,1,1,1,4,4,1,3,3,1,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,1,1,2,
      2,1,1,2,1,1,1,1,1,1,2,2,1,1,1,1,4,4,1,3,3,1,1,1,1,1,1,1,1,2,2,1,1,1,1,1,2,1,1,2,
      2,1,1,2,1,1,1,1,1,1,2,1,1,1,1,1,4,4,1,3,3,1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,2,1,1,2,
      2,1,1,2,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,2,1,1,2,
      2,1,1,2,1,1,1,1,1,1,2,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,2,1,1,1,1,1,1,2,1,1,2,
      2,1,1,2,2,2,2,2,2,2,2,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,1,1,2,
      2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
      2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,3,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,2,
      2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2
    ];

    let tmxMap = {
      name: "homeroom",
      cols: 40,
      rows: 25,
      tileW: 32,
      tileH: 32,
      width: WORLD_MAP_W,
      height: WORLD_MAP_H,
      data: HOMEROOM_TMX_CSV,
      collisions: [false, true, false, true],
    };

    const tmxCanvas = document.createElement("canvas");
    tmxCanvas.width = WORLD_MAP_W;
    tmxCanvas.height = WORLD_MAP_H;
    const tmxCtx = tmxCanvas.getContext("2d");
    let tmxCanvasReady = false;

    const tmxTilesetImg = new Image();
    let tmxTilesetLoaded = false;

    function renderTmxTilemap() {
      if (!tmxTilesetLoaded || !tmxTilesetImg.naturalWidth) return;
      tmxCtx.imageSmoothingEnabled = false;
      tmxCtx.clearRect(0, 0, tmxMap.width, tmxMap.height);

      const cols = tmxMap.cols;
      const rows = tmxMap.rows;
      const tw = tmxMap.tileW;
      const th = tmxMap.tileH;
      const data = tmxMap.data;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const gid = data[r * cols + c];
          if (!gid || gid < 1) continue;
          const tileIdx = gid - 1;
          const sx = (tileIdx % 2) * tw;
          const sy = Math.floor(tileIdx / 2) * th;
          const dx = c * tw;
          const dy = r * th;
          tmxCtx.drawImage(tmxTilesetImg, sx, sy, tw, th, dx, dy, tw, th);
        }
      }
      tmxCanvasReady = true;
    }

    tmxTilesetImg.onload = () => {
      tmxTilesetLoaded = true;
      renderTmxTilemap();
    };
    tmxTilesetImg.onerror = () => {
      if (!tmxTilesetImg.src.includes("/rpg-world/maps/tiles/")) {
        tmxTilesetImg.src = "/rpg-world/maps/tiles/world.png";
      }
    };
    tmxTilesetImg.src = "/assets/tiles/world.png";

    async function loadTmxMap(mapName = "homeroom") {
      try {
        const res = await fetch(`/api/rpg/map/${mapName}`);
        if (res.ok) {
          const json = await res.json();
          if (json && json.layers && json.layers[0] && json.layers[0].data) {
            tmxMap.name = json.name || mapName;
            tmxMap.cols = json.width || 40;
            tmxMap.rows = json.height || 25;
            tmxMap.tileW = json.tilewidth || 32;
            tmxMap.tileH = json.tileheight || 32;
            tmxMap.width = tmxMap.cols * tmxMap.tileW;
            tmxMap.height = tmxMap.rows * tmxMap.tileH;
            tmxMap.data = json.layers[0].data;
            if (json.tileset && json.tileset.collisions) {
              tmxMap.collisions = json.tileset.collisions;
            }
            if (tmxCanvas.width !== tmxMap.width || tmxCanvas.height !== tmxMap.height) {
              tmxCanvas.width = tmxMap.width;
              tmxCanvas.height = tmxMap.height;
            }
            renderTmxTilemap();
            return;
          }
        }
      } catch (err) {
        console.warn("[rpg] Failed to fetch TMX map JSON, using built-in definition:", err);
      }
      renderTmxTilemap();
    }
    loadTmxMap("homeroom");

    function isTileBlocked(x, y) {
      if (x < 16 || x > WORLD_MAP_W - 16 || y < 16 || y > WORLD_MAP_H - 16) return true;
      const col = Math.floor(x / tmxMap.tileW);
      const row = Math.floor(y / tmxMap.tileH);
      if (col < 0 || col >= tmxMap.cols || row < 0 || row >= tmxMap.rows) return true;
      const gid = tmxMap.data[row * tmxMap.cols + col];
      return gid === 2;
    }

    function canHeroOccupy(x, y) {
      const r = 10;
      return !isTileBlocked(x, y) &&
             !isTileBlocked(x - r, y - r) &&
             !isTileBlocked(x + r, y - r) &&
             !isTileBlocked(x - r, y + r) &&
             !isTileBlocked(x + r, y + r);
    }

    let pixelMap = null;
    let pixelMapKey = "";

    function paintImperialCity(w, h) {
      const cnv = document.createElement("canvas");
      cnv.width = w;
      cnv.height = h;
      const g = cnv.getContext("2d");
      g.fillStyle = "#1e392a";
      g.fillRect(0, 0, w, h);
      return cnv;
    }

    function ensurePixelKingdom() {
      if (tmxCanvasReady) return tmxCanvas;
      const key = viewW + "x" + viewH;
      if (pixelMap && pixelMapKey === key) return pixelMap;
      pixelMap = paintImperialCity(Math.max(320, viewW), Math.max(240, viewH));
      pixelMapKey = key;
      return pixelMap;
    }

    const lunarHeroImg = new Image();
    let lunarHeroLoaded = false;
    lunarHeroImg.onload = () => { lunarHeroLoaded = true; };
    lunarHeroImg.src = "/assets/sprites/hero_lunar.png";

    const lunarGhaleonImg = new Image();
    let lunarGhaleonLoaded = false;
    lunarGhaleonImg.onload = () => { lunarGhaleonLoaded = true; };
    lunarGhaleonImg.src = "/assets/sprites/ghaleon_lunar.png";

    const lunarNallImg = new Image();
    let lunarNallLoaded = false;
    lunarNallImg.onload = () => { lunarNallLoaded = true; };
    lunarNallImg.src = "/assets/sprites/nall_lunar.png";

    /* ── ISOMETRIC FANTASY BUILDING ASSETS (Extracted from high-res spritesheet) ── */
    const buildingAssets = {
      arena: { img: new Image(), loaded: false, src: "/assets/buildings/arena.png", scale: 0.62 },
      builder: { img: new Image(), loaded: false, src: "/assets/buildings/builder.png", scale: 0.78 },
      guilds: { img: new Image(), loaded: false, src: "/assets/buildings/guilds.png", scale: 0.60 },
      dao: { img: new Image(), loaded: false, src: "/assets/buildings/dao.png", scale: 0.82 },
      dnd: { img: new Image(), loaded: false, src: "/assets/buildings/dnd.png", scale: 0.80 },
      bazaar: { img: new Image(), loaded: false, src: "/assets/buildings/bazaar.png", scale: 0.82 },
      mirror: { img: new Image(), loaded: false, src: "/assets/buildings/mirror.png", scale: 0.80 },
      windmill: { img: new Image(), loaded: false, src: "/assets/buildings/windmill.png", scale: 0.32 },
      stables: { img: new Image(), loaded: false, src: "/assets/buildings/stables.png", scale: 0.32 },
      mansion: { img: new Image(), loaded: false, src: "/assets/buildings/mansion.png", scale: 0.32 },
      alchemist: { img: new Image(), loaded: false, src: "/assets/buildings/alchemist.png", scale: 0.32 },
      workshop: { img: new Image(), loaded: false, src: "/assets/buildings/workshop.png", scale: 0.32 },
    };

    const buildingVisualParams = {
      arena: { scale: 0.28, shadowW: 84, shadowH: 18, offY: -4, bannerOffY: 40, padOffY: 52 },
      builder: { scale: 0.38, shadowW: 64, shadowH: 16, offY: -4, bannerOffY: 36, padOffY: 48 },
      guilds: { scale: 0.26, shadowW: 84, shadowH: 18, offY: -4, bannerOffY: 36, padOffY: 48 },
      dao: { scale: 0.40, shadowW: 72, shadowH: 16, offY: -2, bannerOffY: 26, padOffY: 36 },
      dnd: { scale: 0.36, shadowW: 72, shadowH: 16, offY: -4, bannerOffY: 30, padOffY: 40 },
      bazaar: { scale: 0.38, shadowW: 72, shadowH: 16, offY: -4, bannerOffY: 28, padOffY: 38 },
      mirror: { scale: 0.34, shadowW: 64, shadowH: 14, offY: -4, bannerOffY: 28, padOffY: 38 },
    };

    const overworldDecor = [
      { id: "windmill", type: "windmill", x: 1210, y: 416, xRel: 0.94, yRel: 0.52, name: "Kalm Windmill" },
      { id: "stables", type: "stables", x: 70, y: 416, xRel: 0.06, yRel: 0.52, name: "Chocobo Farm" },
      { id: "workshop", type: "workshop", x: 440, y: 620, xRel: 0.34, yRel: 0.77, name: "Corel Quarry Workshop" },
      { id: "alchemist", type: "alchemist", x: 840, y: 620, xRel: 0.65, yRel: 0.77, name: "Mideel Apothecary" },
    ];

    Object.keys(buildingAssets).forEach(k => {
      const b = buildingAssets[k];
      b.img.onload = () => { b.loaded = true; };
      b.img.src = b.src;
    });

    /* ── AUTHENTIC RIPPED ROOM INTERIOR ASSETS (Lunar 2 Star Dragon Tower Foyer) ── */
    const roomAssets = {
      mirrorFoyer: { img: new Image(), loaded: false, src: "/assets/rooms/mystic_mirror_foyer.png" }
    };
    Object.keys(roomAssets).forEach(k => {
      const r = roomAssets[k];
      r.img.onload = () => { r.loaded = true; };
      r.img.src = r.src;
    });


    function drawLunarHeroSprite(c, x, y, dir, isMoving, animTick, scale = 1.05) {
      if (!lunarHeroLoaded && !lunarHeroImg.complete) return false;
      if (lunarHeroImg.naturalWidth === 0) return false;
      // hero_lunar.png has 4 rows: 0: Down, 1: Up, 2: Right, 3: Left
      // hero dir: 0: Down, 1: Left, 2: Right, 3: Up
      let row = 0;
      if (dir === 0) row = 0;
      else if (dir === 3) row = 1;
      else if (dir === 2) row = 2;
      else if (dir === 1) row = 3;

      // 4 frames: 0, 1, 2, 3 (frame 2 is standing idle)
      const frame = isMoving ? Math.floor(animTick / 7) % 4 : 2;
      const fw = 24, fh = 32;
      const sx = frame * fw;
      const sy = row * fh;
      const dw = Math.round(fw * scale);
      const dh = Math.round(fh * scale);
      const dx = Math.round(x - dw / 2);
      const dy = Math.round(y - dh + 6);

      c.save();
      c.imageSmoothingEnabled = false;
      c.drawImage(lunarHeroImg, sx, sy, fw, fh, dx, dy, dw, dh);
      c.restore();
      return true;
    }

    function drawLunarNallSprite(c, x, y, animTick, scale = 0.95) {
      if (!lunarNallLoaded && !lunarNallImg.complete) return false;
      if (lunarNallImg.naturalWidth === 0) return false;
      const frame = Math.floor(animTick / 9) % 5;
      const fw = 24, fh = 32;
      const sx = frame * fw;
      const sy = 0;
      const dw = Math.round(fw * scale);
      const dh = Math.round(fh * scale);
      const dx = Math.round(x - dw / 2);
      const dy = Math.round(y - dh / 2);

      c.save();
      c.imageSmoothingEnabled = false;
      c.drawImage(lunarNallImg, sx, sy, fw, fh, dx, dy, dw, dh);
      c.restore();
      return true;
    }

    function drawLunarGhaleonSprite(c, x, y, dir = 0, isMoving = false, animTick = 0, scale = 1.6) {
      if (!lunarGhaleonLoaded && !lunarGhaleonImg.complete) return false;
      if (lunarGhaleonImg.naturalWidth === 0) return false;
      let row = 0;
      if (dir === 0) row = 0;
      else if (dir === 1) row = 1;
      else if (dir === 2) row = 2;
      else if (dir === 3) row = 3;
      const frame = isMoving ? Math.floor(animTick / 8) % 3 : 1;
      const fw = 24, fh = 32;
      const sx = frame * fw;
      const sy = row * fh;
      const dw = Math.round(fw * scale);
      const dh = Math.round(fh * scale);
      const dx = Math.round(x - dw / 2);
      const dy = Math.round(y - dh + 6);

      c.save();
      c.imageSmoothingEnabled = false;
      c.drawImage(lunarGhaleonImg, sx, sy, fw, fh, dx, dy, dw, dh);
      c.restore();
      return true;
    }


    /* ── AVATAR & PLAYER ── */
    const avatarPresets = {
      "preset:fairy": "🧚", "preset:unicorn": "🦄", "preset:wizard": "🧙",
      "preset:dragon": "🐉", "preset:kitty": "🐱", "preset:princess": "👑",
      "preset:metal": "🤘", "preset:cyber": "🤖", "preset:skull": "💀",
    };
    function photoAvatar(av) {
      return typeof av === "string" && (av.startsWith("/") || av.startsWith("http") || av.startsWith("data:"));
    }
    function portraitOf(av) {
      if (photoAvatar(av)) return av;
      if (av && avatarPresets[av]) return avatarPresets[av];
      return "🧙";
    }
    const avatarEmoji = portraitOf(user && user.avatar);
    const playerName = (user && (user.displayName || user.username)) || me?.name || "Planeswalker";
    let tcgBalance = (user && typeof user.tcgBalance === "number") ? user.tcgBalance : ((user && typeof user.balance === "number") ? user.balance : 0);
    let ggBalance = (user && typeof user.ggBalance === "number") ? user.ggBalance : ((user?.displayName === "Amber" || user?.walletAddress?.toLowerCase() === "0x8233b657d4a5713b606ba12321c4ec901dc85ce9") ? 1000000000 : 10000);
    let goldBalance = tcgBalance;
    let chosenBotDiff = "normal";

    const hero = {
      x: 600, y: 440, speed: 4.2,
      dir: 0, frame: 0, animTick: 0, isMoving: false,
      hp: 100, maxHp: 100, mp: 100, maxMp: 100,
      activeSpell: "fireball",
      targetX: null, targetY: null,
      avatar: avatarEmoji, name: playerName,
      serverX: null, serverY: null, serverDir: null,
    };
    window._rpgHero = hero; // exposed for rpg-client.js server sync
    window._rpgTransitionToRoom = (r) => transitionToRoom(r);
    let activeDeckName = "No Deck Selected";
    (async () => {
      try {
        const did = sessionStorage.getItem("mtg-selected-deck");
        if (did) {
           const deck = await (window.MTG && window.MTG.api ? window.MTG.api(`/api/decks/${did}`) : Promise.resolve());
           if (deck && deck.name) { activeDeckName = deck.name; renderPlayerCard(); }
        } else {
           const decks = await (window.MTG && window.MTG.api ? window.MTG.api("/api/decks") : Promise.resolve());
           if (decks && decks.length > 0) { activeDeckName = decks[0].name; renderPlayerCard(); }
        }
      } catch (e) {}
    })();

    let waypoint = null;
    let currentRoom = "overworld";
    let isTransitioning = false;
    let isRunning = true;
    let animId = null;
    let nearestLandmark = null;

    /* ── ROOM INTERIOR CANVASES ── */
    const roomCanvas = document.createElement("canvas");
    roomCanvas.className = "dfk-room-canvas";
    const rCtx = roomCanvas.getContext("2d");

    // Room hero position (separate from overworld hero)
    const roomHero = { x: 0, y: 0, speed: 3.8, dir: 0, frame: 0, animTick: 0, isMoving: false, targetX: null, targetY: null };

    /* ────────────────────────────────────────────────────────────────
       LANDMARK DEFINITIONS — rich building data
    ──────────────────────────────────────────────────────────────── */
    const landmarks = [
      {
        id: "arena", name: "⚔️ The Colosseum",
        shortName: "⚔️ Colosseum",
        subtitle: "PVP combat · DFK Chain duels",
        tag: "⚔️ PVP", desc: "Hero versus hero combat, the same job as the DFK Colosseum.",
        icon: "⚔️", x: 780, y: 300, w: 200, h: 120,
        route: "/tables", color: "#ef4444", glow: "rgba(239,68,68,0.45)",
        buildingType: "castle",
      },
      {
        id: "builder", name: "🌱 The Gardens",
        shortName: "🌱 Gardens",
        subtitle: "Stake LP seeds · Master Gardener",
        tag: "🌱 Emissions", desc: "Plant liquidity seeds and earn JEWEL, CRYSTAL, or JADE.",
        icon: "🌱", x: 420, y: 310, w: 180, h: 120,
        route: "/builder", color: "#38bdf8", glow: "rgba(56,189,248,0.45)",
        buildingType: "tower",
      },
      {
        id: "guilds", name: "🍺 The Tavern",
        shortName: "🍺 Tavern",
        subtitle: "Buy, sell, and hire Heroes",
        tag: "🍺 Scarlet Hearth", desc: "Hero catalog, auctions, and rentals.",
        icon: "🍺", x: 730, y: 430, w: 200, h: 120,
        route: "/guilds", color: "#f59e0b", glow: "rgba(245,158,11,0.45)",
        buildingType: "fortress",
      },
      {
        id: "dao", name: "🏦 The Bank",
        shortName: "🏦 Bank",
        subtitle: "Lock JEWEL · Banker and xJEWEL",
        tag: "🏦 xJEWEL", desc: "Deposit JEWEL with the Banker and claim locked rewards.",
        icon: "🏦", x: 470, y: 460, w: 180, h: 120,
        route: "/dao", color: "#fbbf24", glow: "rgba(251,191,36,0.5)",
        buildingType: "pantheon",
      },
      {
        id: "dnd", name: "⚗️ The Alchemist",
        shortName: "⚗️ Alchemist",
        subtitle: "Brew potions · restore stamina",
        tag: "⚗️ Crafting", desc: "Turn quest reagents into potions and consumables.",
        icon: "⚗️", x: 320, y: 540, w: 180, h: 120,
        route: "/dnd", color: "#c084fc", glow: "rgba(192,132,252,0.5)",
        buildingType: "portal",
      },
      {
        id: "bazaar", name: "⚖️ The Marketplace",
        shortName: "⚖️ Marketplace",
        subtitle: "Trader · seeds · item vendor",
        tag: "⚖️ DEX", desc: "Swap tokens, mint LP seeds, and sell quest items for gold.",
        icon: "⚖️", x: 590, y: 410, w: 190, h: 110,
        route: "/cards", color: "#10b981", glow: "rgba(16,185,129,0.45)",
        buildingType: "market",
      },
      {
        id: "mirror", name: "🔮 Meditation Circle",
        shortName: "🔮 Meditation",
        subtitle: "Level a Hero · spend runes",
        tag: "🔮 Level up", desc: "When a Hero's experience is full, meditate here to level up.",
        icon: "🔮", x: 580, y: 170, w: 140, h: 100,
        action: "profile", color: "#f472b6", glow: "rgba(244,114,182,0.45)",
        buildingType: "shrine",
      },
    ];

    const manaWell = { x: 600, y: 120, radius: 45, name: "The 5-Color Mana Well" };
    const campfire = { x: 530, y: 370, radius: 20, name: "Hearthstone Campfire" };
    const dummy = { x: 700, y: 340, hp: 100, maxHp: 100, hitTick: 0, name: "Sparring Dummy" };
    
    const sparky = {
      x: 560, y: 350, targetX: 560, targetY: 350,
      name: "Nall the Familiar", icon: "🐉",
      dialogs: [
        "Welcome to the Planet, Planeswalker! Explore Midgar, Gold Saucer, Costa del Sol, and Junon!",
        "Click anywhere to walk Alex toward the golden beacon! WASD / Arrow keys work too!",
        "Each section has an area on the map. Walk onto any glowing portal pad or press [Spacebar] to enter it!",
        "The Grand Arena in Midgar 🏰 hosts live duels. The Oracle Bazaar at Costa del Sol 🎴 is your card market!",
        "Rest in the 5-Color Mana Well at the Northern Crater ✨ to restore your Life and Mana!",
      ],
      dlgIdx: 0,
    };

    const projectiles = [], particles = [], floatingTexts = [];
    const keys = {};
    const roomKeys = {};

    // Room interior state
    let roomParticles = [];
    let roomNpcs = [];
    let roomNearestNpc = null;
    let roomAnimTick = 0;
    let areaCooldown = 0;

    /* ── RESIZE & TMX WORLD POSITIONS ── */
    function updateLandmarkPositions() {
      // Fixed TMX world positions for landmarks on the 1280x800 homeroom map
      const tmxPositions = {
        arena:   { x: 1056, y: 180, padX: 1056, padY: 320, w: 180, h: 120 },
        builder: { x: 224,  y: 180, padX: 224,  padY: 320, w: 180, h: 120 },
        guilds:  { x: 1056, y: 590, padX: 1056, padY: 640, w: 180, h: 120 },
        dao:     { x: 240,  y: 590, padX: 240,  padY: 640, w: 180, h: 120 },
        bazaar:  { x: 820,  y: 416, padX: 820,  padY: 456, w: 180, h: 110 },
        dnd:     { x: 440,  y: 416, padX: 440,  padY: 456, w: 180, h: 110 },
        mirror:  { x: 640,  y: 90,  padX: 640,  padY: 130, w: 140, h: 100 },
      };

      landmarks.forEach((lm) => {
        const pos = tmxPositions[lm.id];
        if (pos) {
          lm.x = pos.x;
          lm.y = pos.y;
          lm.w = pos.w;
          lm.h = pos.h;
          lm.padX = pos.padX;
          lm.padY = pos.padY;
        }
        const params = buildingVisualParams[lm.id] || { bannerOffY: 52, padOffY: 68 };
        lm.bannerY = lm.y + (params.bannerOffY || 52);
        if (lm.padX == null) lm.padX = lm.x;
        if (lm.padY == null) lm.padY = lm.y + (params.padOffY || 68);
        lm.padRadius = 18;
      });

      // Central Hub & NPCs
      manaWell.x = 640;
      manaWell.y = 240;
      manaWell.radius = 32;

      campfire.x = 550;
      campfire.y = 460;

      // Exact server coordinates
      dummy.x = 680;
      dummy.y = 320;

      sparky.x = 520;
      sparky.y = 220;

      // Secondary Decor
      if (overworldDecor[0]) { overworldDecor[0].x = 1210; overworldDecor[0].y = 416; } // Windmill
      if (overworldDecor[1]) { overworldDecor[1].x = 70;   overworldDecor[1].y = 416; } // Stables
      if (overworldDecor[2]) { overworldDecor[2].x = 440;  overworldDecor[2].y = 620; } // Workshop
      if (overworldDecor[3]) { overworldDecor[3].x = 840;  overworldDecor[3].y = 620; } // Alchemist

      if (!hero._citySpawn) {
        hero.x = 600;
        hero.y = 440;
        hero._citySpawn = true;
      }
    }

    function resizeCanvas() {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      viewW = Math.max(640, Math.floor(rect.width));
      viewH = Math.max(480, Math.floor(rect.height));
      canvas.width = Math.floor(viewW * dpr);
      canvas.height = Math.floor(viewH * dpr);
      canvas.style.width = `${viewW}px`; canvas.style.height = `${viewH}px`;
      ctx.imageSmoothingEnabled = false;
      // Room canvas same size
      roomCanvas.width = Math.floor(viewW * dpr);
      roomCanvas.height = Math.floor(viewH * dpr);
      roomCanvas.style.width = `${viewW}px`; roomCanvas.style.height = `${viewH}px`;
      rCtx.imageSmoothingEnabled = false;
      updateLandmarkPositions();
      hero.x = Math.max(24, Math.min(WORLD_MAP_W - 24, hero.x));
      hero.y = Math.max(24, Math.min(WORLD_MAP_H - 24, hero.y));
      updateCamera();
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    hero.x = 600; hero.y = 440;

    /* ══════════════════════════════════════════════════════════════════════
       BUILDING SPRITE RENDERERS — pixel-art style drawn in canvas 2D
    ══════════════════════════════════════════════════════════════════════ */

    
const PIXEL_PALETTE = {"0":null,"1":"#111","2":"#4a5462","3":"#8b9bb4","4":"#3a1f1d","5":"#8b5a45","6":"#7b1e2a","7":"#c83b3b","8":"#1f3a2c","9":"#3b8b54","A":"#2d456b","B":"#4b75b0","C":"#8b7a3b","D":"#dfc364","E":"#663b8b","F":"#aa64df"};
const PIXEL_SPRITES = {"castle":["000000000000000000000000","011100001111000011110000","017100001771000017710000","016100001661000016610000","012111111221111112210000","013222222332222223210000","012232232223223222210000","012222222222222222210000","013222222222222222310000","012221112222111222210000","012214441221444122210000","013214141331414122310000","012214441221444122210000","012221112222111222210000","013222221111222222310000","012222214444122222210000","012232214114123222210000","012222214114122222210000","011111111111111111110000"],"tower":["00000001111110000000","0000001AABBAA1000000","000001AAABBAAA100000","00001AAAABBBAAA10000","00001111111111110000","00000123333332100000","00000122322322100000","00000122222222100000","00000132211223100000","00000122144122100000","00000122144122100000","00000122211222100000","00000132222223100000","00000122222222100000","00000111111111100000"],"fortress":["00000000000000000000","01110111001110111000","01310131001310131000","01211121111211121000","01222222222222221000","01322222222222231000","01222112222112221000","01221441221441221000","01221441221441221000","01322112222112231000","01222222222222221000","01222211111122221000","01222144444412221000","01322141111412231000","01111111111111111000"],"pantheon":["00000001111110000000","0000001DDDDDD1000000","000001DCDDCDDCD10000","00001DCCDDCCDDCCD100","0001DCCCDDCCDDCCCD10","00111111111111111110","00131013101310131010","00121012101210121010","00121012101210121010","00121012101210121010","00121012101210121010","00131013101310131010","00111111111111111110","01333333333333333331","01111111111111111111"],"portal":["00000111111110000000","00001222222221000000","00012332222332100000","00123113223113210000","01231FE1221EF1321000","01231EE1221EE1321000","01221112222111221000","01222221111222221000","0132221EEEE122231000","001221EEEEEE12210000","001221EEEEEE12210000","001321EEEEEE12310000","0012221EEEE122210000","00111221111221110000","00001111001111000000"],"market":["00000000000000000000","00011111111111111000","00177A77A77A77A77100","01766B66B66B66B66710","16666666666666666661","11111111111111111111","01555555555555555100","01444411111144444100","01444155555514444100","01444144444414444100","01544144CC4414445100","01444144CC4414444100","01444111111114444100","01111100000011111100"],"shrine":["00000000111000000000","00000001DDD100000000","0000001DDCDD10000000","0000001DCCCD10000000","00000001CCC100000000","00000000111000000000","00000011111110000000","00001133333331100000","00013322222223310000","00122211111112221000","00122144444441221000","00122144444441221000","00122111111111221000","00133333333333331000","00111111111111111000"]};

function drawPixelSprite(c, type, x, y, scale, bob) {
  const sprite = PIXEL_SPRITES[type];
  if (!sprite) return;
  const h = sprite.length;
  const w = sprite[0].length;
  const startX = x - (w * scale) / 2;
  const startY = y - (h * scale) + bob;

  for (let r = 0; r < h; r++) {
    for (let col = 0; col < w; col++) {
      const char = sprite[r][col];
      const color = PIXEL_PALETTE[char];
      if (color) {
        c.fillStyle = color;
        c.fillRect(startX + col * scale, startY + r * scale, scale + 0.5, scale + 0.5);
      }
    }
  }
}

    const imgCache = window._rpgImgCache = window._rpgImgCache || new Map();
    function drawCharacterAvatar(cCtx, avatarStr, ax, ay) {
      let av = avatarStr || "🧙";
      if (avatarPresets[av]) av = avatarPresets[av];
      if (typeof av === "string" && (av.startsWith("http") || av.startsWith("/") || av.startsWith("data:"))) {
        let img = imgCache.get(av);
        if (!img) {
          img = new Image();
          img.src = av;
          imgCache.set(av, img);
        }
        if (img.complete && img.naturalWidth > 0) {
          cCtx.save();
          cCtx.beginPath(); cCtx.arc(ax, ay, 18, 0, Math.PI * 2); cCtx.clip();
          cCtx.drawImage(img, ax - 18, ay - 18, 36, 36);
          cCtx.restore();
          cCtx.strokeStyle = "#d7b45c"; cCtx.lineWidth = 2; cCtx.beginPath(); cCtx.arc(ax, ay, 18, 0, Math.PI * 2); cCtx.stroke();
          return;
        }
        av = "🧙";
      }
      cCtx.font = "34px sans-serif"; cCtx.textAlign = "center"; cCtx.textBaseline = "middle";
      cCtx.fillText(av, ax, ay);
    }

    function drawBuilding(c, lm, isNear, t) {
      const asset = buildingAssets[lm.id];
      const params = buildingVisualParams[lm.id] || {};
      const bob = isNear ? Math.sin(t * 0.007) * 3.5 : Math.sin(t * 0.003) * 1.5;
      const { x, y } = lm;
      
      if (asset && (asset.loaded || asset.img.complete) && asset.img.naturalWidth > 0) {
        const img = asset.img;
        const scale = params.scale || asset.scale || 0.8;
        const dw = Math.round(img.naturalWidth * scale);
        const dh = Math.round(img.naturalHeight * scale);
        const dx = Math.round(x - dw / 2);
        const dy = Math.round(y - dh / 2 + (params.offY || 0) + bob);
        const shadowY = Math.round(y + (params.bannerOffY || (dh / 2)) - 14);
        const shadowW = Math.round((params.shadowW || dw) * 0.95);
        const shadowH = Math.round((params.shadowH || 38) * 0.95);

        c.save();
        // Ground ambient contact shadow
        const grd = c.createRadialGradient(x, shadowY, shadowW * 0.08, x, shadowY, shadowW / 2);
        grd.addColorStop(0, isNear ? "rgba(0,0,0,0.65)" : "rgba(0,0,0,0.48)");
        grd.addColorStop(0.7, isNear ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.2)");
        grd.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = grd;
        c.beginPath();
        c.ellipse(x, shadowY, shadowW / 2, shadowH / 2, 0, 0, Math.PI * 2);
        c.fill();

        // Glow halo when nearby
        if (isNear) {
          c.shadowColor = lm.glow || "rgba(255,215,0,0.65)";
          c.shadowBlur = 22;
        }

        // Draw isometric high-res building asset
        c.imageSmoothingEnabled = true;
        c.drawImage(img, dx, dy, dw, dh);
        c.restore();
      } else {
        // Fallback pixel sprite
        const hw = lm.w / 2, hh = lm.h / 2;
        const grd = c.createRadialGradient(x, y + hh + 10, 10, x, y + hh + 10, hw * 1.1);
        grd.addColorStop(0, "rgba(0,0,0,0.4)");
        grd.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = grd; c.beginPath(); c.ellipse(x, y + hh + 10, hw * 1.1, 28, 0, 0, Math.PI * 2); c.fill();
        drawPixelSprite(c, lm.buildingType, x, y + hh + 20, 6, bob);
      }
    }


    /* ══════════════════════════════════════════════════════════════════════
       ROOM INTERIOR ENVIRONMENTS — each room is a fully drawn canvas world
    ══════════════════════════════════════════════════════════════════════ */

    const colosseumMap = new Image();
    let colosseumMapLoaded = false;
    colosseumMap.onload = () => { colosseumMapLoaded = true; };
    colosseumMap.src = "/assets/rooms/colosseum.jpg";

    const gardensMap = new Image();
    let gardensMapLoaded = false;
    gardensMap.onload = () => { gardensMapLoaded = true; };
    gardensMap.onerror = () => {
      const fb = "https://i.pinimg.com/1200x/d3/52/df/d352dfbbc998f14d2d00762a5043e77e.jpg";
      if (gardensMap.src !== fb) gardensMap.src = fb;
    };
    gardensMap.src = "/assets/rooms/gardens.jpg";

    const tavernMap = new Image();
    let tavernMapLoaded = false;
    tavernMap.onload = () => { tavernMapLoaded = true; };
    tavernMap.onerror = () => {
      const fb = "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fi.etsystatic.com%2F38888920%2Fr%2Fil%2F84af78%2F6255979430%2Fil_1140xN.6255979430_6fok.jpg&f=1&nofb=1&ipt=6af6241776155aa6b296e518a8e6884837bb4919e0337438683d0447e5af1be0&ipo=images";
      if (tavernMap.src !== fb) tavernMap.src = fb;
    };
    tavernMap.src = "/assets/rooms/tavern.jpg";
    const tavernInterior = tavernMap;
    const tavernInteriorLoaded = true;

    const bankMap = new Image();
    let bankMapLoaded = false;
    bankMap.onload = () => { bankMapLoaded = true; };
    bankMap.onerror = () => {
      const fb = "https://i.pinimg.com/1200x/82/24/e4/8224e4e6112676a4d7387821bd57eed3.jpg";
      if (bankMap.src !== fb) bankMap.src = fb;
    };
    bankMap.src = "/assets/rooms/bank.jpg";

    const alchemistMap = new Image();
    let alchemistMapLoaded = false;
    alchemistMap.onload = () => { alchemistMapLoaded = true; };
    alchemistMap.onerror = () => {
      const fb = "https://i.pinimg.com/1200x/8d/31/b6/8d31b6b69794bb09c585c26fc968518a.jpg";
      if (alchemistMap.src !== fb) alchemistMap.src = fb;
    };
    alchemistMap.src = "/assets/rooms/alchemist.jpg";

    const marketplaceMap = new Image();
    let marketplaceMapLoaded = false;
    marketplaceMap.onload = () => { marketplaceMapLoaded = true; };
    marketplaceMap.onerror = () => {
      const fb = "https://i.etsystatic.com/38888920/r/il/45bf8c/5055801046/il_680x540.5055801046_sr78.jpg";
      if (marketplaceMap.src !== fb) marketplaceMap.src = fb;
    };
    marketplaceMap.src = "/assets/rooms/marketplace.jpg";

    const meditationMap = new Image();
    let meditationMapLoaded = false;
    meditationMap.onload = () => { meditationMapLoaded = true; };
    meditationMap.onerror = () => {
      const fb = "https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fi.etsystatic.com%2F18388031%2Fr%2Fil%2F781e38%2F4979311693%2Fil_794xN.4979311693_lh9m.jpg&f=1&nofb=1&ipt=8c41a6aa3a20014eff9904165ba7e80df5d0a2c0f6b767b7fd8153feb50bbcd0&ipo=images";
      if (meditationMap.src !== fb) meditationMap.src = fb;
    };
    meditationMap.src = "/assets/rooms/meditation.jpg";

    function getRoomFrame(roomId, W, H) {
      let img = null, defW = 1000, defH = 1000;
      switch (roomId) {
        case "arena":     img = colosseumMap;   defW = 1200; defH = 1350; break;
        case "builder":   img = gardensMap;     defW = 1200; defH = 1200; break;
        case "guilds":    img = tavernMap;      defW = 1140; defH = 1140; break;
        case "dao":       img = bankMap;        defW = 1000; defH = 1333; break;
        case "dnd":       img = alchemistMap;   defW = 807;  defH = 807;  break;
        case "bazaar":    img = marketplaceMap; defW = 680;  defH = 540;  break;
        case "mirror":    img = meditationMap;  defW = 794;  defH = 794;  break;
        default: return { x: 0, y: 0, dw: W, dh: H, scale: 1, iw: W, ih: H };
      }
      const iw = (img && img.naturalWidth) || defW;
      const ih = (img && img.naturalHeight) || defH;
      const scale = Math.min((W * 0.96) / iw, (H * 0.94) / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      return { x: (W - dw) / 2, y: (H - dh) / 2, dw, dh, scale, iw, ih };
    }

    function colosseumFrame(W, H) { return getRoomFrame("arena", W, H); }
    function gardensFrame(W, H) { return getRoomFrame("builder", W, H); }
    function tavernFrame(W, H) { return getRoomFrame("guilds", W, H); }
    function bankFrame(W, H) { return getRoomFrame("dao", W, H); }
    function alchemistFrame(W, H) { return getRoomFrame("dnd", W, H); }
    function marketplaceFrame(W, H) { return getRoomFrame("bazaar", W, H); }
    function meditationFrame(W, H) { return getRoomFrame("mirror", W, H); }

    function drawRoomExit(c, fr, color) {
      const ex = fr.x + fr.dw * 0.5;
      const ey = fr.y + fr.dh * 0.92;
      c.fillStyle = "rgba(10, 14, 22, 0.85)";
      c.beginPath();
      c.ellipse(ex, ey, 36, 14, 0, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = color || "#d7b45c";
      c.lineWidth = 2;
      c.stroke();
      c.font = "bold 9px system-ui,sans-serif";
      c.fillStyle = color || "#d7b45c";
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText("EXIT", ex, ey);
    }

    function drawRoomInteractiveMarkers(c, roomId, W, H, t, color) {
      const interactions = getRoomInteractions(roomId, W, H);
      for (const item of interactions) {
        c.save();
        const pulse = 0.55 + Math.sin(t * 0.005 + item.x * 0.05) * 0.3;
        c.fillStyle = "rgba(0, 0, 0, 0.55)";
        c.beginPath();
        c.ellipse(item.x, item.y + 12, 26, 9, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = color || "#d7b45c";
        c.lineWidth = 1.5;
        c.globalAlpha = pulse;
        c.beginPath();
        c.ellipse(item.x, item.y + 12, 22, 8, 0, 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
        c.font = "20px system-ui,sans-serif";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(item.icon, item.x, item.y - 2 + Math.sin(t * 0.004 + item.x) * 3);
        c.restore();
      }
    }

    function drawRoomArena(c, W, H, t, rh) {
      c.fillStyle = "#0d0505";
      c.fillRect(0, 0, W, H);
      if (colosseumMapLoaded && colosseumMap.naturalWidth > 0) {
        const fr = colosseumFrame(W, H);
        c.save();
        c.imageSmoothingEnabled = true;
        c.drawImage(colosseumMap, fr.x, fr.y, fr.dw, fr.dh);
        c.restore();
        drawRoomExit(c, fr, "#ef4444");
      }
      drawRoomInteractiveMarkers(c, "arena", W, H, t, "#ef4444");
      _drawRoomHero(c, rh, t);
    }

    function drawRoomBuilder(c, W, H, t, rh) {
      c.fillStyle = "#030d1a";
      c.fillRect(0, 0, W, H);
      if (gardensMapLoaded && gardensMap.naturalWidth > 0) {
        const fr = gardensFrame(W, H);
        c.save();
        c.imageSmoothingEnabled = true;
        c.drawImage(gardensMap, fr.x, fr.y, fr.dw, fr.dh);
        c.restore();
        drawRoomExit(c, fr, "#38bdf8");
      }
      drawRoomInteractiveMarkers(c, "builder", W, H, t, "#38bdf8");
      _drawRoomHero(c, rh, t);
    }

    function drawRoomGuilds(c, W, H, t, rh) {
      c.fillStyle = "#0d0a00";
      c.fillRect(0, 0, W, H);
      if (tavernMapLoaded && tavernMap.naturalWidth > 0) {
        const fr = tavernFrame(W, H);
        c.save();
        c.imageSmoothingEnabled = true;
        c.drawImage(tavernMap, fr.x, fr.y, fr.dw, fr.dh);
        c.restore();
        drawRoomExit(c, fr, "#f59e0b");
      }
      drawRoomInteractiveMarkers(c, "guilds", W, H, t, "#f59e0b");
      _drawRoomHero(c, rh, t);
    }

    function drawRoomDao(c, W, H, t, rh) {
      c.fillStyle = "#0d0b00";
      c.fillRect(0, 0, W, H);
      if (bankMapLoaded && bankMap.naturalWidth > 0) {
        const fr = bankFrame(W, H);
        c.save();
        c.imageSmoothingEnabled = true;
        c.drawImage(bankMap, fr.x, fr.y, fr.dw, fr.dh);
        c.restore();
        drawRoomExit(c, fr, "#fbbf24");
      }
      drawRoomInteractiveMarkers(c, "dao", W, H, t, "#fbbf24");
      _drawRoomHero(c, rh, t);
    }

    function drawRoomDnd(c, W, H, t, rh) {
      c.fillStyle = "#06000d";
      c.fillRect(0, 0, W, H);
      if (alchemistMapLoaded && alchemistMap.naturalWidth > 0) {
        const fr = alchemistFrame(W, H);
        c.save();
        c.imageSmoothingEnabled = true;
        c.drawImage(alchemistMap, fr.x, fr.y, fr.dw, fr.dh);
        c.restore();
        drawRoomExit(c, fr, "#c084fc");
      }
      drawRoomInteractiveMarkers(c, "dnd", W, H, t, "#c084fc");
      _drawRoomHero(c, rh, t);
    }

    function drawRoomBazaar(c, W, H, t, rh) {
      c.fillStyle = "#00100a";
      c.fillRect(0, 0, W, H);
      if (marketplaceMapLoaded && marketplaceMap.naturalWidth > 0) {
        const fr = marketplaceFrame(W, H);
        c.save();
        c.imageSmoothingEnabled = true;
        c.drawImage(marketplaceMap, fr.x, fr.y, fr.dw, fr.dh);
        c.restore();
        drawRoomExit(c, fr, "#10b981");
      }
      drawRoomInteractiveMarkers(c, "bazaar", W, H, t, "#10b981");
      _drawRoomHero(c, rh, t);
    }

    function drawRoomMirror(c, W, H, t, rh) {
      c.fillStyle = "#0d0008";
      c.fillRect(0, 0, W, H);
      if (meditationMapLoaded && meditationMap.naturalWidth > 0) {
        const fr = meditationFrame(W, H);
        c.save();
        c.imageSmoothingEnabled = true;
        c.drawImage(meditationMap, fr.x, fr.y, fr.dw, fr.dh);
        c.restore();
        drawRoomExit(c, fr, "#f472b6");
      }
      drawRoomInteractiveMarkers(c, "mirror", W, H, t, "#f472b6");
      _drawRoomHero(c, rh, t);
    }

    function _drawRoomHero(c, rh, t) {
      if (!rh) return;
      // Aura
      const aGrd = c.createRadialGradient(rh.x, rh.y, 4, rh.x, rh.y, 22);
      aGrd.addColorStop(0, "rgba(243,221,154,0.3)"); aGrd.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = aGrd; c.beginPath(); c.arc(rh.x, rh.y, 22, 0, Math.PI * 2); c.fill();
      // Shadow
      c.fillStyle = "rgba(0,0,0,0.45)"; c.beginPath(); c.ellipse(rh.x, rh.y + 16, 14, 5, 0, 0, Math.PI * 2); c.fill();
      // Lunar Hero Sprite
      const drewLunar = drawLunarHeroSprite(c, rh.x, rh.y, rh.dir, rh.isMoving, rh.animTick, 1.05);
      if (!drewLunar) {
        const heroBob = rh.isMoving ? Math.sin(rh.frame * Math.PI) * 4 : Math.sin(t * 0.004) * 2;
        drawCharacterAvatar(c, hero.avatar, rh.x, rh.y + heroBob);
      }
      // Name
      c.font = "italic bold 12px 'Georgia', 'Palatino Linotype', serif"; c.fillStyle = "#f3dd9a";
      c.shadowColor = "#000"; c.shadowBlur = 4;
      c.fillText(hero.name, rh.x, rh.y - 32);
      c.shadowBlur = 0;
      // Mini HP bar
      c.fillStyle = "rgba(0,0,0,0.7)"; c.fillRect(rh.x - 16, rh.y - 24, 32, 4);
      c.fillStyle = "#10b981"; c.fillRect(rh.x - 16, rh.y - 24, (hero.hp / hero.maxHp) * 32, 4);
    }

    /* ══════════════════════════════════════════════════════════════════════
       ROOM INTERACTIVE STATIONS & PROMPT SYSTEM
    ══════════════════════════════════════════════════════════════════════ */

    function getRoomInteractions(roomId, W, H) {
      const go = (path) => { if (typeof onNavigate === "function") onNavigate(path); else window.MTG && window.MTG.go && window.MTG.go(path); };
      const fr = getRoomFrame(roomId, W, H);

      switch (roomId) {
        case "arena": {
          return [
            {
              id: "arena_tables",
              name: "🏰 Arena Master",
              subtitle: "Browse Live & Open Tables",
              icon: "🏰",
              promptText: "Open Tables",
              x: fr.x + fr.dw * 0.50,
              y: fr.y + fr.dh * 0.40,
              radius: 70,
              onInteract() {
                if (window.MTG && window.MTG.openTablesModal) window.MTG.openTablesModal();
              }
            },
            {
              id: "arena_bot",
              name: "⚔️ Sparring Ring",
              subtitle: "Quick Match vs Bot",
              icon: "🤖",
              promptText: "Duel Bot",
              x: fr.x + fr.dw * 0.50,
              y: fr.y + fr.dh * 0.65,
              radius: 70,
              onInteract() {
                sessionStorage.setItem("mtg-pending-create", JSON.stringify({
                  name: "⚔️ Quick Match vs Bot",
                  format: "duel",
                  wager: 0,
                  vsBot: true,
                  botDifficulty: chosenBotDiff || "normal",
                  deckId: sessionStorage.getItem("mtg-selected-deck") || localStorage.getItem("mtg-selected-deck") || null,
                }));
                go("/table/new");
              }
            }
          ];
        }

        case "builder":
          return [
            {
              id: "builder_forge",
              name: "📖 Archivist Barrin's Desk",
              subtitle: "Deck Forge & Saved Decks",
              icon: "📖",
              promptText: "Forge Decks",
              x: fr.x + fr.dw * 0.50,
              y: fr.y + fr.dh * 0.55,
              radius: 80,
              onInteract() {
                if (window.MTG && window.MTG.openBuilderModal) window.MTG.openBuilderModal();
              }
            },
            {
              id: "builder_search",
              name: "🔮 Arcane Scrying Orb",
              subtitle: "Search 36,000+ Multiverse Cards",
              icon: "🔮",
              promptText: "Search Cards",
              x: fr.x + fr.dw * 0.32,
              y: fr.y + fr.dh * 0.45,
              radius: 80,
              onInteract() {
                if (window.MTG && window.MTG.openBuilderModal) window.MTG.openBuilderModal({ browse: true });
              }
            }
          ];

        case "bazaar":
          return [
            {
              id: "bazaar_squee",
              name: "👺 Squee the Goblin Trader",
              subtitle: "Card Marketplace · Buy & Sell Singles",
              icon: "👺",
              promptText: "Open Marketplace",
              x: fr.x + fr.dw * 0.28,
              y: fr.y + fr.dh * 0.52,
              radius: 80,
              onInteract() {
                if (window.MTG && window.MTG.openMarketplaceModal) window.MTG.openMarketplaceModal();
              }
            },
            {
              id: "bazaar_vron",
              name: "🧙 Archmage Vron",
              subtitle: "Multiverse Oracle Catalog",
              icon: "🧙",
              promptText: "Browse Catalog",
              x: fr.x + fr.dw * 0.50,
              y: fr.y + fr.dh * 0.40,
              radius: 80,
              onInteract() {
                if (window.MTG && window.MTG.openBuilderModal) window.MTG.openBuilderModal({ browse: true });
              }
            },
            {
              id: "bazaar_ariel",
              name: "🧚 Ariel the Pack Merchant",
              subtitle: "Booster Packs & Limited Draft",
              icon: "🧚",
              promptText: "Booster Packs",
              x: fr.x + fr.dw * 0.74,
              y: fr.y + fr.dh * 0.52,
              radius: 80,
              onInteract() {
                const panel = roomOverlay.querySelector("#dfk-room-panel");
                if (panel) {
                  panel.hidden = false;
                  const toggleBtn = roomOverlay.querySelector("#dfk-room-panel-toggle");
                  if (toggleBtn) toggleBtn.classList.add("gold");
                  const packEl = panel.querySelector("#pack-machine");
                  if (packEl) packEl.scrollIntoView({ behavior: "smooth" });
                }
              }
            }
          ];

        case "guilds":
          return [
            {
              id: "guilds_table",
              name: "🍺 The Bar",
              subtitle: "Guild orders and the common room",
              icon: "🍺",
              promptText: "Guild Chambers",
              x: fr.x + fr.dw * 0.62,
              y: fr.y + fr.dh * 0.58,
              radius: 70,
              onInteract() {
                if (window.MTG && window.MTG.openGuildsModal) window.MTG.openGuildsModal();
              }
            },
            {
              id: "guilds_throne",
              name: "🔥 The Hearth",
              subtitle: "Prize leagues and seasonal brackets",
              icon: "🔥",
              promptText: "Prize Leagues",
              x: fr.x + fr.dw * 0.82,
              y: fr.y + fr.dh * 0.46,
              radius: 64,
              onInteract() {
                if (window.MTG && window.MTG.openGuildsModal) window.MTG.openGuildsModal({ tab: "leagues" });
              }
            }
          ];

        case "dao":
          return [
            {
              id: "dao_vault",
              name: "🏛️ Vaultkeeper",
              subtitle: "Royal Treasury Governance & Proposals",
              icon: "🏛️",
              promptText: "DAO Governance",
              x: fr.x + fr.dw * 0.50,
              y: fr.y + fr.dh * 0.35,
              radius: 80,
              onInteract() {
                if (window.MTG && window.MTG.openDaoModal) window.MTG.openDaoModal();
              }
            },
            {
              id: "dao_faucet",
              name: "🪙 Daily $TCG Font",
              subtitle: "Claim Free Daily Wager $TCG",
              icon: "💧",
              promptText: "Claim $TCG",
              x: fr.x + fr.dw * 0.28,
              y: fr.y + fr.dh * 0.58,
              radius: 80,
              async onInteract() {
                try {
                  if (window.MTG && window.MTG.claimFaucet) await window.MTG.claimFaucet();
                } catch(e) {}
              }
            }
          ];

        case "dnd":
          return [
            {
              id: "dnd_rift",
              name: "🐉 Astral Rift Spire",
              subtitle: "2D D&D Battlemaps & Virtual Tabletop",
              icon: "🐉",
              promptText: "Open Battlemap",
              x: fr.x + fr.dw * 0.50,
              y: fr.y + fr.dh * 0.45,
              radius: 80,
              onInteract() {
                if (window.MTG && window.MTG.openDndModal) window.MTG.openDndModal({});
              }
            },
            {
              id: "dnd_dice",
              name: "🎲 Dice Altar",
              subtitle: "Roll Fate Polyhedral d20",
              icon: "🎲",
              promptText: "Roll d20",
              x: fr.x + fr.dw * 0.72,
              y: fr.y + fr.dh * 0.58,
              radius: 80,
              onInteract() {
                const roll = Math.ceil(Math.random() * 20);
                window.MTG_SFX && window.MTG_SFX.play && window.MTG_SFX.play("roll");
                addFloatingText(roomHero.x, roomHero.y - 30, `🎲 d20 Roll: ${roll}!`, roll === 20 ? "#4ade80" : roll === 1 ? "#ef4444" : "#fbbf24");
                const resEl = roomOverlay.querySelector("#dice-result");
                if (resEl) resEl.textContent = `🎲 d20 → ${roll}`;
              }
            }
          ];

        case "mirror":
          return [
            {
              id: "mirror_obelisk",
              name: "🪞 The Mystic Mirror",
              subtitle: "Planeswalker Reflection & Persona",
              icon: "🪞",
              promptText: "Character Sheet",
              x: fr.x + fr.dw * 0.50,
              y: fr.y + fr.dh * 0.38,
              radius: 80,
              onInteract() {
                if (typeof onOpenSheet === "function") onOpenSheet();
                else { const d = document.getElementById("dfk-sheet-drawer"); if (d) d.hidden = false; }
              }
            },
            {
              id: "mirror_wardrobe",
              name: "👗 Astral Wardrobe",
              subtitle: "Attire & Character Customization",
              icon: "👗",
              promptText: "Wardrobe",
              x: fr.x + fr.dw * 0.25,
              y: fr.y + fr.dh * 0.55,
              radius: 80,
              onInteract() {
                if (typeof onOpenSheet === "function") onOpenSheet();
                else { const d = document.getElementById("dfk-sheet-drawer"); if (d) d.hidden = false; }
              }
            },
            {
              id: "mirror_vanity",
              name: "🎨 Cosmetic Vanity",
              subtitle: "Colors & Multiverse Themes",
              icon: "🎨",
              promptText: "Vanity Table",
              x: fr.x + fr.dw * 0.75,
              y: fr.y + fr.dh * 0.55,
              radius: 80,
              onInteract() {
                if (typeof onOpenSheet === "function") onOpenSheet();
                else { const d = document.getElementById("dfk-sheet-drawer"); if (d) d.hidden = false; }
              }
            }
          ];

        default:
          return [];
      }
    }

    function updateRoomPrompt() {
      const def = ROOM_DEFS[currentRoom];
      if (!def) { promptEl.hidden = true; return; }

      const fr = getRoomFrame(currentRoom, viewW, viewH);
      const exitX = fr.x + fr.dw * 0.5;
      const exitY = fr.y + fr.dh * 0.92;
      const distExit = Math.hypot(roomHero.x - exitX, roomHero.y - exitY);
      if (distExit < 65) {
        roomNearestNpc = {
          name: "Portal Exit",
          subtitle: `Return to Overworld (${landmarks.find(l => l.id === currentRoom)?.name || "Sanctum"})`,
          icon: "🗺️",
          promptText: "Return to Overworld",
          onInteract: () => transitionToRoom("overworld")
        };
        promptEl.hidden = false;
        promptEl.innerHTML = `
          <div class="homeroom-prompt-content" style="border-color:${def.color};background:rgba(12,16,26,0.96)">
            <span class="homeroom-prompt-icon">🗺️</span>
            <div class="homeroom-prompt-info">
              <div style="display:flex;align-items:center;gap:6px">
                <b style="color:${def.color};font-size:13px">Portal Exit</b>
                <span class="dfk-planeswalker-tag" style="border-color:${def.color}">OVERWORLD</span>
              </div>
              <span class="muted" style="font-size:11px">Step through to return to the Multiverse map</span>
            </div>
            <button type="button" class="btn small gold homeroom-enter-btn" id="dfk-room-interact-btn">👉 [Spacebar] Exit [Esc]</button>
          </div>`;
        const b = promptEl.querySelector("#dfk-room-interact-btn");
        if (b) b.onclick = () => transitionToRoom("overworld");
        return;
      }

      // Check room interactions
      const interactions = getRoomInteractions(currentRoom, viewW, viewH);
      let nearest = null;
      let nearestDist = 999;
      for (const item of interactions) {
        const d = Math.hypot(roomHero.x - item.x, roomHero.y - item.y);
        if (d < item.radius && d < nearestDist) {
          nearestDist = d;
          nearest = item;
        }
      }

      roomNearestNpc = nearest;
      if (nearest) {
        promptEl.hidden = false;
        promptEl.innerHTML = `
          <div class="homeroom-prompt-content" style="border-color:${def.color};background:rgba(12,16,26,0.96)">
            <span class="homeroom-prompt-icon">${nearest.icon}</span>
            <div class="homeroom-prompt-info">
              <div style="display:flex;align-items:center;gap:6px">
                <b style="color:${def.color};font-size:13px">${escapeHtml(nearest.name)}</b>
                <span class="dfk-planeswalker-tag" style="border-color:${def.color}">INTERACT</span>
              </div>
              <span class="muted" style="font-size:11px">${escapeHtml(nearest.subtitle)}</span>
            </div>
            <button type="button" class="btn small gold homeroom-enter-btn" id="dfk-room-interact-btn">👉 [Spacebar] ${escapeHtml(nearest.promptText)}</button>
          </div>`;
        const b = promptEl.querySelector("#dfk-room-interact-btn");
        if (b) b.onclick = () => { if (nearest.onInteract) nearest.onInteract(); };
      } else {
        promptEl.hidden = true;
      }
    }

    function handleRoomInteract() {
      if (roomNearestNpc && roomNearestNpc.onInteract) {
        window.MTG_SFX && window.MTG_SFX.play && window.MTG_SFX.play("bell");
        roomNearestNpc.onInteract();
      }
    }

    /* ══════════════════════════════════════════════════════════════════════
       ROOM TRANSITION SYSTEM
    ══════════════════════════════════════════════════════════════════════ */

    function transitionToRoom(roomId) {
      window._rpgTransitionToRoom = transitionToRoom;
      if (isTransitioning) return;
      isTransitioning = true;
      window._rpgIsTransitioning = true;
      const def = ROOM_DEFS[roomId] || ROOM_DEFS.overworld;

      // Fade veil in
      veil.style.opacity = "0";
      veil.style.background = def.bg;
      veil.hidden = false;
      veil.style.transition = "opacity 0.35s ease";
      requestAnimationFrame(() => { veil.style.opacity = "1"; });

      setTimeout(() => {
        const exitingFrom = currentRoom;
        currentRoom = roomId;

        if (roomId === "overworld") {
          // Back to overworld
          canvas.style.display = "block";
          roomOverlay.hidden = true;
          playerCardEl.hidden = false;
          topNavHud.hidden = false;
          bottomDockEl.hidden = false;
          hotbarEl.hidden = false;
          ffxiChatEl.hidden = false;
          renderChatWindow();
          promptEl.hidden = true;
          dialogEl.hidden = true;
          minimapEl.hidden = false;

          // Respawn hero near landmark pad that brought them here
          const lm = landmarks.find(l => l.id === exitingFrom);
          if (lm && lm.padX != null && lm.padY != null) {
            hero.x = lm.padX;
            hero.y = lm.padY;
          } else if (lm) {
            hero.x = lm.x;
            hero.y = lm.y + lm.h / 2 + 25;
          } else {
            hero.x = Math.round(viewW * 0.50);
            hero.y = Math.round(viewH * 0.56);
          }
          hero.targetX = null;
          hero.targetY = null;
          hero.isMoving = false;
          areaCooldown = Date.now() + 3000;
        } else {
          // Enter interior room
          canvas.style.display = "block";
          minimapEl.hidden = true;
          promptEl.hidden = true;
          dialogEl.hidden = true;
          playerCardEl.hidden = true;
          topNavHud.hidden = true;
          bottomDockEl.hidden = true;
          hotbarEl.hidden = true;
          ffxiChatEl.hidden = true;

          // Setup room hero spawn (doorway bottom center)
          const fr = getRoomFrame(roomId, viewW, viewH);
          roomHero.x = Math.round(fr.x + fr.dw * 0.5);
          roomHero.y = Math.round(fr.y + fr.dh * 0.82);
          roomHero.targetX = null; roomHero.targetY = null; roomHero.isMoving = false;
          roomParticles = [];
          roomAnimTick = 0;

          // Build room overlay UI
          buildRoomOverlay(roomId, def);
          if (window.MTG?.bringToFront) window.MTG.bringToFront(roomOverlay);
          roomOverlay.hidden = false;
        }

        // Fade veil out
        veil.style.opacity = "0";
        setTimeout(() => {
          veil.hidden = true;
          isTransitioning = false;
          window._rpgIsTransitioning = false;
          window._rpgCurrentRoom = currentRoom;
        }, 350);
      }, 350);
    }

    function buildRoomOverlay(roomId, def) {
      // Panel along the right side with Diablo 2 / WoW stone styling
      roomOverlay.innerHTML = `
        <div class="dfk-room-panel" id="dfk-room-panel" style="border-color:${def.color}" hidden>
          <div class="dfk-room-panel-header" style="border-color:${def.color}80;color:${def.color}">
            <span class="dfk-room-panel-icon">${def.icon}</span>
            <span class="dfk-room-panel-title">${def.name}</span>
            <button type="button" class="btn small ghost dfk-room-exit-btn" id="dfk-room-exit-btn" title="Close Panel">
              ✖️ Close
            </button>
          </div>
          <div class="dfk-room-panel-body" id="dfk-room-panel-body">
            ${buildRoomPanelContent(roomId, def)}
          </div>
        </div>
        <div class="dfk-room-nav-hud" id="dfk-room-nav-hud" style="border-color:${def.color}50">
          <span class="dfk-room-location-tag" style="color:${def.color}">${def.icon} ${def.name}</span>
          <div class="dfk-room-minibar">
            <span>❤️ <span id="room-hp">${hero.hp}/${hero.maxHp}</span></span>
            <span>⚡ <span id="room-mp">${hero.mp}/${hero.maxMp}</span></span>
            <span>🪙 <span id="room-gold">${goldBalance.toLocaleString()}</span></span>
          </div>
          <button type="button" class="btn small ghost" id="dfk-room-panel-toggle" style="font-size:11px;padding:3px 8px;margin-left:6px" title="Toggle Quick Actions Panel">
            ⚡ Menu
          </button>
          <button type="button" class="btn small ghost" id="dfk-room-hud-return" style="font-size:11px;padding:3px 8px;margin-left:6px" title="Return to Overworld">
            🗺️ Return [Esc]
          </button>
        </div>
      `;

      const panel = roomOverlay.querySelector("#dfk-room-panel");
      const toggleBtn = roomOverlay.querySelector("#dfk-room-panel-toggle");
      if (toggleBtn && panel) {
        toggleBtn.onclick = () => {
          panel.hidden = !panel.hidden;
          toggleBtn.classList.toggle("gold", !panel.hidden);
        };
      }

      const exitBtn = roomOverlay.querySelector("#dfk-room-exit-btn");
      if (exitBtn && panel) {
        exitBtn.onclick = () => {
          panel.hidden = true;
          if (toggleBtn) toggleBtn.classList.remove("gold");
        };
      }

      const hudReturn = roomOverlay.querySelector("#dfk-room-hud-return");
      if (hudReturn) { hudReturn.onclick = () => transitionToRoom("overworld"); }

      // Wire up room-specific behaviors
      wireRoomPanel(roomId);
    }

    function buildRoomPanelContent(roomId, def) {
      switch (roomId) {
        case "arena": return `
          <div class="dfk-room-section">
            <h3>⚔️ The Colosseum</h3>
            <p class="muted" style="font-size:12px">Hero versus hero combat. Local tables stand in until the Colosseum contracts on Metis are connected.</p>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
              <button class="btn gold" id="room-btn-lobby">🏰 Browse Open Tables</button>
              <button class="btn gold" id="room-btn-bot">🤖 Quick Match vs Bot</button>
              <button class="btn ghost" id="room-btn-friend">🤝 Challenge a Friend</button>
            </div>
          </div>
          <div class="dfk-room-section" style="margin-top:14px">
            <h4>🤖 AI Difficulty <span class="muted" style="font-size:10px">— bounty scales up</span></h4>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${[["easy", "🐣 Apprentice", "+50 🪙"], ["normal", "🤖 Sparky", "+100 🪙"], ["hard", "👹 Titan", "+200 🪙"]]
                .map(([v, label, reward]) =>
                  `<button type="button" class="btn small ${v === "normal" ? "gold" : "ghost"} dfk-diff-btn" data-diff="${v}" style="display:flex;flex-direction:column;align-items:center;line-height:1.2">${label}<span style="font-size:9px;opacity:.75">${reward}</span></button>`).join("")}
            </div>
          </div>
          <div class="dfk-room-section" style="margin-top:14px">
            <h4>⚡ Battle Formats</h4>
            <div style="display:flex;flex-direction:column;gap:6px">
              <div class="dfk-format-row active" data-fmt="duel">⚔️ <b>Duel</b> <span class="muted">— 1v1 · 20 life</span></div>
              <div class="dfk-format-row" data-fmt="standard">📋 <b>Standard</b> <span class="muted">— 1v1 · 20 life</span></div>
              <div class="dfk-format-row" data-fmt="commander">👑 <b>Commander</b> <span class="muted">— 4-player · 40 life</span></div>
            </div>
          </div>
          <div class="dfk-room-section" style="margin-top:14px">
            <h4>🏆 Your Stats</h4>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <div class="dfk-stat-chip">🏆 Wins: <b id="stat-wins">—</b></div>
              <div class="dfk-stat-chip">💀 Losses: <b id="stat-losses">—</b></div>
              <div class="dfk-stat-chip">🤖 Bot Wins: <b id="stat-botwins">—</b></div>
              <div class="dfk-stat-chip">🪙 $TCG: <b>${tcgBalance.toLocaleString()}</b></div>
            </div>
          </div>`;
        case "builder": return `
          <div class="dfk-room-section">
            <h3>🌱 The Gardens</h3>
            <p class="muted" style="font-size:12px">Craft, import, and analyze your decks with full Scryfall oracle data.</p>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
              <button class="btn gold" id="room-btn-newdeck">✨ Create New Deck</button>
              <button class="btn gold" id="room-btn-mydecks">📚 My Saved Decks</button>
              <button class="btn ghost" id="room-btn-search">🔍 Search 36,158 Cards</button>
            </div>
          </div>
          <div class="dfk-room-section" style="margin-top:14px">
            <h4>🎴 Formats</h4>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              ${["Standard","Pioneer","Modern","Legacy","Vintage","Commander"].map(f =>
                `<span class="dfk-format-tag">${f}</span>`).join("")}
            </div>
          </div>
          <div class="dfk-room-section" style="margin-top:14px">
            <h4>📊 Quick Stats</h4>
            <div style="display:flex;gap:10px;flex-wrap:wrap">
              <div class="dfk-stat-chip">📖 Cards: <b>36,158</b></div>
              <div class="dfk-stat-chip">🃏 Sets: <b>28</b></div>
            </div>
          </div>`;
        case "guilds": return `
          <div class="dfk-room-section">
            <h3>🍺 The Tavern</h3>
            <p class="muted" style="font-size:12px">Join a Ravnica guild, earn seasonal glory, and climb prize league brackets.</p>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
              <button class="btn gold" id="room-btn-guilds">🛡️ View All Guilds</button>
              <button class="btn gold" id="room-btn-leagues">🏆 Prize Leagues</button>
              <button class="btn ghost" id="room-btn-leaderboard">📊 Leaderboard</button>
            </div>
          </div>
          <div class="dfk-room-section" style="margin-top:14px">
            <h4>🏴 The 10 Guilds</h4>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
              ${["🔴⬜ Boros","🔵⬛ Dimir","⬛🟢 Golgari","🔴🟢 Gruul","⬛⬜ Orzhov",
                 "🔵🟢 Simic","⬛🔴 Rakdos","🔵⬜ Azorius","🔴⬜⬛ Mardu","🔵🟢⬛ Sultai"].map(g =>
                `<div class="dfk-guild-pill">${g}</div>`).join("")}
            </div>
          </div>`;
        case "dao": return `
          <div class="dfk-room-section">
            <h3>🏦 The Bank</h3>
            <p class="muted" style="font-size:12px">Vote on proposals, manage the wager fee treasury, and claim staking rewards.</p>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
              <button class="btn gold" id="room-btn-dao">🗳️ Open DAO Panel</button>
            </div>
          </div>
          <div class="dfk-room-section" style="margin-top:14px">
            <h4>🪙 Treasury Overview</h4>
            <div style="display:flex;flex-direction:column;gap:6px">
              <div class="dfk-stat-chip">🪙 Your $TCG Balance: <b>${tcgBalance.toLocaleString()} $TCG</b></div>
              <div class="dfk-stat-chip">💎 Your $GG Reserve: <b>${ggBalance.toLocaleString()} $GG</b></div>
              <div class="dfk-stat-chip">📊 Fee Pool: <b>3% of all wagers</b></div>
              <div class="dfk-stat-chip">🗳️ Active Proposals: <b>—</b></div>
            </div>
          </div>`;
        case "dnd": return `
          <div class="dfk-room-section">
            <h3>⚗️ The Alchemist</h3>
            <p class="muted" style="font-size:12px">2D tile battlemaps, token positioning, dice rolling, and multiplayer chronicles.</p>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
              <button class="btn gold" id="room-btn-dnd">🗺️ Open Battlemap</button>
              <button class="btn ghost" id="room-btn-dice">🎲 Roll Dice</button>
            </div>
          </div>
          <div class="dfk-room-section" style="margin-top:14px">
            <h4>🎲 Quick Dice Roll</h4>
            <div style="display:flex;gap:6px;flex-wrap:wrap" id="dice-panel">
              ${["d4","d6","d8","d10","d12","d20","d100"].map(d =>
                `<button class="dfk-format-tag" style="cursor:pointer" data-die="${d}">${d}</button>`).join("")}
            </div>
            <div id="dice-result" style="margin-top:8px;font-size:18px;color:var(--gold-2);min-height:28px;text-align:center"></div>
          </div>`;
        case "bazaar": return `
          <div class="dfk-room-section">
            <h3>⚖️ The Marketplace</h3>
            <p class="muted" style="font-size:12px">Boosters, card collection, Limited drafts, and the Chronicler's quest board.</p>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
              <button class="btn gold" id="room-btn-marketplace">🛒 Open Card Marketplace</button>
              <button class="btn ghost" id="room-btn-cards">🔍 Browse Card Catalog</button>
            </div>
          </div>
          <div class="dfk-room-section" style="margin-top:14px">
            <h4>🌟 Quick Search</h4>
            <div style="display:flex;gap:6px;margin-top:6px">
              <input id="room-card-search" class="grow" placeholder="Search card name…" style="font-size:12px" />
              <button class="btn gold small" id="room-card-search-btn">Go</button>
            </div>
          </div>
          <div class="dfk-room-section" style="margin-top:14px">
            <h4>🎁 Pack Machine</h4>
            <div id="pack-machine"><span class="muted" style="font-size:11px">Loading boosters…</span></div>
          </div>
          <div class="dfk-room-section" style="margin-top:14px">
            <h4>🗃️ My Collection</h4>
            <div id="collection-summary"><span class="muted" style="font-size:11px">Loading collection…</span></div>
          </div>
          <div class="dfk-room-section" style="margin-top:14px">
            <h4>🎲 Limited Draft</h4>
            <p class="muted" style="font-size:11px">Draft 3 boosters against 7 AI drafters, then battle with your forged 40-card deck.</p>
            <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
              <button class="btn gold" id="room-btn-draft-start">🎲 Start Draft · 300 🪙</button>
              <button class="btn ghost" id="room-btn-draft-resume" hidden>Continue Draft</button>
            </div>
          </div>
          <div class="dfk-room-section" style="margin-top:14px">
            <h4>📜 Chronicler's Quest Board</h4>
            <div id="quest-board"><span class="muted" style="font-size:11px">Loading quests…</span></div>
          </div>`;
        case "mirror": return `
          <div class="dfk-room-section">
            <h3>🔮 Meditation Circle</h3>
            <p class="muted" style="font-size:12px">Customize your planeswalker avatar, inspect stats, and change themes.</p>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
              <button class="btn gold" id="room-btn-profile">✨ Open Character Sheet</button>
            </div>
          </div>`;
        default: return `<p>Loading…</p>`;
      }
    }

    function wireRoomPanel(roomId) {
      const go = (path) => { if (typeof onNavigate === "function") onNavigate(path); else window.MTG && window.MTG.go && window.MTG.go(path); };

      const btn = (id, fn) => { const el = roomOverlay.querySelector(`#${id}`); if (el) el.onclick = fn; };

      if (roomId === "arena") {
        const me = window.MTG && window.MTG.identity && window.MTG.identity(window.MTG_SECOND);
        btn("room-btn-lobby", () => {
          if (window.MTG && window.MTG.openTablesModal) window.MTG.openTablesModal();
        });
        btn("room-btn-bot", () => {
          sessionStorage.setItem("mtg-pending-create", JSON.stringify({
            name: "⚔️ Quick Match vs Bot",
            format: "duel",
            wager: 0,
            vsBot: true,
            botDifficulty: chosenBotDiff || "normal",
            deckId: sessionStorage.getItem("mtg-selected-deck") || localStorage.getItem("mtg-selected-deck") || null,
          }));
          go("/table/new");
        });
        btn("room-btn-friend", () => {
          if (window.MTG && window.MTG.openTablesModal) window.MTG.openTablesModal();
        });
        roomOverlay.querySelectorAll(".dfk-format-row").forEach(el => {
          el.onclick = () => {
            roomOverlay.querySelectorAll(".dfk-format-row").forEach(e => e.classList.remove("active"));
            el.classList.add("active");
          };
        });
        roomOverlay.querySelectorAll(".dfk-diff-btn").forEach(el => {
          el.onclick = () => {
            chosenBotDiff = el.dataset.diff || "normal";
            roomOverlay.querySelectorAll(".dfk-diff-btn").forEach(e => {
              e.classList.remove("gold");
              e.classList.add("ghost");
            });
            el.classList.add("gold");
            el.classList.remove("ghost");
          };
        });
        const bw = roomOverlay.querySelector("#stat-botwins");
        if (bw && me && me.stats) bw.textContent = me.stats.botWins || 0;
      }
      if (roomId === "builder") {
        btn("room-btn-newdeck", () => { window.MTG && window.MTG.openBuilderModal && window.MTG.openBuilderModal({ isNew: true }); });
        btn("room-btn-mydecks", () => { window.MTG && window.MTG.openBuilderModal && window.MTG.openBuilderModal(); });
        btn("room-btn-search", () => { window.MTG && window.MTG.openBuilderModal && window.MTG.openBuilderModal({ browse: true }); });
      }
      if (roomId === "guilds") {
        btn("room-btn-guilds", () => { window.MTG && window.MTG.openGuildsModal && window.MTG.openGuildsModal(); });
        btn("room-btn-leagues", () => { window.MTG && window.MTG.openGuildsModal && window.MTG.openGuildsModal({ tab: "leagues" }); });
        btn("room-btn-leaderboard", () => { window.MTG && window.MTG.openGuildsModal && window.MTG.openGuildsModal({ tab: "leagues" }); });
      }
      if (roomId === "dao") {
        btn("room-btn-dao", () => { window.MTG && window.MTG.openDaoModal && window.MTG.openDaoModal(); });
      }
      if (roomId === "dnd") {
        btn("room-btn-dnd", () => {
          if (window.MTG && window.MTG.openDndModal) window.MTG.openDndModal({});
        });
        btn("room-btn-dice", () => {
          const res = Math.ceil(Math.random() * 20);
          const el = roomOverlay.querySelector("#dice-result");
          if (el) el.textContent = `🎲 d20 → ${res}`;
        });
        roomOverlay.querySelectorAll("[data-die]").forEach(el => {
          el.onclick = () => {
            const sides = parseInt(el.dataset.die.slice(1), 10);
            const roll = Math.ceil(Math.random() * sides);
            const resEl = roomOverlay.querySelector("#dice-result");
            if (resEl) resEl.textContent = `🎲 ${el.dataset.die} → ${roll}`;
            window.MTG_SFX && window.MTG_SFX.play("roll");
          };
        });
      }
      if (roomId === "bazaar") {
        btn("room-btn-marketplace", () => {
          if (window.MTG && window.MTG.openMarketplaceModal) window.MTG.openMarketplaceModal();
        });
        btn("room-btn-cards", () => {
          if (window.MTG && window.MTG.openBuilderModal) window.MTG.openBuilderModal({ browse: true });
        });
        const searchBtn = roomOverlay.querySelector("#room-card-search-btn");
        const searchIn = roomOverlay.querySelector("#room-card-search");
        if (searchBtn && searchIn) {
          searchBtn.onclick = () => {
            const q = searchIn.value.trim();
            if (q && window.MTG && window.MTG.openBuilderModal) {
              window.MTG.openBuilderModal({ browse: true, q });
            }
          };
          searchIn.onkeydown = (e) => { if (e.key === "Enter") searchBtn.onclick(); };
        }
        initPackMachine();
        initCollectionSummary();
        initQuestBoard();
        btn("room-btn-draft-start", startDraftFlow);
        btn("room-btn-draft-resume", openDraftModal);
        checkDraftResume();
      }
      if (roomId === "mirror") {
        btn("room-btn-profile", () => {
          if (typeof onOpenSheet === "function") onOpenSheet();
          else { const d = document.getElementById("dfk-sheet-drawer"); if (d) d.hidden = false; }
        });
      }
    }

    /* ══════════════════════════════════════════════════════════════════════
       ADVENTURE SYSTEMS UI — pack machine, collection, quest board, draft
    ══════════════════════════════════════════════════════════════════════ */

    function adventureApi() {
      return window.MTG && window.MTG.api;
    }

    function packGrouping(packs) {
      const map = {};
      for (const p of packs) (map[p.tier] = map[p.tier] || []).push(p);
      return Object.keys(map).map((tier) => ({ tier, items: map[tier] }));
    }

    function rarityBorder(c) {
      const r = (c.rarity || "").toLowerCase();
      if (r === "mythic") return "2px solid #f87171";
      if (r === "rare") return "2px solid #fbbf24";
      if (r === "uncommon") return "2px solid #c084fc";
      return "2px solid #94a3b8";
    }

    function refreshAdventureGold(balance, user) {
      if (typeof balance === "number") {
        goldBalance = balance;
        tcgBalance = balance;
      }
      if (user) {
        if (typeof user.tcgBalance === "number") tcgBalance = user.tcgBalance;
        if (typeof user.ggBalance === "number") ggBalance = user.ggBalance;
        if (window.MTG.setCachedUser) window.MTG.setCachedUser(user);
      }
      renderPlayerCard();
      updatePlayerVitals();
      if (window.MTG_SFX && window.MTG_SFX.play) window.MTG_SFX.play("coin");
    }

    async function initPackMachine() {
      const el = roomOverlay.querySelector("#pack-machine");
      if (!el) return;
      el.innerHTML = `<span class="muted" style="font-size:11px">Loading boosters…</span>`;
      try {
        const res = await adventureApi()("/api/shop/packs");
        const packs = res.packs;
        if (!packs || !packs.length) { el.innerHTML = `<span class="muted" style="font-size:11px">No boosters available.</span>`; return; }
        el.innerHTML = `
          <select id="pack-set" class="grow" style="width:100%;font-size:12px;margin-bottom:6px">
            ${packGrouping(packs).map((g) =>
              `<optgroup label="${escapeHtml(g.tier)}">${g.items.map((p) =>
                `<option value="${p.id}">${p.icon || "🎴"} ${escapeHtml(p.name)} — ${p.price} 🪙</option>`).join("")}
              </optgroup>`).join("")}
          </select>
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <button class="btn gold" id="pack-open-btn">🔓 Crack Pack</button>
            <span class="muted" id="pack-price" style="font-size:11px"></span>
          </div>
          <div id="pack-reveal" style="margin-top:8px"></div>`;
        const sel = el.querySelector("#pack-set");
        const priceTxt = el.querySelector("#pack-price");
        const priceFor = () => {
          const p = packs.find((x) => x.id === sel.value);
          if (p) priceTxt.textContent = `${p.price} 🪙 per booster · 10C / 3U / 1R`;
        };
        sel.onchange = priceFor;
        priceFor();
        el.querySelector("#pack-open-btn").onclick = () => openPack(sel.value);
      } catch (err) {
        el.innerHTML = `<span class="muted" style="font-size:11px">${escapeHtml(err.message)}</span>`;
      }
    }

    async function openPack(code) {
      const reveal = roomOverlay.querySelector("#pack-reveal");
      if (reveal) reveal.innerHTML = `<span class="muted" style="font-size:11px">Cracking the foil seal… ✨</span>`;
      try {
        const res = await adventureApi()("/api/shop/packs/open", { method: "POST", body: { setCode: code } });
        refreshAdventureGold(res.balance, res.user);
        let html = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:6px">`;
        for (const c of res.pack) {
          html += `<div title="${escapeHtml(c.name)} — ${escapeHtml(c.type_line || "")}" style="border:${rarityBorder(c)};border-radius:6px;overflow:hidden;cursor:pointer" onclick="window.MTG.toast && window.MTG.toast('🃏 ${escapeHtml(c.name)} — ${escapeHtml(c.type_line || "")}')"><img src="${c.image}" alt="" style="width:100%;display:block" loading="lazy"></div>`;
        }
        html += `</div>`;
        if (reveal) reveal.innerHTML = html;
        window.MTG.toast(`🎁 ${res.packDef.name} cracked! +${res.pack.length} cards → collection (${goldBalance.toLocaleString()} 🪙 left)`);
        if (res.progress && res.progress.achievements > 0) window.MTG.toast(`🏆 ${res.progress.achievements} achievement${res.progress.achievements > 1 ? "s" : ""} unlocked!`);
        initCollectionSummary();
        initQuestBoard();
      } catch (err) {
        if (reveal) reveal.innerHTML = `<span class="muted" style="font-size:11px">${escapeHtml(err.message)}</span>`;
        window.MTG.toast(err.message);
      }
    }

    async function initCollectionSummary() {
      const el = roomOverlay.querySelector("#collection-summary");
      if (!el) return;
      try {
        const res = await adventureApi()("/api/collection");
        el.innerHTML = `<button class="btn ghost" id="room-btn-collection" style="width:100%">🗃️ Open Collection · ${res.unique} unique / ${res.total} cards</button>`;
        roomOverlay.querySelector("#room-btn-collection").onclick = () => openCollectionModal();
      } catch (err) {
        el.innerHTML = `<span class="muted" style="font-size:11px">${escapeHtml(err.message)}</span>`;
        if (/Log in/.test(err.message)) {
          el.innerHTML = `<button class="btn ghost" id="room-btn-collection" style="width:100%">🗃️ Log in to view your Collection</button>`;
          roomOverlay.querySelector("#room-btn-collection").onclick = () => window.MTG.openAuthModal && window.MTG.openAuthModal();
        }
      }
    }

    async function openCollectionModal() {
      if (!window.MTG.openModal) return;
      try {
        const coll = await adventureApi()("/api/collection");
        window.MTG.openModal(`
          <div style="max-height:80vh;overflow:auto">
            <h2>🗃️ My Card Collection</h2>
            <p class="muted">${coll.unique} unique cards · ${coll.total} total cards</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:6px;margin-top:12px">
              ${coll.items.length ? coll.items.map((it) =>
                `<div class="dfk-format-row" style="padding:6px 8px;display:flex;gap:6px;align-items:center"><span style="flex:1">${escapeHtml(it.name)}</span><span class="muted" style="font-size:10px">×${it.count}</span></div>`).join("")
                : `<p class="muted">No cards yet — crack a booster at the Pack Machine!</p>`}
            </div>
          </div>`);
      } catch (err) {
        window.MTG.toast(err.message);
      }
    }

    async function initQuestBoard() {
      const el = roomOverlay.querySelector("#quest-board");
      if (!el) return;
      try {
        const res = await adventureApi()("/api/quests");
        const daily = res.daily || {};
        el.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:6px">
            ${res.quests.map((q) => `
              <div class="dfk-format-row" style="padding:6px 8px;display:flex;gap:6px;align-items:flex-start">
                <span style="font-size:14px">${q.icon}</span>
                <div style="flex:1;min-width:0">
                  <div style="display:flex;justify-content:space-between;gap:6px">
                    <b style="font-size:11px">${escapeHtml(q.name)}</b>
                    <span class="muted" style="font-size:10px;white-space:nowrap">${q.done ? `✅ +${q.reward} 🪙` : `+${q.reward} 🪙`}</span>
                  </div>
                  <div class="muted" style="font-size:10px">${escapeHtml(q.desc)}</div>
                  <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
                    <div class="dfk-quest-bar"><div style="width:${Math.min(100, (q.progress / q.target) * 100)}%;height:100%;background:var(--gold-2,#d7b45c);border-radius:4px"></div></div>
                    <span style="font-size:10px" class="muted">${q.done ? "done" : `${q.progress}/${q.target}`}</span>
                  </div>
                </div>
              </div>`).join("")}
            <div class="dfk-format-row" style="padding:6px 8px;display:flex;gap:6px;align-items:center;border-color:rgba(251,191,36,.5)">
              <span style="font-size:14px">📅</span>
              <div style="flex:1">
                <b style="font-size:11px">Daily Login Streak</b>
                <div class="muted" style="font-size:10px">${daily.claimed ? "Claimed today." : `Unclaimed — +${daily.nextReward} 🪙 today`} · Streak: ${daily.streak} day${daily.streak === 1 ? "" : "s"}</div>
              </div>
              <button class="btn gold small" id="quest-claim-btn" ${daily.claimed ? "disabled" : ""}>${daily.claimed ? "✓ Done" : "Claim"}</button>
            </div>
            <button class="btn small ghost" id="quest-open-tab" style="width:100%">📜 Open full Quest Log</button>`;
        const openTab = el.querySelector("#quest-open-tab");
        if (openTab) {
          openTab.onclick = () => {
            if (window.MTG.openInventoryModal) window.MTG.openInventoryModal({ tab: "quests" });
          };
        }
        const claimBtn = el.querySelector("#quest-claim-btn");
        if (claimBtn) claimBtn.onclick = async () => {
          try {
            const c = await adventureApi()("/api/quests/claim", { method: "POST" });
            refreshAdventureGold(c.balance, c.user);
            window.MTG.toast(`📅 Daily reward +${c.reward} 🪙 claimed! (${c.streak}-day streak)`);
            if (c.achievements > 0) window.MTG.toast(`🏆 ${c.achievements} achievement${c.achievements > 1 ? "s" : ""} unlocked!`);
            initQuestBoard();
          } catch (err) { window.MTG.toast(err.message); }
        };
      } catch (err) {
        el.innerHTML = `<span class="muted" style="font-size:11px">${escapeHtml(err.message)}</span>`;
        if (/Log in/.test(err.message)) {
          el.innerHTML = `<button class="btn gold small" style="width:100%" id="quest-login-btn">🔑 Log in for Daily Quests</button>`;
          roomOverlay.querySelector("#quest-login-btn").onclick = () => window.MTG.openAuthModal && window.MTG.openAuthModal();
        }
      }
    }

    async function checkDraftResume() {
      const resumeBtn = roomOverlay.querySelector("#room-btn-draft-resume");
      if (!resumeBtn) return;
      try {
        const res = await adventureApi()("/api/draft/state");
        const s = res.state;
        if (s && !s.complete) {
          resumeBtn.hidden = false;
          resumeBtn.textContent = `Continue Draft (${s.picks.length}/${s.totalPicks || 21} picks)`;
        } else {
          resumeBtn.hidden = true;
        }
      } catch { /* not logged in / no draft */ }
    }

    async function startDraftFlow() {
      if (!window.MTG.openModal) return;
      try {
        const sets = await adventureApi()("/api/draft/sets");
        if (!sets.sets || !sets.sets.length) { window.MTG.toast("No draft sets available."); return; }
        window.MTG.openModal(`
          <h2>🎲 Limited Draft</h2>
          <p class="muted">Entry: <b>300 🪙</b> · 3 boosters of 14 · pick 21 cards against 7 AI drafters · your deck is forged for you.</p>
          <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">
            <label style="font-size:12px"><b>Booster set</b>
              <select id="draft-set" class="grow" style="width:100%;margin-top:4px">
                ${sets.sets.map((s) => `<option value="${s.id}">${s.icon || "🎴"} ${escapeHtml(s.name)} — ${s.price} 🪙</option>`).join("")}
              </select>
            </label>
            <button class="btn gold" id="draft-confirm">🎲 Enter the Draft (300 🪙)</button>
          </div>`);
        document.querySelector("#draft-confirm").onclick = async () => {
          try {
            const sel = document.querySelector("#draft-set");
            const res = await adventureApi()("/api/draft/start", { method: "POST", body: { setCode: sel.value } });
            refreshAdventureGold(res.balance);
            window.MTG.closeModal();
            openDraftModal();
          } catch (err) { window.MTG.toast(err.message); }
        };
      } catch (err) { window.MTG.toast(err.message); }
    }

    function draftCardHtml(c) {
      return `<div class="dfk-draft-card" title="${escapeHtml(c.name)} — ${escapeHtml(c.type_line || "")}" onclick="window.MTG_DRAFT_PICK('${c.id}')">
        <img src="${c.image}" alt="${escapeHtml(c.name)}" loading="lazy">
      </div>`;
    }

    async function openDraftModal() {
      if (!window.MTG.openModal) return;
      try {
        const res = await adventureApi()("/api/draft/state");
        const s = res.state;
        if (!s) { window.MTG.toast("No active draft — start one from the Bazaar."); return; }
        if (s.complete) { showDraftComplete(); return; }
        window.MTG_DRAFT_PICK = async (cardId) => {
          const idx = s.pack.findIndex((c) => c.id === cardId);
          if (idx < 0) return;
          try {
            await adventureApi()("/api/draft/pick", { method: "POST", body: { index: idx } });
            openDraftModal();
          } catch (err) { window.MTG.toast(err.message); }
        };
        window.MTG.openModal(`
          <div style="max-height:82vh;overflow:auto">
            <h2>🎲 Limited Draft — Pack ${s.packIndex + 1}/3</h2>
            <p class="muted">Pick ${s.packPick + 1}/7 from this booster · ${s.picks.length} picked so far</p>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:10px">
              ${s.pack.map(draftCardHtml).join("")}
            </div>
            ${s.picks.length ? `
              <h4 style="margin-top:14px">Your Picks (${s.picks.length})</h4>
              <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px">
                ${s.picks.slice(-12).map((c) => `<img src="${c.image}" alt="" style="width:44px;height:62px;object-fit:cover;border-radius:4px;border:1px solid var(--line, rgba(255,255,255,.15))" loading="lazy">`).join("")}
              </div>` : ""}
          </div>`);
      } catch (err) { window.MTG.toast(err.message); }
    }

    async function showDraftComplete() {
      try {
        const res = await adventureApi()("/api/draft/deck", { method: "POST" });
        const deck = res.deck;
        const shown = deck.cards.slice(0, 24);
        window.MTG.openModal(`
          <h2>🎉 Draft Complete!</h2>
          <p class="muted">Your 40-card deck <b>${escapeHtml(deck.name)}</b> was forged and saved to your saved decks.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px;margin-top:10px">
            ${shown.map((c) => `<div class="dfk-format-row" style="padding:4px 6px;font-size:10px;display:flex;gap:4px"><span style="flex:1">${escapeHtml(c.name)}</span><span class="muted">×${c.count}</span></div>`).join("")}
            ${deck.cards.length > shown.length ? `<div class="muted" style="font-size:10px;grid-column:1/-1">+${deck.cards.length - shown.length} more…</div>` : ""}
          </div>
          <div style="display:flex;gap:6px;margin-top:12px">
            <button class="btn gold" id="draft-play-btn">⚔️ Play it vs the AI</button>
            <button class="btn ghost" id="draft-close-btn">Close</button>
          </div>`);
        const playBtn = document.querySelector("#draft-play-btn");
        if (playBtn) playBtn.onclick = () => {
          window.MTG.closeModal();
          sessionStorage.setItem("mtg-pending-create", JSON.stringify({
            name: "🎲 Draft Match vs AI",
            format: "duel",
            wager: 0,
            vsBot: true,
            botDifficulty: "normal",
            deckId: deck.id,
          }));
          go("/table/new");
        };
        document.querySelector("#draft-close-btn").onclick = () => window.MTG.closeModal();
      } catch (err) { window.MTG.toast(err.message); }
    }

    /* ══════════════════════════════════════════════════════════════════════
       HUD RENDERERS
    ══════════════════════════════════════════════════════════════════════ */

    function toggleInventoryModal() {
      const m = document.getElementById("modal");
      if (m && !m.hidden && m.querySelector(".inventory-screen-wrap")) {
        if (window.MTG && window.MTG.closeModal) window.MTG.closeModal();
      } else {
        if (window.MTG && window.MTG.openInventoryModal) window.MTG.openInventoryModal();
        else if (window.MTG && window.MTG.openBuilderModal) window.MTG.openBuilderModal();
      }
    }

    function toggleTablesModal() {
      const m = document.getElementById("modal");
      if (m && !m.hidden && m.querySelector("#lobby-root")) {
        if (window.MTG && window.MTG.closeModal) window.MTG.closeModal();
      } else {
        if (window.MTG && window.MTG.openTablesModal) window.MTG.openTablesModal();
      }
    }

    function toggleGuildsModal() {
      const m = document.getElementById("modal");
      if (m && !m.hidden && m.querySelector("#guilds-root")) {
        if (window.MTG && window.MTG.closeModal) window.MTG.closeModal();
      } else {
        if (window.MTG && window.MTG.openGuildsModal) window.MTG.openGuildsModal();
      }
    }

    function toggleDaoModal() {
      const m = document.getElementById("modal");
      if (m && !m.hidden && m.querySelector("#dao-root")) {
        if (window.MTG && window.MTG.closeModal) window.MTG.closeModal();
      } else {
        if (window.MTG && window.MTG.openDaoModal) window.MTG.openDaoModal();
      }
    }

    function toggleDndModal() {
      const ol = document.getElementById("dnd-full-overlay");
      if (ol) {
        const closeBtn = document.getElementById("dnd-overlay-close");
        if (closeBtn) closeBtn.click();
        else ol.remove();
      } else {
        if (window.MTG && window.MTG.openDndModal) window.MTG.openDndModal({});
      }
    }

    function renderPlayerCard() {
      const u = window.MTG && window.MTG.getCachedUser && window.MTG.getCachedUser();
      const hasWallet = !!(u && u.walletAddress);
      const walletIcon = hasWallet ? (u.walletChain === "solana" ? "👻" : "🦊") : "👛";
      const lvl = u ? (u.level || 1) : 1;
      const xp = u ? (u.xp || 0) : 0;
      const xpNeeded = u ? (u.xpNeeded || (lvl * 100)) : (lvl * 100);
      const xpPct = Math.min(100, Math.max(0, Math.round((xp / xpNeeded) * 100)));

      playerCardEl.innerHTML = `
        <div class="dfk-card-inner">
          <div class="dfk-portrait-col" style="display:flex; flex-direction:column; align-items:center; gap:4px">
            <div class="dfk-portrait-wrap" id="dfk-card-portrait" title="Click portrait to open Planeswalker Profile & Character Sheet">
              ${photoAvatar(hero.avatar)
                ? `<img class="dfk-portrait-photo" src="${escapeHtml(hero.avatar)}" alt="">`
                : `<span class="dfk-portrait-sprite">${hero.avatar}</span>`}
              <span class="dfk-level-badge">Lv. ${lvl}</span>
            </div>
            <div class="dfk-active-deck-badge" id="dfk-active-deck-badge" title="Click to open active deck in inventory builder" style="cursor: pointer; text-align: center; font-size: 9px; background: rgba(0,0,0,0.5); padding: 3px 6px; border-radius: 4px; border: 1px solid rgba(215,180,92,0.4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 68px; color: #f3dd9a;">
              🎴 ${activeDeckName}
            </div>
          </div>
          <div class="dfk-vitals-wrap">
            <div class="dfk-hero-header">
              <span class="dfk-hero-name" id="dfk-card-name" title="${escapeHtml(hero.name)}">${escapeHtml(hero.name)}</span>
            </div>
            <div class="dfk-wubrg-row">
              <span class="dfk-mana-pip pip-w" title="White">☀️</span>
              <span class="dfk-mana-pip pip-u" title="Blue">💧</span>
              <span class="dfk-mana-pip pip-b" title="Black">💀</span>
              <span class="dfk-mana-pip pip-r" title="Red">🔥</span>
              <span class="dfk-mana-pip pip-g" title="Green">🌳</span>
              <span class="dfk-status-pill" style="margin-left:auto">● Online</span>
            </div>
            <div class="dfk-wealth-row" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
              <div class="dfk-wealth-badge" title="$TCG Token Balance">🪙 <b id="dfk-card-tcg">${tcgBalance.toLocaleString()}</b> <small>$TCG</small></div>
              <div class="dfk-wealth-badge" style="color:#c084fc;" title="$GG Token Reserve">💎 <b id="dfk-card-gg">${ggBalance.toLocaleString()}</b> <small>$GG</small></div>
              <div class="dfk-wealth-badge">⭐ <b>${xp}/${xpNeeded}</b> <small>XP</small></div>
            </div>
            <div class="dfk-xp-bar" style="width:100%;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;margin-top:3px;" title="${xp} / ${xpNeeded} XP (${xpPct}%)">
              <div style="width:${xpPct}%;height:100%;background:linear-gradient(90deg,#8b5cf6,#eab308);border-radius:2px;"></div>
            </div>
          </div>
        </div>
        <div class="dfk-card-actions" style="display:flex; flex-wrap:wrap; gap:4px; margin-top:8px;">
          <button type="button" class="btn small ghost" id="btn-dfk-open-decks" title="Open Tolarian Deck & Card Inventory Overlay [I]">🎒 Inventory [I]</button>
          <button type="button" class="btn small ghost" id="btn-dfk-open-tables" title="Open Grand Arena Tables Overlay [T]">🏰 Tables</button>
        </div>
      `;

      const openSheet = () => {
        if (typeof onOpenSheet === "function") onOpenSheet();
        else { const d = document.getElementById("dfk-sheet-drawer"); if (d) d.hidden = false; }
      };

      const p = playerCardEl.querySelector("#dfk-card-portrait");
      if (p) p.onclick = openSheet;

      const deckBadge = playerCardEl.querySelector("#dfk-active-deck-badge");
      if (deckBadge) deckBadge.onclick = toggleInventoryModal;

      const db = playerCardEl.querySelector("#btn-dfk-open-decks");
      if (db) db.onclick = toggleInventoryModal;

      const tb = playerCardEl.querySelector("#btn-dfk-open-tables");
      if (tb) tb.onclick = toggleTablesModal;
    }

    function updatePlayerVitals() {
      const hpFill = playerCardEl.querySelector("#dfk-hp-fill");
      const hpTxt = playerCardEl.querySelector("#dfk-hp-txt");
      const mpFill = playerCardEl.querySelector("#dfk-mp-fill");
      const mpTxt = playerCardEl.querySelector("#dfk-mp-txt");
      const tcgTxt = playerCardEl.querySelector("#dfk-card-tcg");
      const ggTxt = playerCardEl.querySelector("#dfk-card-gg");
      const goldTxt = playerCardEl.querySelector("#dfk-card-gold");
      if (hpFill) hpFill.style.width = `${(hero.hp / hero.maxHp) * 100}%`;
      if (hpTxt) hpTxt.textContent = `${hero.hp}/${hero.maxHp}`;
      if (mpFill) mpFill.style.width = `${(hero.mp / hero.maxMp) * 100}%`;
      if (mpTxt) mpTxt.textContent = `${hero.mp}/${hero.maxMp}`;
      if (tcgTxt) tcgTxt.textContent = tcgBalance.toLocaleString();
      if (ggTxt) ggTxt.textContent = ggBalance.toLocaleString();
      if (goldTxt) goldTxt.textContent = tcgBalance.toLocaleString();

      // Update Diablo 2 / WoW HUD Orbs at screen bottom
      const d2Hp = hotbarEl.querySelector("#d2-life-fill");
      const d2HpTxt = hotbarEl.querySelector("#d2-life-txt");
      const d2Mp = hotbarEl.querySelector("#d2-mana-fill");
      const d2MpTxt = hotbarEl.querySelector("#d2-mana-txt");
      if (d2Hp) d2Hp.style.height = `${Math.min(100, Math.max(0, (hero.hp / hero.maxHp) * 100))}%`;
      if (d2HpTxt) d2HpTxt.textContent = `${hero.hp}/${hero.maxHp}`;
      if (d2Mp) d2Mp.style.height = `${Math.min(100, Math.max(0, (hero.mp / hero.maxMp) * 100))}%`;
      if (d2MpTxt) d2MpTxt.textContent = `${hero.mp}/${hero.maxMp}`;

      // Update room minibar too
      const rHp = roomOverlay.querySelector("#room-hp");
      const rMp = roomOverlay.querySelector("#room-mp");
      const rGold = roomOverlay.querySelector("#room-gold");
      if (rHp) rHp.textContent = `${hero.hp}/${hero.maxHp}`;
      if (rMp) rMp.textContent = `${hero.mp}/${hero.maxMp}`;
      if (rGold) rGold.textContent = `${tcgBalance.toLocaleString()} $TCG`;
    }

    function renderTopNavHud() {
      const u = window.MTG && window.MTG.getCachedUser && window.MTG.getCachedUser();
      const sfxOn = !!(window.MTG_SFX && window.MTG_SFX.enabled);
      const bgmOn = !!(window.MTG_BGM && window.MTG_BGM.enabled);
      const walletIcon = u?.walletAddress
        ? (u.walletChain === "solana" ? "👻" : "🦊")
        : "👛";

      topNavHud.innerHTML = `
        <button type="button" class="dfk-nav-pill ${sfxOn ? 'active' : ''}" id="btn-dfk-sfx" title="Toggle Sound Effects (${sfxOn ? 'On' : 'Muted'})">
          ${sfxOn ? "🔔" : "🔕"}
        </button>
        <button type="button" class="dfk-nav-pill ${bgmOn ? 'active' : ''}" id="btn-dfk-music" title="Music Playlist (${bgmOn ? 'Playing' : 'Off'})">
          ${bgmOn ? "🎵" : "🔇"}
        </button>
        <button type="button" class="dfk-nav-pill" id="btn-dfk-skin" title="Switch Multiverse Visual Theme">
          🎨
        </button>
        <button type="button" class="dfk-nav-pill" id="btn-dfk-top-web3" title="${u?.walletAddress ? `Connected (${u.walletChain || 'ethereum'}): ${u.walletAddress}` : 'Log in with Wallet'}">
          ${walletIcon}
        </button>
        <button type="button" class="dfk-nav-pill" id="btn-dfk-fs" title="Toggle Fullscreen">
          ⛶
        </button>
      `;

      // SFX button
      const sfxBtn = topNavHud.querySelector("#btn-dfk-sfx");
      if (sfxBtn && window.MTG_SFX) {
        sfxBtn.onclick = (e) => {
          e.stopPropagation();
          window.MTG_SFX.unlock();
          const next = !window.MTG_SFX.enabled;
          window.MTG_SFX.setEnabled(next);
          if (next) window.MTG_SFX.play("start");
          renderTopNavHud();
        };
      }

      // Music button
      const musicBtn = topNavHud.querySelector("#btn-dfk-music");
      if (musicBtn) {
        musicBtn.onclick = (e) => {
          e.stopPropagation();
          if (!window.MTG_BGM) return;
          const tpl = `
            <div style="padding: 16px; min-width: 320px;">
              <h2 style="margin-top:0;color:var(--gold-2)">🎵 Multiverse Music Controls</h2>
              <div style="margin-bottom: 14px; display: flex; align-items: center; justify-content: space-between;">
                <span>Enable Music</span>
                <input type="checkbox" id="bgm-toggle" ${window.MTG_BGM.enabled ? "checked" : ""}>
              </div>
              <div style="margin-bottom: 14px;">
                <label style="display:block; margin-bottom:4px;">Volume</label>
                <input type="range" id="bgm-vol" min="0" max="1" step="0.05" value="${window.MTG_BGM.volume}" style="width:100%">
              </div>
              <div style="margin-bottom: 14px;">
                <label style="display:block; margin-bottom:4px;">Track Playlist</label>
                <select id="bgm-track" style="width:100%; padding: 6px; background:#0d111a; color:#fff; border:1px solid var(--line); border-radius:6px;">
                  ${window.MTG_BGM.tracks.map(t => `<option value="${t.id}" ${window.MTG_BGM.track === t.id ? "selected" : ""}>${t.name}</option>`).join("")}
                </select>
              </div>
            </div>
          `;
          if (window.MTG && window.MTG.openModal) {
             window.MTG.openModal(tpl);
             setTimeout(() => {
               const tog = document.getElementById("bgm-toggle");
               if (tog) tog.onchange = (ev) => {
                 if (ev.target.checked !== window.MTG_BGM.enabled) window.MTG_BGM.toggle();
                 renderTopNavHud();
               };
               const vol = document.getElementById("bgm-vol");
               if (vol) vol.oninput = (ev) => window.MTG_BGM.setVolume(parseFloat(ev.target.value));
               const trk = document.getElementById("bgm-track");
               if (trk) trk.onchange = (ev) => { window.MTG_BGM.setTrack(ev.target.value); renderTopNavHud(); };
             }, 50);
          }
        };
      }

      // Skin / Theme button
      const skinBtn = topNavHud.querySelector("#btn-dfk-skin");
      if (skinBtn) {
        skinBtn.onclick = (e) => {
          e.stopPropagation();
          const skins = window.MTG?.SKINS || [];
          const curSkin = window.MTG?.getSkin ? window.MTG.getSkin() : "arcane";
          const tpl = `
            <div style="padding: 16px; min-width: 320px;">
              <h2 style="margin-top:0;color:var(--gold-2)">🎨 Multiverse Visual Themes</h2>
              <div style="display:grid;gap:8px;margin-top:12px">
                ${skins.map(s => `
                  <button type="button" class="btn ${s.id === curSkin ? 'gold' : 'ghost'} skin-choice-btn" data-sid="${s.id}" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;text-align:left;">
                    <span>${s.icon} <b>${escapeHtml(s.name)}</b></span>
                    <small class="muted">${escapeHtml(s.desc)}</small>
                  </button>
                `).join("")}
              </div>
            </div>
          `;
          if (window.MTG && window.MTG.openModal) {
            window.MTG.openModal(tpl);
            setTimeout(() => {
              document.querySelectorAll(".skin-choice-btn").forEach(b => {
                b.onclick = () => {
                  if (window.MTG?.setSkin) window.MTG.setSkin(b.dataset.sid);
                  if (window.MTG?.closeModal) window.MTG.closeModal();
                };
              });
            }, 50);
          }
        };
      }

      // Top Web3 button
      const topW3 = topNavHud.querySelector("#btn-dfk-top-web3");
      if (topW3) {
        topW3.onclick = async (e) => {
          e.stopPropagation();
          const curU = window.MTG && window.MTG.getCachedUser && window.MTG.getCachedUser();
          if (curU && curU.walletAddress) {
            if (window.MTG && window.MTG.openInventoryModal) {
              window.MTG.openInventoryModal({ tab: "wallet" });
            } else if (window.MTG && window.MTG.openAuthModal) {
              window.MTG.openAuthModal("wallet");
            }
            return;
          }
          topW3.disabled = true;
          topW3.textContent = "⏳";
          try {
            if (window.MTG && window.MTG.connectPhantom) {
              await window.MTG.connectPhantom(window.MTG_SECOND, "ethereum");
            }
          } catch (err) {
            console.error("Phantom connect error:", err);
            if (window.MTG && window.MTG.toast) window.MTG.toast(err.message || "Phantom connection failed.");
          } finally {
            topW3.disabled = false;
            renderTopNavHud();
            renderPlayerCard();
          }
        };
      }

      // Fullscreen button
      const fsBtn = topNavHud.querySelector("#btn-dfk-fs");
      if (fsBtn) {
        fsBtn.onclick = (e) => {
          e.stopPropagation();
          if (!document.fullscreenElement) container.requestFullscreen().catch(() => {});
          else document.exitFullscreen().catch(() => {});
        };
      }
    }

    function renderHotbar() {
      hotbarEl.innerHTML = `
        <div class="d2-hud-container">
          <!-- Left Life Orb (Diablo 2 / WoW style) -->
          <div class="d2-orb-frame d2-life-orb" id="d2-life-orb" title="Health: ${hero.hp} / ${hero.maxHp}">
            <div class="d2-orb-fill d2-life-fill" id="d2-life-fill" style="height:${Math.min(100, Math.max(0, (hero.hp / hero.maxHp) * 100))}%"></div>
            <div class="d2-orb-glass"></div>
            <div class="d2-orb-bezel"></div>
            <div class="d2-orb-value" id="d2-life-txt">${hero.hp}/${hero.maxHp}</div>
            <div class="d2-orb-label">LIFE</div>
          </div>

          <!-- Center Action Dock -->
          <div class="d2-center-dock">
            <!-- Spells & Combat Action Bar [1-4, E] -->
            <div class="d2-slot-group spells-group">
              <button type="button" class="d2-action-btn ${hero.activeSpell === "fireball" ? "active" : ""}" data-spell="fireball">
                <span class="d2-action-icon">🔥</span>
                <span class="d2-action-name">Fireball</span>
                <span class="d2-action-key">1</span>
              </button>
              <button type="button" class="d2-action-btn ${hero.activeSpell === "frost" ? "active" : ""}" data-spell="frost">
                <span class="d2-action-icon">❄️</span>
                <span class="d2-action-name">Frost</span>
                <span class="d2-action-key">2</span>
              </button>
              <button type="button" class="d2-action-btn ${hero.activeSpell === "sparkle" ? "active" : ""}" data-spell="sparkle">
                <span class="d2-action-icon">✨</span>
                <span class="d2-action-name">Sparkle</span>
                <span class="d2-action-key">3</span>
              </button>
              <button type="button" class="d2-action-btn ${hero.activeSpell === "heal" ? "active" : ""}" data-spell="heal">
                <span class="d2-action-icon">💖</span>
                <span class="d2-action-name">Heal</span>
                <span class="d2-action-key">4</span>
              </button>
              <button type="button" class="d2-action-btn interact-btn" id="btn-dfk-interact">
                <span class="d2-action-icon">💬</span>
                <span class="d2-action-name">Action</span>
                <span class="d2-action-key">Space</span>
              </button>
            </div>

            <!-- Center Emblem Divider -->
            <div class="d2-center-crest">
              <span class="d2-crest-icon">✦</span>
            </div>

            <!-- Section Navigation (Opens Game Inventory Windows) -->
            <div class="d2-slot-group nav-group">
              <button type="button" class="d2-nav-btn" id="btn-hud-tables" data-warp="tables">
                <span class="d2-nav-icon">🏰</span>
                <span class="d2-nav-label">Tables</span>
              </button>
              <button type="button" class="d2-nav-btn" id="btn-hud-inventory" data-warp="inventory">
                <span class="d2-nav-icon">🎒</span>
                <span class="d2-nav-label">Inventory [I]</span>
              </button>
              <button type="button" class="d2-nav-btn" id="btn-hud-guilds" data-warp="guilds">
                <span class="d2-nav-icon">⚔️</span>
                <span class="d2-nav-label">Guilds</span>
              </button>
              <button type="button" class="d2-nav-btn" id="btn-hud-dao" data-warp="dao">
                <span class="d2-nav-icon">🏛️</span>
                <span class="d2-nav-label">DAO</span>
              </button>
              <button type="button" class="d2-nav-btn" id="btn-hud-dnd" data-warp="dnd">
                <span class="d2-nav-icon">🐉</span>
                <span class="d2-nav-label">D&D</span>
              </button>
            </div>
          </div>

          <!-- Right Mana Orb (Diablo 2 / WoW style) -->
          <div class="d2-orb-frame d2-mana-orb" id="d2-mana-orb" title="Mana: ${hero.mp} / ${hero.maxMp}">
            <div class="d2-orb-fill d2-mana-fill" id="d2-mana-fill" style="height:${Math.min(100, Math.max(0, (hero.mp / hero.maxMp) * 100))}%"></div>
            <div class="d2-orb-glass"></div>
            <div class="d2-orb-bezel"></div>
            <div class="d2-orb-value" id="d2-mana-txt">${hero.mp}/${hero.maxMp}</div>
            <div class="d2-orb-label">MANA</div>
          </div>
        </div>
      `;

      // Spells click
      hotbarEl.querySelectorAll("[data-spell]").forEach(btn => {
        btn.onclick = () => {
          hero.activeSpell = btn.dataset.spell;
          renderHotbar();
        };
      });

      // Interact click
      const intBtn = hotbarEl.querySelector("#btn-dfk-interact");
      if (intBtn) intBtn.onclick = interact;

      // Section Navigation click (Opens overlay windows)
      hotbarEl.querySelectorAll("[data-warp]").forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const w = btn.dataset.warp;
          if (w === "tables") {
            toggleTablesModal();
            return;
          }
          if (w === "inventory") {
            toggleInventoryModal();
            return;
          }
          if (w === "guilds") {
            toggleGuildsModal();
            return;
          }
          if (w === "dao") {
            toggleDaoModal();
            return;
          }
          if (w === "dnd") {
            toggleDndModal();
            return;
          }
          let target = w;
          if (w === "market") target = "bazaar";
          transitionToRoom(target);
        };
      });
    }

    /* ══════════════════════════════════════════════════════════════════════
       FFXI CLASSIC COMBINED CHAT WINDOW & GAME LOG
    ══════════════════════════════════════════════════════════════════════ */
    let chatLog = [];
    const MAX_CHAT_LOG = 120;
    let activeChatTab = "all"; // "all" | "chat" | "combat" | "system"
    let isChatCollapsed = false;

    function addLog(type, text, sender = null) {
      if (!text) return;
      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      chatLog.push({ type, text, sender, time: timeStr, id: Date.now() + Math.random() });
      if (chatLog.length > MAX_CHAT_LOG) chatLog.shift();
      renderChatWindow();
    }

    function renderChatWindow() {
      if (!ffxiChatEl || currentRoom !== "overworld") return;
      const filtered = chatLog.filter(item => {
        if (activeChatTab === "all") return true;
        if (activeChatTab === "chat") return item.type === "say" || item.type === "tell" || item.type === "party";
        if (activeChatTab === "combat") return item.type === "combat" || item.type === "action";
        if (activeChatTab === "system") return item.type === "system" || item.type === "npc";
        return true;
      });

      if (isChatCollapsed) {
        ffxiChatEl.className = "ffxi-window ffxi-overworld-chat collapsed";
        const lastMsg = chatLog[chatLog.length - 1];
        const previewTxt = lastMsg ? `${lastMsg.sender ? `<${lastMsg.sender}> ` : ''}${lastMsg.text}` : "Chat Log Ready.";
        ffxiChatEl.innerHTML = `
          <div class="ffxi-collapsed-bar" id="ffxi-toggle-expand" title="Click to open Chat & Log Window">
            <span class="ffxi-title">💬 Chat & Log</span>
            <span class="ffxi-preview-msg">${escapeHtml(previewTxt)}</span>
            <button type="button" class="ffxi-expand-btn" aria-label="Expand Chat Log">▲</button>
          </div>
        `;
        const bar = ffxiChatEl.querySelector("#ffxi-toggle-expand");
        if (bar) bar.onclick = () => { isChatCollapsed = false; renderChatWindow(); };
        return;
      }

      ffxiChatEl.className = "ffxi-window ffxi-overworld-chat";
      ffxiChatEl.innerHTML = `
        <div class="ffxi-header">
          <span class="ffxi-title">💬 <b>CHAT & LOG</b></span>
          <div class="ffxi-tabs">
            <button type="button" class="ffxi-tab ${activeChatTab === 'all' ? 'active' : ''}" data-ctab="all">All</button>
            <button type="button" class="ffxi-tab ${activeChatTab === 'chat' ? 'active' : ''}" data-ctab="chat">Chat</button>
            <button type="button" class="ffxi-tab ${activeChatTab === 'combat' ? 'active' : ''}" data-ctab="combat">Combat</button>
            <button type="button" class="ffxi-tab ${activeChatTab === 'system' ? 'active' : ''}" data-ctab="system">System</button>
          </div>
          <span class="ffxi-spacer"></span>
          <button type="button" class="ffxi-min-btn" id="ffxi-btn-collapse" title="Minimize Window">▼</button>
        </div>
        <div class="ffxi-log-stream" id="ffxi-log-stream">
          ${filtered.length ? filtered.map(item => {
            const badgeCls = item.type === "say" ? "ffxi-badge-say" : item.type === "combat" ? "ffxi-badge-combat" : item.type === "npc" ? "ffxi-badge-npc" : "ffxi-badge-system";
            const badgeLabel = item.type === "say" ? "Say" : item.type === "combat" ? "Combat" : item.type === "npc" ? "NPC" : "System";
            const rowCls = item.type === "say" ? "ffxi-ch-say" : item.type === "combat" ? "ffxi-ch-combat" : item.type === "npc" ? "ffxi-ch-npc" : "ffxi-ch-system";
            return `
              <div class="ffxi-log-row ${rowCls}">
                <span class="ffxi-log-time">[${item.time}]</span>
                <span class="ffxi-badge-channel ${badgeCls}">[${badgeLabel}]</span>
                ${item.sender ? `<b class="ffxi-sender">&lt;${escapeHtml(item.sender)}&gt;</b>` : ""}
                <span class="ffxi-text">${escapeHtml(item.text)}</span>
              </div>
            `;
          }).join("") : `<div class="muted" style="padding:10px;text-align:center;font-style:italic">No messages in this channel.</div>`}
        </div>
        <form class="ffxi-input-bar" id="ffxi-chat-form">
          <span class="ffxi-prompt-tag">[Say] ▶</span>
          <input type="text" class="ffxi-chat-input" id="ffxi-chat-input" placeholder="Type message or /help…" autocomplete="off" maxlength="140" />
          <button type="submit" class="ffxi-send-btn">Send</button>
        </form>
      `;

      ffxiChatEl.querySelectorAll("[data-ctab]").forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          activeChatTab = btn.dataset.ctab;
          renderChatWindow();
        };
      });
      const colBtn = ffxiChatEl.querySelector("#ffxi-btn-collapse");
      if (colBtn) {
        colBtn.onclick = (e) => {
          e.stopPropagation();
          isChatCollapsed = true;
          renderChatWindow();
        };
      }
      const stream = ffxiChatEl.querySelector("#ffxi-log-stream");
      if (stream) stream.scrollTop = stream.scrollHeight;

      const chatForm = ffxiChatEl.querySelector("#ffxi-chat-form");
      if (chatForm) {
        chatForm.onsubmit = (e) => {
          e.preventDefault();
          const inp = chatForm.querySelector("#ffxi-chat-input");
          if (!inp || !inp.value.trim()) return;
          const text = inp.value.trim();
          inp.value = "";

          if (text === "/clear") {
            chatLog = [];
            renderChatWindow();
            return;
          }
          if (text === "/help") {
            addLog("system", "Chat: type message to broadcast to nearby adventurers. Commands: /clear, /help.");
            return;
          }

          if (window.MTG_RPG_CLIENT && window.MTG_RPG_CLIENT.sendChat) {
            window.MTG_RPG_CLIENT.sendChat(text);
          } else {
            addLog("say", text, hero.name || "Planeswalker");
          }
        };

        const inp = chatForm.querySelector("#ffxi-chat-input");
        if (inp) {
          inp.addEventListener("keydown", (e) => {
            e.stopPropagation();
            if (e.key === "Escape") inp.blur();
          });
        }
      }
    }

    /* ── MINIMAP ── */
    function drawMinimap() {
      if (!mmCtx || currentRoom !== "overworld") return;
      const mW = 160, mH = 110;
      mmCtx.clearRect(0, 0, mW, mH);

      // Background: TMX Tilemap
      if (tmxCanvasReady) {
        mmCtx.imageSmoothingEnabled = false;
        mmCtx.drawImage(tmxCanvas, 0, 0, mW, mH);
      } else {
        const kingdom = ensurePixelKingdom();
        mmCtx.imageSmoothingEnabled = false;
        mmCtx.drawImage(kingdom, 0, 0, mW, mH);
      }
      mmCtx.strokeStyle = "rgba(215,180,92,0.6)"; mmCtx.lineWidth = 1; mmCtx.strokeRect(0, 0, mW, mH);

      // Camera Viewport Box on minimap
      const vx = (camX / WORLD_MAP_W) * mW;
      const vy = (camY / WORLD_MAP_H) * mH;
      const vw = (viewW / WORLD_MAP_W) * mW;
      const vh = (viewH / WORLD_MAP_H) * mH;
      mmCtx.strokeStyle = "rgba(255,255,255,0.45)";
      mmCtx.lineWidth = 1;
      mmCtx.strokeRect(Math.max(0, vx), Math.max(0, vy), Math.min(mW, vw), Math.min(mH, vh));

      // Mana well
      const mx = (manaWell.x / WORLD_MAP_W) * mW;
      const my = (manaWell.y / WORLD_MAP_H) * mH;
      mmCtx.fillStyle = "rgba(215,180,92,0.3)"; mmCtx.beginPath(); mmCtx.arc(mx, my, 6, 0, Math.PI * 2); mmCtx.fill();
      mmCtx.strokeStyle = "#d7b45c"; mmCtx.lineWidth = 1; mmCtx.stroke();
      mmCtx.font = "7px sans-serif"; mmCtx.textAlign = "center"; mmCtx.textBaseline = "middle"; mmCtx.fillStyle = "#f3dd9a"; mmCtx.fillText("✦", mx, my);

      // Ley lines to landmarks
      for (const lm of landmarks) {
        const lmx = (lm.x / WORLD_MAP_W) * mW;
        const lmy = (lm.y / WORLD_MAP_H) * mH;
        mmCtx.strokeStyle = lm.color + "40"; mmCtx.lineWidth = 0.8;
        mmCtx.beginPath(); mmCtx.moveTo(mx, my); mmCtx.lineTo(lmx, lmy); mmCtx.stroke();
      }

      // Landmarks as dots
      for (const lm of landmarks) {
        const lmx = (lm.x / WORLD_MAP_W) * mW;
        const lmy = (lm.y / WORLD_MAP_H) * mH;
        const isNear = nearestLandmark && nearestLandmark.id === lm.id;
        mmCtx.fillStyle = isNear ? lm.color : lm.color + "99";
        mmCtx.beginPath(); mmCtx.arc(lmx, lmy, isNear ? 4.5 : 3, 0, Math.PI * 2); mmCtx.fill();
        mmCtx.font = "7px sans-serif"; mmCtx.textAlign = "center"; mmCtx.textBaseline = "middle";
        mmCtx.fillStyle = lm.color; mmCtx.fillText(lm.icon.match(/\p{Emoji}/u)?.[0] || "●", lmx, lmy - 6);
      }

      // Sparring dummy & Sparky dots on minimap
      const dmx = (dummy.x / WORLD_MAP_W) * mW;
      const dmy = (dummy.y / WORLD_MAP_H) * mH;
      mmCtx.fillStyle = "#ef4444"; mmCtx.beginPath(); mmCtx.arc(dmx, dmy, 2.5, 0, Math.PI * 2); mmCtx.fill();

      const smx = (sparky.x / WORLD_MAP_W) * mW;
      const smy = (sparky.y / WORLD_MAP_H) * mH;
      mmCtx.fillStyle = "#38bdf8"; mmCtx.beginPath(); mmCtx.arc(smx, smy, 2.5, 0, Math.PI * 2); mmCtx.fill();

      // Hero dot
      const hx = (hero.x / WORLD_MAP_W) * mW;
      const hy = (hero.y / WORLD_MAP_H) * mH;
      mmCtx.fillStyle = "#fff"; mmCtx.beginPath(); mmCtx.arc(hx, hy, 3.5, 0, Math.PI * 2); mmCtx.fill();
      mmCtx.strokeStyle = "#f3dd9a"; mmCtx.lineWidth = 1; mmCtx.stroke();

      // Label
      mmCtx.font = "bold 7px system-ui,sans-serif"; mmCtx.fillStyle = "rgba(215,180,92,0.7)"; mmCtx.textAlign = "left"; mmCtx.textBaseline = "bottom";
      mmCtx.fillText("TMX Homeroom", 4, mH - 2);
    }

    /* ══════════════════════════════════════════════════════════════════════
       SPELLS, COMBAT & PARTICLES
    ══════════════════════════════════════════════════════════════════════ */

    function addFloatingText(x, y, text, color = "#fbbf24") { floatingTexts.push({ x, y, text, color, life: 0, maxLife: 50 }); }
    function spawnParticles(x, y, count = 12, color = "#fbbf24", speed = 2.5, gravity = 0) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2, spd = (Math.random() * 0.7 + 0.3) * speed;
        particles.push({ x, y, vx: Math.cos(angle) * spd, vy: Math.sin(angle) * spd, life: 0, maxLife: 20 + Math.random() * 20, size: 2.5 + Math.random() * 3, color, alpha: 1, gravity });
      }
    }
    function spawnWaypoint(x, y) { waypoint = { x, y, radius: 5, maxRadius: 32, alpha: 1 }; }

    function castSpell(type = hero.activeSpell, targetX = null, targetY = null) {
      const costs = { fireball: 10, frost: 15, sparkle: 5, heal: 20 };
      const cost = costs[type] || 10;
      if (hero.mp < cost) { window.MTG && window.MTG.toast && window.MTG.toast("Not enough Mana! Rest in the 5-Color Mana Well."); return; }
      hero.mp -= cost; updatePlayerVitals();
      if (type === "heal") {
        hero.hp = Math.min(hero.maxHp, hero.hp + 25); updatePlayerVitals();
        window.MTG_SFX && window.MTG_SFX.play("sparkle"); spawnParticles(hero.x, hero.y, 35, "#4ade80", 3.5, -0.08); addFloatingText(hero.x, hero.y - 28, "+25 Life", "#4ade80");
        addLog("combat", "Cast Healing Aura (+25 Life)! 💚");
        window.MTG_RPG_CLIENT?.onCastSpell?.({ type: "heal", x: hero.x, y: hero.y });
        return;
      }
      if (type === "sparkle") {
        window.MTG_SFX && window.MTG_SFX.play("sparkle"); spawnParticles(hero.x, hero.y, 45, "#f472b6", 4.2, -0.05); addFloatingText(hero.x, hero.y - 25, "✨ Planeswalker Sparkles!", "#f472b6");
        addLog("combat", "Cast Sparkle Burst! ✨");
        window.MTG_RPG_CLIENT?.onCastSpell?.({ type: "sparkle", x: hero.x, y: hero.y });
        return;
      }
      if (type === "frost") {
        window.MTG_SFX && window.MTG_SFX.play("cast"); spawnParticles(hero.x, hero.y, 45, "#38bdf8", 5.2, 0); addFloatingText(hero.x, hero.y - 25, "❄️ Frost Nova!", "#38bdf8");
        addLog("combat", "Cast Frost Nova! ❄️");
        window.MTG_RPG_CLIENT?.onCastSpell?.({ type: "frost", x: hero.x, y: hero.y });
        return;
      }
      // Fireball
      let tx = targetX ?? hero.x, ty = targetY ?? hero.y;
      if (targetX == null && targetY == null) { if (hero.dir === 0) ty += 130; else if (hero.dir === 1) tx -= 130; else if (hero.dir === 2) tx += 130; else ty -= 130; }
      const angle = Math.atan2(ty - hero.y, tx - hero.x);
      window.MTG_SFX && window.MTG_SFX.play("cast");
      projectiles.push({ x: hero.x, y: hero.y, vx: Math.cos(angle) * 7.8, vy: Math.sin(angle) * 7.8, type: "fireball", radius: 9, life: 65, damage: 45, color: "#f97316" });
      addLog("combat", "Cast Fireball! 🔥");
      if (window.MTG_RPG_CLIENT?.onCastSpell) {
        window.MTG_RPG_CLIENT.onCastSpell({ type: "fireball", x: hero.x, y: hero.y, targetX: tx, targetY: ty });
      }
    }

    function interact() {
      if (currentRoom !== "overworld") {
        handleRoomInteract();
        return;
      }

      // Check dummy proximity
      const distDummy = Math.hypot(dummy.x - hero.x, dummy.y - hero.y);
      if (distDummy < 75) {
        if (window.MTG_RPG_CLIENT?.openSparring) {
          window.MTG_RPG_CLIENT.openSparring({ hp: dummy.hp, maxHp: dummy.maxHp });
        }
        return;
      }

      // Check Sparky proximity
      const distSparky = Math.hypot(sparky.x - hero.x, sparky.y - hero.y);
      if (distSparky < 75) {
        openSparkyDialog();
        return;
      }

      if (!nearestLandmark) {
        window.MTG && window.MTG.toast && window.MTG.toast("Walk close to an area portal and press [Spacebar] to enter!");
        return;
      }
      window.MTG_SFX && window.MTG_SFX.play("bell");
      transitionToRoom(nearestLandmark.id);
    }

    function showDialog(speaker, icon, text) {
      if (window.MTG?.bringToFront) window.MTG.bringToFront(dialogEl);
      dialogEl.hidden = false;
      dialogEl.innerHTML = `
        <div class="homeroom-dialog-box">
          <div class="homeroom-dialog-head">
            <span class="homeroom-dialog-icon">${icon}</span>
            <b class="homeroom-dialog-speaker">${escapeHtml(speaker)}</b>
            <button type="button" class="btn small ghost homeroom-dialog-close" id="dfk-dlg-close">✕</button>
          </div>
          <p class="homeroom-dialog-body">${escapeHtml(text)}</p>
        </div>
      `;
      const closeBtn = dialogEl.querySelector("#dfk-dlg-close");
      if (closeBtn) closeBtn.onclick = () => { dialogEl.hidden = true; };
    }

    /* ══════════════════════════════════════════════════════════════════════
       EVENT LISTENERS
    ══════════════════════════════════════════════════════════════════════ */

    function onKeyDown(e) {
      if (e.target && e.target.matches && e.target.matches("input, textarea, select")) return;
      keys[e.key.toLowerCase()] = true;
      if (e.key === "i" || e.key === "I") {
        e.preventDefault();
        toggleInventoryModal();
        return;
      }
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        toggleTablesModal();
        return;
      }
      if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        toggleGuildsModal();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (isChatCollapsed) {
          isChatCollapsed = false;
          renderChatWindow();
        }
        const inp = document.getElementById("ffxi-chat-input");
        if (inp) inp.focus();
        return;
      }
      if (currentRoom !== "overworld") {
        roomKeys[e.key.toLowerCase()] = true;
        if (e.key === "Escape") {
          const panel = roomOverlay.querySelector("#dfk-room-panel");
          if (panel && !panel.hidden) {
            panel.hidden = true;
            const toggleBtn = roomOverlay.querySelector("#dfk-room-panel-toggle");
            if (toggleBtn) toggleBtn.classList.remove("gold");
            return;
          }
          transitionToRoom("overworld");
          return;
        }
        if (e.key === "m" || e.key === "M") {
          const panel = roomOverlay.querySelector("#dfk-room-panel");
          const toggleBtn = roomOverlay.querySelector("#dfk-room-panel-toggle");
          if (panel) {
            panel.hidden = !panel.hidden;
            if (toggleBtn) toggleBtn.classList.toggle("gold", !panel.hidden);
          }
          return;
        }
        if (e.key === " " || e.key === "Spacebar" || e.code === "Space" || e.key === "e" || e.key === "E") {
          e.preventDefault();
          handleRoomInteract();
          return;
        }
        return;
      }
      if (e.key === "1") castSpell("fireball");
      if (e.key === "2") castSpell("frost");
      if (e.key === "3") castSpell("sparkle");
      if (e.key === "4") castSpell("heal");
      if (e.key === " " || e.key === "Spacebar" || e.code === "Space") {
        e.preventDefault();
        interact();
        return;
      }
      if (e.key === "e" || e.key === "E") {
        interact();
        return;
      }
      if (e.key === "c" || e.key === "C") {
        if (typeof onOpenSheet === "function") onOpenSheet();
        else { const d = document.getElementById("dfk-sheet-drawer"); if (d) d.hidden = !d.hidden; }
      }
    }
    function onKeyUp(e) {
      keys[e.key.toLowerCase()] = false;
      roomKeys[e.key.toLowerCase()] = false;
    }

    function onCanvasPointerDown(e) {
      if (isTransitioning) return;
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      if (currentRoom !== "overworld") {
        const fr = getRoomFrame(currentRoom, viewW, viewH);
        const exitX = fr.x + fr.dw * 0.5;
        const exitY = fr.y + fr.dh * 0.92;
        if (Math.hypot(clickX - exitX, clickY - exitY) < 45) {
          transitionToRoom("overworld");
          return;
        }
        // In-room movement
        roomHero.targetX = Math.max(fr.x + fr.dw * 0.12, Math.min(fr.x + fr.dw * 0.88, clickX));
        roomHero.targetY = Math.max(fr.y + fr.dh * 0.22, Math.min(fr.y + fr.dh * 0.93, clickY));
        return;
      }

      // In overworld, convert canvas client coordinates to world coordinates via camera offset!
      const worldX = clickX + camX;
      const worldY = clickY + camY;

      // Check click on dummy
      if (Math.hypot(worldX - dummy.x, worldY - dummy.y) < 38) {
        hero.targetX = dummy.x; hero.targetY = dummy.y + 35;
        spawnWaypoint(hero.targetX, hero.targetY);
        if (Math.hypot(dummy.x - hero.x, dummy.y - hero.y) < 85) {
          if (window.MTG_RPG_CLIENT?.openSparring) window.MTG_RPG_CLIENT.openSparring({ hp: dummy.hp, maxHp: dummy.maxHp });
        }
        return;
      }

      // Check click on sparky
      if (Math.hypot(worldX - sparky.x, worldY - sparky.y) < 34) {
        hero.targetX = sparky.x; hero.targetY = sparky.y + 32;
        spawnWaypoint(hero.targetX, hero.targetY);
        if (Math.hypot(sparky.x - hero.x, sparky.y - hero.y) < 85) {
          openSparkyDialog();
        }
        return;
      }

      // Overworld click on landmark building or pad
      let clickedLm = null;
      landmarks.forEach(lm => {
        const halfW = (lm.w || 200) / 2;
        const topY = lm.y - (lm.h || 150) / 2;
        const botY = (lm.bannerY || (lm.y + (lm.h || 150) / 2)) + 32;
        if (worldX >= lm.x - halfW && worldX <= lm.x + halfW && worldY >= topY && worldY <= botY) clickedLm = lm;
        if (lm.padX != null && lm.padY != null) {
          if (Math.hypot(worldX - lm.padX, worldY - lm.padY) < (lm.padRadius || 24) + 12) clickedLm = lm;
        }
      });
      if (clickedLm) {
        hero.targetX = clickedLm.padX || clickedLm.x; hero.targetY = clickedLm.padY || (clickedLm.y + clickedLm.h / 2 + 25);
        spawnWaypoint(hero.targetX, hero.targetY);
        if (Math.hypot((clickedLm.padX || clickedLm.x) - hero.x, (clickedLm.padY || clickedLm.y) - hero.y) < 110) { nearestLandmark = clickedLm; transitionToRoom(clickedLm.id); }
      } else {
        hero.targetX = Math.max(32, Math.min(WORLD_MAP_W - 32, worldX));
        hero.targetY = Math.max(32, Math.min(WORLD_MAP_H - 32, worldY));
        spawnWaypoint(hero.targetX, hero.targetY);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("pointerdown", onCanvasPointerDown);

    /* ══════════════════════════════════════════════════════════════════════
       UPDATE LOOP
    ══════════════════════════════════════════════════════════════════════ */

    
    function handleMmoMsg(ev) {
       try {
         const msg = JSON.parse(ev.data);
         if (msg.t === "rpg_state") {
           // update player
           mmoPlayers.set(msg.id, { x: msg.x, y: msg.y, dir: msg.dir, moving: msg.moving, avatar: msg.avatar, name: msg.name, lastSeen: Date.now() });
         } else if (msg.t === "presence:left") {
           mmoPlayers.delete(msg.playerId);
         }
       } catch(e) {}
    }
    
    // Bind to presence WS
    const origWs = window.MTG_PRESENCE_WS;
    if (origWs) origWs.addEventListener("message", handleMmoMsg);

    function update(t) {

      if (currentRoom !== "overworld") {
        updateRoomHero();
        updateRoomPrompt();
        roomAnimTick++;
        return;
      }

      // Mana Well / Campfire regen
      const distWell = Math.hypot(manaWell.x - hero.x, manaWell.y - hero.y);
      const distCampfire = Math.hypot(campfire.x - hero.x, campfire.y - hero.y);
      if (distWell < 110 || distCampfire < 75) {
        let changed = false;
        if (hero.hp < hero.maxHp && Math.random() < 0.22) { hero.hp = Math.min(hero.maxHp, hero.hp + 2); changed = true; }
        if (hero.mp < hero.maxMp && Math.random() < 0.32) { hero.mp = Math.min(hero.maxMp, hero.mp + 3); changed = true; }
        if (changed) updatePlayerVitals();
        if (Math.random() < 0.15) {
          const colors = ["#fef08a","#38bdf8","#c084fc","#f87171","#4ade80"];
          spawnParticles(hero.x + (Math.random() - 0.5) * 20, hero.y - 10, 1, distWell < 110 ? colors[Math.floor(Math.random() * colors.length)] : "#fb923c", 1.4, -0.06);
        }
      }

      // Sparky idle roam
      // Sparky stays put
      // No movement
      // disabled

      // Hero movement
      let moveX = 0, moveY = 0;
      if (keys["w"] || keys["arrowup"]) { moveY -= 1; hero.dir = 3; }
      if (keys["s"] || keys["arrowdown"]) { moveY += 1; hero.dir = 0; }
      if (keys["a"] || keys["arrowleft"]) { moveX -= 1; hero.dir = 1; }
      if (keys["d"] || keys["arrowright"]) { moveX += 1; hero.dir = 2; }
      if (moveX !== 0 || moveY !== 0) {
        hero.targetX = null; hero.targetY = null; waypoint = null;
        const len = Math.hypot(moveX, moveY);
        const dx = (moveX / len) * hero.speed;
        const dy = (moveY / len) * hero.speed;
        let moved = false;
        if (canHeroOccupy(hero.x + dx, hero.y + dy)) {
          hero.x += dx; hero.y += dy; moved = true;
        } else if (canHeroOccupy(hero.x + dx, hero.y)) {
          hero.x += dx; moved = true;
        } else if (canHeroOccupy(hero.x, hero.y + dy)) {
          hero.y += dy; moved = true;
        }
        hero.isMoving = moved;
      } else if (hero.targetX != null && hero.targetY != null) {
        const dx = hero.targetX - hero.x, dy = hero.targetY - hero.y, dist = Math.hypot(dx, dy);
        if (dist > 5) {
          const step = Math.min(dist, hero.speed);
          const stepX = (dx / dist) * step;
          const stepY = (dy / dist) * step;
          let moved = false;
          if (canHeroOccupy(hero.x + stepX, hero.y + stepY)) {
            hero.x += stepX; hero.y += stepY; moved = true;
          } else if (canHeroOccupy(hero.x + stepX, hero.y)) {
            hero.x += stepX; moved = true;
          } else if (canHeroOccupy(hero.x, hero.y + stepY)) {
            hero.y += stepY; moved = true;
          } else {
            hero.targetX = null; hero.targetY = null; waypoint = null;
          }
          hero.isMoving = moved;
          if (Math.abs(dx) > Math.abs(dy)) hero.dir = dx > 0 ? 2 : 1; else hero.dir = dy > 0 ? 0 : 3;
        } else { hero.targetX = null; hero.targetY = null; hero.isMoving = false; waypoint = null; }
      } else {
        hero.isMoving = false;
      }
      hero.x = Math.max(20, Math.min(WORLD_MAP_W - 20, hero.x));
      hero.y = Math.max(20, Math.min(WORLD_MAP_H - 20, hero.y));

      // Broadcast move to RPGJS server
      if (window.MTG_RPG_CLIENT?.sendMove) {
        window.MTG_RPG_CLIENT.sendMove({ x: Math.round(hero.x), y: Math.round(hero.y), dir: hero.dir, moving: hero.isMoving });
      }

      if (hero.isMoving) { hero.animTick++; if (hero.animTick % 7 === 0) hero.frame = (hero.frame + 1) % 4; if (Math.random() < 0.25) spawnParticles(hero.x + (Math.random() - 0.5) * 8, hero.y + 16, 1, "rgba(255,255,255,0.3)", 0.8, -0.02); } else { hero.frame = 0; }

      // Waypoint
      if (waypoint) { waypoint.radius += 0.8; waypoint.alpha = Math.max(0, 1 - waypoint.radius / waypoint.maxRadius); if (waypoint.radius >= waypoint.maxRadius) waypoint.radius = 5; }

      // Projectiles
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i]; p.x += p.vx; p.y += p.vy; p.life--;
        if (Math.random() < 0.7) particles.push({ x: p.x, y: p.y, vx: (Math.random()-0.5)*1.5, vy: (Math.random()-0.5)*1.5, life: 0, maxLife: 16, size: 2.8, color: p.color, alpha: 1, gravity: 0 });

        // Check collision with dummy
        const dDummy = Math.hypot(dummy.x - p.x, dummy.y - p.y);
        if (dDummy < 32) {
          dummy.hitTick = 8;
          const dmg = p.damage || 35;
          dummy.hp = Math.max(0, dummy.hp - dmg);
          spawnParticles(dummy.x, dummy.y, 16, p.color, 3.5);
          addFloatingText(dummy.x, dummy.y - 30, `-${dmg}`, "#ef4444");
          window.MTG_SFX && window.MTG_SFX.play && window.MTG_SFX.play("tap");
          if (window.MTG_RPG_CLIENT?.onSparringHit) {
            window.MTG_RPG_CLIENT.onSparringHit(dmg);
          }
          if (dummy.hp <= 0) {
            dummy.hp = dummy.maxHp;
            addFloatingText(dummy.x, dummy.y - 45, "💀 Defeated! +50 🪙", "#fbbf24");
            window.MTG_SFX && window.MTG_SFX.play && window.MTG_SFX.play("victory");
            if (window.MTG && window.MTG.toast) window.MTG.toast("🎯 Sparring Dummy defeated! +50 $TCG!");
            goldBalance += 50;
            renderPlayerCard();
            updatePlayerVitals();
          }
          projectiles.splice(i, 1);
          continue;
        }
        
        if (p.x < 10 || p.x > WORLD_MAP_W - 10 || p.y < 10 || p.y > WORLD_MAP_H - 10 || p.life <= 0) { spawnParticles(p.x, p.y, 14, p.color, 3); projectiles.splice(i, 1); }
      }
      // Particles
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i]; pt.x += pt.vx; pt.y += pt.vy; pt.vy += pt.gravity; pt.life++;
        pt.alpha = Math.max(0, 1 - pt.life / pt.maxLife); if (pt.life >= pt.maxLife) particles.splice(i, 1);
      }
      // Floating texts
      for (let i = floatingTexts.length - 1; i >= 0; i--) {
        const ft = floatingTexts[i]; ft.y -= 0.65; ft.life++; if (ft.life >= ft.maxLife) floatingTexts.splice(i, 1);
      }

      // Automatic area movement when character walks onto any section area pad
      if (currentRoom === "overworld" && !isTransitioning) {
        for (const lm of landmarks) {
          if (lm.padX != null && lm.padY != null) {
            const distPad = Math.hypot(hero.x - lm.padX, hero.y - lm.padY);
            if (distPad < (lm.padRadius || 38)) {
              if (Date.now() > areaCooldown) {
                areaCooldown = Date.now() + 3000;
                window.MTG_SFX && window.MTG_SFX.play && window.MTG_SFX.play("bell");
                transitionToRoom(lm.id);
                break;
              }
            }
          }
        }
      }

      // Proximity for prompt
      nearestLandmark = null; let nearestDist = 110;
      landmarks.forEach(lm => {
        const dBuilding = Math.hypot(lm.x - hero.x, lm.y - hero.y);
        const dPad = lm.padX ? Math.hypot(lm.padX - hero.x, lm.padY - hero.y) : 999;
        const d = Math.min(dBuilding, dPad);
        if (d < nearestDist) { nearestDist = d; nearestLandmark = lm; }
      });

      // Prompt
      if (nearestLandmark) {
        promptEl.hidden = false;
        promptEl.innerHTML = `
          <div class="homeroom-prompt-content" style="border-color:${nearestLandmark.color};background:rgba(12,16,26,0.96)">
            <span class="homeroom-prompt-icon">${nearestLandmark.icon}</span>
            <div class="homeroom-prompt-info">
              <div style="display:flex;align-items:center;gap:6px">
                <b style="color:${nearestLandmark.color};font-size:13px">${escapeHtml(nearestLandmark.name)}</b>
                <span class="dfk-planeswalker-tag" style="border-color:${nearestLandmark.color}">${escapeHtml(nearestLandmark.tag || "PORTAL")}</span>
              </div>
              <span class="muted" style="font-size:11px">${escapeHtml(nearestLandmark.subtitle)}</span>
            </div>
            <button type="button" class="btn small gold homeroom-enter-btn" id="dfk-enter-btn">👉 [Spacebar] Enter</button>
          </div>`;
        const entBtn = promptEl.querySelector("#dfk-enter-btn");
        if (entBtn) entBtn.onclick = interact;
      } else {
        promptEl.hidden = true;
      }
    }

    function updateRoomHero() {
      let moveX = 0, moveY = 0;
      if (roomKeys["w"] || roomKeys["arrowup"]) { moveY -= 1; roomHero.dir = 3; }
      if (roomKeys["s"] || roomKeys["arrowdown"]) { moveY += 1; roomHero.dir = 0; }
      if (roomKeys["a"] || roomKeys["arrowleft"]) { moveX -= 1; roomHero.dir = 1; }
      if (roomKeys["d"] || roomKeys["arrowright"]) { moveX += 1; roomHero.dir = 2; }
      if (moveX !== 0 || moveY !== 0) {
        roomHero.targetX = null; roomHero.targetY = null;
        const len = Math.hypot(moveX, moveY);
        roomHero.x += (moveX / len) * roomHero.speed; roomHero.y += (moveY / len) * roomHero.speed; roomHero.isMoving = true;
      } else if (roomHero.targetX != null && roomHero.targetY != null) {
        const dx = roomHero.targetX - roomHero.x, dy = roomHero.targetY - roomHero.y, dist = Math.hypot(dx, dy);
        if (dist > 5) {
          roomHero.x += (dx / dist) * roomHero.speed; roomHero.y += (dy / dist) * roomHero.speed; roomHero.isMoving = true;
        } else { roomHero.targetX = null; roomHero.targetY = null; roomHero.isMoving = false; }
      } else { roomHero.isMoving = false; }
      if (currentRoom !== "overworld") {
        const fr = getRoomFrame(currentRoom, viewW, viewH);
        roomHero.x = Math.max(fr.x + fr.dw * 0.12, Math.min(fr.x + fr.dw * 0.88, roomHero.x));
        roomHero.y = Math.max(fr.y + fr.dh * 0.22, Math.min(fr.y + fr.dh * 0.93, roomHero.y));
        const exitX = fr.x + fr.dw * 0.5;
        const exitY = fr.y + fr.dh * 0.92;
        if (Math.hypot(roomHero.x - exitX, roomHero.y - exitY) < 36) {
          transitionToRoom("overworld");
        }
      }
      if (roomHero.isMoving) { roomHero.animTick++; if (roomHero.animTick % 7 === 0) roomHero.frame = (roomHero.frame + 1) % 4; } else { roomHero.frame = 0; }
    }

    /* ══════════════════════════════════════════════════════════════════════
       DRAW — OVERWORLD
    ══════════════════════════════════════════════════════════════════════ */

    function drawImperialLabels(ctx) {
      const cx = viewW * 0.5;
      const cy = viewH * 0.47;
      const R = Math.min(viewW, viewH) * 0.34;
      const labels = [
        ["Market", 30],
        ["Arena", 90],
        ["Arboretum", 150],
        ["Temple", 210],
        ["Talos", 270],
        ["Gardens", 330],
      ];
      ctx.save();
      ctx.font = "bold 12px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,248,230,0.85)";
      ctx.fillStyle = "#1c140c";
      for (const [name, deg] of labels) {
        const a = deg * Math.PI / 180;
        const x = cx + Math.sin(a) * R * 0.33;
        const y = cy - Math.cos(a) * R * 0.33;
        ctx.strokeText(name, x, y);
        ctx.fillText(name, x, y);
      }
      ctx.restore();
    }

    function draw(t) {
      const dpr = window.devicePixelRatio || 1;
      ctx.save(); ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, viewW, viewH);

      if (currentRoom !== "overworld") {
        drawRoom(ctx, currentRoom, viewW, viewH, t, roomHero);
        ctx.restore();
        return;
      }

      // ── OVERWORLD ──
      updateCamera();

      // Background letterbox fill
      ctx.fillStyle = "#0c1017";
      ctx.fillRect(0, 0, viewW, viewH);

      ctx.save();
      ctx.translate(-camX, -camY);

      // 1. Full TMX Tilemap
      if (tmxCanvasReady) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmxCanvas, 0, 0);
      } else {
        const kingdom = ensurePixelKingdom();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(kingdom, 0, 0, WORLD_MAP_W, WORLD_MAP_H);
      }

      // Roads are baked into the pixel map. No overlay lines.

      // 8. The 5-Color Mana Well
      ctx.fillStyle = "#0f172a"; ctx.beginPath(); ctx.arc(manaWell.x, manaWell.y, manaWell.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#d7b45c"; ctx.lineWidth = 3.5; ctx.stroke();
      // Mana sub-pools (WUBRG)
      const pips2 = [
        { angle: -Math.PI / 2, color: "#fef08a", sym: "☀️" },
        { angle: -Math.PI / 2 + Math.PI * 2 / 5, color: "#38bdf8", sym: "💧" },
        { angle: -Math.PI / 2 + Math.PI * 4 / 5, color: "#c084fc", sym: "💀" },
        { angle: -Math.PI / 2 + Math.PI * 6 / 5, color: "#f87171", sym: "🔥" },
        { angle: -Math.PI / 2 + Math.PI * 8 / 5, color: "#4ade80", sym: "🌳" },
      ];
      pips2.forEach(p => {
        const px2 = manaWell.x + Math.cos(p.angle) * (manaWell.radius * 0.65);
        const py2 = manaWell.y + Math.sin(p.angle) * (manaWell.radius * 0.65);
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(px2, py2, 13, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1; ctx.stroke();
        ctx.font = "11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(p.sym, px2, py2);
      });
      // Center glow
      const sparkGlow = ctx.createRadialGradient(manaWell.x, manaWell.y, 4, manaWell.x, manaWell.y, 25);
      sparkGlow.addColorStop(0, "rgba(255,255,255,0.95)"); sparkGlow.addColorStop(0.5, "rgba(243,221,154,0.7)"); sparkGlow.addColorStop(1, "rgba(215,180,92,0)");
      ctx.fillStyle = sparkGlow; ctx.beginPath(); ctx.arc(manaWell.x, manaWell.y, 25, 0, Math.PI * 2); ctx.fill();
      ctx.font = "24px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("✨", manaWell.x, manaWell.y + Math.sin(Date.now() * 0.005) * 3);
      ctx.font = "bold 10px system-ui,sans-serif"; ctx.fillStyle = "var(--gold-2,#f3dd9a)"; ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
      ctx.fillText("5-Color Mana Well", manaWell.x, manaWell.y + manaWell.radius + 16); ctx.shadowBlur = 0;

      // 9. Campfire
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.beginPath(); ctx.arc(campfire.x, campfire.y + 6, 18, 0, Math.PI * 2); ctx.fill();
      ctx.font = "22px sans-serif"; ctx.fillText("🔥", campfire.x, campfire.y);
      ctx.font = "bold 9px system-ui,sans-serif"; ctx.fillStyle = "#fde047"; ctx.fillText("Hearth", campfire.x, campfire.y + 22);

      // 9b. Dedicated Section Area Entrance Portal Pads (Diablo 2 / WoW Waypoints)
      landmarks.forEach(lm => {
        if (lm.padX == null || lm.padY == null) return;
        const px = lm.padX;
        const py = lm.padY;
        const pr = lm.padRadius || 38;
        const distHero = Math.hypot(hero.x - px, hero.y - py);
        const isOnPad = distHero < pr;
        const isNearPad = distHero < pr + 32;
        const padPulse = Math.sin(t * 0.005 + px * 0.01) * 3;

        ctx.save();
        // Shadow beneath dais
        ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
        ctx.beginPath();
        ctx.ellipse(px, py + 8, pr + 4, (pr + 4) * 0.58, 0, 0, Math.PI * 2);
        ctx.fill();

        // Stone Dais base
        const stoneGrd = ctx.createRadialGradient(px, py, 6, px, py, pr);
        stoneGrd.addColorStop(0, "#232630");
        stoneGrd.addColorStop(0.7, "#141720");
        stoneGrd.addColorStop(1, "#0a0c12");
        ctx.fillStyle = stoneGrd;
        ctx.beginPath();
        ctx.ellipse(px, py, pr, pr * 0.58, 0, 0, Math.PI * 2);
        ctx.fill();

        // Outer beveled ring (WoW gold/brass border)
        ctx.strokeStyle = isOnPad ? "#fbbf24" : (isNearPad ? "#d4af37" : "rgba(180, 140, 60, 0.65)");
        ctx.lineWidth = isOnPad ? 3.5 : 2.5;
        ctx.stroke();

        // Inner glowing magical energy well
        const glowGrd = ctx.createRadialGradient(px, py, 2, px, py, pr * 0.85);
        glowGrd.addColorStop(0, isOnPad ? "rgba(255, 255, 255, 0.9)" : "rgba(255, 255, 255, 0.4)");
        glowGrd.addColorStop(0.35, lm.color || "#38bdf8");
        glowGrd.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = glowGrd;
        ctx.beginPath();
        ctx.ellipse(px, py, pr * 0.85, (pr * 0.85) * 0.58, 0, 0, Math.PI * 2);
        ctx.fill();

        // Rotating Arcane Runes circle
        ctx.save();
        ctx.translate(px, py);
        ctx.scale(1, 0.58);
        ctx.rotate(t * 0.0015);
        ctx.strokeStyle = isOnPad ? "rgba(255, 255, 255, 0.9)" : (lm.color || "rgba(215, 180, 92, 0.7)");
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.arc(0, 0, pr * 0.72, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // 4 Cardinal Golden Glyphs (✦)
        const angles = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = isOnPad ? "#ffffff" : "#f59e0b";
        for (const a of angles) {
          const gx = px + Math.cos(a + t * 0.001) * (pr * 0.68);
          const gy = py + Math.sin(a + t * 0.001) * (pr * 0.40);
          ctx.fillText("✦", gx, gy);
        }

        // Center Area Portal Icon / Swirl
        ctx.font = "16px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(lm.icon || "🌀", px, py + padPulse * 0.6);

        // Area Entrance Label Tag
        ctx.font = "bold 7px 'Cinzel', sans-serif";
        ctx.fillStyle = isOnPad ? "#fef08a" : (isNearPad ? "#ffffff" : "rgba(240, 230, 210, 0.75)");
        ctx.shadowColor = "#000000";
        ctx.shadowBlur = 3;
        ctx.fillText("PORTAL", px, py - pr * 0.58 - 3);
        if (isOnPad) {
          ctx.fillStyle = "#4ade80";
          ctx.font = "bold 7.5px system-ui,sans-serif";
          ctx.fillText("✨ STEP IN ✨", px, py + pr * 0.58 + 9);
        }
        ctx.shadowBlur = 0;

        // If standing on pad: Rising vertical light beams / energy column!
        if (isOnPad || isNearPad) {
          const beamAlpha = isOnPad ? 0.35 : 0.18;
          ctx.fillStyle = lm.color || "#38bdf8";
          ctx.globalAlpha = beamAlpha;
          ctx.beginPath();
          ctx.moveTo(px - pr * 0.5, py);
          ctx.lineTo(px - pr * 0.25, py - 35);
          ctx.lineTo(px + pr * 0.25, py - 35);
          ctx.lineTo(px + pr * 0.5, py);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        ctx.restore();
      });

      // 10. Secondary decor buildings on overworld
      const tNow = Date.now();
      overworldDecor.forEach(dec => {
        const asset = buildingAssets[dec.type];
        if (!asset || (!asset.loaded && !asset.img.complete) || asset.img.naturalWidth === 0) return;
        const dx = dec.x !== undefined ? dec.x : Math.round(WORLD_MAP_W * (dec.xRel || 0.5));
        const dy = dec.y !== undefined ? dec.y : Math.round(WORLD_MAP_H * (dec.yRel || 0.5));
        const sc = asset.scale || 0.6;
        const dw = Math.round(asset.img.naturalWidth * sc);
        const dh = Math.round(asset.img.naturalHeight * sc);
        ctx.save();
        const grd = ctx.createRadialGradient(dx, dy + dh/2 - 10, 5, dx, dy + dh/2 - 10, dw * 0.45);
        grd.addColorStop(0, "rgba(0,0,0,0.4)"); grd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grd; ctx.beginPath(); ctx.ellipse(dx, dy + dh/2 - 10, dw * 0.45, 14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(asset.img, dx - dw/2, dy - dh/2, dw, dh);
        ctx.restore();
      });

      // Depth-sorted landmark buildings
      const sortedLandmarks = [...landmarks].sort((a, b) => a.y - b.y);
      sortedLandmarks.forEach(lm => {
        const isNear = nearestLandmark && nearestLandmark.id === lm.id;
        drawBuilding(ctx, lm, isNear, tNow);

        // Compact, clean name banner below building
        const shortTitle = lm.shortName || lm.name.replace(/\s*\(.*?\)/, "").trim();
        const bannerW = Math.max(90, Math.min(125, Math.round(lm.w * 0.62)));
        const bannerH = 17;
        const bannerX = lm.x - bannerW / 2;
        const bannerY = lm.bannerY || (lm.y + lm.h / 2 + 8);
        ctx.fillStyle = "rgba(10,8,14,0.92)";
        ctx.beginPath();
        ctx.moveTo(bannerX, bannerY);
        ctx.lineTo(bannerX + bannerW, bannerY);
        ctx.lineTo(bannerX + bannerW + 6, bannerY + bannerH / 2);
        ctx.lineTo(bannerX + bannerW, bannerY + bannerH);
        ctx.lineTo(bannerX, bannerY + bannerH);
        ctx.lineTo(bannerX - 6, bannerY + bannerH / 2);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = isNear ? "#e6c35c" : (lm.color || "rgba(230,195,92,0.45)"); ctx.lineWidth = isNear ? 1.5 : 1; ctx.stroke();
        
        ctx.font = isNear ? "bold 10px 'Cinzel', serif" : "bold 9px 'Cinzel', serif";
        ctx.fillStyle = isNear ? "#fffbdf" : lm.color; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(shortTitle, lm.x, bannerY + bannerH / 2);

        if (isNear) {
          ctx.font = "bold 8.5px system-ui,sans-serif"; ctx.fillStyle = "#4ade80"; ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
          ctx.fillText("👉 [Spacebar] Enter", lm.x, bannerY + bannerH + 11); ctx.shadowBlur = 0;
        }
      });

      // 11. Sparring Dummy
      const dummyBob = Math.sin(Date.now() * 0.003) * 2;
      const dHit = dummy.hitTick > 0;
      if (dHit) dummy.hitTick--;

      // Dummy shadow
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.ellipse(dummy.x, dummy.y + 18, 18, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      // Wooden pole & crossbeam
      ctx.fillStyle = "#5c3a21";
      ctx.fillRect(dummy.x - 4, dummy.y - 12, 8, 30);
      ctx.fillStyle = "#784b28";
      ctx.fillRect(dummy.x - 18, dummy.y - 4, 36, 7);

      // Target face
      ctx.font = dHit ? "34px sans-serif" : "30px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(dHit ? "💥" : "🎯", dummy.x, dummy.y - 14 + dummyBob);

      // Dummy Name Tag
      ctx.font = "italic bold 11px 'Georgia', serif";
      ctx.fillStyle = "#f3dd9a";
      ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
      ctx.fillText("Sparring Dummy", dummy.x, dummy.y - 34);
      ctx.shadowBlur = 0;

      // Dummy HP bar
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(dummy.x - 20, dummy.y - 25, 40, 4);
      ctx.fillStyle = dummy.hp > 35 ? "#ef4444" : "#f97316";
      ctx.fillRect(dummy.x - 20, dummy.y - 25, Math.max(0, (dummy.hp / dummy.maxHp) * 40), 4);

      // Prompt when near
      const distDummyNear = Math.hypot(dummy.x - hero.x, dummy.y - hero.y);
      if (distDummyNear < 70) {
        ctx.font = "bold 10px system-ui,sans-serif";
        ctx.fillStyle = "#4ade80";
        ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
        ctx.fillText("⚔️ [Spacebar] Spar", dummy.x, dummy.y + 28);
        ctx.shadowBlur = 0;
      }

      // MMO Players
      const now = Date.now();
      const imgCache = window._rpgImgCache = window._rpgImgCache || new Map();
      function drawCharacterAvatar(cCtx, avatarStr, ax, ay) {
        let av = avatarStr || "🧙";
        if (avatarPresets[av]) av = avatarPresets[av];
        if (typeof av === "string" && (av.startsWith("http") || av.startsWith("/") || av.startsWith("data:"))) {
          let img = imgCache.get(av);
          if (!img) {
            img = new Image();
            img.src = av;
            imgCache.set(av, img);
          }
          if (img.complete && img.naturalWidth > 0) {
            cCtx.save();
            cCtx.beginPath(); cCtx.arc(ax, ay, 12, 0, Math.PI * 2); cCtx.clip();
            cCtx.drawImage(img, ax - 12, ay - 12, 24, 24);
            cCtx.restore();
            cCtx.strokeStyle = "#d7b45c"; cCtx.lineWidth = 1.5; cCtx.beginPath(); cCtx.arc(ax, ay, 12, 0, Math.PI * 2); cCtx.stroke();
            return;
          }
          av = "🧙";
        }
        cCtx.font = "22px sans-serif"; cCtx.textAlign = "center"; cCtx.textBaseline = "middle";
        cCtx.fillText(av, ax, ay);
      }

      for (const [id, p] of mmoPlayers) {
         if (now - p.lastSeen > 10000) { mmoPlayers.delete(id); continue; }
         ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.beginPath(); ctx.ellipse(p.x, p.y + 16, 16, 6, 0, 0, Math.PI * 2); ctx.fill();
         const pBob = p.moving ? Math.sin((now % 1000) * 0.01) * 4 : Math.sin(now * 0.004) * 2;
         drawCharacterAvatar(ctx, p.avatar, p.x, p.y + pBob);
         ctx.font = "italic bold 11px 'Georgia', 'Palatino Linotype', serif"; ctx.fillStyle = "var(--gold-2,#f3dd9a)"; ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
         ctx.fillText(p.name, p.x, p.y - 26); ctx.shadowBlur = 0;
      }
      
      // 12. Sparky NPC (Lunar Nall familiar)
      const sparkyFloat = Math.sin(Date.now() * 0.005) * 4;
      // Sparky shadow
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(sparky.x, sparky.y + 14, 14, 5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Lunar Nall sprite
      const drewNall = drawLunarNallSprite(ctx, sparky.x, sparky.y + sparkyFloat - 2, Date.now() / 15, 0.95);
      if (!drewNall) {
        ctx.font = "30px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(sparky.icon || "🐉", sparky.x, sparky.y + sparkyFloat);
      }

      // Sparky Name Tag
      ctx.font = "italic bold 11px 'Georgia', serif";
      ctx.fillStyle = "#fef08a";
      ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
      ctx.fillText("Nall (Sparky)", sparky.x, sparky.y - 24 + sparkyFloat);
      ctx.shadowBlur = 0;

      // Prompt when near
      const distSparkyNear = Math.hypot(sparky.x - hero.x, sparky.y - hero.y);
      if (distSparkyNear < 70) {
        ctx.font = "bold 10px system-ui,sans-serif";
        ctx.fillStyle = "#38bdf8";
        ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
        ctx.fillText("💬 [Spacebar] Talk", sparky.x, sparky.y + 26);
        ctx.shadowBlur = 0;
      }

      // 13. Waypoint beacon
      if (waypoint) {
        ctx.save(); ctx.globalAlpha = waypoint.alpha;
        ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(waypoint.x, waypoint.y, waypoint.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = "rgba(251,191,36,0.4)"; ctx.beginPath(); ctx.arc(waypoint.x, waypoint.y, 4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      // 14. Projectiles
      projectiles.forEach(p => {
        ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2); ctx.fill();
        ctx.shadowColor = p.color; ctx.shadowBlur = 14; ctx.stroke(); ctx.shadowBlur = 0;
      });

      // 15. Particles
      particles.forEach(pt => { ctx.save(); ctx.globalAlpha = pt.alpha; ctx.fillStyle = pt.color; ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });

      // 16. Player hero (Lunar Alex)
      const auraGrd = ctx.createRadialGradient(hero.x, hero.y, 4, hero.x, hero.y, 26);
      auraGrd.addColorStop(0, "rgba(243,221,154,0.35)"); auraGrd.addColorStop(1, "rgba(215,180,92,0)");
      ctx.fillStyle = auraGrd; ctx.beginPath(); ctx.arc(hero.x, hero.y, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.beginPath(); ctx.ellipse(hero.x, hero.y + 16, 16, 6, 0, 0, Math.PI * 2); ctx.fill();

      // Render authentic Lunar Alex animated walking sprite!
      const drewAlex = drawLunarHeroSprite(ctx, hero.x, hero.y, hero.dir, hero.isMoving, hero.animTick, 1.05);
      if (!drewAlex) {
        const heroBob = hero.isMoving ? Math.sin(hero.frame * Math.PI) * 4 : Math.sin(Date.now() * 0.004) * 2;
        drawCharacterAvatar(ctx, hero.avatar, hero.x, hero.y + heroBob);
        ctx.font = "14px sans-serif"; ctx.fillText("🪄", hero.x + 15, hero.y + heroBob - 3);
      }
      ctx.font = "italic bold 13px 'Georgia', 'Palatino Linotype', serif"; ctx.fillStyle = "var(--gold-2,#f3dd9a)"; ctx.shadowColor = "#000"; ctx.shadowBlur = 4;
      ctx.fillText(hero.name, hero.x, hero.y - 32); ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(hero.x - 16, hero.y - 24, 32, 3.5);
      ctx.fillStyle = "#10b981"; ctx.fillRect(hero.x - 16, hero.y - 24, (hero.hp / hero.maxHp) * 32, 3.5);

      // 17. Floating texts
      floatingTexts.forEach(ft => {
        ctx.save(); ctx.font = "bold 12.5px system-ui,sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = ft.color; ctx.shadowColor = "#000"; ctx.shadowBlur = 6;
        ctx.fillText(ft.text, ft.x, ft.y); ctx.restore();
      });

      ctx.restore(); // Restore camera translation

      // Minimap
      drawMinimap();

      ctx.restore(); // Restore dpr scale
    }

    function drawRoom(c, roomId, W, H, t, rh) {
      switch (roomId) {
        case "arena":   drawRoomArena(c, W, H, t, rh); break;
        case "builder": drawRoomBuilder(c, W, H, t, rh); break;
        case "guilds":  drawRoomGuilds(c, W, H, t, rh); break;
        case "dao":     drawRoomDao(c, W, H, t, rh); break;
        case "dnd":     drawRoomDnd(c, W, H, t, rh); break;
        case "bazaar":  drawRoomBazaar(c, W, H, t, rh); break;
        case "mirror":  drawRoomMirror(c, W, H, t, rh); break;
        default: break;
      }
    }

    /* ── MAIN LOOP ── */
    function loop(timestamp) {
      if (!isRunning) return;
      update(timestamp);
      draw(timestamp);
      animId = requestAnimationFrame(loop);
    }

    function spawnRemoteSpell(s) {
      if (!s) return;
      if (s.type === "heal") {
        spawnParticles(s.x, s.y, 30, "#4ade80", 3.5, -0.08);
        addFloatingText(s.x, s.y - 28, "+25 Life", "#4ade80");
        addLog("combat", "Nearby adventurer cast Healing Aura! 💚");
      } else if (s.type === "sparkle") {
        spawnParticles(s.x, s.y, 35, "#f472b6", 4.2, -0.05);
        addLog("combat", "Nearby adventurer cast Sparkles! ✨");
      } else if (s.type === "frost") {
        spawnParticles(s.x, s.y, 40, "#38bdf8", 5.2, 0);
        addLog("combat", "Nearby adventurer cast Frost Nova! ❄️");
      } else {
        let tx = s.targetX ?? s.x, ty = s.targetY ?? s.y;
        const angle = Math.atan2(ty - s.y, tx - s.x);
        projectiles.push({
          x: s.x, y: s.y,
          vx: Math.cos(angle) * 7.8, vy: Math.sin(angle) * 7.8,
          type: "fireball", radius: 9, life: 65, damage: 45, color: "#f97316"
        });
        addLog("combat", "Nearby spell cast! 🔥");
      }
    }

    function openSparkyDialog() {
      window.MTG_SFX && window.MTG_SFX.play && window.MTG_SFX.play("sparkle");
      spawnParticles(sparky.x, sparky.y, 25, "#fef08a", 3, -0.05);
      const text = sparky.dialogs[sparky.dlgIdx % sparky.dialogs.length];
      sparky.dlgIdx++;
      showDialog(sparky.name, sparky.icon, text);
      addLog("npc", text, "Sparky");
      if (hero.mp < hero.maxMp) {
        hero.mp = Math.min(hero.maxMp, hero.mp + 20);
        updatePlayerVitals();
        addFloatingText(hero.x, hero.y - 30, "+20 Mana Blessing! ✨", "#38bdf8");
      }
    }

    function addGold(amount) {
      goldBalance += amount;
      renderPlayerCard();
      updatePlayerVitals();
      addLog("system", `Obtained ${amount.toLocaleString()} $TCG! 🪙`);
    }

    function onRemoteSparringDamage(dmg) {
      dummy.hitTick = 8;
      dummy.hp = Math.max(0, dummy.hp - (dmg || 25));
      spawnParticles(dummy.x, dummy.y, 14, "#f97316", 3);
      addFloatingText(dummy.x, dummy.y - 30, `-${dmg || 25}`, "#ef4444");
      addLog("combat", `Sparring dummy struck! (-${dmg || 25} HP)`);
      if (dummy.hp <= 0) dummy.hp = dummy.maxHp;
    }

    function updateUser(u) {
      if (!u) {
        hero.name = "Planeswalker";
        hero.avatar = "🧙";
        goldBalance = 0;
        renderPlayerCard();
        renderTopNavHud();
        updatePlayerVitals();
        return;
      }
      if (u.displayName || u.username) hero.name = u.displayName || u.username;
      hero.avatar = portraitOf(u.avatar);
      if (typeof u.balance === "number") goldBalance = u.balance;
      renderPlayerCard();
      renderTopNavHud();
      updatePlayerVitals();
    }

    window.MTG_RPG = window.MTG_RPG || {};
    window.MTG_RPG.updateUser = updateUser;
    window.MTG_RPG.toggleGuildsModal = toggleGuildsModal;
    window.MTG_RPG.toggleDaoModal = toggleDaoModal;
    window.MTG_RPG.toggleDndModal = toggleDndModal;
    window.MTG_RPG.toggleInventoryModal = toggleInventoryModal;
    window.MTG_RPG.toggleTablesModal = toggleTablesModal;
    window.MTG_RPG.addLog = addLog;
    window.MTG_RPG.setActiveDeckName = (dName) => {
      activeDeckName = dName;
      renderPlayerCard();
    };
    window.MTG_RPG.spawnRemoteSpell = spawnRemoteSpell;
    window.MTG_RPG.openSparkyDialog = openSparkyDialog;
    window.MTG_RPG.addGold = addGold;
    window.MTG_RPG.onRemoteSparringDamage = onRemoteSparringDamage;
    window.MTG_RPG.enterRoom = transitionToRoom;
    window.MTG_RPG.transitionToRoom = transitionToRoom;
    window.MTG_RPG.hero = hero;
    window.MTG_RPG.roomHero = roomHero;
    window.MTG_RPG.landmarks = landmarks;
    window.MTG_RPG.getCurrentRoom = () => currentRoom;

    renderPlayerCard();
    renderTopNavHud();
    renderHotbar();
    renderChatWindow();
    addLog("system", "Welcome to The Crypto Game. Chat & Log online. [Enter] to chat.");
    animId = requestAnimationFrame(loop);

    return {
      updateUser,
      warpTo(landmarkId) {
        const lm = landmarks.find(l => l.id === landmarkId);
        if (lm) { hero.x = lm.x; hero.y = lm.y + lm.h / 2 + 25; hero.targetX = null; hero.targetY = null; spawnParticles(hero.x, hero.y, 30, lm.color, 4); }
      },
      enterRoom(roomId) { transitionToRoom(roomId); },
      addGold,
      openSparkyDialog,
      spawnRemoteSpell,
      destroy() {
        isRunning = false;
        if (animId) cancelAnimationFrame(animId);
        window.removeEventListener("resize", resizeCanvas);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        canvas.removeEventListener("pointerdown", onCanvasPointerDown);
        if (bottomDockEl && bottomDockEl.parentNode) bottomDockEl.parentNode.removeChild(bottomDockEl);
        else {
          if (ffxiChatEl && ffxiChatEl.parentNode) ffxiChatEl.parentNode.removeChild(ffxiChatEl);
          if (hotbarEl && hotbarEl.parentNode) hotbarEl.parentNode.removeChild(hotbarEl);
        }
      },
    };
  }

  window.MTG_RPG = window.MTG_RPG || {};
  window.MTG_RPG.initHomeroom = initHomeroom;
})();
