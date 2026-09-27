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

    const hotbarEl = document.createElement("div");
    hotbarEl.id = "dfk-bottom-hotbar";
    hotbarEl.className = "dfk-bottom-hotbar";
    container.appendChild(hotbarEl);

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

    /* ── FF7 WORLD MAP & LUNAR SPRITE ENGINE ── */
    let pixelMap = null;
    let pixelMapKey = "";

    function paintImperialCity(w, h) {
      const cnv = document.createElement("canvas");
      cnv.width = w;
      cnv.height = h;
      const g = cnv.getContext("2d");
      const img = g.createImageData(w, h);
      const px = img.data;
      const set = (x, y, r, gg, b) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const i = (y * w + x) * 4;
        px[i] = r; px[i + 1] = gg; px[i + 2] = b; px[i + 3] = 255;
      };
      const cx = w * 0.5;
      const cy = h * 0.47;
      const R = Math.min(w, h) * 0.34;
      const zones = [
        [214, 176, 92],
        [196, 96, 84],
        [98, 162, 90],
        [170, 148, 198],
        [216, 198, 164],
        [102, 170, 160],
      ];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.hypot(dx, dy);
          let ang = Math.atan2(dx, -dy);
          if (ang < 0) ang += Math.PI * 2;
          const spoke = ((ang + Math.PI / 6) % (Math.PI / 3)) - Math.PI / 6;
          const onSpoke = Math.abs(spoke) < 0.05;
          const zone = Math.floor(ang / (Math.PI / 3)) % 6;
          let r = 22;
          let gg = 72;
          let b = 128;
          if (dist < R * 1.14 && dist > R) {
            r = 46; gg = 114; b = 160;
          }
          const onBridge = Math.abs(dy) < Math.max(5, R * 0.04) && dx < -R * 0.9 && dx > -R * 1.82;
          const onFarShore = Math.hypot((dx + R * 1.96) / (R * 0.26), dy / (R * 0.2)) < 1;
          const onDocks = dy > R * 0.96 && dy < R * 1.34 && Math.abs(dx) < R * 0.58;
          const onArcane = Math.hypot(x - (cx + R * 1.48), y - cy) < R * 0.26;
          const onPrison = Math.hypot(x - (cx + R * 0.9), y - (cy - R * 1.16)) < R * 0.16;
          const onCause = Math.abs(dy) < Math.max(4, R * 0.028) && dx > R * 0.92 && dx < R * 1.24;
          if (dist <= R) {
            if (dist < R * 0.2) {
              r = 48; gg = 108; b = 64;
            } else if (dist < R * 0.27 || (onSpoke && dist < R * 0.9)) {
              r = 236; gg = 228; b = 208;
            } else if (dist > R * 0.91) {
              if (onSpoke) { r = 236; gg = 228; b = 208; }
              else { r = 74; gg = 68; b = 62; }
            } else {
              const z = zones[zone];
              const shade = ((x + y * 3) & 15) === 0 ? -12 : 0;
              r = z[0] + shade; gg = z[1] + shade; b = z[2] + shade;
            }
          } else if (onDocks) {
            r = 154; gg = 126; b = 84;
            if ((x & 6) === 0) { r = 92; gg = 74; b = 48; }
          } else if (onArcane) {
            r = 146; gg = 126; b = 178;
          } else if (onPrison) {
            r = 132; gg = 130; b = 124;
          } else if (onBridge || onCause) {
            r = 176; gg = 164; b = 138;
          } else if (onFarShore) {
            r = 108; gg = 150; b = 84;
          }
          set(x, y, r, gg, b);
        }
      }
      g.putImageData(img, 0, 0);
      return cnv;
    }

    function ensurePixelKingdom() {
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
      { id: "windmill", type: "windmill", xRel: 0.88, yRel: 0.52, name: "Kalm Windmill" },
      { id: "stables", type: "stables", xRel: 0.08, yRel: 0.48, name: "Chocobo Farm" },
      { id: "workshop", type: "workshop", xRel: 0.18, yRel: 0.62, name: "Corel Quarry Workshop" },
      { id: "alchemist", type: "alchemist", xRel: 0.92, yRel: 0.82, name: "Mideel Apothecary" },
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
    let goldBalance = (user && typeof user.balance === "number") ? user.balance : 0;
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

    /* ── RESIZE ── */
    function citySpot(W, H, deg, scale) {
      const cx = W * 0.5;
      const cy = H * 0.47;
      const R = Math.min(W, H) * 0.34;
      const a = deg * Math.PI / 180;
      return {
        x: Math.round(cx + Math.sin(a) * R * scale),
        y: Math.round(cy - Math.cos(a) * R * scale),
        cx, cy, R,
      };
    }

    function updateLandmarkPositions() {
      const W = viewW, H = viewH;
      const hub = citySpot(W, H, 0, 0);
      const place = (i, deg, scale) => {
        const p = citySpot(W, H, deg, scale);
        landmarks[i].x = p.x;
        landmarks[i].y = p.y;
      };
      // Clockwise from the north, matching the Imperial City wheel.
      place(5, 30, 0.58);  // Marketplace in the Market district
      place(0, 90, 0.58);  // Colosseum in the Arena district
      place(6, 210, 0.58); // Meditation in the Temple district
      place(3, 270, 0.58); // Bank in Talos Plaza
      place(1, 330, 0.58); // Gardens in the Elven Gardens
      landmarks[2].x = hub.cx; // Tavern on the waterfront docks
      landmarks[2].y = Math.round(hub.cy + hub.R * 1.12);
      landmarks[4].x = Math.round(hub.cx + hub.R * 1.48); // Alchemist on the east island
      landmarks[4].y = hub.cy;
      const size = (i, wf, hf) => {
        landmarks[i].w = Math.min(150, Math.round(W * wf));
        landmarks[i].h = Math.min(120, Math.round(H * hf));
      };
      size(0, 0.11, 0.13);
      size(1, 0.10, 0.13);
      size(2, 0.11, 0.13);
      size(3, 0.10, 0.12);
      size(4, 0.10, 0.12);
      size(5, 0.10, 0.12);
      size(6, 0.09, 0.11);

      // Calculate dedicated Area Portal Pads for each section of the main map
      landmarks.forEach((lm) => {
        const params = buildingVisualParams[lm.id] || { bannerOffY: 66, padOffY: 82 };
        lm.bannerY = lm.y + params.bannerOffY;
        lm.padX = lm.x;
        lm.padY = lm.y + params.padOffY;
        lm.padRadius = 16;
      });

      manaWell.x = hub.cx;
      manaWell.y = hub.cy;
      manaWell.radius = Math.min(28, Math.round(Math.min(W, H) * 0.032));
      campfire.x = Math.round(hub.cx - hub.R * 0.28);
      campfire.y = Math.round(hub.cy + hub.R * 1.12);
      dummy.x = Math.round(hub.cx + hub.R * 0.9);
      dummy.y = Math.round(hub.cy - hub.R * 1.16);
      sparky.x = Math.round(hub.cx + hub.R * 0.16);
      sparky.y = Math.round(hub.cy + hub.R * 0.16);
      overworldDecor[0].xRel = (hub.cx - hub.R * 1.95) / W;
      overworldDecor[0].yRel = hub.cy / H;
      overworldDecor[1].xRel = (hub.cx - hub.R * 1.95) / W;
      overworldDecor[1].yRel = (hub.cy + hub.R * 0.28) / H;
      overworldDecor[2].xRel = (hub.cx - hub.R * 0.36) / W;
      overworldDecor[2].yRel = (hub.cy + hub.R * 1.12) / H;
      overworldDecor[3].xRel = (hub.cx + hub.R * 1.48) / W;
      overworldDecor[3].yRel = (hub.cy - hub.R * 0.22) / H;
      if (!hero._citySpawn) {
        hero.x = Math.round(hub.cx - hub.R * 1.2);
        hero.y = hub.cy;
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
      hero.x = Math.max(50, Math.min(viewW - 50, hero.x));
      hero.y = Math.max(50, Math.min(viewH - 50, hero.y));
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    hero.x = Math.round(viewW * 0.53); hero.y = Math.round(viewH * 0.48);

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

    function colosseumFrame(W, H) {
      const iw = colosseumMap.naturalWidth || 1200;
      const ih = colosseumMap.naturalHeight || 1350;
      const scale = Math.min((W * 0.96) / iw, (H * 0.94) / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      return { x: (W - dw) / 2, y: (H - dh) / 2, dw, dh };
    }

    function drawRoomArena(c, W, H, t, rh) {
      c.fillStyle = "#140c08";
      c.fillRect(0, 0, W, H);
      if (colosseumMapLoaded && colosseumMap.naturalWidth > 0) {
        const fr = colosseumFrame(W, H);
        c.save();
        c.imageSmoothingEnabled = true;
        c.drawImage(colosseumMap, fr.x, fr.y, fr.dw, fr.dh);
        c.restore();
        const ex = fr.x + fr.dw * 0.5;
        const ey = fr.y + fr.dh * 0.9;
        c.fillStyle = "#1a1008";
        c.beginPath();
        c.ellipse(ex, ey, 34, 14, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "#ef4444";
        c.lineWidth = 2;
        c.stroke();
        c.font = "bold 9px system-ui,sans-serif";
        c.fillStyle = "#f3dd9a";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText("EXIT", ex, ey);
      }
      _drawRoomHero(c, rh, t);
    }

    const gardensMap = new Image();
    let gardensMapLoaded = false;
    gardensMap.onload = () => { gardensMapLoaded = true; };
    gardensMap.src = "/assets/rooms/gardens.jpg";

    function gardensFrame(W, H) {
      const iw = gardensMap.naturalWidth || 1000;
      const ih = gardensMap.naturalHeight || 1200;
      const scale = Math.min((W * 0.96) / iw, (H * 0.94) / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      return { x: (W - dw) / 2, y: (H - dh) / 2, dw, dh };
    }

    function drawRoomBuilder(c, W, H, t, rh) {
      c.fillStyle = "#143018";
      c.fillRect(0, 0, W, H);
      if (gardensMapLoaded && gardensMap.naturalWidth > 0) {
        const fr = gardensFrame(W, H);
        c.save();
        c.imageSmoothingEnabled = false;
        c.drawImage(gardensMap, fr.x, fr.y, fr.dw, fr.dh);
        c.restore();
        const ex = fr.x + fr.dw * 0.5;
        const ey = fr.y + fr.dh * 0.93;
        c.fillStyle = "#143018";
        c.beginPath();
        c.ellipse(ex, ey, 34, 14, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "#86efac";
        c.lineWidth = 2;
        c.stroke();
        c.font = "bold 9px system-ui,sans-serif";
        c.fillStyle = "#ecfccb";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText("EXIT", ex, ey);
      }
      _drawRoomHero(c, rh, t);
    }

    function drawRoomGuilds(c, W, H, t, rh) {
      c.fillStyle = "#120a00"; c.fillRect(0, 0, W, H);
      if (tavernInteriorLoaded && tavernInterior.naturalWidth > 0) {
        const fr = tavernFrame(W, H);
        c.save();
        c.imageSmoothingEnabled = false;
        c.drawImage(tavernInterior, fr.x, fr.y, fr.dw, fr.dh);
        c.restore();
        c.fillStyle = "#1a1008";
        c.beginPath();
        c.ellipse(fr.x + fr.dw * 0.5, fr.y + fr.dh * 0.9, 34, 16, 0, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = "#f59e0b";
        c.lineWidth = 2;
        c.stroke();
        c.font = "bold 9px system-ui,sans-serif";
        c.fillStyle = "#f59e0b";
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText("EXIT", fr.x + fr.dw * 0.5, fr.y + fr.dh * 0.9);
      } else {
      // Warm stone floor
      for (let ty = 0; ty < H; ty += 48) {
        for (let tx = 0; tx < W; tx += 64) {
          c.fillStyle = `rgba(${60 + ((tx/64+ty/48)%3)*10},${30},0,1)`;
          c.fillRect(tx, ty, 64, 48);
          c.strokeStyle = "rgba(0,0,0,0.3)"; c.lineWidth = 1; c.strokeRect(tx, ty, 64, 48);
        }
      }
      // Grand hall pillars
      const pillarX = [W * 0.12, W * 0.88];
      for (const px of pillarX) {
        const pilGrd = c.createLinearGradient(px - 18, 0, px + 18, 0);
        pilGrd.addColorStop(0, "#4a2800"); pilGrd.addColorStop(0.4, "#7a4800"); pilGrd.addColorStop(1, "#3a1c00");
        c.fillStyle = pilGrd; c.fillRect(px - 18, 0, 36, H);
        // Carved relief lines
        c.strokeStyle = "rgba(0,0,0,0.5)"; c.lineWidth = 1;
        for (let py = 30; py < H; py += 40) { c.beginPath(); c.moveTo(px - 16, py); c.lineTo(px + 16, py); c.stroke(); }
        // Torch on pillar
        const tf = 0.5 + Math.sin(t * 0.012 + px) * 0.5;
        c.save(); c.globalAlpha = tf * 0.5; c.fillStyle = "#f97316"; c.beginPath(); c.arc(px, H * 0.35, 20, 0, Math.PI * 2); c.fill(); c.restore();
        c.font = "18px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("🔥", px, H * 0.35 - 18);
      }

      // Throne dais at far end
      c.fillStyle = "#1e0d00"; c.fillRect(W * 0.25, H * 0.12, W * 0.5, H * 0.12);

      // Raised Citadel Fortress sitting on elevated stone dais
      const fortAsset = buildingAssets.guilds;
      if (fortAsset && (fortAsset.loaded || fortAsset.img.complete) && fortAsset.img.naturalWidth > 0) {
        c.save();
        const sc = 0.52;
        const fw = Math.round(fortAsset.img.naturalWidth * sc);
        const fh = Math.round(fortAsset.img.naturalHeight * sc);
        c.drawImage(fortAsset.img, Math.round(W/2 - fw/2), Math.round(H * 0.02), fw, fh);
        c.restore();
      }

      // Guild banners hanging from ceiling
      const guildBanners = [
        { x: W * 0.2, color: "#ef4444", name: "Boros" },
        { x: W * 0.35, color: "#6366f1", name: "Dimir" },
        { x: W * 0.5, color: "#22c55e", name: "Golgari" },
        { x: W * 0.65, color: "#f97316", name: "Gruul" },
        { x: W * 0.8, color: "#a855f7", name: "Orzhov" },
      ];
      for (const gb of guildBanners) {
        const gbH = 70 + Math.sin(t * 0.004 + gb.x * 0.02) * 5;
        c.fillStyle = gb.color;
        c.beginPath(); c.moveTo(gb.x - 14, 0); c.lineTo(gb.x + 14, 0); c.lineTo(gb.x + 14, gbH); c.lineTo(gb.x, gbH + 10); c.lineTo(gb.x - 14, gbH); c.closePath(); c.fill();
        c.strokeStyle = "rgba(255,255,255,0.2)"; c.lineWidth = 1; c.stroke();
        c.fillStyle = "rgba(255,255,255,0.8)"; c.font = "bold 7px sans-serif"; c.textAlign = "center";
        c.fillText(gb.name, gb.x, 30);
        // Guild symbol
        c.font = "12px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText("⚔️", gb.x, 50);
        // Hanging rope
        c.strokeStyle = "#5d3b1a"; c.lineWidth = 2;
        c.beginPath(); c.moveTo(gb.x - 14, 0); c.lineTo(gb.x - 14, -8); c.stroke();
        c.beginPath(); c.moveTo(gb.x + 14, 0); c.lineTo(gb.x + 14, -8); c.stroke();
      }

      // Round table in middle (council table)
      c.fillStyle = "#3d1500"; c.beginPath(); c.ellipse(W/2, H * 0.58, W * 0.22, H * 0.14, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#8b5e00"; c.lineWidth = 3; c.stroke();
      // Chairs around table
      for (let ci = 0; ci < 10; ci++) {
        const ca = (ci / 10) * Math.PI * 2;
        const cx = W/2 + Math.cos(ca) * W * 0.25;
        const cy = H * 0.58 + Math.sin(ca) * H * 0.17;
        c.font = "14px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(["🧙","🧚","🦄","🐉","🐱","👑","🤘","🤖","💀","🎴"][ci], cx, cy);
      }
      // Map/document on table
      c.font = "22px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("📜", W/2, H * 0.58);
      }
      _drawRoomHero(c, rh, t);
    }

    function drawRoomDao(c, W, H, t, rh) {
      c.fillStyle = "#0d0900"; c.fillRect(0, 0, W, H);
      // Marble floor tiles
      for (let ty = 0; ty < H; ty += 44) {
        for (let tx = 0; tx < W; tx += 44) {
          const shade = ((tx + ty) / 88) % 1;
          c.fillStyle = `rgb(${Math.round(25 + shade * 8)},${Math.round(20 + shade * 5)},0)`;
          c.fillRect(tx, ty, 44, 44);
          c.strokeStyle = "rgba(180,140,0,0.15)"; c.lineWidth = 0.5; c.strokeRect(tx, ty, 44, 44);
        }
      }
      // Gold veining
      c.save(); c.globalAlpha = 0.08;
      c.strokeStyle = "#fbbf24"; c.lineWidth = 1.5;
      for (let vy = 0; vy < H; vy += 110) {
        c.beginPath(); c.moveTo(0, vy); c.bezierCurveTo(W*0.3, vy+22, W*0.6, vy-14, W, vy+8); c.stroke();
      }
      c.restore();

      // Grand vaulted ceiling (arches)
      const archCount = 5;
      for (let ai = 0; ai < archCount; ai++) {
        const ax = (W / (archCount + 1)) * (ai + 1);
        c.strokeStyle = "rgba(180,140,0,0.3)"; c.lineWidth = 2;
        c.beginPath(); c.arc(ax, 0, H * 0.45, 0, Math.PI); c.stroke();
      }

      // Treasury vault back wall
      c.fillStyle = "#1f1500"; c.fillRect(0, 0, W, H * 0.18);
      c.fillStyle = "#2d1e00"; c.fillRect(W * 0.2, 0, W * 0.6, H * 0.18);

      // Giant vault door (center back)
      c.fillStyle = "#6b5000"; c.fillRect(W/2 - 50, 0, 100, H * 0.15);
      // Vault door spokes
      c.strokeStyle = "#d4a017"; c.lineWidth = 3;
      const vaultCx = W/2, vaultCy = H * 0.075;
      for (let sv = 0; sv < 8; sv++) {
        const va = sv * Math.PI / 4 + t * 0.002;
        c.beginPath(); c.moveTo(vaultCx, vaultCy); c.lineTo(vaultCx + Math.cos(va) * 38, vaultCy + Math.sin(va) * 38); c.stroke();
      }
      c.strokeStyle = "#d4a017"; c.lineWidth = 2;
      c.beginPath(); c.arc(vaultCx, vaultCy, 38, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(vaultCx, vaultCy, 22, 0, Math.PI * 2); c.stroke();
      c.fillStyle = "#8b6a00"; c.beginPath(); c.arc(vaultCx, vaultCy, 8, 0, Math.PI * 2); c.fill();

      // Royal Gold Mine Treasury
      const daoAsset = buildingAssets.dao;
      if (daoAsset && (daoAsset.loaded || daoAsset.img.complete) && daoAsset.img.naturalWidth > 0) {
        c.save();
        const sc = 0.88;
        const dw = Math.round(daoAsset.img.naturalWidth * sc);
        const dh = Math.round(daoAsset.img.naturalHeight * sc);
        c.drawImage(daoAsset.img, Math.round(W * 0.22 - dw/2), Math.round(H * 0.24), dw, dh);
        c.restore();
      }

      // Gold coin piles (3 big piles)
      const piles = [{ x: W * 0.2, y: H * 0.62 }, { x: W * 0.5, y: H * 0.65 }, { x: W * 0.8, y: H * 0.62 }];
      for (const pile of piles) {
        // Pile shadow
        c.fillStyle = "rgba(0,0,0,0.5)"; c.beginPath(); c.ellipse(pile.x, pile.y + 14, 40, 12, 0, 0, Math.PI * 2); c.fill();
        // Coin pile body
        const coinGrd = c.createRadialGradient(pile.x - 10, pile.y - 10, 5, pile.x, pile.y, 38);
        coinGrd.addColorStop(0, "#fbbf24"); coinGrd.addColorStop(0.6, "#d97706"); coinGrd.addColorStop(1, "#92400e");
        c.fillStyle = coinGrd; c.beginPath(); c.ellipse(pile.x, pile.y, 38, 22, 0, 0, Math.PI * 2); c.fill();
        // Individual coins stacked
        for (let ci = 0; ci < 6; ci++) {
          const cx2 = pile.x + (ci % 3 - 1) * 12;
          const cy2 = pile.y - 14 - Math.floor(ci / 3) * 8;
          c.fillStyle = "#fbbf24"; c.beginPath(); c.ellipse(cx2, cy2, 8, 3, 0, 0, Math.PI * 2); c.fill();
          c.strokeStyle = "#d97706"; c.lineWidth = 0.5; c.stroke();
        }
      }

      // Treasure chests
      const chests = [{ x: W * 0.12, y: H * 0.5 }, { x: W * 0.88, y: H * 0.5 }];
      for (const ch of chests) {
        c.fillStyle = "#5d3b1a"; c.fillRect(ch.x - 24, ch.y - 16, 48, 32);
        c.fillStyle = "#7a4e22"; c.fillRect(ch.x - 24, ch.y - 16, 48, 14);
        c.strokeStyle = "#d4a017"; c.lineWidth = 1.5; c.strokeRect(ch.x - 24, ch.y - 16, 48, 32);
        c.fillStyle = "#d4a017"; c.fillRect(ch.x - 2, ch.y - 2, 4, 4);
        c.font = "10px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("🔒", ch.x, ch.y + 8);
        const chestGlow = 0.3 + Math.sin(t * 0.005 + ch.x) * 0.2;
        c.save(); c.globalAlpha = chestGlow; c.fillStyle = "#fbbf24"; c.beginPath(); c.arc(ch.x, ch.y, 30, 0, Math.PI * 2); c.fill(); c.restore();
      }

      // Floating DAO governance scrolls
      for (let si = 0; si < 4; si++) {
        const sa = t * 0.003 + si * 1.57;
        const sx = W/2 + Math.cos(sa) * W * 0.28;
        const sy = H * 0.4 + Math.sin(sa) * H * 0.12;
        c.save(); c.globalAlpha = 0.7; c.font = "16px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(["📜","🗳️","🪙","⚖️"][si], sx, sy); c.restore();
      }

      // Stained glass windows (sides)
      const winColors = ["#ef4444","#f97316","#fbbf24","#22c55e","#06b6d4","#6366f1"];
      for (let wi = 0; wi < 3; wi++) {
        const wx = W * 0.08 + wi * (W * 0.06);
        const wy = H * 0.04;
        c.fillStyle = winColors[wi % winColors.length]; c.save(); c.globalAlpha = 0.5;
        c.beginPath(); c.arc(wx, wy + 20, 12, Math.PI, 0); c.rect(wx - 12, wy + 20, 24, 28); c.fill(); c.restore();
        const wx2 = W - W * 0.08 - wi * (W * 0.06);
        c.fillStyle = winColors[(wi + 3) % winColors.length]; c.save(); c.globalAlpha = 0.5;
        c.beginPath(); c.arc(wx2, wy + 20, 12, Math.PI, 0); c.rect(wx2 - 12, wy + 20, 24, 28); c.fill(); c.restore();
      }

      // Hero
      _drawRoomHero(c, rh, t);

      // Exit
      c.fillStyle = "#0d0900";
      c.beginPath(); c.arc(W/2, H, 28, Math.PI, 0); c.rect(W/2 - 28, H - 4, 56, 30); c.fill();
      c.strokeStyle = "#fbbf24"; c.lineWidth = 2;
      c.beginPath(); c.arc(W/2, H, 28, Math.PI, 0); c.stroke();
      c.font = "bold 9px system-ui,sans-serif"; c.fillStyle = "#fbbf24"; c.textAlign = "center"; c.textBaseline = "top";
      c.fillText("← EXIT", W/2, H - 28);
    }

    function drawRoomDnd(c, W, H, t, rh) {
      c.fillStyle = "#060010"; c.fillRect(0, 0, W, H);
      // Astral plane starfield
      for (let si = 0; si < 180; si++) {
        const sx = (si * 137.5) % W;
        const sy = (si * 89.3 + 47) % H;
        const sa = 0.3 + Math.sin(t * 0.008 + si * 0.4) * 0.5;
        c.fillStyle = `rgba(255,255,255,${sa})`;
        c.beginPath(); c.arc(sx, sy, si % 4 === 0 ? 1.5 : 0.8, 0, Math.PI * 2); c.fill();
      }

      // Nebula clouds
      const nebulas = [
        { x: W * 0.2, y: H * 0.3, color: "rgba(192,132,252,", r: 90 },
        { x: W * 0.8, y: H * 0.6, color: "rgba(99,102,241,", r: 80 },
        { x: W * 0.5, y: H * 0.5, color: "rgba(139,92,246,", r: 100 },
      ];
      for (const neb of nebulas) {
        const nbGrd = c.createRadialGradient(neb.x, neb.y, 5, neb.x, neb.y, neb.r);
        nbGrd.addColorStop(0, neb.color + "0.18)");
        nbGrd.addColorStop(0.5, neb.color + "0.08)");
        nbGrd.addColorStop(1, neb.color + "0)");
        c.fillStyle = nbGrd; c.beginPath(); c.arc(neb.x, neb.y, neb.r, 0, Math.PI * 2); c.fill();
      }

      // Hex grid battlemap overlay
      c.save(); c.globalAlpha = 0.18; c.strokeStyle = "#7c3aed"; c.lineWidth = 0.8;
      const hexR = 24;
      const hexW2 = hexR * Math.sqrt(3);
      for (let row = -1; row < H / (hexR * 1.5) + 1; row++) {
        for (let col = -1; col < W / hexW2 + 1; col++) {
          const hx = col * hexW2 + (row % 2 === 0 ? 0 : hexW2 / 2);
          const hy = row * hexR * 1.5;
          c.beginPath();
          for (let p = 0; p < 6; p++) {
            const angle = Math.PI / 180 * (60 * p - 30);
            const px = hx + hexR * Math.cos(angle), py = hy + hexR * Math.sin(angle);
            if (p === 0) c.moveTo(px, py); else c.lineTo(px, py);
          }
          c.closePath(); c.stroke();
        }
      }
      c.restore();

      // Floating islands / platforms
      const platforms = [
        { x: W * 0.2, y: H * 0.45, w: 90, color: "#1e1030" },
        { x: W * 0.8, y: H * 0.45, w: 90, color: "#1a0c2e" },
        { x: W * 0.5, y: H * 0.3, w: 120, color: "#0e0a20" },
      ];
      for (const plat of platforms) {
        c.fillStyle = plat.color; c.beginPath(); c.ellipse(plat.x, plat.y, plat.w/2, 18, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = "rgba(139,92,246,0.5)"; c.lineWidth = 1.5; c.stroke();
        // Platform surface
        c.fillStyle = "#2d1a4a"; c.fillRect(plat.x - plat.w/2 + 4, plat.y - 22, plat.w - 8, 22);
        c.strokeStyle = "rgba(192,132,252,0.3)"; c.lineWidth = 1; c.strokeRect(plat.x - plat.w/2 + 4, plat.y - 22, plat.w - 8, 22);
        // Platform glow
        const platGrd = c.createRadialGradient(plat.x, plat.y + 20, 5, plat.x, plat.y + 20, 60);
        platGrd.addColorStop(0, "rgba(139,92,246,0.25)"); platGrd.addColorStop(1, "rgba(0,0,0,0)");
        c.fillStyle = platGrd; c.beginPath(); c.ellipse(plat.x, plat.y + 20, 60, 20, 0, 0, Math.PI * 2); c.fill();
      }

      // Miniature monsters on side platforms
      const monsters = ["🧟","🦂"];
      [platforms[0], platforms[1]].forEach((plat, mi) => {
        c.font = "20px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        const mBob = Math.sin(t * 0.008 + mi * 1.2) * 4;
        c.fillText(monsters[mi % monsters.length], plat.x, plat.y - 26 + mBob);
      });

      // Golden Dragon perched atop Rock Altar on center astral platform
      const dndAsset = buildingAssets.dnd;
      if (dndAsset && (dndAsset.loaded || dndAsset.img.complete) && dndAsset.img.naturalWidth > 0) {
        c.save();
        const sc = 0.88;
        const dw = Math.round(dndAsset.img.naturalWidth * sc);
        const dh = Math.round(dndAsset.img.naturalHeight * sc);
        c.drawImage(dndAsset.img, Math.round(W * 0.5 - dw/2), Math.round(H * 0.30 - dh + 10), dw, dh);
        c.restore();
      }

      // Giant portal at center (spinning)
      const portalRot = t * 0.004;
      c.save(); c.translate(W/2, H * 0.55); c.rotate(portalRot);
      c.strokeStyle = "rgba(192,132,252,0.7)"; c.lineWidth = 6;
      c.beginPath(); c.arc(0, 0, 66, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = "rgba(139,92,246,0.4)"; c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, 80, 0, Math.PI * 2); c.stroke();
      // Runic marks
      for (let ri = 0; ri < 8; ri++) {
        const ra = (ri / 8) * Math.PI * 2;
        c.fillStyle = "#e879f9"; c.font = "10px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(["ᚠ","ᚢ","ᚦ","ᚨ","ᚱ","ᚲ","ᚷ","ᚹ"][ri], Math.cos(ra) * 60, Math.sin(ra) * 60);
      }
      c.restore();
      // Portal void
      const vGrd = c.createRadialGradient(W/2, H * 0.55, 0, W/2, H * 0.55, 60);
      vGrd.addColorStop(0, "rgba(5,0,20,0.96)"); vGrd.addColorStop(0.6, "rgba(88,28,135,0.6)"); vGrd.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = vGrd; c.beginPath(); c.arc(W/2, H * 0.55, 60, 0, Math.PI * 2); c.fill();
      c.font = "30px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText("🎲", W/2, H * 0.55 + Math.sin(t * 0.007) * 6);

      // Floating dice around portal
      const diceTypes = ["⚀","⚁","⚂","⚃","⚄","⚅"];
      for (let di = 0; di < 6; di++) {
        const da = t * 0.005 + di * 1.047;
        const dr = 100;
        const dx = W/2 + Math.cos(da) * dr;
        const dy = H * 0.55 + Math.sin(da) * 55;
        c.save(); c.globalAlpha = 0.8; c.font = "16px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(diceTypes[di], dx, dy); c.restore();
      }

      // Astral chains connecting platforms
      c.save(); c.globalAlpha = 0.3; c.strokeStyle = "#7c3aed"; c.lineWidth = 1; c.setLineDash([4, 8]);
      c.beginPath(); c.moveTo(platforms[0].x, platforms[0].y); c.lineTo(platforms[2].x, platforms[2].y); c.stroke();
      c.beginPath(); c.moveTo(platforms[1].x, platforms[1].y); c.lineTo(platforms[2].x, platforms[2].y); c.stroke();
      c.setLineDash([]); c.restore();

      // Hero
      _drawRoomHero(c, rh, t);

      // Exit
      c.fillStyle = "#060010";
      c.beginPath(); c.arc(W/2, H, 28, Math.PI, 0); c.rect(W/2 - 28, H - 4, 56, 30); c.fill();
      c.strokeStyle = "#c084fc"; c.lineWidth = 2;
      c.beginPath(); c.arc(W/2, H, 28, Math.PI, 0); c.stroke();
      c.font = "bold 9px system-ui,sans-serif"; c.fillStyle = "#c084fc"; c.textAlign = "center"; c.textBaseline = "top";
      c.fillText("← EXIT", W/2, H - 28);
    }

    function drawRoomBazaar(c, W, H, t, rh) {
      c.fillStyle = "#000e08"; c.fillRect(0, 0, W, H);
      // Cobblestone ground
      for (let ty = H * 0.5; ty < H; ty += 30) {
        for (let tx = 0; tx < W; tx += 40) {
          c.fillStyle = `rgba(0,${20 + (tx/40 + ty/30) % 4 * 5},${10},1)`;
          c.fillRect(tx, ty, 40, 30); c.strokeStyle = "rgba(0,0,0,0.3)"; c.lineWidth = 0.5; c.strokeRect(tx, ty, 40, 30);
        }
      }
      // Open sky top half (evening glow)
      const skyGrd = c.createLinearGradient(0, 0, 0, H * 0.5);
      skyGrd.addColorStop(0, "#001a0d"); skyGrd.addColorStop(0.5, "#002b14"); skyGrd.addColorStop(1, "#004020");
      c.fillStyle = skyGrd; c.fillRect(0, 0, W, H * 0.5);

      // Stars in sky
      for (let si = 0; si < 60; si++) {
        const sx = (si * 200.5) % W;
        const sy = (si * 77.3) % (H * 0.45);
        c.fillStyle = `rgba(255,255,255,${0.3 + Math.sin(t * 0.01 + si) * 0.3})`;
        c.beginPath(); c.arc(sx, sy, 0.8, 0, Math.PI * 2); c.fill();
      }

      // Moon
      c.fillStyle = "#fefce8"; c.save(); c.globalAlpha = 0.9;
      c.beginPath(); c.arc(W * 0.85, H * 0.12, 22, 0, Math.PI * 2); c.fill();
      c.restore();
      // Moon glow
      const moonGrd = c.createRadialGradient(W * 0.85, H * 0.12, 5, W * 0.85, H * 0.12, 55);
      moonGrd.addColorStop(0, "rgba(254,252,232,0.2)"); moonGrd.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = moonGrd; c.beginPath(); c.arc(W * 0.85, H * 0.12, 55, 0, Math.PI * 2); c.fill();

      // Grand Oracle Bazaar Trading Hall in background
      const bazAsset = buildingAssets.bazaar;
      if (bazAsset && (bazAsset.loaded || bazAsset.img.complete) && bazAsset.img.naturalWidth > 0) {
        c.save();
        const sc = 0.76;
        const bw = Math.round(bazAsset.img.naturalWidth * sc);
        const bh = Math.round(bazAsset.img.naturalHeight * sc);
        c.drawImage(bazAsset.img, Math.round(W * 0.5 - bw/2), Math.round(H * 0.12), bw, bh);
        c.restore();
      }

      // Market stalls (3 big ones)
      const stalls = [
        { x: W * 0.15, y: H * 0.38, color: "#065f46", name: "Cards" },
        { x: W * 0.5, y: H * 0.35, color: "#7c3aed", name: "Spells" },
        { x: W * 0.85, y: H * 0.38, color: "#b45309", name: "Relics" },
      ];
      for (const stall of stalls) {
        // Stall frame
        c.strokeStyle = "#5d3b1a"; c.lineWidth = 3;
        c.beginPath(); c.moveTo(stall.x - 55, stall.y + 40); c.lineTo(stall.x - 55, stall.y - 30); c.stroke();
        c.beginPath(); c.moveTo(stall.x + 55, stall.y + 40); c.lineTo(stall.x + 55, stall.y - 30); c.stroke();
        c.beginPath(); c.moveTo(stall.x, stall.y + 40); c.lineTo(stall.x, stall.y - 50); c.stroke();
        // Awning
        const awningPoints = [[-55, -28], [-28, -44], [0, -52], [28, -44], [55, -28]];
        c.fillStyle = stall.color;
        c.beginPath(); c.moveTo(stall.x + awningPoints[0][0], stall.y + awningPoints[0][1]);
        for (const [ax, ay] of awningPoints) { c.lineTo(stall.x + ax, stall.y + ay); }
        c.lineTo(stall.x + 55, stall.y + 40); c.lineTo(stall.x - 55, stall.y + 40); c.closePath(); c.fill();
        c.strokeStyle = "rgba(255,255,255,0.3)"; c.lineWidth = 1; c.stroke();
        // Counter
        c.fillStyle = "#5d3b1a"; c.fillRect(stall.x - 52, stall.y + 20, 104, 18);
        // Stall name tag
        c.fillStyle = "#fef3c7"; c.font = "bold 8px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(stall.name, stall.x, stall.y - 10);
        // Stall items on counter
        const stallItems = ["🎴","🃏","⚔️","💎","🌟","📜"];
        for (let ii = 0; ii < 4; ii++) {
          c.font = "11px sans-serif"; c.fillText(stallItems[(ii + stalls.indexOf(stall) * 2) % stallItems.length], stall.x - 30 + ii * 22, stall.y + 29);
        }
        // Stall merchant
        const merchants = ["👺","🧙","🧚"];
        const merchantTitles = ["Squee [Card Marketplace]", "Archmage Vron [Spells]", "Ariel [Booster Packs]"];
        c.font = "24px sans-serif"; c.fillText(merchants[stalls.indexOf(stall)], stall.x, stall.y - 2);
        c.font = "italic bold 10px 'Cinzel', serif"; c.fillStyle = "#fef3c7";
        c.shadowColor = "#000"; c.shadowBlur = 4;
        c.fillText(merchantTitles[stalls.indexOf(stall)], stall.x, stall.y - 22);
        c.shadowBlur = 0;
      }

      // String lights connecting stalls
      for (let li = 0; li < stalls.length - 1; li++) {
        const s1 = stalls[li], s2 = stalls[li + 1];
        const lightCount = 8;
        for (let lj = 0; lj <= lightCount; lj++) {
          const lt = lj / lightCount;
          const lx = s1.x + (s2.x - s1.x) * lt;
          const ly = s1.y + (s2.y - s1.y) * lt - Math.sin(lt * Math.PI) * 18;
          const lGlow = 0.6 + Math.sin(t * 0.012 + lj * 0.8) * 0.4;
          c.save(); c.globalAlpha = lGlow;
          c.fillStyle = ["#f97316","#fbbf24","#22c55e","#38bdf8","#c084fc"][lj % 5];
          c.beginPath(); c.arc(lx, ly, 4, 0, Math.PI * 2); c.fill(); c.restore();
        }
        c.strokeStyle = "rgba(255,255,255,0.15)"; c.lineWidth = 1; c.setLineDash([2, 4]);
        c.beginPath(); c.moveTo(s1.x, s1.y - 30); c.quadraticCurveTo((s1.x + s2.x) / 2, (s1.y + s2.y) / 2 - 40, s2.x, s2.y - 30); c.stroke();
        c.setLineDash([]);
      }

      // Floating oracle card display (center)
      const cardAng = t * 0.003;
      const featuredCards = ["🌙","⭐","🌊","🔥","🌿","⚡","💜"];
      for (let ci = 0; ci < 7; ci++) {
        const ca = cardAng + ci * (Math.PI * 2 / 7);
        const cr = Math.min(W,H) * 0.28;
        const cx2 = W/2 + Math.cos(ca) * cr;
        const cy2 = H * 0.42 + Math.sin(ca) * cr * 0.4;
        c.save(); c.globalAlpha = 0.65 + Math.sin(t * 0.006 + ci) * 0.3;
        c.font = "16px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(featuredCards[ci], cx2, cy2); c.restore();
      }

      // Scrying crystal ball center
      const crystGrd = c.createRadialGradient(W/2 - 8, H * 0.42 - 8, 4, W/2, H * 0.42, 30);
      crystGrd.addColorStop(0, "rgba(255,255,255,0.9)"); crystGrd.addColorStop(0.4, "rgba(16,185,129,0.6)"); crystGrd.addColorStop(1, "rgba(0,20,10,0.9)");
      c.fillStyle = crystGrd; c.beginPath(); c.arc(W/2, H * 0.42, 30, 0, Math.PI * 2); c.fill();
      c.strokeStyle = "#6ee7b7"; c.lineWidth = 2; c.stroke();
      c.save(); c.globalAlpha = 0.8; c.font = "20px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText("🔮", W/2, H * 0.42); c.restore();

      // Hero
      _drawRoomHero(c, rh, t);

      // Exit
      c.fillStyle = "#000e08";
      c.beginPath(); c.arc(W/2, H - 4, 28, Math.PI, 0); c.rect(W/2 - 28, H - 4, 56, 30); c.fill();
      c.strokeStyle = "#10b981"; c.lineWidth = 2;
      c.beginPath(); c.arc(W/2, H - 4, 28, Math.PI, 0); c.stroke();
      c.font = "bold 9px system-ui,sans-serif"; c.fillStyle = "#10b981"; c.textAlign = "center"; c.textBaseline = "top";
      c.fillText("← EXIT", W/2, H - 32);
    }

    function drawRoomMirror(c, W, H, t, rh) {
      // 1. Cosmic Void / Night Sky background
      c.fillStyle = "#07060e";
      c.fillRect(0, 0, W, H);
      for (let i = 0; i < 28; i++) {
        const sx = ((i * 137.5) % W);
        const sy = ((i * 89.3) % H);
        const sa = 0.25 + Math.sin(t * 0.003 + i) * 0.25;
        c.fillStyle = `rgba(180, 195, 255, ${sa})`;
        c.beginPath(); c.arc(sx, sy, 0.8, 0, Math.PI * 2); c.fill();
      }

      // 2. Star Dragon Tower Foyer (ripped from Lunar 2: Eternal Blue Complete)
      const foyer = roomAssets.mirrorFoyer;
      const fScale = Math.min((W * 0.90) / 352, (H * 0.90) / 319, 1.85);
      const fw = Math.round(352 * fScale);
      const fh = Math.round(319 * fScale);
      const fx = Math.round((W - fw) / 2);
      const fy = Math.round((H - fh) / 2);

      // Ambient radial glow beneath foyer
      const fGrd = c.createRadialGradient(W / 2, H / 2, fw * 0.2, W / 2, H / 2, fw * 0.62);
      fGrd.addColorStop(0, "rgba(79, 70, 229, 0.25)");
      fGrd.addColorStop(0.7, "rgba(30, 27, 75, 0.15)");
      fGrd.addColorStop(1, "rgba(0, 0, 0, 0)");
      c.fillStyle = fGrd;
      c.beginPath(); c.ellipse(W / 2, H / 2, fw * 0.62, fh * 0.58, 0, 0, Math.PI * 2); c.fill();

      // Render the authentic Lunar 2 Foyer
      if (foyer && (foyer.loaded || foyer.img.complete) && foyer.img.naturalWidth > 0) {
        c.save();
        c.imageSmoothingEnabled = false; // crisp authentic pixel art
        c.drawImage(foyer.img, fx, fy, fw, fh);
        c.restore();
      }

      // 3. Grand Mystic Mirror Obelisk (mounted gracefully on the northern dais before archway)
      const mirrorW = Math.round(72 * (fScale / 1.5));
      const mirrorH = Math.round(112 * (fScale / 1.5));
      const mx = W / 2;
      const my = fy + Math.round(fh * 0.33);

      // Obelisk pedestal shadow
      c.fillStyle = "rgba(0,0,0,0.55)";
      c.beginPath();
      c.ellipse(mx, my + mirrorH / 2 + 4, mirrorW * 0.65, 12, 0, 0, Math.PI * 2);
      c.fill();

      // Mirror Stone Frame (ornate arch)
      c.fillStyle = "#1e1329";
      c.beginPath();
      c.arc(mx, my - 8, mirrorW / 2 + 8, Math.PI, 0);
      c.rect(mx - mirrorW / 2 - 8, my - 8, mirrorW + 16, mirrorH / 2 + 8);
      c.fill();
      c.strokeStyle = "#fbbf24";
      c.lineWidth = 2.5;
      c.beginPath();
      c.arc(mx, my - 8, mirrorW / 2 + 8, Math.PI, 0);
      c.rect(mx - mirrorW / 2 - 8, my - 8, mirrorW + 16, mirrorH / 2 + 8);
      c.stroke();

      // Lifestream / Astral Mirror Glass
      const glassGrd = c.createRadialGradient(mx, my, 4, mx, my, mirrorW / 2);
      glassGrd.addColorStop(0, "rgba(244, 114, 182, 0.9)");
      glassGrd.addColorStop(0.45, "rgba(139, 92, 246, 0.6)");
      glassGrd.addColorStop(1, "rgba(15, 23, 42, 0.95)");
      c.fillStyle = glassGrd;
      c.beginPath();
      c.arc(mx, my - 8, mirrorW / 2, Math.PI, 0);
      c.rect(mx - mirrorW / 2, my - 8, mirrorW, mirrorH / 2);
      c.fill();

      // Mirror reflection: Player avatar live reflection inside glass
      c.save();
      c.globalAlpha = 0.88 + Math.sin(t * 0.005) * 0.12;
      drawCharacterAvatar(c, hero.avatar, mx, my + 8);
      c.restore();

      // Floating mirror sparkles
      c.font = "14px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText("✨", mx - mirrorW / 2 - 12, my - 16 + Math.sin(t * 0.006) * 4);
      c.fillText("✨", mx + mirrorW / 2 + 12, my - 8 + Math.sin(t * 0.006 + 1.2) * 4);

      c.font = "bold 10px 'Cinzel', serif"; c.fillStyle = "#fef08a"; c.textAlign = "center";
      c.shadowColor = "#000"; c.shadowBlur = 4;
      c.fillText("MYSTIC MIRROR", mx, my - mirrorW / 2 - 20);
      c.shadowBlur = 0;

      // 4. Left Alcove: Astral Wardrobe
      const wx = fx + Math.round(fw * 0.18);
      const wy = fy + Math.round(fh * 0.44);
      c.fillStyle = "rgba(0,0,0,0.4)"; c.beginPath(); c.ellipse(wx, wy + 26, 24, 8, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#3b1e08"; c.fillRect(wx - 22, wy - 26, 44, 52);
      c.strokeStyle = "#d4af37"; c.lineWidth = 1.5; c.strokeRect(wx - 22, wy - 26, 44, 52);
      c.font = "18px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText("👗", wx, wy);
      c.font = "bold 8.5px sans-serif"; c.fillStyle = "#f472b6";
      c.fillText("Wardrobe", wx, wy + 35);

      // 5. Right Alcove: Cosmetic Vanity
      const vx = fx + Math.round(fw * 0.82);
      const vy = fy + Math.round(fh * 0.44);
      c.fillStyle = "rgba(0,0,0,0.4)"; c.beginPath(); c.ellipse(vx, vy + 18, 26, 8, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#3b1e08"; c.fillRect(vx - 24, wy - 14, 48, 32);
      c.strokeStyle = "#d4af37"; c.lineWidth = 1.5; c.strokeRect(vx - 24, wy - 14, 48, 32);
      c.font = "16px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
      c.fillText("🎨", vx - 8, wy + 2); c.fillText("✨", vx + 10, wy + 2);
      c.font = "bold 8.5px sans-serif"; c.fillStyle = "#f472b6";
      c.fillText("Vanity Table", vx, wy + 28);

      // 6. Floating avatar presets around foyer chamber
      const presets = ["🧙","🧚","🦄","🐉","👑","🤘","🤖","💀","🐱"];
      for (let pi = 0; pi < presets.length; pi++) {
        const pa = (pi / presets.length) * Math.PI * 2 + t * 0.001;
        const prX = fw * 0.28;
        const prY = fh * 0.20;
        const px = W / 2 + Math.cos(pa) * prX;
        const py = fy + Math.round(fh * 0.52) + Math.sin(pa) * prY;
        c.save(); c.globalAlpha = 0.45 + Math.sin(t * 0.005 + pi) * 0.25;
        c.font = "13px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
        c.fillText(presets[pi], px, py);
        c.restore();
      }

      // 7. Ambient rising stardust
      for (let si = 0; si < 12; si++) {
        const sx = fx + Math.round(fw * 0.25) + ((si * 43) % Math.round(fw * 0.5));
        const sy = fy + Math.round(fh * 0.35) + (((t * 0.04 + si * 28) % Math.round(fh * 0.45)));
        c.fillStyle = `rgba(244, 114, 182, ${0.25 + Math.sin(t * 0.004 + si) * 0.2})`;
        c.beginPath(); c.arc(sx, sy, 1.2, 0, Math.PI * 2); c.fill();
      }

      // 8. Hero
      _drawRoomHero(c, rh, t);

      // 9. Exit arch at south threshold
      const ex = W / 2;
      const ey = fy + fh - Math.round(22 * fScale);
      c.fillStyle = "rgba(10, 8, 16, 0.85)";
      c.beginPath(); c.arc(ex, ey, 20, Math.PI, 0); c.rect(ex - 20, ey, 40, 12); c.fill();
      c.strokeStyle = "#f472b6"; c.lineWidth = 1.5;
      c.beginPath(); c.arc(ex, ey, 20, Math.PI, 0); c.stroke();
      c.font = "bold 8px system-ui,sans-serif"; c.fillStyle = "#f472b6"; c.textAlign = "center"; c.textBaseline = "top";
      c.fillText("← EXIT", ex, ey - 18);
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

      switch (roomId) {
        case "arena": {
          const fr = colosseumMapLoaded ? colosseumFrame(W, H) : { x: 0, y: 0, dw: W, dh: H };
          return [
            {
              id: "arena_tables",
              name: "🏰 Arena Master",
              subtitle: "Browse Live & Open Tables",
              icon: "🏰",
              promptText: "Open Tables",
              x: fr.x + fr.dw * 0.5,
              y: fr.y + fr.dh * 0.4,
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
              x: fr.x + fr.dw * 0.5,
              y: fr.y + fr.dh * 0.7,
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
              x: W * 0.5,
              y: H * 0.60,
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
              x: W * 0.5 - 79,
              y: H * 0.57,
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
              x: W * 0.15,
              y: H * 0.45,
              radius: 85,
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
              x: W * 0.5,
              y: H * 0.42,
              radius: 85,
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
              x: W * 0.85,
              y: H * 0.45,
              radius: 85,
              onInteract() {
                const packEl = roomOverlay.querySelector("#pack-machine");
                if (packEl) packEl.scrollIntoView({ behavior: "smooth" });
              }
            }
          ];

        case "guilds": {
          const fr = tavernInteriorLoaded ? tavernFrame(W, H) : { x: 0, y: 0, dw: W, dh: H };
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
              x: fr.x + fr.dw * 0.86,
              y: fr.y + fr.dh * 0.46,
              radius: 64,
              onInteract() {
                if (window.MTG && window.MTG.openGuildsModal) window.MTG.openGuildsModal({ tab: "leagues" });
              }
            }
          ];
        }

        case "dao":
          return [
            {
              id: "dao_vault",
              name: "🏛️ Vaultkeeper",
              subtitle: "Royal Treasury Governance & Proposals",
              icon: "🏛️",
              promptText: "DAO Governance",
              x: W * 0.5,
              y: H * 0.18,
              radius: 85,
              onInteract() {
                if (window.MTG && window.MTG.openDaoModal) window.MTG.openDaoModal();
              }
            },
            {
              id: "dao_faucet",
              name: "🪙 Daily Gold Font",
              subtitle: "Claim Free Daily Wager Gold",
              icon: "💧",
              promptText: "Claim Gold",
              x: W * 0.5,
              y: H * 0.65,
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
              x: W * 0.5,
              y: H * 0.55,
              radius: 85,
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
              x: W * 0.2,
              y: H * 0.45,
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
              x: W * 0.5,
              y: H * 0.38,
              radius: 85,
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
              x: W * 0.20,
              y: H * 0.46,
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
              x: W * 0.80,
              y: H * 0.46,
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

      // Check exit arch proximity first
      const distExit = Math.hypot(roomHero.x - viewW * 0.5, roomHero.y - viewH);
      if (distExit < 70) {
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
          hotbarEl.hidden = false;
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

          // Setup room hero spawn (doorway bottom center)
          if (roomId === "mirror") {
            const fScale = Math.min((viewW * 0.90) / 352, (viewH * 0.90) / 319, 1.85);
            const fh = Math.round(319 * fScale);
            const fy = Math.round((viewH - fh) / 2);
            roomHero.x = Math.round(viewW * 0.5);
            roomHero.y = fy + fh - Math.round(36 * fScale);
          } else if (roomId === "arena") {
            const fr = colosseumFrame(viewW, viewH);
            roomHero.x = Math.round(fr.x + fr.dw * 0.5);
            roomHero.y = Math.round(fr.y + fr.dh * 0.72);
          } else if (roomId === "guilds") {
            const fr = tavernFrame(viewW, viewH);
            roomHero.x = Math.round(fr.x + fr.dw * 0.28);
            roomHero.y = Math.round(fr.y + fr.dh * 0.62);
          } else {
            roomHero.x = Math.round(viewW * 0.5);
            roomHero.y = Math.round(viewH * 0.84);
          }
          roomHero.targetX = null; roomHero.targetY = null; roomHero.isMoving = false;
          roomParticles = [];
          roomAnimTick = 0;

          // Build room overlay UI
          buildRoomOverlay(roomId, def);
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
        <div class="dfk-room-panel" id="dfk-room-panel" style="border-color:${def.color}">
          <div class="dfk-room-panel-header" style="border-color:${def.color}80;color:${def.color}">
            <span class="dfk-room-panel-icon">${def.icon}</span>
            <span class="dfk-room-panel-title">${def.name}</span>
            <button type="button" class="btn small ghost dfk-room-exit-btn" id="dfk-room-exit-btn" title="Exit to Overworld">
              🗺️ Exit [Esc]
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
          <button type="button" class="btn small ghost" id="dfk-room-hud-return" style="font-size:11px;padding:3px 8px;margin-left:6px" title="Return to Overworld">
            🗺️ Return [Esc]
          </button>
        </div>
      `;

      const exitBtn = roomOverlay.querySelector("#dfk-room-exit-btn");
      if (exitBtn) { exitBtn.onclick = () => transitionToRoom("overworld"); }
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
              <div class="dfk-stat-chip">🪙 Gold: <b>${goldBalance.toLocaleString()}</b></div>
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
              <div class="dfk-stat-chip">🪙 Your Balance: <b>${goldBalance.toLocaleString()} Gold</b></div>
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
      if (typeof balance === "number") goldBalance = balance;
      if (user && window.MTG.setCachedUser) window.MTG.setCachedUser(user);
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
          </div>`;
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
            <div class="dfk-wealth-row">
              <div class="dfk-wealth-badge">🪙 <b id="dfk-card-gold">${goldBalance.toLocaleString()}</b> <small>Gold</small></div>
              <div class="dfk-wealth-badge">⭐ <b>${xp}/${xpNeeded}</b> <small>XP</small></div>
            </div>
            <div class="dfk-xp-bar" style="width:100%;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;margin-top:3px;" title="${xp} / ${xpNeeded} XP (${xpPct}%)">
              <div style="width:${xpPct}%;height:100%;background:linear-gradient(90deg,#8b5cf6,#eab308);border-radius:2px;"></div>
            </div>
          </div>
        </div>
        <div class="dfk-card-actions" style="display:flex; flex-wrap:wrap; gap:4px; margin-top:8px;">
          <button type="button" class="btn small danger" id="btn-dfk-quickplay" title="Quick Duel vs Sparky AI">⚔️ Quickplay</button>
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

      const btnQp = playerCardEl.querySelector("#btn-dfk-quickplay");
      if (btnQp) btnQp.onclick = () => {
         sessionStorage.setItem("mtg-pending-create", JSON.stringify({
           name: "⚔️ Quickplay vs AI",
           format: "duel",
           wager: 0,
           vsBot: true,
           deckId: sessionStorage.getItem("mtg-selected-deck") || localStorage.getItem("mtg-selected-deck") || null,
         }));
         if (typeof onNavigate === "function") onNavigate("/table/new");
         else window.MTG && window.MTG.go && window.MTG.go("/table/new");
      };

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
      const goldTxt = playerCardEl.querySelector("#dfk-card-gold");
      if (hpFill) hpFill.style.width = `${(hero.hp / hero.maxHp) * 100}%`;
      if (hpTxt) hpTxt.textContent = `${hero.hp}/${hero.maxHp}`;
      if (mpFill) mpFill.style.width = `${(hero.mp / hero.maxMp) * 100}%`;
      if (mpTxt) mpTxt.textContent = `${hero.mp}/${hero.maxMp}`;
      if (goldTxt) goldTxt.textContent = goldBalance.toLocaleString();

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
      if (rGold) rGold.textContent = goldBalance.toLocaleString();
    }

    function renderTopNavHud() {
      const u = window.MTG && window.MTG.getCachedUser && window.MTG.getCachedUser();
      const sfxOn = !!(window.MTG_SFX && window.MTG_SFX.enabled);
      const bgmOn = !!(window.MTG_BGM && window.MTG_BGM.enabled);

      topNavHud.innerHTML = `
        <button type="button" class="dfk-nav-pill ${sfxOn ? 'active' : ''}" id="btn-dfk-sfx" title="Toggle Sound Effects">
          ${sfxOn ? "🔔 Sounds" : "🔕 Muted"}
        </button>
        <button type="button" class="dfk-nav-pill ${bgmOn ? 'active' : ''}" id="btn-dfk-music" title="BGM Whimsical Music Playlist">
          ${bgmOn ? "🎵 Music" : "🔇 Music Off"}
        </button>
        <button type="button" class="dfk-nav-pill" id="btn-dfk-skin" title="Switch Multiverse Visual Theme">
          🎨 Theme
        </button>
        <button type="button" class="dfk-nav-pill" id="btn-dfk-top-web3" title="${u?.walletAddress ? `Connected (${u.walletChain || 'ethereum'}): ${u.walletAddress}` : 'Log in with an Ethereum wallet on Sepolia and sign a test message'}">
          ${u?.walletAddress ? `${window.MTG?.loginIcon || ""}${u.walletAddress.slice(0, 6)}…` : `${window.MTG?.loginIcon || ""}Login`}
        </button>
        <button type="button" class="dfk-nav-pill" id="btn-dfk-fs" title="Toggle Fullscreen">
          ⛶ Fullscreen
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
          topW3.textContent = "👻 Opening…";
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
              <button type="button" class="d2-action-btn ${hero.activeSpell === "fireball" ? "active" : ""}" data-spell="fireball" title="🔥 Fireball (Hotkey: 1)">
                <span class="d2-action-icon">🔥</span>
                <span class="d2-action-name">Fireball</span>
                <span class="d2-action-key">1</span>
              </button>
              <button type="button" class="d2-action-btn ${hero.activeSpell === "frost" ? "active" : ""}" data-spell="frost" title="❄️ Frost Nova (Hotkey: 2)">
                <span class="d2-action-icon">❄️</span>
                <span class="d2-action-name">Frost</span>
                <span class="d2-action-key">2</span>
              </button>
              <button type="button" class="d2-action-btn ${hero.activeSpell === "sparkle" ? "active" : ""}" data-spell="sparkle" title="✨ Sparkle (Hotkey: 3)">
                <span class="d2-action-icon">✨</span>
                <span class="d2-action-name">Sparkle</span>
                <span class="d2-action-key">3</span>
              </button>
              <button type="button" class="d2-action-btn ${hero.activeSpell === "heal" ? "active" : ""}" data-spell="heal" title="💖 Heal (Hotkey: 4)">
                <span class="d2-action-icon">💖</span>
                <span class="d2-action-name">Heal</span>
                <span class="d2-action-key">4</span>
              </button>
              <button type="button" class="d2-action-btn interact-btn" id="btn-dfk-interact" title="💬 Action / Interact (Hotkey: Spacebar)">
                <span class="d2-action-icon">💬</span>
                <span class="d2-action-name">Action</span>
                <span class="d2-action-key">Space</span>
              </button>
            </div>

            <!-- Center Emblem Divider -->
            <div class="d2-center-crest" title="Planeswalker Sanctum">
              <span class="d2-crest-icon">✦</span>
            </div>

            <!-- Section Navigation (Opens Game Inventory Windows) -->
            <div class="d2-slot-group nav-group">
              <button type="button" class="d2-nav-btn" id="btn-hud-tables" data-warp="tables" title="🏰 Grand Arena Tables (Overlay Window) [T]">
                <span class="d2-nav-icon">🏰</span>
                <span class="d2-nav-label">Tables</span>
              </button>
              <button type="button" class="d2-nav-btn" id="btn-hud-inventory" data-warp="inventory" title="🎒 Tolarian Deck & Card Inventory (Overlay Window) [I]">
                <span class="d2-nav-icon">🎒</span>
                <span class="d2-nav-label">Inventory [I]</span>
              </button>
              <button type="button" class="d2-nav-btn" data-warp="bazaar" title="⚖️ The Oracle Bazaar Card Marketplace (Overlay Window)">
                <span class="d2-nav-icon">⚖️</span>
                <span class="d2-nav-label">Market</span>
              </button>
              <button type="button" class="d2-nav-btn" data-warp="guilds" title="⚔️ Citadel of Guilds (Inventory Window)">
                <span class="d2-nav-icon">⚔️</span>
                <span class="d2-nav-label">Guilds</span>
              </button>
              <button type="button" class="d2-nav-btn" data-warp="dao" title="🏛️ Royal Treasury DAO (Inventory Window)">
                <span class="d2-nav-icon">🏛️</span>
                <span class="d2-nav-label">DAO</span>
              </button>
              <button type="button" class="d2-nav-btn" data-warp="dnd" title="🐉 Astral Rift RPG (Inventory Window)">
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

      // Section Navigation click (Walks into dedicated room)
      hotbarEl.querySelectorAll("[data-warp]").forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const w = btn.dataset.warp;
          let target = w;
          if (w === "tables") target = "arena";
          if (w === "inventory") target = "builder";
          if (w === "market") target = "bazaar";
          transitionToRoom(target);
        };
      });
    }

    /* ── MINIMAP ── */
    function drawMinimap() {
      if (!mmCtx || currentRoom !== "overworld") return;
      const mW = 160, mH = 110;
      mmCtx.clearRect(0, 0, mW, mH);
      // Background
      const kingdom = ensurePixelKingdom();
      mmCtx.imageSmoothingEnabled = false;
      mmCtx.drawImage(kingdom, 0, 0, mW, mH);
      mmCtx.strokeStyle = "rgba(215,180,92,0.6)"; mmCtx.lineWidth = 1; mmCtx.strokeRect(0, 0, mW, mH);

      // Mana well
      const scale = (v, dim) => v / dim;
      const mx = scale(manaWell.x, viewW) * mW;
      const my = scale(manaWell.y, viewH) * mH;
      mmCtx.fillStyle = "rgba(215,180,92,0.3)"; mmCtx.beginPath(); mmCtx.arc(mx, my, 7, 0, Math.PI * 2); mmCtx.fill();
      mmCtx.strokeStyle = "#d7b45c"; mmCtx.lineWidth = 1; mmCtx.stroke();
      mmCtx.font = "7px sans-serif"; mmCtx.textAlign = "center"; mmCtx.textBaseline = "middle"; mmCtx.fillStyle = "#f3dd9a"; mmCtx.fillText("✦", mx, my);

      // Ley lines to landmarks
      for (const lm of landmarks) {
        const lmx = scale(lm.x, viewW) * mW;
        const lmy = scale(lm.y, viewH) * mH;
        mmCtx.strokeStyle = lm.color + "40"; mmCtx.lineWidth = 0.8;
        mmCtx.beginPath(); mmCtx.moveTo(mx, my); mmCtx.lineTo(lmx, lmy); mmCtx.stroke();
      }

      // Landmarks as dots
      for (const lm of landmarks) {
        const lmx = scale(lm.x, viewW) * mW;
        const lmy = scale(lm.y, viewH) * mH;
        const isNear = nearestLandmark && nearestLandmark.id === lm.id;
        mmCtx.fillStyle = isNear ? lm.color : lm.color + "99";
        mmCtx.beginPath(); mmCtx.arc(lmx, lmy, isNear ? 4.5 : 3, 0, Math.PI * 2); mmCtx.fill();
        mmCtx.font = "7px sans-serif"; mmCtx.textAlign = "center"; mmCtx.textBaseline = "middle";
        mmCtx.fillStyle = lm.color; mmCtx.fillText(lm.icon.match(/\p{Emoji}/u)?.[0] || "●", lmx, lmy - 6);
      }

      // Hero dot
      const hx = scale(hero.x, viewW) * mW;
      const hy = scale(hero.y, viewH) * mH;
      mmCtx.fillStyle = "#fff"; mmCtx.beginPath(); mmCtx.arc(hx, hy, 3.5, 0, Math.PI * 2); mmCtx.fill();
      mmCtx.strokeStyle = "#f3dd9a"; mmCtx.lineWidth = 1; mmCtx.stroke();

      // Label
      mmCtx.font = "bold 7px system-ui,sans-serif"; mmCtx.fillStyle = "rgba(215,180,92,0.7)"; mmCtx.textAlign = "left"; mmCtx.textBaseline = "bottom";
      mmCtx.fillText("Overworld", 4, mH - 2);
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
        window.MTG_RPG_CLIENT?.onCastSpell?.({ type: "heal", x: hero.x, y: hero.y });
        return;
      }
      if (type === "sparkle") {
        window.MTG_SFX && window.MTG_SFX.play("sparkle"); spawnParticles(hero.x, hero.y, 45, "#f472b6", 4.2, -0.05); addFloatingText(hero.x, hero.y - 25, "✨ Planeswalker Sparkles!", "#f472b6");
        window.MTG_RPG_CLIENT?.onCastSpell?.({ type: "sparkle", x: hero.x, y: hero.y });
        return;
      }
      if (type === "frost") {
        window.MTG_SFX && window.MTG_SFX.play("cast"); spawnParticles(hero.x, hero.y, 45, "#38bdf8", 5.2, 0); addFloatingText(hero.x, hero.y - 25, "❄️ Frost Nova!", "#38bdf8");
        window.MTG_RPG_CLIENT?.onCastSpell?.({ type: "frost", x: hero.x, y: hero.y });
        return;
      }
      // Fireball
      let tx = targetX ?? hero.x, ty = targetY ?? hero.y;
      if (targetX == null && targetY == null) { if (hero.dir === 0) ty += 130; else if (hero.dir === 1) tx -= 130; else if (hero.dir === 2) tx += 130; else ty -= 130; }
      const angle = Math.atan2(ty - hero.y, tx - hero.x);
      window.MTG_SFX && window.MTG_SFX.play("cast");
      projectiles.push({ x: hero.x, y: hero.y, vx: Math.cos(angle) * 7.8, vy: Math.sin(angle) * 7.8, type: "fireball", radius: 9, life: 65, damage: 45, color: "#f97316" });
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
      if (currentRoom !== "overworld") {
        roomKeys[e.key.toLowerCase()] = true;
        if (e.key === "Escape") {
          transitionToRoom("overworld");
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
        // In-room movement
        roomHero.targetX = Math.max(40, Math.min(viewW - 40, clickX));
        roomHero.targetY = Math.max(40, Math.min(viewH - 40, clickY));
        // Check exit arch click
        if (currentRoom === "mirror") {
          const fScale = Math.min((viewW * 0.90) / 352, (viewH * 0.90) / 319, 1.85);
          const fh = Math.round(319 * fScale);
          const fy = Math.round((viewH - fh) / 2);
          if (Math.hypot(clickX - viewW / 2, clickY - (fy + fh - 14 * fScale)) < 45) {
            transitionToRoom("overworld");
            return;
          }
        }
        if (Math.hypot(clickX - viewW / 2, clickY - viewH) < 55) {
          transitionToRoom("overworld");
        }
        return;
      }

      // Check click on dummy
      if (Math.hypot(clickX - dummy.x, clickY - dummy.y) < 38) {
        hero.targetX = dummy.x; hero.targetY = dummy.y + 35;
        spawnWaypoint(hero.targetX, hero.targetY);
        if (Math.hypot(dummy.x - hero.x, dummy.y - hero.y) < 85) {
          if (window.MTG_RPG_CLIENT?.openSparring) window.MTG_RPG_CLIENT.openSparring({ hp: dummy.hp, maxHp: dummy.maxHp });
        }
        return;
      }

      // Check click on sparky
      if (Math.hypot(clickX - sparky.x, clickY - sparky.y) < 34) {
        hero.targetX = sparky.x; hero.targetY = sparky.y + 32;
        spawnWaypoint(hero.targetX, hero.targetY);
        if (Math.hypot(sparky.x - hero.x, sparky.y - hero.y) < 85) {
          openSparkyDialog();
        }
        return;
      }

      // Overworld click
      let clickedLm = null;
      landmarks.forEach(lm => {
        const halfW = (lm.w || 200) / 2;
        const topY = lm.y - (lm.h || 150) / 2;
        const botY = (lm.bannerY || (lm.y + (lm.h || 150) / 2)) + 32;
        if (clickX >= lm.x - halfW && clickX <= lm.x + halfW && clickY >= topY && clickY <= botY) clickedLm = lm;
      });
      if (clickedLm) {
        hero.targetX = clickedLm.padX || clickedLm.x; hero.targetY = clickedLm.padY || (clickedLm.y + clickedLm.h / 2 + 25);
        spawnWaypoint(hero.targetX, hero.targetY);
        if (Math.hypot((clickedLm.padX || clickedLm.x) - hero.x, (clickedLm.padY || clickedLm.y) - hero.y) < 110) { nearestLandmark = clickedLm; transitionToRoom(clickedLm.id); }
      } else {
        hero.targetX = Math.max(50, Math.min(viewW - 50, clickX));
        hero.targetY = Math.max(50, Math.min(viewH - 50, clickY));
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
        hero.x += (moveX / len) * hero.speed; hero.y += (moveY / len) * hero.speed; hero.isMoving = true;
      } else if (hero.targetX != null && hero.targetY != null) {
        const dx = hero.targetX - hero.x, dy = hero.targetY - hero.y, dist = Math.hypot(dx, dy);
        if (dist > 5) {
          hero.x += (dx / dist) * hero.speed; hero.y += (dy / dist) * hero.speed; hero.isMoving = true;
          if (Math.abs(dx) > Math.abs(dy)) hero.dir = dx > 0 ? 2 : 1; else hero.dir = dy > 0 ? 0 : 3;
        } else { hero.targetX = null; hero.targetY = null; hero.isMoving = false; waypoint = null; }
      } else {
        hero.isMoving = false;
      }
      hero.x = Math.max(45, Math.min(viewW - 45, hero.x));
      hero.y = Math.max(45, Math.min(viewH - 45, hero.y));

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
            if (window.MTG && window.MTG.toast) window.MTG.toast("🎯 Sparring Dummy defeated! +50 Gold!");
            goldBalance += 50;
            renderPlayerCard();
            updatePlayerVitals();
          }
          projectiles.splice(i, 1);
          continue;
        }
        
        if (p.x < 10 || p.x > viewW - 10 || p.y < 10 || p.y > viewH - 10 || p.life <= 0) { spawnParticles(p.x, p.y, 14, p.color, 3); projectiles.splice(i, 1); }
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
      if (currentRoom === "arena" && colosseumMapLoaded) {
        const fr = colosseumFrame(viewW, viewH);
        roomHero.x = Math.max(fr.x + fr.dw * 0.28, Math.min(fr.x + fr.dw * 0.72, roomHero.x));
        roomHero.y = Math.max(fr.y + fr.dh * 0.58, Math.min(fr.y + fr.dh * 0.9, roomHero.y));
        if (roomHero.y > fr.y + fr.dh * 0.84 && Math.abs(roomHero.x - (fr.x + fr.dw * 0.5)) < 48) {
          transitionToRoom("overworld");
        }
      } else if (currentRoom === "guilds" && tavernInteriorLoaded) {
        const fr = tavernFrame(viewW, viewH);
        roomHero.x = Math.max(fr.x + fr.dw * 0.14, Math.min(fr.x + fr.dw * 0.86, roomHero.x));
        roomHero.y = Math.max(fr.y + fr.dh * 0.4, Math.min(fr.y + fr.dh * 0.9, roomHero.y));
        if (roomHero.y > fr.y + fr.dh * 0.82 && Math.abs(roomHero.x - (fr.x + fr.dw * 0.5)) < 42) {
          transitionToRoom("overworld");
        }
      } else if (currentRoom === "mirror") {
        const fScale = Math.min((viewW * 0.90) / 352, (viewH * 0.90) / 319, 1.85);
        const fw = Math.round(352 * fScale);
        const fh = Math.round(319 * fScale);
        const fx = Math.round((viewW - fw) / 2);
        const fy = Math.round((viewH - fh) / 2);
        roomHero.x = Math.max(fx + fw * 0.12, Math.min(fx + fw * 0.88, roomHero.x));
        roomHero.y = Math.max(fy + fh * 0.30, Math.min(fy + fh * 0.94, roomHero.y));
        if (roomHero.y > (fy + fh - Math.round(22 * fScale)) && Math.abs(roomHero.x - viewW / 2) < 36) {
          transitionToRoom("overworld");
        }
      } else {
        roomHero.x = Math.max(40, Math.min(viewW - 40, roomHero.x));
        roomHero.y = Math.max(40, Math.min(viewH - 40, roomHero.y));
        // Check exit (bottom center portal)
        if (roomHero.y > viewH * 0.92 && Math.abs(roomHero.x - viewW / 2) < 36) {
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

      // 1. Pixel kingdom overworld
      const kingdom = ensurePixelKingdom();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(kingdom, 0, 0, viewW, viewH);
      drawImperialLabels(ctx);

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
        const dx = Math.round(viewW * dec.xRel);
        const dy = Math.round(viewH * dec.yRel);
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

      ctx.restore();

      // Minimap
      drawMinimap();
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
      } else if (s.type === "sparkle") {
        spawnParticles(s.x, s.y, 35, "#f472b6", 4.2, -0.05);
      } else if (s.type === "frost") {
        spawnParticles(s.x, s.y, 40, "#38bdf8", 5.2, 0);
      } else {
        let tx = s.targetX ?? s.x, ty = s.targetY ?? s.y;
        const angle = Math.atan2(ty - s.y, tx - s.x);
        projectiles.push({
          x: s.x, y: s.y,
          vx: Math.cos(angle) * 7.8, vy: Math.sin(angle) * 7.8,
          type: "fireball", radius: 9, life: 65, damage: 45, color: "#f97316"
        });
      }
    }

    function openSparkyDialog() {
      window.MTG_SFX && window.MTG_SFX.play && window.MTG_SFX.play("sparkle");
      spawnParticles(sparky.x, sparky.y, 25, "#fef08a", 3, -0.05);
      const text = sparky.dialogs[sparky.dlgIdx % sparky.dialogs.length];
      sparky.dlgIdx++;
      showDialog(sparky.name, sparky.icon, text);
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
    }

    function onRemoteSparringDamage(dmg) {
      dummy.hitTick = 8;
      dummy.hp = Math.max(0, dummy.hp - (dmg || 25));
      spawnParticles(dummy.x, dummy.y, 14, "#f97316", 3);
      addFloatingText(dummy.x, dummy.y - 30, `-${dmg || 25}`, "#ef4444");
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
      },
    };
  }

  window.MTG_RPG = window.MTG_RPG || {};
  window.MTG_RPG.initHomeroom = initHomeroom;
})();
