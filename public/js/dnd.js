/* ==========================================================================
   D&D Multiverse Tavern & Tabletop RPG Sanctum
   Battlemap Builder, Campaign System, 3D Dice Roller, Character Sheet & Quests
   ========================================================================== */

(() => {
  const {
    $,
    $$,
    api,
    toast,
    escapeHtml,
    nav,
    bindNav,
    sparkle,
  } = window.MTG;

  const DICE_TYPES = [
    { type: "d4", label: "D4", icon: "▲", max: 4, desc: "Dagger / Potion" },
    { type: "d6", label: "D6", icon: "⚅", max: 6, desc: "Shortsword / Fireball" },
    { type: "d8", label: "D8", icon: "◆", max: 8, desc: "Longsword / Cure Wounds" },
    { type: "d10", label: "D10", icon: "⬟", max: 10, desc: "Eldritch Blast / Halberd" },
    { type: "d12", label: "D12", icon: "⬡", max: 12, desc: "Greataxe / Barbarian" },
    { type: "d20", label: "D20", icon: "🎯", max: 20, desc: "Attack / Ability Check" },
    { type: "d100", label: "D100", icon: "🎲", max: 100, desc: "Wild Magic / Percentile" },
  ];

  const TERRAIN_TYPES = [
    { id: "floor", name: "Stone Floor", icon: "🪨", bg: "#1e293b", border: "#334155" },
    { id: "wall", name: "Solid Wall", icon: "🧱", bg: "#0f172a", border: "#475569" },
    { id: "grass", name: "Sylvan Moss", icon: "🌿", bg: "#14532d", border: "#166534" },
    { id: "water", name: "Deep Water", icon: "💧", bg: "#1e3a8a", border: "#2563eb" },
    { id: "lava", name: "Molten Lava", icon: "🔥", bg: "#7f1d1d", border: "#dc2626" },
    { id: "wood", name: "Tavern Wood", icon: "🪵", bg: "#451a03", border: "#78350f" },
    { id: "door", name: "Wooden Door", icon: "🚪", bg: "#78350f", border: "#d97706" },
  ];

  const TOKEN_PRESETS = [
    { name: "Valen Ironshield", icon: "⚔️", color: "#3b82f6", hp: 48, maxHp: 48, isEnemy: false, type: "Fighter" },
    { name: "Lyra Starweaver", icon: "🧙", color: "#a855f7", hp: 32, maxHp: 32, isEnemy: false, type: "Wizard" },
    { name: "Finn Swiftfoot", icon: "🗡️", color: "#10b981", hp: 36, maxHp: 36, isEnemy: false, type: "Rogue" },
    { name: "Theron Sunbearer", icon: "🛡️", color: "#f59e0b", hp: 52, maxHp: 52, isEnemy: false, type: "Paladin" },
    { name: "Aria Moonsong", icon: "🎵", color: "#ec4899", hp: 34, maxHp: 34, isEnemy: false, type: "Bard" },
    { name: "Goblin Raider", icon: "👺", color: "#ef4444", hp: 12, maxHp: 12, isEnemy: true, type: "Goblin" },
    { name: "Skeleton Archer", icon: "💀", color: "#f97316", hp: 14, maxHp: 14, isEnemy: true, type: "Undead" },
    { name: "Orc Berserker", icon: "👹", color: "#b91c1c", hp: 30, maxHp: 30, isEnemy: true, type: "Orc" },
    { name: "Obsidian Dragon", icon: "🐉", color: "#dc2626", hp: 178, maxHp: 178, size: 2, isEnemy: true, type: "Dragon" },
    { name: "Grog Barkeep", icon: "🍺", color: "#eab308", hp: 28, maxHp: 28, isEnemy: false, type: "NPC" },
  ];

  function loadChar() {
    try {
      const raw = localStorage.getItem("mtg-dnd-char");
      if (raw) return JSON.parse(raw);
    } catch {}
    return {
      name: "Elara Moonwhisper",
      charClass: "Level 5 Wizard",
      race: "High Elf",
      ac: 15,
      hp: 28,
      maxHp: 28,
      speed: 30,
      str: 8,
      dex: 14,
      con: 13,
      int: 18,
      wis: 12,
      cha: 10,
      slots: {
        1: { total: 4, used: 1 },
        2: { total: 3, used: 0 },
        3: { total: 2, used: 1 },
      },
      deathSaves: { succ: 0, fail: 0 },
    };
  }

  function saveChar(char) {
    try {
      localStorage.setItem("mtg-dnd-char", JSON.stringify(char));
    } catch {}
  }

  function calcMod(score) {
    const m = Math.floor((score - 10) / 2);
    return m >= 0 ? `+${m}` : `${m}`;
  }

  window.MTG.openDndModal = async function openDndModal(routeParams = {}) {
    
    let overlay = document.getElementById("dnd-full-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "dnd-full-overlay";
      overlay.className = "dnd-inventory-overlay";
      overlay.style.position = "fixed";
      overlay.style.inset = "0";
      overlay.style.zIndex = "100060";
      overlay.style.background = "rgba(0, 0, 0, 0.75)";
      overlay.style.backdropFilter = "blur(8px)";
      overlay.style.display = "flex";
      overlay.style.alignItems = "center";
      overlay.style.justifyContent = "center";
      overlay.style.padding = "20px";
      overlay.onclick = (e) => {
        if (e.target === overlay) closeDndOverlay();
      };
      document.body.appendChild(overlay);
    }
    if (window.MTG?.bringToFront) {
      window.MTG.bringToFront(overlay);
    } else {
      overlay.style.zIndex = "100060";
    }
    overlay.innerHTML = `<div class="sheet game-inventory-window" style="width:min(1240px, 96vw); max-height:92vh; overflow-y:auto; padding:20px; position:relative;"><div class="wrap" id="dnd-root">Loading D&D Sanctum… 🎲</div></div>`;
  

    let dndData = { campaigns: [], maps: [] };
    try {
      dndData = await api("/api/dnd/data");
    } catch {
      dndData = { campaigns: [], maps: [] };
    }

    let activeTab = "map"; // "map", "campaign", "character", "dice"
    let currentMapId = (dndData.maps && dndData.maps.length) ? dndData.maps[0].id : null;
    let currentCampaignId = (dndData.campaigns && dndData.campaigns.length) ? dndData.campaigns[0].id : null;
    
    // Battlemap state
    let activeTool = "select"; // "select", "terrain", "eraser"
    let selectedTerrain = "wall";
    let selectedTokenId = null;
    let isDrawing = false;
    let showGrid = true;
    let showFog = false;
    let mapEngineMode = "rpgjs"; // "rpgjs" (2D interactive RPG engine) or "tabletop" (classic miniature grid)
    let rpgjsInstance = null;

    // Character & Dice State
    let char = loadChar();
    let rollHistory = [];
    let initiativeList = [
      { name: char.name || "Hero", init: 16, hp: `${char.hp}/${char.maxHp}`, isHero: true },
      { name: "Goblin Archer", init: 12, hp: "7/7", isHero: false },
      { name: "Bugbear Chieftain", init: 8, hp: "27/27", isHero: false },
    ];
    let currentTurnIndex = 0;

    function getActiveMap() {
      return dndData.maps.find((m) => m.id === currentMapId) || dndData.maps[0];
    }

    function getActiveCampaign() {
      return dndData.campaigns.find((c) => c.id === currentCampaignId) || dndData.campaigns[0];
    }

    function render() {
      const root = $("#dnd-root");
      if (!root) return;

      root.innerHTML = `
        <button type="button" id="dnd-overlay-close" style="position:fixed;top:16px;right:20px;z-index:100;background:rgba(0,0,0,0.65);border:1px solid rgba(255,255,255,0.15);color:#fff;border-radius:50%;width:36px;height:36px;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1" title="Close">×</button>
        <div class="hero">
          <div>
            <h1>🎲 D&D Multiverse Tabletop Sanctum</h1>
            <p>Battlemap builder with RPGJS.dev 2D animated adventure engine, tabletop miniatures, campaign chronicles, 3D dice, and character sheet tracker.</p>
            <div class="toolbar" style="margin-top:16px;gap:8px">
              <button type="button" class="btn ${activeTab === "map" ? "gold" : "ghost"}" id="subtab-map">🗺️ Battlemap & RPGJS</button>
              <button type="button" class="btn ${activeTab === "campaign" ? "gold" : "ghost"}" id="subtab-camp">📖 Campaign Chronicles</button>
              <button type="button" class="btn ${activeTab === "character" ? "gold" : "ghost"}" id="subtab-char">📜 Character Sheet</button>
              <button type="button" class="btn ${activeTab === "dice" ? "gold" : "ghost"}" id="subtab-dice">🎲 3D Dice & Combat</button>
            </div>
          </div>
        </div>

        <div style="margin-top:20px">
          ${activeTab === "map" ? renderBattlemapView() : ""}
          ${activeTab === "campaign" ? renderCampaignView() : ""}
          ${activeTab === "character" ? renderCharacterView() : ""}
          ${activeTab === "dice" ? renderDiceView() : ""}
        </div>
      `;

      bindTabs();
      if (activeTab === "map") bindBattlemapEvents();
      if (activeTab === "campaign") bindCampaignEvents();
      if (activeTab === "character") bindCharacterEvents();
      if (activeTab === "dice") bindDiceEvents();
    }

    function bindTabs() {
      const cleanupRpg = () => {
        if (rpgjsInstance) {
          rpgjsInstance.destroy();
          rpgjsInstance = null;
        }
      };
      $("#subtab-map").onclick = () => { cleanupRpg(); activeTab = "map"; render(); };
      $("#subtab-camp").onclick = () => { cleanupRpg(); activeTab = "campaign"; render(); };
      $("#subtab-char").onclick = () => { cleanupRpg(); activeTab = "character"; render(); };
      $("#subtab-dice").onclick = () => { cleanupRpg(); activeTab = "dice"; render(); };
    }

    /* ==========================================================================
       RPGJS.DEV 2D ACTION RPG ENGINE INTEGRATION
       ========================================================================== */

    function renderRpgjsView(curMap) {
      return `
        <!-- RPGJS Control Bar -->
        <div class="card-panel" style="padding:12px 18px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <span style="font-weight:700;font-size:15px">🗺️ Map:</span>
            <select id="map-selector" style="padding:6px 12px;border-radius:6px;background:var(--bg);border:1px solid var(--line);font-weight:600">
              ${dndData.maps.map((m) => `<option value="${m.id}" ${m.id === curMap.id ? "selected" : ""}>${escapeHtml(m.name)} (${m.width}x${m.height})</option>`).join("")}
            </select>
            <button type="button" class="btn small ghost" id="btn-new-map">➕ New Map</button>

            <!-- Mode Switcher -->
            <div style="display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden;margin-left:6px">
              <button type="button" class="btn small gold" id="btn-mode-rpgjs" title="2D Animated Action RPG Engine Viewport">🎮 RPGJS Engine</button>
              <button type="button" class="btn small ghost" id="btn-mode-tabletop" title="Classic Miniature Battlemap Grid">🗺️ Tabletop Grid</button>
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="muted" style="font-size:12px">GM Brush:</span>
            <button type="button" class="btn small ${activeTool === "terrain" ? "gold" : "ghost"}" id="tool-terrain" title="Toggle GM terrain painting brush">🖌️ Paint Tiles</button>
            <button type="button" class="btn small gold" id="btn-save-map">💾 Save Map</button>
          </div>
        </div>

        <!-- Terrain Brush Palette (When Paint Tool Active) -->
        ${
          activeTool === "terrain"
            ? `
          <div class="card-panel" style="padding:10px 16px;margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:rgba(0,0,0,0.3)">
            <span class="muted" style="font-size:12px">Terrain Palette (Click canvas to paint):</span>
            ${TERRAIN_TYPES.map(
              (t) => `
              <button type="button" class="btn small ghost btn-brush-sel ${selectedTerrain === t.id ? "gold" : ""}" data-terrain="${t.id}" style="display:inline-flex;align-items:center;gap:6px">
                <span>${t.icon}</span> <span>${t.name}</span>
              </button>
            `
            ).join("")}
          </div>
        `
            : ""
        }

        <!-- 2D RPGJS Viewport Layout -->
        <div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
          <!-- Canvas Viewport with Overlaid HUD -->
          <div style="flex:1;min-width:320px;position:relative;background:#05070e;border-radius:12px;border:3px solid #334155;box-shadow:inset 0 0 50px rgba(0,0,0,0.9), 0 10px 30px rgba(0,0,0,0.5);overflow:hidden">
            <canvas id="rpgjs-canvas" width="760" height="500" style="display:block;margin:0 auto;cursor:crosshair;touch-action:none;width:100%;height:auto;max-height:500px;background:#050811"></canvas>
            
            <!-- Top-Left RPGJS Character HUD -->
            <div class="rpgjs-hud" style="position:absolute;top:12px;left:12px;display:flex;align-items:center;gap:10px;background:rgba(10,14,24,0.85);backdrop-filter:blur(6px);padding:8px 14px;border-radius:8px;border:1px solid var(--gold);box-shadow:0 4px 12px rgba(0,0,0,0.6);pointer-events:none;z-index:30">
              <div style="font-size:28px">🧙</div>
              <div>
                <div style="display:flex;align-items:center;gap:6px">
                  <span style="font-weight:900;font-size:13px;color:var(--gold)">${escapeHtml(char.name || "Wizard Hero")}</span>
                  <span class="chip gold" style="font-size:9px">LVL 5</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
                  <span style="font-size:10px;font-weight:700;color:#ef4444;width:18px">HP</span>
                  <div style="width:110px;height:7px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden">
                    <div id="rpg-hp-bar" style="width:100%;height:100%;background:linear-gradient(90deg,#ef4444,#10b981);transition:width 0.2s"></div>
                  </div>
                  <span id="rpg-hp-txt" style="font-size:10px;font-weight:700">${char.hp || 28}/${char.maxHp || 28}</span>
                </div>
                <div style="display:flex;align-items:center;gap:6px;margin-top:3px">
                  <span style="font-size:10px;font-weight:700;color:#38bdf8;width:18px">MP</span>
                  <div style="width:110px;height:7px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden">
                    <div id="rpg-mp-bar" style="width:100%;height:100%;background:linear-gradient(90deg,#0284c7,#38bdf8);transition:width 0.2s"></div>
                  </div>
                  <span id="rpg-mp-txt" style="font-size:10px;font-weight:700">50/50</span>
                </div>
              </div>
            </div>

            <!-- Bottom Action Hotbar -->
            <div class="rpgjs-hotbar" style="position:absolute;bottom:12px;left:50%;transform:translateX(-50%);display:flex;gap:6px;background:rgba(10,14,24,0.9);backdrop-filter:blur(8px);padding:6px 12px;border-radius:10px;border:1px solid var(--line);box-shadow:0 4px 16px rgba(0,0,0,0.6);z-index:30">
              <button type="button" class="btn small gold btn-rpg-spell active" data-spell="fireball" title="[1] Cast Fireball (10 MP)">🔥 Fireball [1]</button>
              <button type="button" class="btn small ghost btn-rpg-spell" data-spell="frost" title="[2] Cast Frost Nova (15 MP)">❄️ Frost Nova [2]</button>
              <button type="button" class="btn small ghost btn-rpg-spell" data-spell="missile" title="[3] Cast Magic Missile (12 MP)">⚡ Magic Missile [3]</button>
              <button type="button" class="btn small ghost btn-rpg-spell" data-spell="heal" title="[4] Cast Healing Light (20 MP)">💖 Heal [4]</button>
              <button type="button" class="btn small ghost" id="btn-rpg-interact" title="[E] Interact with Chest / NPC">💬 [E] Interact</button>
            </div>

            <!-- RPGJS Dialogue Box Overlay -->
            <div id="rpg-dialog-overlay" style="display:none;position:absolute;bottom:65px;left:20px;right:20px;background:rgba(9,13,22,0.95);border:2px solid var(--gold);padding:14px 18px;border-radius:8px;box-shadow:0 8px 30px rgba(0,0,0,0.8);z-index:40">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <b id="rpg-dialog-speaker" style="color:var(--gold);font-size:14px">Grand Archmage</b>
                <button type="button" class="btn small ghost" id="rpg-dialog-close">✕ Close</button>
              </div>
              <p id="rpg-dialog-text" style="margin:0;font-size:13px;line-height:1.5;color:var(--ink)"></p>
            </div>
          </div>

          <!-- Right Sidebar: Controls & Spawners -->
          <div style="width:310px;display:flex;flex-direction:column;gap:16px">
            <div class="card-panel">
              <h3 style="margin:0 0 8px 0;font-size:15px">🎮 RPGJS Engine Controls</h3>
              <p class="muted" style="font-size:12px;margin:0 0 10px 0">Explore the 2D dungeon live using keyboard or mouse:</p>
              <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:4px">
                <li><b>W / A / S / D</b> or <b>Arrow Keys</b> to walk in 4 directions</li>
                <li><b>Click on Canvas</b> to move or target monsters</li>
                <li><b>Spacebar</b> or <b>[F]</b> to cast active spell</li>
                <li><b>[1] [2] [3] [4]</b> to switch active spell</li>
                <li><b>[E]</b> to talk to NPCs or open treasure chests</li>
              </ul>
            </div>

            <!-- GM Event Spawner Palette -->
            <div class="card-panel">
              <h3 style="margin:0 0 8px 0;font-size:15px">✨ Spawn Interactive Events</h3>
              <p class="muted" style="font-size:12px;margin:0 0 10px 0">Click to place events at current hero location:</p>
              <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:8px">
                <button type="button" class="btn small ghost btn-rpg-spawn" data-spawn="chest">🎁 Chest</button>
                <button type="button" class="btn small ghost btn-rpg-spawn" data-spawn="torch">🕯️ Campfire</button>
                <button type="button" class="btn small ghost btn-rpg-spawn" data-spawn="portal">🚪 Astral Portal</button>
                <button type="button" class="btn small ghost btn-rpg-spawn" data-spawn="goblin">👺 Goblin</button>
                <button type="button" class="btn small ghost btn-rpg-spawn" data-spawn="npc">🧙 Archmage</button>
                <button type="button" class="btn small ghost btn-rpg-spawn" data-spawn="orc">👹 Orc</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    function initRpgjsEngine(curMap) {
      const canvas = document.getElementById("rpgjs-canvas");
      if (!canvas) return null;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      const cols = curMap.width || 20;
      const rows = curMap.height || 14;
      const tileSize = 40;
      const worldW = cols * tileSize;
      const worldH = rows * tileSize;

      // The spawn used to be hardcoded to (160,160) = cell (4,4), which on a
      // walled map is usually a wall — the hero would spawn stuck inside one.
      // Walk inward from the top-left until a passable cell turns up.
      const walkableAt = (cx, cy) => {
        const t = (curMap.tiles || {})[`${cx},${cy}`];
        return t !== "wall" && t !== "lava";
      };
      let spawnX = 1, spawnY = 1;
      outer: for (let ring = 1; ring < Math.max(cols, rows); ring++) {
        for (let d = 0; d <= ring * 2; d++) {
          const cands = [
            [1 + d, 1 + ring], [1 + ring, 1 + d],
            [1 + ring, 1 + 2 * ring - d], [1 + 2 * ring - d, 1 + ring],
          ];
          for (const [cx, cy] of cands) {
            if (cx < cols && cy < rows && walkableAt(cx, cy)) {
              spawnX = cx; spawnY = cy;
              break outer;
            }
          }
        }
      }
      // Never fall back to a wall cell, even on a fully solid map.
      if (!walkableAt(spawnX, spawnY)) { spawnX = 1; spawnY = 1; }

      const hero = {
        x: spawnX * tileSize + tileSize / 2,
        y: spawnY * tileSize + tileSize / 2,
        speed: 3.5,
        dir: 0, // 0: Down, 1: Left, 2: Right, 3: Up
        frame: 0,
        animTick: 0,
        isMoving: false,
        hp: (char && char.hp) || 28,
        maxHp: (char && char.maxHp) || 28,
        mp: 50,
        maxMp: 50,
        activeSpell: "fireball",
        targetX: null,
        targetY: null,
      };

      const events = {
        chests: [
          { id: "ch1", x: 280, y: 160, opened: false, gold: 250, label: "Ancient Hearth Vault" },
          { id: "ch2", x: 520, y: 360, opened: false, gold: 150, label: "Smuggler's Stash" },
        ],
        portals: [
          { id: "p1", x: 640, y: 160, targetX: 120, targetY: 200, label: "Astral Rift" },
        ],
        torches: [
          { id: "t1", x: 120, y: 120, isCampfire: false },
          { id: "t2", x: 680, y: 120, isCampfire: false },
          { id: "t3", x: 400, y: 280, isCampfire: true },
        ],
        npcs: [
          {
            id: "npc1",
            name: "Archmage Elrond",
            icon: "🧙",
            x: 400,
            y: 160,
            dialog: "Greetings, planeswalker! Welcome to the 2D Multiverse Tabletop. Use WASD or click to move, and press [Space] to cast your spells into the darkness. Beware wandering beasts!",
          },
          {
            id: "npc2",
            name: "Grog Barkeep",
            icon: "🍺",
            x: 200,
            y: 360,
            dialog: "Pour yourself a mug of dwarven cider, adventurer! Explore the dungeon or place a gold wager by the hearth!",
          },
        ],
        monsters: [
          { id: "m1", name: "Goblin Raider", icon: "👺", x: 320, y: 320, hp: 30, maxHp: 30, speed: 1.1, dir: 0, patrolX: 320, patrolY: 320, hitFlash: 0 },
          { id: "m2", name: "Skeleton Archer", icon: "💀", x: 560, y: 240, hp: 25, maxHp: 25, speed: 0.9, dir: 1, patrolX: 560, patrolY: 240, hitFlash: 0 },
          { id: "m3", name: "Orc Berserker", icon: "👹", x: 480, y: 400, hp: 50, maxHp: 50, speed: 1.3, dir: 2, patrolX: 480, patrolY: 400, hitFlash: 0 },
        ],
      };

      // RPGJS mode used to show a hardcoded demo encounter no matter which
      // battlemap was open, so a GM's saved tokens were invisible here even
      // though they rendered fine on the tabletop. Adopt the map's own tokens
      // instead: hostiles become monsters, allies become NPCs.
      if (Array.isArray(curMap.tokens) && curMap.tokens.length) {
        events.monsters = [];
        events.npcs = [];
        for (const t of curMap.tokens) {
          if (t.isEnemy) {
            events.monsters.push({
              id: t.id, name: t.name, icon: t.icon || "👹",
              x: t.x * tileSize + tileSize / 2,
              y: t.y * tileSize + tileSize / 2,
              hp: t.hp, maxHp: t.maxHp, speed: 1.1, dir: 0,
              patrolX: t.x * tileSize + tileSize / 2,
              patrolY: t.y * tileSize + tileSize / 2,
              hitFlash: 0,
            });
          } else {
            events.npcs.push({
              id: t.id, name: t.name, icon: t.icon || "🛡️",
              x: t.x * tileSize + tileSize / 2,
              y: t.y * tileSize + tileSize / 2,
              dialog: `${t.name} holds the line.`,
            });
          }
        }
      }

      const projectiles = [];
      const particles = [];
      const floatingTexts = [];
      const keys = {};
      let isRunning = true;
      let animId = null;

      function isSolid(x, y) {
        const gx = Math.floor(x / tileSize);
        const gy = Math.floor(y / tileSize);
        if (gx < 0 || gx >= cols || gy < 0 || gy >= rows) return true;
        const tile = (curMap.tiles && curMap.tiles[`${gx},${gy}`]) || "floor";
        return tile === "wall" || tile === "water";
      }

      function spawnParticles(x, y, count = 8, color = "#ff75a0", speed = 2, gravity = 0) {
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = (Math.random() * 0.7 + 0.3) * speed;
          particles.push({
            x,
            y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            life: 1,
            maxLife: 25 + Math.random() * 20,
            size: 2 + Math.random() * 3,
            color,
            alpha: 1,
            gravity,
          });
        }
      }

      function addFloatingText(x, y, text, color = "#fbbf24") {
        floatingTexts.push({ x, y, text, color, life: 1, maxLife: 45 });
      }

      function castSpell(type = hero.activeSpell, targetX = null, targetY = null) {
        const costs = { fireball: 10, frost: 15, missile: 12, heal: 20 };
        const cost = costs[type] || 10;
        if (hero.mp < cost) {
          toast("Not enough Mana (MP)! Rest near a campfire.");
          return;
        }
        hero.mp -= cost;
        updateHud();

        if (type === "heal") {
          hero.hp = Math.min(hero.maxHp, hero.hp + 15);
          updateHud();
          window.MTG_SFX && window.MTG_SFX.play("sparkle");
          spawnParticles(hero.x, hero.y, 24, "#4ade80", 3, -0.1);
          addFloatingText(hero.x, hero.y - 20, "+15 HP", "#4ade80");
          return;
        }

        if (type === "frost") {
          window.MTG_SFX && window.MTG_SFX.play("cast");
          spawnParticles(hero.x, hero.y, 36, "#38bdf8", 4.5, 0);
          addFloatingText(hero.x, hero.y - 20, "❄️ Frost Nova!", "#38bdf8");
          // Damage all nearby monsters
          events.monsters.forEach((m) => {
            const d = Math.hypot(m.x - hero.x, m.y - hero.y);
            if (d < 120) {
              m.hp -= 20;
              m.hitFlash = 10;
              addFloatingText(m.x, m.y - 15, "-20 Frozen", "#7dd3fc");
              spawnParticles(m.x, m.y, 12, "#38bdf8", 2.5);
              window.MTG_SFX && window.MTG_SFX.play("strike");
            }
          });
          return;
        }

        // Projectile spells: Fireball or Magic Missile
        let tx = targetX != null ? targetX : hero.x;
        let ty = targetY != null ? targetY : hero.y;
        if (targetX == null && targetY == null) {
          if (hero.dir === 0) ty += 100;
          else if (hero.dir === 1) tx -= 100;
          else if (hero.dir === 2) tx += 100;
          else if (hero.dir === 3) ty -= 100;
        }
        const angle = Math.atan2(ty - hero.y, tx - hero.x);
        window.MTG_SFX && window.MTG_SFX.play("cast");

        if (type === "missile") {
          for (let i = -1; i <= 1; i++) {
            const a = angle + i * 0.22;
            projectiles.push({
              x: hero.x,
              y: hero.y,
              vx: Math.cos(a) * 6.5,
              vy: Math.sin(a) * 6.5,
              type: "missile",
              radius: 5,
              life: 45,
              damage: 12,
              color: "#38bdf8",
            });
          }
        } else {
          // Fireball
          projectiles.push({
            x: hero.x,
            y: hero.y,
            vx: Math.cos(angle) * 5.8,
            vy: Math.sin(angle) * 5.8,
            type: "fireball",
            radius: 8,
            life: 60,
            damage: 28,
            color: "#f97316",
          });
        }
      }

      function interact() {
        // Find nearest interactable event within 50px
        let nearest = null;
        let minDist = 55;

        // Check Chests
        events.chests.forEach((ch) => {
          const d = Math.hypot(ch.x - hero.x, ch.y - hero.y);
          if (d < minDist) { minDist = d; nearest = { type: "chest", data: ch }; }
        });

        // Check NPCs
        events.npcs.forEach((npc) => {
          const d = Math.hypot(npc.x - hero.x, npc.y - hero.y);
          if (d < minDist) { minDist = d; nearest = { type: "npc", data: npc }; }
        });

        // Check Portals
        events.portals.forEach((p) => {
          const d = Math.hypot(p.x - hero.x, p.y - hero.y);
          if (d < minDist) { minDist = d; nearest = { type: "portal", data: p }; }
        });

        if (!nearest) {
          toast("Nothing close enough to interact with. Walk up to a chest, NPC, or portal!");
          return;
        }

        if (nearest.type === "chest") {
          const ch = nearest.data;
          if (ch.opened) {
            toast("This chest has already been looted!");
            return;
          }
          ch.opened = true;
          window.MTG_SFX && window.MTG_SFX.play("bell");
          spawnParticles(ch.x, ch.y, 28, "#fbbf24", 4, -0.05);
          addFloatingText(ch.x, ch.y - 20, `+${ch.gold} 🪙 Gold Loot!`, "#fbbf24");
          toast(`🎁 Opened ${ch.label}! Claimed +${ch.gold} Gold spoils! ✨`);
        } else if (nearest.type === "portal") {
          const p = nearest.data;
          window.MTG_SFX && window.MTG_SFX.play("summon");
          spawnParticles(hero.x, hero.y, 25, "#c084fc", 4);
          hero.x = p.targetX || 120;
          hero.y = p.targetY || 200;
          spawnParticles(hero.x, hero.y, 25, "#38bdf8", 4);
          addFloatingText(hero.x, hero.y - 25, "✨ Astral Warp!", "#c084fc");
          toast(`Warped through the ${p.label}!`);
        } else if (nearest.type === "npc") {
          const npc = nearest.data;
          const overlay = $("#rpg-dialog-overlay");
          const spk = $("#rpg-dialog-speaker");
          const txt = $("#rpg-dialog-text");
          if (overlay && spk && txt) {
            spk.textContent = `${npc.icon} ${npc.name}`;
            txt.textContent = npc.dialog;
            overlay.style.display = "block";
            window.MTG_SFX && window.MTG_SFX.play("tap");
          }
        }
      }

      function updateHud() {
        const hpBar = $("#rpg-hp-bar");
        const hpTxt = $("#rpg-hp-txt");
        const mpBar = $("#rpg-mp-bar");
        const mpTxt = $("#rpg-mp-txt");
        if (hpBar) hpBar.style.width = `${Math.max(0, Math.min(100, (hero.hp / hero.maxHp) * 100))}%`;
        if (hpTxt) hpTxt.textContent = `${hero.hp}/${hero.maxHp}`;
        if (mpBar) mpBar.style.width = `${Math.max(0, Math.min(100, (hero.mp / hero.maxMp) * 100))}%`;
        if (mpTxt) mpTxt.textContent = `${hero.mp}/${hero.maxMp}`;
      }

      // Input listeners
      const onKeyDown = (e) => {
        if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
          e.preventDefault();
        }
        keys[e.code] = true;

        if (e.code === "Digit1") setSpell("fireball");
        else if (e.code === "Digit2") setSpell("frost");
        else if (e.code === "Digit3") setSpell("missile");
        else if (e.code === "Digit4") setSpell("heal");
        else if (e.code === "KeyE") interact();
        else if (e.code === "Space" || e.code === "KeyF") castSpell();
      };

      const onKeyUp = (e) => {
        keys[e.code] = false;
      };

      function setSpell(spell) {
        hero.activeSpell = spell;
        $$(".btn-rpg-spell").forEach((b) => b.classList.toggle("gold", b.dataset.spell === spell));
        $$(".btn-rpg-spell").forEach((b) => b.classList.toggle("ghost", b.dataset.spell !== spell));
      }

      $$(".btn-rpg-spell").forEach((b) => {
        b.onclick = () => setSpell(b.dataset.spell);
      });

      const intBtn = $("#btn-rpg-interact");
      if (intBtn) intBtn.onclick = () => interact();
      const dlgClose = $("#rpg-dialog-close");
      if (dlgClose) dlgClose.onclick = () => { $("#rpg-dialog-overlay").style.display = "none"; };

      // GM Spawner clicks
      $$(".btn-rpg-spawn").forEach((b) => {
        b.onclick = () => {
          const type = b.dataset.spawn;
          const sx = Math.round(hero.x);
          const sy = Math.round(hero.y);
          if (type === "chest") {
            events.chests.push({ id: "ch-" + Math.random().toString(36).slice(2, 6), x: sx, y: sy, opened: false, gold: 200, label: "Adventurer's Cache" });
            toast("Spawned 🎁 Treasure Chest!");
          } else if (type === "torch") {
            events.torches.push({ id: "t-" + Math.random().toString(36).slice(2, 6), x: sx, y: sy, isCampfire: true });
            toast("Spawned 🕯️ Campfire!");
          } else if (type === "portal") {
            events.portals.push({ id: "p-" + Math.random().toString(36).slice(2, 6), x: sx, y: sy, targetX: 160, targetY: 160, label: "Waygate Portal" });
            toast("Spawned 🚪 Astral Portal!");
          } else if (type === "goblin") {
            events.monsters.push({ id: "m-" + Math.random().toString(36).slice(2, 6), name: "Goblin", icon: "👺", x: sx, y: sy, hp: 25, maxHp: 25, speed: 1.2, dir: 0, patrolX: sx, patrolY: sy, hitFlash: 0 });
            toast("Spawned 👺 Goblin Raider!");
          } else if (type === "orc") {
            events.monsters.push({ id: "m-" + Math.random().toString(36).slice(2, 6), name: "Orc", icon: "👹", x: sx, y: sy, hp: 55, maxHp: 55, speed: 1.3, dir: 0, patrolX: sx, patrolY: sy, hitFlash: 0 });
            toast("Spawned 👹 Orc Berserker!");
          } else if (type === "npc") {
            events.npcs.push({ id: "npc-" + Math.random().toString(36).slice(2, 6), name: "Wandering Sage", icon: "🧙", x: sx, y: sy, dialog: "May the leylines grant you fortune, traveller!" });
            toast("Spawned 🧙 Archmage NPC!");
          }
          window.MTG_SFX && window.MTG_SFX.play("summon");
          spawnParticles(sx, sy, 18, "#fbbf24", 3);
        };
      });

      // Canvas click to move / target / paint
      canvas.onmousedown = (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const screenX = (e.clientX - rect.left) * scaleX;
        const screenY = (e.clientY - rect.top) * scaleY;

        // Camera offset
        const camX = Math.max(0, Math.min(worldW - canvas.width, hero.x - canvas.width / 2));
        const camY = Math.max(0, Math.min(worldH - canvas.height, hero.y - canvas.height / 2));
        const worldClickX = screenX + camX;
        const worldClickY = screenY + camY;

        if (activeTool === "terrain") {
          const gx = Math.floor(worldClickX / tileSize);
          const gy = Math.floor(worldClickY / tileSize);
          if (!curMap.tiles) curMap.tiles = {};
          curMap.tiles[`${gx},${gy}`] = selectedTerrain;
          spawnParticles(worldClickX, worldClickY, 8, "#4ade80", 2);
          window.MTG_SFX && window.MTG_SFX.play("tap");
          return;
        }

        // Check if clicked on a monster
        const clickedMon = events.monsters.find((m) => Math.hypot(m.x - worldClickX, m.y - worldClickY) < 30);
        if (clickedMon) {
          castSpell(hero.activeSpell, clickedMon.x, clickedMon.y);
          return;
        }

        hero.targetX = worldClickX;
        hero.targetY = worldClickY;
        spawnParticles(worldClickX, worldClickY, 6, "#38bdf8", 1.8);
      };

      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);

      // Main RPGJS Game Loop (60 FPS)
      let lastTime = performance.now();
      function gameLoop(now) {
        if (!isRunning) return;
        const dt = Math.min(0.1, (now - lastTime) / 1000);
        lastTime = now;

        update(dt);
        render();

        animId = requestAnimationFrame(gameLoop);
      }
      animId = requestAnimationFrame(gameLoop);

      function update(dt) {
        // Keyboard movement
        let dx = 0;
        let dy = 0;
        if (keys["KeyW"] || keys["ArrowUp"]) { dy -= 1; hero.dir = 3; }
        if (keys["KeyS"] || keys["ArrowDown"]) { dy += 1; hero.dir = 0; }
        if (keys["KeyA"] || keys["ArrowLeft"]) { dx -= 1; hero.dir = 1; }
        if (keys["KeyD"] || keys["ArrowRight"]) { dx += 1; hero.dir = 2; }

        if (dx !== 0 || dy !== 0) {
          hero.targetX = null;
          hero.targetY = null;
          const len = Math.hypot(dx, dy);
          const nextX = hero.x + (dx / len) * hero.speed;
          const nextY = hero.y + (dy / len) * hero.speed;

          if (!isSolid(nextX, hero.y)) hero.x = Math.max(16, Math.min(worldW - 16, nextX));
          if (!isSolid(hero.x, nextY)) hero.y = Math.max(16, Math.min(worldH - 16, nextY));

          hero.isMoving = true;
          hero.animTick++;
          if (hero.animTick > 7) {
            hero.frame = (hero.frame + 1) % 4;
            hero.animTick = 0;
            if (Math.random() < 0.3) {
              spawnParticles(hero.x, hero.y + 12, 1, "rgba(255,255,255,0.4)", 0.6, -0.05);
            }
          }
        } else if (hero.targetX != null && hero.targetY != null) {
          const tdx = hero.targetX - hero.x;
          const tdy = hero.targetY - hero.y;
          const dist = Math.hypot(tdx, tdy);
          if (dist < 4) {
            hero.targetX = null;
            hero.targetY = null;
            hero.isMoving = false;
            hero.frame = 0;
          } else {
            if (Math.abs(tdx) > Math.abs(tdy)) hero.dir = tdx > 0 ? 2 : 1;
            else hero.dir = tdy > 0 ? 0 : 3;

            const nextX = hero.x + (tdx / dist) * hero.speed;
            const nextY = hero.y + (tdy / dist) * hero.speed;
            if (!isSolid(nextX, hero.y)) hero.x = nextX;
            if (!isSolid(hero.x, nextY)) hero.y = nextY;

            hero.isMoving = true;
            hero.animTick++;
            if (hero.animTick > 7) {
              hero.frame = (hero.frame + 1) % 4;
              hero.animTick = 0;
            }
          }
        } else {
          hero.isMoving = false;
          hero.frame = 0;
        }

        // Campfire regeneration
        events.torches.forEach((t) => {
          if (t.isCampfire && Math.hypot(t.x - hero.x, t.y - hero.y) < 65) {
            if (Math.random() < 0.05 && hero.hp < hero.maxHp) {
              hero.hp = Math.min(hero.maxHp, hero.hp + 1);
              updateHud();
            }
            if (Math.random() < 0.08 && hero.mp < hero.maxMp) {
              hero.mp = Math.min(hero.maxMp, hero.mp + 1);
              updateHud();
            }
          }
        });

        // Update Projectiles
        for (let i = projectiles.length - 1; i >= 0; i--) {
          const p = projectiles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.life--;

          // Trail particles
          if (Math.random() < 0.6) {
            spawnParticles(p.x, p.y, 1, p.color, 0.8, -0.02);
          }

          // Check monster collision
          let hit = false;
          for (const m of events.monsters) {
            if (Math.hypot(m.x - p.x, m.y - p.y) < p.radius + 18) {
              hit = true;
              m.hp -= p.damage;
              m.hitFlash = 8;
              addFloatingText(m.x, m.y - 18, `-${p.damage}`, "#ef4444");
              spawnParticles(p.x, p.y, 16, p.color, 3.5);
              window.MTG_SFX && window.MTG_SFX.play("strike");

              if (m.hp <= 0) {
                spawnParticles(m.x, m.y, 25, "#fbbf24", 4);
                addFloatingText(m.x, m.y - 25, "💀 Defeated! +50 🪙", "#fbbf24");
                window.MTG_SFX && window.MTG_SFX.play("victory");
                // Respawn monster after delay
                setTimeout(() => { m.hp = m.maxHp; m.x = m.patrolX; m.y = m.patrolY; }, 8000);
              }
              break;
            }
          }

          // Wall collision
          if (isSolid(p.x, p.y)) {
            hit = true;
            spawnParticles(p.x, p.y, 10, p.color, 2);
          }

          if (hit || p.life <= 0) {
            projectiles.splice(i, 1);
          }
        }

        // Update Monsters
        events.monsters.forEach((m) => {
          if (m.hitFlash > 0) m.hitFlash--;
          if (m.hp > 0) {
            // Wander near patrol center
            const distFromHome = Math.hypot(m.x - m.patrolX, m.y - m.patrolY);
            if (distFromHome > 90) {
              const a = Math.atan2(m.patrolY - m.y, m.patrolX - m.x);
              m.x += Math.cos(a) * m.speed;
              m.y += Math.sin(a) * m.speed;
            } else if (Math.random() < 0.04) {
              const randAngle = Math.random() * Math.PI * 2;
              const nx = m.x + Math.cos(randAngle) * 16;
              const ny = m.y + Math.sin(randAngle) * 16;
              if (!isSolid(nx, ny)) {
                m.x = nx;
                m.y = ny;
              }
            }
          }
        });

        // Update Particles
        for (let i = particles.length - 1; i >= 0; i--) {
          const pt = particles[i];
          pt.x += pt.vx;
          pt.y += pt.vy;
          pt.vy += pt.gravity;
          pt.life++;
          pt.alpha = Math.max(0, 1 - pt.life / pt.maxLife);
          if (pt.life >= pt.maxLife) particles.splice(i, 1);
        }

        // Update Floating Texts
        for (let i = floatingTexts.length - 1; i >= 0; i--) {
          const ft = floatingTexts[i];
          ft.y -= 0.6;
          ft.life++;
          if (ft.life >= ft.maxLife) floatingTexts.splice(i, 1);
        }
      }

      function render() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Camera clamped
        const camX = Math.max(0, Math.min(worldW - canvas.width, hero.x - canvas.width / 2));
        const camY = Math.max(0, Math.min(worldH - canvas.height, hero.y - canvas.height / 2));

        ctx.save();
        ctx.translate(-camX, -camY);

        // 1. Draw Tiles
        for (let gy = 0; gy < rows; gy++) {
          for (let gx = 0; gx < cols; gx++) {
            const rx = gx * tileSize;
            const ry = gy * tileSize;
            if (rx + tileSize < camX || rx > camX + canvas.width || ry + tileSize < camY || ry > camY + canvas.height) continue;

            const tile = (curMap.tiles && curMap.tiles[`${gx},${gy}`]) || "floor";
            const terrain = TERRAIN_TYPES.find((t) => t.id === tile) || TERRAIN_TYPES[0];

            ctx.fillStyle = terrain.bg;
            ctx.fillRect(rx, ry, tileSize, tileSize);
            ctx.strokeStyle = terrain.border;
            ctx.lineWidth = 1;
            ctx.strokeRect(rx, ry, tileSize, tileSize);

            // Tile textures
            if (tile === "wall") {
              ctx.fillStyle = "rgba(255,255,255,0.06)";
              ctx.fillRect(rx + 2, ry + 2, tileSize - 4, 8);
              ctx.fillStyle = "rgba(0,0,0,0.35)";
              ctx.fillRect(rx + 2, ry + tileSize - 6, tileSize - 4, 4);
            } else if (tile === "water") {
              ctx.fillStyle = "rgba(255,255,255,0.12)";
              ctx.fillRect(rx + 6, ry + 12 + Math.sin((performance.now() + rx) * 0.005) * 4, tileSize - 12, 2);
            } else if (tile === "lava") {
              ctx.fillStyle = "rgba(255,200,0,0.2)";
              ctx.fillRect(rx + 8, ry + 8, tileSize - 16, tileSize - 16);
            }
          }
        }

        // 2. Draw Torches & Campfires with Ambient Light Glow
        events.torches.forEach((t) => {
          // Ambient Warm Radial Gradient
          const rad = t.isCampfire ? 95 : 60;
          const grad = ctx.createRadialGradient(t.x, t.y, 4, t.x, t.y, rad);
          grad.addColorStop(0, "rgba(251, 191, 36, 0.45)");
          grad.addColorStop(0.5, "rgba(249, 115, 22, 0.15)");
          grad.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(t.x, t.y, rad, 0, Math.PI * 2);
          ctx.fill();

          // Campfire logs
          ctx.fillStyle = "#78350f";
          ctx.fillRect(t.x - 10, t.y + 4, 20, 6);
          // Animated Flame
          const flameH = 12 + Math.sin(performance.now() * 0.015 + t.x) * 4;
          ctx.fillStyle = "#f59e0b";
          ctx.beginPath();
          ctx.moveTo(t.x - 6, t.y + 4);
          ctx.lineTo(t.x, t.y + 4 - flameH);
          ctx.lineTo(t.x + 6, t.y + 4);
          ctx.closePath();
          ctx.fill();

          if (Math.random() < 0.25) {
            spawnParticles(t.x + (Math.random() * 8 - 4), t.y, 1, "#fbbf24", 1.2, -0.06);
          }
        });

        // 3. Draw Portals
        events.portals.forEach((p) => {
          const t = performance.now() * 0.004;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(t);
          ctx.strokeStyle = "#c084fc";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(0, 0, 24, 14, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(0, 0, 16, 8, Math.PI / 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
          ctx.fillStyle = "#e2d9f3";
          ctx.font = "bold 10px monospace";
          ctx.textAlign = "center";
          ctx.fillText("PORTAL", p.x, p.y - 28);
        });

        // 4. Draw Chests
        events.chests.forEach((ch) => {
          ctx.fillStyle = ch.opened ? "#78350f" : "#b45309";
          ctx.fillRect(ch.x - 12, ch.y - 8, 24, 16);
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(ch.x - 12, ch.y - 8, 24, 16);
          ctx.fillStyle = "#fbbf24";
          ctx.fillRect(ch.x - 3, ch.y - 3, 6, 6);
          if (!ch.opened) {
            ctx.fillStyle = "#fbbf24";
            ctx.font = "9px sans-serif";
            ctx.fillText("✨", ch.x - 4, ch.y - 12);
          }
        });

        // 5. Draw NPCs
        events.npcs.forEach((npc) => {
          ctx.font = "24px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(npc.icon, npc.x, npc.y + 8);
          // Speech bubble indicator
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.fillRect(npc.x - 24, npc.y - 28, 48, 14);
          ctx.fillStyle = "#facc15";
          ctx.font = "bold 9px monospace";
          ctx.fillText("[E] Talk", npc.x, npc.y - 18);
        });

        // 6. Draw Monsters
        events.monsters.forEach((m) => {
          if (m.hp <= 0) return;
          ctx.save();
          if (m.hitFlash > 0) ctx.filter = "brightness(2.5)";
          ctx.font = "24px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(m.icon, m.x, m.y + 8);
          ctx.restore();

          // HP bar
          const barW = 30;
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillRect(m.x - barW / 2, m.y - 20, barW, 4);
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(m.x - barW / 2, m.y - 20, (m.hp / m.maxHp) * barW, 4);
        });

        // 7. Draw Hero Sprite
        ctx.save();
        ctx.translate(hero.x, hero.y);

        // Shadow
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.ellipse(0, 14, 12, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Step offset
        const stepOffset = hero.isMoving ? (hero.frame % 2 === 0 ? -2 : 2) : 0;

        // Robe Body
        ctx.fillStyle = "#4338ca";
        ctx.beginPath();
        ctx.moveTo(-9, 14);
        ctx.lineTo(-6, -4);
        ctx.lineTo(6, -4);
        ctx.lineTo(9, 14);
        ctx.closePath();
        ctx.fill();

        // Head
        ctx.fillStyle = "#fde047";
        ctx.beginPath();
        ctx.arc(0, -9, 7, 0, Math.PI * 2);
        ctx.fill();

        // Wizard Hat
        ctx.fillStyle = "#312e81";
        ctx.beginPath();
        ctx.moveTo(-12, -10);
        ctx.lineTo(0, -26);
        ctx.lineTo(12, -10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(-12, -11, 24, 3);

        // Staff in hand
        ctx.strokeStyle = "#78350f";
        ctx.lineWidth = 2.5;
        const staffX = hero.dir === 1 ? -12 : 12;
        ctx.beginPath();
        ctx.moveTo(staffX, -16 + stepOffset);
        ctx.lineTo(staffX, 14);
        ctx.stroke();

        // Glowing crystal on staff
        ctx.fillStyle = "#38bdf8";
        ctx.beginPath();
        ctx.arc(staffX, -17 + stepOffset, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // 8. Draw Projectiles
        projectiles.forEach((p) => {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        });

        // 9. Draw Particles
        particles.forEach((pt) => {
          ctx.fillStyle = pt.color;
          ctx.globalAlpha = pt.alpha;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;

        // 10. Draw Floating Texts
        floatingTexts.forEach((ft) => {
          ctx.fillStyle = ft.color;
          ctx.font = "bold 12px monospace";
          ctx.textAlign = "center";
          ctx.fillText(ft.text, ft.x, ft.y);
        });

        ctx.restore();

        // 11. Mini-Map in Top Right Corner
        const mmW = 100;
        const mmH = 70;
        const mmX = canvas.width - mmW - 12;
        const mmY = 12;
        ctx.fillStyle = "rgba(5, 7, 14, 0.85)";
        ctx.fillRect(mmX, mmY, mmW, mmH);
        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(mmX, mmY, mmW, mmH);

        // Scale factors for radar
        const sX = mmW / worldW;
        const sY = mmH / worldH;

        // Draw events on radar
        events.chests.forEach((ch) => {
          ctx.fillStyle = "#fbbf24";
          ctx.fillRect(mmX + ch.x * sX - 1, mmY + ch.y * sY - 1, 2, 2);
        });
        events.monsters.forEach((m) => {
          if (m.hp > 0) {
            ctx.fillStyle = "#ef4444";
            ctx.fillRect(mmX + m.x * sX - 1, mmY + m.y * sY - 1, 3, 3);
          }
        });
        events.npcs.forEach((n) => {
          ctx.fillStyle = "#38bdf8";
          ctx.fillRect(mmX + n.x * sX - 1, mmY + n.y * sY - 1, 3, 3);
        });

        // Hero on radar
        ctx.fillStyle = "#4ade80";
        ctx.beginPath();
        ctx.arc(mmX + hero.x * sX, mmY + hero.y * sY, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      return {
        destroy() {
          isRunning = false;
          if (animId) cancelAnimationFrame(animId);
          window.removeEventListener("keydown", onKeyDown);
          window.removeEventListener("keyup", onKeyUp);
        },
      };
    }

    /* ==========================================================================
       1. BATTLEMAP BUILDER VIEW
       ========================================================================== */
    function renderBattlemapView() {
      const curMap = getActiveMap();
      if (!curMap) return `<div class="card-panel">No maps available. Create one!</div>`;

      if (mapEngineMode === "rpgjs") {
        return renderRpgjsView(curMap);
      }

      const cols = curMap.width || 20;
      const rows = curMap.height || 14;
      const tokens = curMap.tokens || [];
      const selectedToken = tokens.find((t) => t.id === selectedTokenId);

      return `
        <!-- Tabletop Control Bar -->
        <div class="card-panel" style="padding:14px 18px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <span style="font-weight:700;font-size:15px">🗺️ Map:</span>
            <select id="map-selector" style="padding:6px 12px;border-radius:6px;background:var(--bg);border:1px solid var(--line);font-weight:600">
              ${dndData.maps.map((m) => `<option value="${m.id}" ${m.id === curMap.id ? "selected" : ""}>${escapeHtml(m.name)} (${m.width}x${m.height})</option>`).join("")}
            </select>
            <button type="button" class="btn small ghost" id="btn-new-map">➕ New Map</button>

            <!-- Mode Switcher -->
            <div style="display:inline-flex;border:1px solid var(--line);border-radius:6px;overflow:hidden;margin-left:6px">
              <button type="button" class="btn small ghost" id="btn-mode-rpgjs" title="2D Animated Action RPG Engine Viewport">🎮 RPGJS Engine</button>
              <button type="button" class="btn small gold" id="btn-mode-tabletop" title="Classic Miniature Battlemap Grid">🗺️ Tabletop Grid</button>
            </div>
          </div>

          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="muted" style="font-size:12px">Tools:</span>
            <button type="button" class="btn small ${activeTool === "select" ? "gold" : "ghost"}" id="tool-select" title="Move and inspect miniatures">👆 Select / Move</button>
            <button type="button" class="btn small ${activeTool === "terrain" ? "gold" : "ghost"}" id="tool-terrain" title="Click or drag to paint terrain tiles">🖌️ Paint Terrain</button>
            <button type="button" class="btn small ${activeTool === "eraser" ? "gold" : "ghost"}" id="tool-eraser" title="Reset cell to standard floor">🧹 Clear Tile</button>
            <button type="button" class="btn small ${activeTool === "fog" ? "gold" : "ghost"}" id="tool-fog" title="Reveal or re-hide cells while Fog is on">🌫️ Reveal Fog</button>
            
            <div style="width:1px;height:24px;background:var(--line);margin:0 4px"></div>
            
            <button type="button" class="btn small ${showGrid ? "gold" : "ghost"}" id="btn-toggle-grid">▦ Grid: ${showGrid ? "ON" : "OFF"}</button>
            <button type="button" class="btn small ${showFog ? "gold" : "ghost"}" id="btn-toggle-fog">🌫️ Fog: ${showFog ? "ON" : "OFF"}</button>
            <button type="button" class="btn small gold" id="btn-save-map">💾 Save Map</button>
          </div>
        </div>

        <!-- Terrain Brush Palette (Visible when Paint tool active) -->
        ${
          activeTool === "terrain"
            ? `
          <div class="card-panel" style="padding:10px 16px;margin-bottom:14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:rgba(0,0,0,0.3)">
            <span class="muted" style="font-size:12px">Terrain Palette:</span>
            ${TERRAIN_TYPES.map(
              (t) => `
              <button type="button" class="btn small ghost btn-brush-sel ${selectedTerrain === t.id ? "gold" : ""}" data-terrain="${t.id}" style="display:inline-flex;align-items:center;gap:6px">
                <span>${t.icon}</span> <span>${t.name}</span>
              </button>
            `
            ).join("")}
          </div>
        `
            : ""
        }

        <!-- Interactive Map Layout: Grid Canvas (Left) + Token Palette & HUD (Right) -->
        <div style="display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
          <!-- Tabletop Battlemap Canvas Container -->
          <div style="flex:1;min-width:320px;overflow-x:auto;background:#090d16;padding:16px;border-radius:12px;border:3px solid #334155;box-shadow:inset 0 0 40px rgba(0,0,0,0.8);position:relative">
            <div id="battlemap-table" style="display:grid;grid-template-columns:repeat(${cols}, 42px);grid-template-rows:repeat(${rows}, 42px);gap:1px;background:${showGrid ? "rgba(255,255,255,0.12)" : "transparent"};width:max-content;margin:0 auto;position:relative;user-select:none">
              ${renderBattlemapCells(curMap, cols, rows)}
              ${renderBattlemapTokens(curMap)}
            </div>
            <!-- Ruler Overlay Banner (During Token Drag) -->
            <div id="map-ruler-banner" style="position:absolute;top:12px;left:12px;background:rgba(0,0,0,0.85);border:1px solid var(--gold);padding:6px 14px;border-radius:20px;font-size:13px;font-weight:700;color:var(--gold);display:none;pointer-events:none;z-index:50">
              📏 Movement: <span id="ruler-dist-val">0 ft</span>
            </div>
          </div>

          <!-- Right Sidebar: Token Spawner & Selected Token HUD -->
          <div style="width:310px;display:flex;flex-direction:column;gap:16px">
            <!-- Selected Token Inspector Card -->
            ${
              selectedToken
                ? `
              <div class="card-panel" style="border-left:4px solid ${selectedToken.color || "var(--accent)"}">
                <div style="display:flex;justify-content:space-between;align-items:center">
                  <div style="display:flex;align-items:center;gap:10px">
                    <span style="font-size:32px">${selectedToken.icon}</span>
                    <div>
                      <h3 style="margin:0;font-size:16px">${escapeHtml(selectedToken.name)}</h3>
                      <span class="chip ${selectedToken.isEnemy ? "red" : "blue"}" style="font-size:10px">${selectedToken.isEnemy ? "Enemy Monster" : "Party Ally"}</span>
                    </div>
                  </div>
                  <button type="button" class="btn small ghost" id="btn-deselect-tok" title="Deselect">✕</button>
                </div>

                <div style="margin-top:14px">
                  <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
                    <span>Health (HP):</span>
                    <b>${selectedToken.hp} / ${selectedToken.maxHp}</b>
                  </div>
                  <div style="background:rgba(255,255,255,0.1);height:8px;border-radius:4px;overflow:hidden">
                    <div style="background:${selectedToken.isEnemy ? "#ef4444" : "#10b981"};width:${Math.max(0, Math.min(100, (selectedToken.hp / selectedToken.maxHp) * 100))}%;height:100%"></div>
                  </div>
                  <div style="display:flex;gap:4px;margin-top:8px">
                    <button type="button" class="btn small ghost btn-hp-adj" data-adj="-5">-5</button>
                    <button type="button" class="btn small ghost btn-hp-adj" data-adj="-1">-1</button>
                    <button type="button" class="btn small ghost btn-hp-adj" data-adj="1">+1</button>
                    <button type="button" class="btn small ghost btn-hp-adj" data-adj="5">+5</button>
                  </div>
                </div>

                <div style="margin-top:14px">
                  <span class="faint" style="font-size:11px">Coordinates: Grid (${selectedToken.x}, ${selectedToken.y})</span>
                </div>

                <div class="toolbar" style="margin-top:14px">
                  <button type="button" class="btn small red" id="btn-del-tok">🗑️ Remove Token</button>
                </div>
              </div>
            `
                : `
              <div class="card-panel faint" style="text-align:center;padding:18px">
                <span style="font-size:24px">👆</span>
                <p style="margin:6px 0 0;font-size:12px">Click any miniature token on the battlemap to view HP and manage combat.</p>
              </div>
            `
            }

            <!-- Quick Token Spawner Palette -->
            <div class="card-panel">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <h3 style="margin:0;font-size:15px">⚔️ Miniatures Library</h3>
                <button type="button" class="btn small ghost" id="btn-custom-tok">➕ Custom</button>
              </div>
              <p class="muted" style="margin:0 0 12px 0;font-size:12px">Click any miniature below to spawn onto the table:</p>
              <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:8px">
                ${TOKEN_PRESETS.map(
                  (tp, idx) => `
                  <button type="button" class="btn small ghost btn-spawn-tok" data-idx="${idx}" style="display:flex;align-items:center;gap:6px;justify-content:flex-start;padding:6px 10px;text-align:left">
                    <span style="font-size:18px">${tp.icon}</span>
                    <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px">${escapeHtml(tp.name.split(" ")[0])}</span>
                  </button>
                `
                ).join("")}
              </div>
              <button type="button" class="btn small gold" id="btn-spawn-hero" style="width:100%;margin-top:12px">🧙 Spawn My Active Hero</button>
            </div>
          </div>
        </div>
      `;
    }

    function renderBattlemapCells(curMap, cols, rows) {
      const tiles = curMap.tiles || {};
      // Fog is per-cell: map.fog holds the cells the GM has revealed. A bare
      // `showFog` flag fogged the entire board, which hid the map and could
      // never be uncovered again.
      const revealed = curMap.fog || {};
      let html = "";
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const key = `${x},${y}`;
          const tileType = tiles[key] || "floor";
          const terrainDef = TERRAIN_TYPES.find((t) => t.id === tileType) || TERRAIN_TYPES[0];
          const isFogged = showFog && !revealed[key];
          html += `
            <div class="dnd-cell ${isFogged ? "fog-cell" : ""}" data-x="${x}" data-y="${y}" style="background:${terrainDef.bg};border:1px solid ${terrainDef.border};display:flex;align-items:center;justify-content:center;position:relative;cursor:${activeTool === "terrain" || activeTool === "fog" ? "crosshair" : "default"}">
              ${tileType === "door" ? "🚪" : tileType === "wall" ? "" : ""}
            </div>
          `;
        }
      }
      return html;
    }

    function renderBattlemapTokens(curMap) {
      const tokens = curMap.tokens || [];
      return tokens
        .map((t) => {
          const left = t.x * 43;
          const top = t.y * 43;
          const isSel = t.id === selectedTokenId;
          const hpPct = Math.max(0, Math.min(100, (t.hp / t.maxHp) * 100));
          const sizePx = (t.size || 1) * 42;
          return `
          <div class="dnd-token-el ${isSel ? "selected" : ""}" data-tok-id="${t.id}" style="position:absolute;left:${left + 1}px;top:${top + 1}px;width:${sizePx}px;height:${sizePx}px;border-radius:50%;background:radial-gradient(circle at 35% 35%, #fff 0%, ${t.color || "#3b82f6"} 70%);border:2px solid ${isSel ? "var(--gold)" : "#fff"};display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 4px 10px rgba(0,0,0,0.6);cursor:grab;z-index:20;transition:transform 0.1s">
            <span style="font-size:${(t.size || 1) * 20}px;pointer-events:none">${t.icon}</span>
            <div style="position:absolute;bottom:-4px;width:75%;height:4px;background:rgba(0,0,0,0.6);border-radius:2px;overflow:hidden">
              <div style="background:${t.isEnemy ? "#ef4444" : "#10b981"};width:${hpPct}%;height:100%"></div>
            </div>
          </div>
        `;
        })
        .join("");
    }

    function bindBattlemapEvents() {
      const curMap = getActiveMap();
      if (!curMap) return;

      // Mode Switcher buttons
      const btnModeRpg = $("#btn-mode-rpgjs");
      const btnModeTabletop = $("#btn-mode-tabletop");
      if (btnModeRpg) {
        btnModeRpg.onclick = () => {
          if (mapEngineMode === "rpgjs") return;
          mapEngineMode = "rpgjs";
          render();
        };
      }
      if (btnModeTabletop) {
        btnModeTabletop.onclick = () => {
          if (mapEngineMode === "tabletop") return;
          if (rpgjsInstance) {
            rpgjsInstance.destroy();
            rpgjsInstance = null;
          }
          mapEngineMode = "tabletop";
          render();
        };
      }

      // Map selector change
      const mapSel = $("#map-selector");
      if (mapSel) {
        mapSel.onchange = (e) => {
          if (rpgjsInstance) {
            rpgjsInstance.destroy();
            rpgjsInstance = null;
          }
          currentMapId = e.target.value;
          selectedTokenId = null;
          render();
        };
      }

      // New Map button
      const newMapBtn = $("#btn-new-map");
      if (newMapBtn) {
        newMapBtn.onclick = () => openNewMapModal();
      }

      // Persist the current map. `quiet` suppresses the toast/sfx for
      // auto-saves (e.g. after revealing fog) where a popup every click is
      // noise. Saves are debounced so dragging the fog brush doesn't fire a
      // request per cell.
      let persistTimer = null;
      function persistMap({ quiet = false } = {}) {
        return new Promise((resolve, reject) => {
          clearTimeout(persistTimer);
          persistTimer = setTimeout(async () => {
            try {
              await api(`/api/dnd/maps/${curMap.id}`, {
                method: "PUT",
                body: {
                  name: curMap.name,
                  width: curMap.width,
                  height: curMap.height,
                  tiles: curMap.tiles,
                  tokens: curMap.tokens,
                  fog: curMap.fog || null,
                },
              });
              if (!quiet) {
                window.MTG_SFX && window.MTG_SFX.play("victory");
                toast("Battlemap saved successfully! 💾✨");
              }
              resolve();
            } catch (err) {
              if (!quiet) toast(err.message || "Could not save map");
              reject(err);
            }
          }, quiet ? 400 : 0);
        });
      }

      // Save Map button
      const saveMapBtn = $("#btn-save-map");
      if (saveMapBtn) {
        saveMapBtn.onclick = () => persistMap();
      }

      // If in RPGJS 2D Engine Mode, initialize canvas engine and finish
      if (mapEngineMode === "rpgjs") {
        const toolTerrain = $("#tool-terrain");
        if (toolTerrain) {
          toolTerrain.onclick = () => {
            activeTool = activeTool === "terrain" ? "select" : "terrain";
            render();
          };
        }
        $$(".btn-brush-sel").forEach((btn) => {
          btn.onclick = () => {
            selectedTerrain = btn.dataset.terrain;
            $$(".btn-brush-sel").forEach((b) => b.classList.toggle("gold", b === btn));
          };
        });

        if (rpgjsInstance) {
          rpgjsInstance.destroy();
          rpgjsInstance = null;
        }
        rpgjsInstance = initRpgjsEngine(curMap);
        return;
      }

      // Tabletop Mode Tool Toggles
      const toolSelect = $("#tool-select");
      if (toolSelect) toolSelect.onclick = () => { activeTool = "select"; render(); };
      const toolTerr = $("#tool-terrain");
      if (toolTerr) toolTerr.onclick = () => { activeTool = "terrain"; render(); };
      const toolEraser = $("#tool-eraser");
      if (toolEraser) toolEraser.onclick = () => { activeTool = "eraser"; render(); };
      const toolFog = $("#tool-fog");
      if (toolFog) toolFog.onclick = () => { activeTool = "fog"; render(); };
      const btnGrid = $("#btn-toggle-grid");
      if (btnGrid) btnGrid.onclick = () => { showGrid = !showGrid; render(); };
      const btnFog = $("#btn-toggle-fog");
      // Turning fog on hides everything not yet revealed; turning it off shows
      // the whole board. Either way the revealed set is persisted on the map.
      if (btnFog) btnFog.onclick = () => {
        showFog = !showFog;
        if (showFog && !curMap.fog) curMap.fog = {};
        persistMap({ quiet: true }).catch(() => {});
        render();
      };

      // Terrain Palette Select
      $$(".btn-brush-sel").forEach((btn) => {
        btn.onclick = () => {
          selectedTerrain = btn.dataset.terrain;
          $$(".btn-brush-sel").forEach((b) => b.classList.toggle("gold", b === btn));
        };
      });

      // Cell interaction for Terrain Painting
      const tableEl = $("#battlemap-table");
      if (tableEl) {
        tableEl.onmousedown = (e) => {
          if (activeTool === "select") return;
          const cell = e.target.closest(".dnd-cell");
          if (!cell) return;
          isDrawing = true;
          paintCell(cell);
        };
        tableEl.onmouseover = (e) => {
          if (!isDrawing || activeTool === "select") return;
          const cell = e.target.closest(".dnd-cell");
          if (cell) paintCell(cell);
        };
        window.addEventListener("mouseup", () => { isDrawing = false; }, { once: true });
      }

      function paintCell(cell) {
        const x = cell.dataset.x;
        const y = cell.dataset.y;
        if (!curMap.tiles) curMap.tiles = {};
        const key = `${x},${y}`;
        if (activeTool === "fog") {
          // Toggling a cell's revealed state, so fog can actually be lifted
          // one square at a time instead of blanketing the whole board.
          if (!curMap.fog) curMap.fog = {};
          if (curMap.fog[key]) {
            delete curMap.fog[key];
            cell.classList.remove("fog-cell");
          } else {
            curMap.fog[key] = true;
            cell.classList.add("fog-cell");
          }
          persistMap({ quiet: true }).catch(() => {});
        } else if (activeTool === "terrain") {
          curMap.tiles[key] = selectedTerrain;
          const terrainDef = TERRAIN_TYPES.find((t) => t.id === selectedTerrain) || TERRAIN_TYPES[0];
          cell.style.background = terrainDef.bg;
          cell.style.borderColor = terrainDef.border;
          cell.textContent = selectedTerrain === "door" ? "🚪" : "";
        } else if (activeTool === "eraser") {
          delete curMap.tiles[key];
          cell.style.background = TERRAIN_TYPES[0].bg;
          cell.style.borderColor = TERRAIN_TYPES[0].border;
          cell.textContent = "";
        }
      }

      // Token Drag & Drop Movement
      $$(".dnd-token-el").forEach((tokEl) => {
        tokEl.onclick = (e) => {
          e.stopPropagation();
          selectedTokenId = tokEl.dataset.tokId;
          render();
        };

        tokEl.onmousedown = (e) => {
          if (activeTool !== "select") return;
          e.preventDefault();
          const tid = tokEl.dataset.tokId;
          const token = curMap.tokens.find((t) => t.id === tid);
          if (!token) return;

          selectedTokenId = tid;
          tokEl.style.cursor = "grabbing";
          tokEl.style.zIndex = "100";
          tokEl.style.transform = "scale(1.15)";

          const originX = token.x;
          const originY = token.y;
          const rulerBanner = $("#map-ruler-banner");
          const rulerDistVal = $("#ruler-dist-val");
          if (rulerBanner) rulerBanner.style.display = "block";

          function onMouseMove(ev) {
            const rect = tableEl.getBoundingClientRect();
            const relX = ev.clientX - rect.left;
            const relY = ev.clientY - rect.top;
            const gx = Math.max(0, Math.min(curMap.width - 1, Math.floor(relX / 43)));
            const gy = Math.max(0, Math.min(curMap.height - 1, Math.floor(relY / 43)));
            tokEl.style.left = `${gx * 43 + 1}px`;
            tokEl.style.top = `${gy * 43 + 1}px`;

            // Calculate 5ft movement distance
            const dx = Math.abs(gx - originX);
            const dy = Math.abs(gy - originY);
            const dist = Math.max(dx, dy) * 5; // D&D 5e standard grid distance
            if (rulerDistVal) rulerDistVal.textContent = `${dist} ft`;
          }

          function onMouseUp(ev) {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
            if (rulerBanner) rulerBanner.style.display = "none";
            tokEl.style.cursor = "grab";
            tokEl.style.zIndex = "20";
            tokEl.style.transform = "none";

            const rect = tableEl.getBoundingClientRect();
            const relX = ev.clientX - rect.left;
            const relY = ev.clientY - rect.top;
            const gx = Math.max(0, Math.min(curMap.width - 1, Math.floor(relX / 43)));
            const gy = Math.max(0, Math.min(curMap.height - 1, Math.floor(relY / 43)));

            token.x = gx;
            token.y = gy;
            window.MTG_SFX && window.MTG_SFX.play("tap");
            render();
          }

          window.addEventListener("mousemove", onMouseMove);
          window.addEventListener("mouseup", onMouseUp);
        };
      });

      // Token HUD Controls
      const deselectBtn = $("#btn-deselect-tok");
      if (deselectBtn) {
        deselectBtn.onclick = () => {
          selectedTokenId = null;
          render();
        };
      }

      $$(".btn-hp-adj").forEach((btn) => {
        btn.onclick = () => {
          const adj = parseInt(btn.dataset.adj, 10) || 0;
          const token = curMap.tokens.find((t) => t.id === selectedTokenId);
          if (token) {
            token.hp = Math.max(0, Math.min(token.maxHp, token.hp + adj));
            if (adj < 0) window.MTG_SFX && window.MTG_SFX.play("strike");
            else window.MTG_SFX && window.MTG_SFX.play("sparkle");
            render();
          }
        };
      });

      const delTokBtn = $("#btn-del-tok");
      if (delTokBtn) {
        delTokBtn.onclick = () => {
          curMap.tokens = curMap.tokens.filter((t) => t.id !== selectedTokenId);
          selectedTokenId = null;
          toast("Token removed from table.");
          render();
        };
      }

      // Spawner buttons
      $$(".btn-spawn-tok").forEach((btn) => {
        btn.onclick = () => {
          const idx = parseInt(btn.dataset.idx, 10);
          const tp = TOKEN_PRESETS[idx];
          if (!tp) return;
          const newToken = {
            id: "tok-" + Math.random().toString(36).slice(2, 8),
            name: tp.name,
            icon: tp.icon,
            color: tp.color,
            hp: tp.hp,
            maxHp: tp.maxHp,
            size: tp.size || 1,
            isEnemy: tp.isEnemy,
            x: Math.floor(curMap.width / 2),
            y: Math.floor(curMap.height / 2),
          };
          if (!curMap.tokens) curMap.tokens = [];
          curMap.tokens.push(newToken);
          selectedTokenId = newToken.id;
          window.MTG_SFX && window.MTG_SFX.play("summon");
          toast(`Spawned ${tp.name} miniature! ✨`);
          render();
        };
      });

      // Spawn Hero button
      $("#btn-spawn-hero").onclick = () => {
        const heroToken = {
          id: "tok-hero-" + Math.random().toString(36).slice(2, 6),
          name: char.name || "Hero",
          icon: "🧙",
          color: "#3b82f6",
          hp: char.hp,
          maxHp: char.maxHp,
          size: 1,
          isEnemy: false,
          x: 2,
          y: Math.floor(curMap.height / 2),
        };
        if (!curMap.tokens) curMap.tokens = [];
        curMap.tokens.push(heroToken);
        selectedTokenId = heroToken.id;
        window.MTG_SFX && window.MTG_SFX.play("summon");
        toast(`Spawned ${char.name} onto the battlemap! ✨`);
        render();
      };

      // Custom Token Modal
      const customTokBtn = $("#btn-custom-tok");
      if (customTokBtn) customTokBtn.onclick = () => openCustomTokenModal(curMap);
    }

    /* Modal: Custom Token */
    function openCustomTokenModal(curMap) {
      const modal = $("#modal");
      if (!modal) return;
      modal.hidden = false;
      modal.innerHTML = `
        <div class="sheet">
          <h2>✨ Create Custom Token</h2>
          <form id="custom-tok-form" style="margin-top:14px">
            <div class="field">
              <label>Token Name</label>
              <input type="text" id="ctk-name" placeholder="e.g. Ancient Shadow Lich" required />
            </div>
            <div class="row" style="gap:10px;margin-top:10px">
              <div class="field" style="width:70px">
                <label>Icon</label>
                <input type="text" id="ctk-icon" value="👾" style="text-align:center;font-size:20px" required />
              </div>
              <div class="field grow">
                <label>Max HP</label>
                <input type="number" id="ctk-hp" value="50" min="1" required />
              </div>
              <div class="field grow">
                <label>Size</label>
                <select id="ctk-size">
                  <option value="1">Medium (1x1)</option>
                  <option value="2">Large (2x2)</option>
                  <option value="3">Huge (3x3)</option>
                </select>
              </div>
            </div>
            <div class="field" style="margin-top:10px">
              <label>Allegiance</label>
              <select id="ctk-team">
                <option value="enemy">Enemy Monster (Red)</option>
                <option value="hero">Party Hero (Blue)</option>
                <option value="npc">Neutral NPC (Gold)</option>
              </select>
            </div>
            <div class="toolbar" style="margin-top:20px">
              <button type="submit" class="btn gold">Spawn Token</button>
              <button type="button" class="btn ghost" id="ctk-cancel">Cancel</button>
            </div>
          </form>
        </div>
      `;

      $("#ctk-cancel").onclick = () => { modal.hidden = true; };
      $("#custom-tok-form").onsubmit = (e) => {
        e.preventDefault();
        const name = $("#ctk-name").value.trim();
        const icon = $("#ctk-icon").value.trim() || "👾";
        const hp = parseInt($("#ctk-hp").value, 10) || 50;
        const size = parseInt($("#ctk-size").value, 10) || 1;
        const team = $("#ctk-team").value;
        const color = team === "enemy" ? "#ef4444" : team === "hero" ? "#3b82f6" : "#f59e0b";

        const tok = {
          id: "tok-" + Math.random().toString(36).slice(2, 8),
          name,
          icon,
          hp,
          maxHp: hp,
          size,
          isEnemy: team === "enemy",
          color,
          x: Math.floor(curMap.width / 2),
          y: Math.floor(curMap.height / 2),
        };
        if (!curMap.tokens) curMap.tokens = [];
        curMap.tokens.push(tok);
        selectedTokenId = tok.id;
        modal.hidden = true;
        window.MTG_SFX && window.MTG_SFX.play("summon");
        toast(`Token "${name}" created! ✨`);
        render();
      };
    }

    /* Modal: New Map */
    function openNewMapModal() {
      const modal = $("#modal");
      if (!modal) return;
      modal.hidden = false;
      modal.innerHTML = `
        <div class="sheet">
          <h2>🗺️ Create New Battlemap</h2>
          <form id="new-map-form" style="margin-top:14px">
            <div class="field">
              <label>Map Name</label>
              <input type="text" id="nm-name" placeholder="e.g. Caverns of Mount Sorrow" required />
            </div>
            <div class="row" style="gap:12px;margin-top:12px">
              <div class="field grow">
                <label>Width (Columns)</label>
                <input type="number" id="nm-w" value="20" min="10" max="35" required />
              </div>
              <div class="field grow">
                <label>Height (Rows)</label>
                <input type="number" id="nm-h" value="14" min="8" max="25" required />
              </div>
            </div>
            <div class="toolbar" style="margin-top:20px">
              <button type="submit" class="btn gold">Create Battlemap</button>
              <button type="button" class="btn ghost" id="nm-cancel">Cancel</button>
            </div>
          </form>
        </div>
      `;

      $("#nm-cancel").onclick = () => { modal.hidden = true; };
      $("#new-map-form").onsubmit = async (e) => {
        e.preventDefault();
        const name = $("#nm-name").value.trim();
        const width = parseInt($("#nm-w").value, 10) || 20;
        const height = parseInt($("#nm-h").value, 10) || 14;
        try {
          const res = await api("/api/dnd/maps", {
            method: "POST",
            body: { name, width, height, tiles: {}, tokens: [] },
          });
          dndData.maps.unshift(res.map);
          currentMapId = res.map.id;
          modal.hidden = true;
          toast(`Battlemap "${name}" created! ✨`);
          render();
        } catch (err) {
          toast(err.message || "Failed to create map");
        }
      };
    }

    /* ==========================================================================
       2. CAMPAIGN CHRONICLES VIEW
       ========================================================================== */
    function renderCampaignView() {
      const curCamp = getActiveCampaign();
      if (!curCamp) return `<div class="card-panel">No campaigns found. Create one below!</div>`;

      const chapters = curCamp.chapters || [];
      const npcs = curCamp.npcs || [];

      return `
        <!-- Campaign Selector Bar -->
        <div class="card-panel" style="padding:14px 18px;margin-bottom:18px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-weight:700;font-size:15px">📖 Campaign:</span>
            <select id="camp-selector" style="padding:6px 12px;border-radius:6px;background:var(--bg);border:1px solid var(--line);font-weight:600">
              ${dndData.campaigns.map((c) => `<option value="${c.id}" ${c.id === curCamp.id ? "selected" : ""}>${escapeHtml(c.title)}</option>`).join("")}
            </select>
            <button type="button" class="btn small ghost" id="btn-new-camp">➕ New Campaign</button>
          </div>

          <div class="toolbar" style="gap:8px">
            <span class="chip gold">${escapeHtml(curCamp.status || "Active")}</span>
            <button type="button" class="btn small gold" id="btn-save-camp">💾 Save Campaign Notes</button>
          </div>
        </div>

        <!-- Campaign Briefing Card -->
        <div class="card-panel" style="padding:22px;margin-bottom:18px;border-left:5px solid var(--accent, #a855f7)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
            <div>
              <h2 style="margin:0">${escapeHtml(curCamp.title)}</h2>
              <div class="muted" style="margin-top:4px;font-size:13px">
                Dungeon Master: <b>${escapeHtml(curCamp.dm)}</b> · Realm: <b>${escapeHtml(curCamp.realm)}</b>
              </div>
            </div>
            ${
              curCamp.activeMapId
                ? `<button type="button" class="btn small gold" id="btn-camp-open-map">🗺️ Open Active Battlemap</button>`
                : ""
            }
          </div>
          <p style="margin:14px 0 0 0;font-size:14px;line-height:1.5">${escapeHtml(curCamp.synopsis)}</p>
        </div>

        <div class="grid-2">
          <!-- Left: Chapter Quests Log -->
          <div class="card-panel">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
              <h3 style="margin:0">📜 Adventure Chapters (${chapters.length})</h3>
              <button type="button" class="btn small ghost" id="btn-add-chapter">➕ Add Chapter</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px">
              ${chapters
                .map(
                  (ch, idx) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:6px;border:1px solid rgba(255,255,255,0.06)">
                  <div>
                    <div style="font-weight:600">${escapeHtml(ch.title)}</div>
                    <div class="faint" style="font-size:11px">XP Reward: +${ch.xp || 300} XP</div>
                  </div>
                  <span class="chip ${ch.status === "completed" ? "green" : ch.status === "in_progress" ? "gold" : "muted"}" style="font-size:11px">
                    ${ch.status === "completed" ? "✓ Completed" : ch.status === "in_progress" ? "⏳ Active Quest" : "🔒 Locked"}
                  </span>
                </div>
              `
                )
                .join("")}
            </div>

            <!-- DM Notes Editor -->
            <div style="margin-top:20px">
              <h3 style="margin:0 0 8px 0">📝 DM Campaign Notes</h3>
              <textarea id="camp-notes-input" rows="6" style="width:100%;font-family:inherit;font-size:13px;padding:10px;border-radius:6px;background:var(--bg);border:1px solid var(--line)">${escapeHtml(curCamp.notes || "")}</textarea>
            </div>
          </div>

          <!-- Right: NPC & Monster Codex -->
          <div class="card-panel">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
              <h3 style="margin:0">👹 NPC & Monster Codex (${npcs.length})</h3>
              <button type="button" class="btn small ghost" id="btn-add-npc">➕ Add NPC</button>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px">
              ${
                npcs.length
                  ? npcs
                      .map(
                        (npc) => `
                  <div style="padding:12px;background:rgba(0,0,0,0.25);border-radius:6px;border:1px solid rgba(255,255,255,0.06)">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start">
                      <div>
                        <div style="font-weight:700;font-size:14px">${escapeHtml(npc.name)}</div>
                        <div class="chip purple" style="font-size:10px;margin-top:2px">${escapeHtml(npc.role)}</div>
                      </div>
                      <div style="text-align:right;font-size:12px">
                        <div>🛡️ AC: <b>${npc.ac}</b></div>
                        <div>❤️ HP: <b>${npc.hp}</b></div>
                      </div>
                    </div>
                    <p class="muted" style="margin:8px 0 0 0;font-size:12px">${escapeHtml(npc.notes)}</p>
                  </div>
                `
                      )
                      .join("")
                  : `<div class="faint" style="padding:16px;text-align:center">No NPCs recorded in this campaign yet.</div>`
              }
            </div>
          </div>
        </div>
      `;
    }

    function bindCampaignEvents() {
      const curCamp = getActiveCampaign();
      if (!curCamp) return;

      $("#camp-selector").onchange = (e) => {
        currentCampaignId = e.target.value;
        render();
      };

      const openMapBtn = $("#btn-camp-open-map");
      if (openMapBtn) {
        openMapBtn.onclick = () => {
          if (curCamp.activeMapId) currentMapId = curCamp.activeMapId;
          activeTab = "map";
          render();
        };
      }

      $("#btn-save-camp").onclick = async () => {
        const notes = $("#camp-notes-input").value;
        curCamp.notes = notes;
        try {
          await api(`/api/dnd/campaigns/${curCamp.id}`, {
            method: "PUT",
            body: { notes },
          });
          window.MTG_SFX && window.MTG_SFX.play("sparkle");
          toast("Campaign notes saved! 📝✨");
        } catch (err) {
          toast(err.message || "Failed to save campaign");
        }
      };

      $("#btn-add-chapter").onclick = () => {
        const title = prompt("Enter Chapter / Quest title:", "Chapter 3: The Forgotten Crypt");
        if (!title) return;
        if (!curCamp.chapters) curCamp.chapters = [];
        curCamp.chapters.push({
          id: "ch-" + Math.random().toString(36).slice(2, 6),
          title: title.trim(),
          status: "in_progress",
          xp: 600,
        });
        toast("Chapter added to campaign! 📜");
        render();
      };

      $("#btn-add-npc").onclick = () => {
        const name = prompt("Enter NPC / Monster Name:", "Gorgon Shaman");
        if (!name) return;
        const role = prompt("Enter role/archetype:", "Boss Monster") || "NPC";
        const ac = parseInt(prompt("Enter Armor Class (AC):", "15"), 10) || 15;
        const hp = parseInt(prompt("Enter Hit Points (HP):", "65"), 10) || 65;
        const notes = prompt("Enter DM notes or tactical abilities:", "Petrifying gaze.") || "";
        if (!curCamp.npcs) curCamp.npcs = [];
        curCamp.npcs.push({ id: "npc-" + Math.random().toString(36).slice(2, 6), name, role, ac, hp, notes });
        toast(`Added ${name} to NPC Codex! 👹`);
        render();
      };

      $("#btn-new-camp").onclick = () => openNewCampaignModal();
    }

    function openNewCampaignModal() {
      const modal = $("#modal");
      if (!modal) return;
      modal.hidden = false;
      modal.innerHTML = `
        <div class="sheet">
          <h2>📖 Create New Campaign</h2>
          <form id="new-camp-form" style="margin-top:14px">
            <div class="field">
              <label>Campaign Title</label>
              <input type="text" id="nc-title" placeholder="e.g. The Tomb of the Cyber Lich" required />
            </div>
            <div class="field" style="margin-top:10px">
              <label>Realm / Setting</label>
              <input type="text" id="nc-realm" value="The Astral Plane" required />
            </div>
            <div class="field" style="margin-top:10px">
              <label>Synopsis / Adventure Hook</label>
              <textarea id="nc-synopsis" rows="3" placeholder="Briefly describe the world and starting objective…"></textarea>
            </div>
            <div class="toolbar" style="margin-top:20px">
              <button type="submit" class="btn gold">Launch Campaign</button>
              <button type="button" class="btn ghost" id="nc-cancel">Cancel</button>
            </div>
          </form>
        </div>
      `;

      $("#nc-cancel").onclick = () => { modal.hidden = true; };
      $("#new-camp-form").onsubmit = async (e) => {
        e.preventDefault();
        const title = $("#nc-title").value.trim();
        const realm = $("#nc-realm").value.trim();
        const synopsis = $("#nc-synopsis").value.trim();
        try {
          const res = await api("/api/dnd/campaigns", {
            method: "POST",
            body: { title, realm, synopsis },
          });
          dndData.campaigns.unshift(res.campaign);
          currentCampaignId = res.campaign.id;
          modal.hidden = true;
          toast(`Campaign "${title}" created! 📖✨`);
          render();
        } catch (err) {
          toast(err.message || "Failed to create campaign");
        }
      };
    }

    /* ==========================================================================
       3. CHARACTER SHEET VIEW
       ========================================================================== */
    function renderCharacterView() {
      const hpPct = Math.max(0, Math.min(100, Math.round((char.hp / char.maxHp) * 100)));
      return `
        <div class="card-panel">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
            <div style="display:flex;align-items:center;gap:16px">
              <span style="font-size:42px">🧙</span>
              <div>
                <div style="display:flex;align-items:center;gap:10px">
                  <h2 style="margin:0">${escapeHtml(char.name)}</h2>
                  <button type="button" class="btn small ghost" id="btn-edit-hero">✏️ Edit</button>
                </div>
                <div class="muted" style="margin-top:3px">${escapeHtml(char.charClass)} · ${escapeHtml(char.race)}</div>
              </div>
            </div>

            <div style="display:flex;gap:12px;align-items:center">
              <div style="text-align:center;padding:8px 14px;background:rgba(255,255,255,0.04);border-radius:8px">
                <div class="faint" style="font-size:11px">ARMOR CLASS</div>
                <div style="font-size:22px;font-weight:900;color:var(--gold)">🛡️ ${char.ac}</div>
              </div>
              <div style="text-align:center;padding:8px 14px;background:rgba(255,255,255,0.04);border-radius:8px">
                <div class="faint" style="font-size:11px">SPEED</div>
                <div style="font-size:22px;font-weight:900">👟 ${char.speed} ft</div>
              </div>
              <button type="button" class="btn gold small" id="btn-long-rest">🌙 Long Rest</button>
            </div>
          </div>

          <!-- HP Bar & Quick Modifiers -->
          <div style="margin-top:20px;padding:16px;background:rgba(0,0,0,0.25);border-radius:8px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-weight:700">Hit Points: ${char.hp} / ${char.maxHp} HP</span>
              <div style="display:flex;gap:6px">
                <button type="button" class="btn small ghost btn-char-hp" data-delta="-5">-5</button>
                <button type="button" class="btn small ghost btn-char-hp" data-delta="-1">-1</button>
                <button type="button" class="btn small ghost btn-char-hp" data-delta="1">+1</button>
                <button type="button" class="btn small ghost btn-char-hp" data-delta="5">+5</button>
              </div>
            </div>
            <div style="background:rgba(255,255,255,0.1);height:10px;border-radius:5px;overflow:hidden;margin-top:10px">
              <div style="background:#10b981;width:${hpPct}%;height:100%"></div>
            </div>
          </div>

          <!-- 6 Ability Scores -->
          <div style="display:grid;grid-template-columns:repeat(6, 1fr);gap:10px;margin-top:20px;text-align:center">
            ${[
              { k: "STR", val: char.str },
              { k: "DEX", val: char.dex },
              { k: "CON", val: char.con },
              { k: "INT", val: char.int },
              { k: "WIS", val: char.wis },
              { k: "CHA", val: char.cha },
            ]
              .map(
                (a) => `
              <div style="padding:12px 6px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.06)">
                <div class="faint" style="font-size:11px;font-weight:700">${a.k}</div>
                <div style="font-size:20px;font-weight:900;margin:2px 0">${a.val}</div>
                <div class="chip gold" style="font-size:11px;padding:2px 6px">${calcMod(a.val)}</div>
              </div>
            `
              )
              .join("")}
          </div>

          <!-- Spell Slots -->
          <div style="margin-top:22px">
            <h3 style="margin:0 0 10px 0">🔮 Spell Slots</h3>
            <div style="display:flex;gap:16px;flex-wrap:wrap">
              ${Object.entries(char.slots || {})
                .map(([lvl, s]) => {
                  return `
                  <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:6px">
                    <span style="font-size:12px;font-weight:700">Lvl ${lvl}:</span>
                    <div style="display:flex;gap:4px">
                      ${Array.from({ length: s.total })
                        .map(
                          (_, i) => `
                        <button type="button" class="slot-pip btn-pip ${i < s.used ? "used" : ""}" data-lvl="${lvl}" data-idx="${i}" style="width:16px;height:16px;border-radius:50%;border:1px solid var(--accent);background:${i < s.used ? "transparent" : "var(--accent)"};cursor:pointer"></button>
                      `
                        )
                        .join("")}
                    </div>
                  </div>
                `;
                })
                .join("")}
            </div>
          </div>
        </div>
      `;
    }

    function bindCharacterEvents() {
      $$(".btn-char-hp").forEach((btn) => {
        btn.onclick = () => {
          const delta = parseInt(btn.dataset.delta, 10) || 0;
          char.hp = Math.max(0, Math.min(char.maxHp, char.hp + delta));
          saveChar(char);
          render();
        };
      });

      $("#btn-long-rest").onclick = () => {
        char.hp = char.maxHp;
        if (char.slots) {
          for (const lvl in char.slots) char.slots[lvl].used = 0;
        }
        saveChar(char);
        window.MTG_SFX && window.MTG_SFX.play("sparkle");
        toast("Long Rest completed! HP and spell slots fully restored. 🌙✨");
        render();
      };

      $$(".btn-pip").forEach((pip) => {
        pip.onclick = () => {
          const lvl = pip.dataset.lvl;
          const s = char.slots[lvl];
          if (!s) return;
          s.used = s.used >= s.total ? 0 : s.used + 1;
          saveChar(char);
          render();
        };
      });

      $("#btn-edit-hero").onclick = () => openHeroEditModal();
    }

    function openHeroEditModal() {
      const modal = $("#modal");
      if (!modal) return;
      modal.hidden = false;
      modal.innerHTML = `
        <div class="sheet">
          <h2>✏️ Edit Character Sheet</h2>
          <form id="hero-edit-form" style="margin-top:14px">
            <div class="field">
              <label>Name</label>
              <input type="text" id="he-name" value="${escapeHtml(char.name)}" required />
            </div>
            <div class="row" style="gap:10px;margin-top:10px">
              <div class="field grow">
                <label>Class</label>
                <input type="text" id="he-class" value="${escapeHtml(char.charClass)}" required />
              </div>
              <div class="field grow">
                <label>Race</label>
                <input type="text" id="he-race" value="${escapeHtml(char.race)}" required />
              </div>
            </div>
            <div class="row" style="gap:10px;margin-top:10px">
              <div class="field grow">
                <label>Max HP</label>
                <input type="number" id="he-maxhp" value="${char.maxHp}" min="1" required />
              </div>
              <div class="field grow">
                <label>AC</label>
                <input type="number" id="he-ac" value="${char.ac}" min="1" required />
              </div>
            </div>
            <div class="toolbar" style="margin-top:20px">
              <button type="submit" class="btn gold">Save Character</button>
              <button type="button" class="btn ghost" id="he-cancel">Cancel</button>
            </div>
          </form>
        </div>
      `;

      $("#he-cancel").onclick = () => { modal.hidden = true; };
      $("#hero-edit-form").onsubmit = (e) => {
        e.preventDefault();
        char.name = $("#he-name").value.trim();
        char.charClass = $("#he-class").value.trim();
        char.race = $("#he-race").value.trim();
        char.maxHp = parseInt($("#he-maxhp").value, 10) || char.maxHp;
        char.hp = Math.min(char.hp, char.maxHp);
        char.ac = parseInt($("#he-ac").value, 10) || char.ac;
        saveChar(char);
        modal.hidden = true;
        toast("Character updated! ✨");
        render();
      };
    }

    /* ==========================================================================
       4. 3D DICE ROLLER & COMBAT INITIATIVE VIEW
       ========================================================================== */
    function renderDiceView() {
      return `
        <div class="grid-2">
          <!-- Left: 3D Polyhedral Dice Roller -->
          <div class="card-panel">
            <h2>🎲 Polyhedral Dice Roller</h2>
            <p class="muted">Click any die to roll with realistic 3D tumbling physics and crit effects.</p>

            <div class="dnd-dice-grid" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px">
              ${DICE_TYPES.map(
                (d) => `
                <button type="button" class="btn ghost dnd-die-btn" data-die="${d.type}" data-max="${d.max}">
                  <span style="font-size:18px">${d.icon}</span> <b>${d.label}</b>
                </button>
              `
              ).join("")}
            </div>

            <div style="display:flex;align-items:center;gap:10px;margin-top:14px">
              <label class="muted" style="font-size:12px;margin:0">Modifier (+/-):</label>
              <input type="number" id="dice-mod" value="0" style="width:70px;padding:4px 8px;border-radius:6px;background:var(--bg);border:1px solid var(--line)" />
              <button type="button" class="btn small ghost" id="roll-with-mod-btn">Roll with Modifier</button>
            </div>

            <!-- 3D Dice Stage -->
            <div id="dice-animation-stage" style="margin-top:16px;min-height:200px;background:radial-gradient(ellipse at 50% 50%, var(--panel-2) 0%, var(--bg) 100%);border-radius:12px;border:1px solid var(--line);display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden">
              <div class="faint" id="dice-placeholder" style="text-align:center;padding:24px">
                <span style="font-size:36px">🎲</span>
                <p style="margin:8px 0 0">Click a die above to roll!</p>
              </div>
            </div>

            <!-- Result callout -->
            <div id="dice-result-banner" style="margin-top:12px;padding:12px;border-radius:8px;background:rgba(255,255,255,0.03);border:1px solid var(--line);display:flex;justify-content:space-between;align-items:center" hidden>
              <div id="dice-result-text" style="font-size:14px"></div>
              <div id="dice-result-big" style="font-size:24px;font-weight:900;color:var(--gold)"></div>
            </div>

            <!-- History -->
            <div class="section-title" style="font-size:12px;margin-top:18px">📜 Recent Rolls</div>
            <div id="dice-history-list" style="max-height:120px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin-top:6px">
              ${rollHistory.slice(0, 6).map((r) => `<div style="font-size:12px;padding:4px 8px;background:rgba(255,255,255,0.03);border-radius:4px" class="faint">${escapeHtml(r)}</div>`).join("")}
            </div>
          </div>

          <!-- Right: Combat Initiative Tracker -->
          <div class="card-panel">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <h2>⚔️ Combat Initiative Tracker</h2>
              <button type="button" class="btn small gold" id="btn-next-turn">Next Turn ⏭️</button>
            </div>
            <div style="display:flex;gap:8px;margin-top:12px">
              <input type="text" id="init-name" placeholder="Name (e.g. Orc)" style="flex:1" />
              <input type="number" id="init-roll" placeholder="Init" style="width:70px" />
              <button type="button" class="btn small gold" id="btn-add-init">Add</button>
            </div>

            <div style="margin-top:16px;display:flex;flex-direction:column;gap:6px">
              ${initiativeList
                .map(
                  (item, idx) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:${idx === currentTurnIndex ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.03)"};border-left:4px solid ${idx === currentTurnIndex ? "var(--gold)" : "transparent"};border-radius:6px">
                  <div style="display:flex;align-items:center;gap:8px">
                    <span style="font-weight:700">#${idx + 1}</span>
                    <span>${item.isHero ? "🧙" : "👹"}</span>
                    <b>${escapeHtml(item.name)}</b>
                  </div>
                  <div style="display:flex;align-items:center;gap:12px">
                    <span class="chip gold">${item.init}</span>
                    <button type="button" class="btn small ghost btn-del-init" data-idx="${idx}">✕</button>
                  </div>
                </div>
              `
                )
                .join("")}
            </div>
          </div>
        </div>
      `;
    }

    function bindDiceEvents() {
      $$(".dnd-die-btn").forEach((btn) => {
        btn.onclick = () => {
          const die = btn.dataset.die;
          const max = parseInt(btn.dataset.max, 10);
          rollDice(die, max);
        };
      });

      $("#roll-with-mod-btn").onclick = () => {
        const mod = parseInt($("#dice-mod").value, 10) || 0;
        rollDice("d20", 20, mod);
      };

      $("#btn-next-turn").onclick = () => {
        if (!initiativeList.length) return;
        currentTurnIndex = (currentTurnIndex + 1) % initiativeList.length;
        window.MTG_SFX && window.MTG_SFX.play("tap");
        render();
      };

      $("#btn-add-init").onclick = () => {
        const name = $("#init-name").value.trim();
        const init = parseInt($("#init-roll").value, 10) || Math.floor(Math.random() * 20) + 1;
        if (!name) return;
        initiativeList.push({ name, init, isHero: false });
        initiativeList.sort((a, b) => b.init - a.init);
        render();
      };

      $$(".btn-del-init").forEach((btn) => {
        btn.onclick = () => {
          const idx = parseInt(btn.dataset.idx, 10);
          initiativeList.splice(idx, 1);
          render();
        };
      });
    }

    function rollDice(dieType, max, mod = 0) {
      const stage = $("#dice-animation-stage");
      const banner = $("#dice-result-banner");
      const textEl = $("#dice-result-text");
      const bigEl = $("#dice-result-big");
      if (!stage) return;

      const raw = Math.floor(Math.random() * max) + 1;
      const total = raw + mod;

      window.MTG_SFX && window.MTG_SFX.play("draw");

      if (window.MTG_FX && window.MTG_FX.rollDnDDice) {
        window.MTG_FX.rollDnDDice(stage, max, (finalVal) => {
          showResult(dieType, max, raw, mod, total);
        });
      } else {
        showResult(dieType, max, raw, mod, total);
      }
    }

    function showResult(dieType, max, raw, mod, total) {
      const banner = $("#dice-result-banner");
      const textEl = $("#dice-result-text");
      const bigEl = $("#dice-result-big");
      if (!banner) return;

      banner.hidden = false;
      let extra = "";
      if (max === 20 && raw === 20) {
        extra = " 🌟 NATURAL 20! CRITICAL SUCCESS! ✨";
        window.MTG_SFX && window.MTG_SFX.play("victory");
      } else if (max === 20 && raw === 1) {
        extra = " 💀 NATURAL 1! CRITICAL FUMBLE!";
        window.MTG_SFX && window.MTG_SFX.play("concede");
      }

      textEl.innerHTML = `Rolled <b>${dieType.toUpperCase()}</b>: [${raw}] ${mod !== 0 ? (mod > 0 ? `+ ${mod}` : `- ${Math.abs(mod)}`) : ""}${extra}`;
      bigEl.textContent = total;

      const logEntry = `${new Date().toLocaleTimeString()} — ${dieType.toUpperCase()}: ${raw}${mod ? ` (${mod >= 0 ? `+${mod}` : mod})` : ""} = ${total}`;
      rollHistory.unshift(logEntry);
      render();
    }

    render();

    // Single teardown path. Removing the overlay alone left the RPGJS requestAnimationFrame
    // loop and the window keydown/keyup listeners running forever, burning CPU
    // and swallowing keys for the rest of the session.
    function closeDndOverlay() {
      if (rpgjsInstance) {
        rpgjsInstance.destroy();
        rpgjsInstance = null;
      }
      const ol = document.getElementById("dnd-full-overlay");
      if (ol) ol.remove();
      if (location.hash === "#/dnd") history.replaceState(null, "", "#/");
    }

    // Bind close button (re-bind after every render since innerHTML is replaced)
    function bindClose() {
      const closeBtn = document.getElementById("dnd-overlay-close");
      if (closeBtn) closeBtn.onclick = closeDndOverlay;
    }
    // Patch render to always re-bind after DOM refresh
    const _origRender = render;
    render = function(...args) {
      _origRender(...args);
      bindClose();
    };
    bindClose();
  };
  window.MTG_VIEWS = window.MTG_VIEWS || {};
  window.MTG_VIEWS.dnd = window.MTG.openDndModal;
})();
