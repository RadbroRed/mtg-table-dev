/**
 * public/js/rpg-client.js
 *
 * Connects to the RPGJS v4 server engine (socket.io at /rpg-socket).
 * Sends keyboard/mouse inputs and spells to the server, receives authoritative
 * world state, and feeds other players into `window.mmoPlayers` so the rpg.js
 * canvas renders them in real time.
 *
 * Also manages the Sparring Dummy grounds and Sparky familiar dialogue.
 */
(() => {
  'use strict';

  // Key names RPGJS understands (1: Up, 2: Right, 3: Down, 4: Left, 'action')
  const KEY_DIR = {
    ArrowUp:    1, w: 1, W: 1,
    ArrowRight: 2, d: 2, D: 2,
    ArrowDown:  3, s: 3, S: 3,
    ArrowLeft:  4, a: 4, A: 4,
  };

  let socket = null;
  let myId   = null;
  let moveFrame = 1;
  let lastMoveSend = 0;

  function connectRpg() {
    if (typeof io === 'undefined') {
      console.warn('[rpg-client] socket.io not loaded yet, retrying…');
      setTimeout(connectRpg, 1000);
      return;
    }

    socket = io({
      path:       '/rpg-socket',
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });

    // ── Server assigns player id ─────────────────────────────────────────
    socket.on('uid', (id) => {
      myId = id;
      console.log('🎮 [rpg-client] connected, playerId:', myId);
      sendAuth();
    });

    socket.on('playerJoined', (data) => {
      if (data && data.playerId) {
        myId = data.playerId;
        console.log('🎮 [rpg-client] playerJoined, playerId:', myId);
        sendAuth();
      }
    });

    socket.on('connect', () => {
      console.log('🎮 [rpg-client] socket connected');
      sendAuth();
    });

    socket.on('connect_error', (err) => {
      console.warn('[rpg-client] RPGWS engine connection notice: ' +
        (err && err.message ? err.message : err));
    });

    // ── World state broadcast ('w' packet) ───────────────────────────────
    socket.on('w', (packet) => {
      try {
        let payload = packet;
        if (Array.isArray(packet)) {
          payload = packet[2]; // [roomId, timestamp, data]
        }
        if (!payload || typeof payload !== 'object') return;

        const mmoPlayers = window.mmoPlayers;
        if (!mmoPlayers) return;

        // 1. Process Users (Players)
        if (payload.users && typeof payload.users === 'object') {
          for (const [id, u] of Object.entries(payload.users)) {
            if (!u) continue;

            if (id === myId) {
              if (u.position) syncHeroFromServer(u.position, u.direction);
              continue;
            }

            const existing = mmoPlayers.get(id) || {
              id,
              x: 600,
              y: 440,
              dir: 0,
              moving: false,
              avatar: '🧙',
              name: 'Planeswalker',
            };

            if (u.position) {
              existing.x = u.position.x;
              existing.y = u.position.y;
            }
            if (u.direction !== undefined) existing.dir = u.direction;
            if (u.moving !== undefined) existing.moving = u.moving;
            if (u.name) existing.name = u.name;
            if (u.displayName) existing.name = u.displayName;
            if (u.avatar) existing.avatar = u.avatar;
            existing.lastSeen = Date.now();

            mmoPlayers.set(id, existing);
          }
        }

        // 2. Process Events (Sparring Dummy, Sparky, etc.)
        if (payload.events && typeof payload.events === 'object') {
          window.rpgEvents = window.rpgEvents || new Map();
          for (const [eid, ev] of Object.entries(payload.events)) {
            if (!ev) continue;
            const cur = window.rpgEvents.get(eid) || { id: eid };
            if (ev.position) {
              cur.x = ev.position.x;
              cur.y = ev.position.y;
            }
            if (ev.name) cur.name = ev.name;
            if (ev.hp !== undefined) cur.hp = ev.hp;
            window.rpgEvents.set(eid, cur);
          }
        }
      } catch (err) {
        // non-fatal, ticks 60fps
      }
    });

    // ── Custom events from server ────────────────────────────────────────
    socket.on('open-sparring', (data) => {
      openSparringOverlay(data);
    });

    socket.on('open-sparky', (data) => {
      if (window.MTG_RPG?.openSparkyDialog) {
        window.MTG_RPG.openSparkyDialog();
      }
    });

    socket.on('remoteSpell', (data) => {
      if (data && data.spell && window.MTG_RPG?.spawnRemoteSpell) {
        window.MTG_RPG.spawnRemoteSpell(data.spell);
      }
    });

    socket.on('remoteSparringDamage', (data) => {
      if (window.MTG_RPG?.onRemoteSparringDamage) {
        window.MTG_RPG.onRemoteSparringDamage(data.damage);
      }
    });

    socket.on('chat', (data) => {
      if (data && data.text && window.MTG_RPG?.addLog) {
        window.MTG_RPG.addLog('say', data.text, data.name || 'Planeswalker');
      }
    });

    socket.on('disconnect', () => {
      console.log('🎮 [rpg-client] disconnected from RPGJS world');
    });

    // ── Keyboard input listener ──────────────────────────────────────────
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (e.target && e.target.matches && e.target.matches('input, textarea')) return;
      const dir = KEY_DIR[e.key];
      if (dir && socket && socket.connected) {
        socket.emit('move', { input: [dir], frame: ++moveFrame });
      }
      if (e.key === ' ' || e.key === 'Enter') {
        if (socket && socket.connected) {
          socket.emit('move', { input: ['action'], frame: ++moveFrame });
        }
      }
    });
  }

  // ── Sync our hero from server state ──────────────────────────────────────
  function syncHeroFromServer(pos, dir) {
    if (!window._rpgHero || !pos) return;
    const h = window._rpgHero;
    if (typeof pos.x === 'number') h.serverX = pos.x;
    if (typeof pos.y === 'number') h.serverY = pos.y;
    if (dir !== undefined) h.serverDir = dir;
  }

  // ── Send player authentication & metadata ────────────────────────────────
  function sendAuth() {
    if (!socket || !socket.connected) return;
    try {
      const user = window.MTG?.getCachedUser?.(window.MTG_SECOND);
      const name = (user && (user.displayName || user.username)) || 'Planeswalker';
      const avatar = user?.avatar || '🧙';
      const gold = (user && typeof user.balance === 'number') ? user.balance : 0;
      const did = sessionStorage.getItem('mtg-selected-deck') || '';

      socket.emit('auth', {
        displayName: name,
        avatar: avatar,
        userId: user?.id || myId,
        activeDeck: did,
        gold: gold,
      });
    } catch (e) {
      // non-fatal
    }
  }

  // ── Send movement to server ──────────────────────────────────────────────
  function sendMove({ x, y, dir, moving }) {
    if (!socket || !socket.connected) return;
    const now = Date.now();
    if (now - lastMoveSend < 45) return; // ~22Hz rate limit
    lastMoveSend = now;
    socket.emit('playerMove', { x, y, dir, moving });
  }

  // ── Send spell cast to other players ─────────────────────────────────────
  function onCastSpell(spellData) {
    if (!socket || !socket.connected) return;
    socket.emit('castSpell', spellData);
  }

  // ── Send sparring damage to server ───────────────────────────────────────
  function onSparringHit(damage) {
    if (!socket || !socket.connected) return;
    socket.emit('sparringDamage', { damage });
  }

  // ── Interactive Sparring Grounds Overlay ─────────────────────────────────
  function openSparringOverlay(data = {}) {
    let ol = document.getElementById('sparring-overlay');
    if (!ol) {
      ol = document.createElement('div');
      ol.id = 'sparring-overlay';
      ol.className = 'sparring-overlay-modal';
      ol.style.cssText = [
        'position:fixed;inset:0;z-index:100070',
        'background:rgba(8,12,20,0.95)',
        'display:flex;flex-direction:column;align-items:center;justify-content:center',
        'color:#efece3;font-family:system-ui,sans-serif',
        'backdrop-filter:blur(6px)',
      ].join(';');
      document.body.appendChild(ol);
    }
    if (window.MTG?.bringToFront) {
      window.MTG.bringToFront(ol);
    } else {
      ol.style.zIndex = '100070';
    }
    ol.hidden = false;

    let dummyHp = typeof data.hp === 'number' ? data.hp : 100;
    let dummyMax = typeof data.maxHp === 'number' ? data.maxHp : 100;

    ol.innerHTML = `
      <div style="max-width:540px;width:92%;background:rgba(18,24,38,0.92);border:2px solid #d7b45c;border-radius:14px;padding:24px;box-shadow:0 0 35px rgba(215,180,92,0.3);text-align:center">
        <div style="font-size:42px;margin-bottom:4px;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.5))">🎯</div>
        <h2 style="color:#f3dd9a;font-size:1.6rem;margin:0 0 6px;font-family:'Georgia',serif">⚔️ Sparring Grounds</h2>
        <p style="color:#9aa4b2;font-size:13px;margin:0 0 16px">Face the enchanted training dummy to practice spells, combos, and earn battle rewards!</p>

        <!-- HP Bar -->
        <div style="margin-bottom:16px;background:rgba(0,0,0,0.5);padding:10px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.1)">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:#d7b45c;margin-bottom:6px">
            <b>Dummy HP</b>
            <span id="spar-hp-num">${dummyHp} / ${dummyMax}</span>
          </div>
          <div style="background:rgba(255,255,255,0.1);border-radius:6px;height:14px;width:100%;overflow:hidden">
            <div id="spar-hp-bar" style="height:100%;background:linear-gradient(90deg,#ef4444,#f97316);border-radius:6px;transition:width 0.25s;width:${(dummyHp/dummyMax)*100}%"></div>
          </div>
        </div>

        <!-- Combat Log -->
        <div id="sparring-log" style="background:rgba(0,0,0,0.45);border:1px solid rgba(215,180,92,0.25);border-radius:8px;padding:12px;min-height:90px;max-height:140px;overflow-y:auto;text-align:left;font-size:12px;line-height:1.5;margin-bottom:16px"></div>

        <!-- Actions -->
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <button id="spar-fireball" class="btn gold">🔥 Fireball (-35)</button>
          <button id="spar-frost"    class="btn ghost" style="border-color:#38bdf8;color:#38bdf8">❄️ Frost Nova (-25)</button>
          <button id="spar-heal"     class="btn ghost" style="border-color:#4ade80;color:#4ade80">💚 Heal (+30)</button>
          <button id="spar-close"    class="btn ghost" style="margin-left:12px">🚪 Leave</button>
        </div>
      </div>
    `;

    const log = ol.querySelector('#sparring-log');
    const bar = ol.querySelector('#spar-hp-bar');
    const num = ol.querySelector('#spar-hp-num');

    function addLog(msg, color = '#efece3') {
      const d = document.createElement('div');
      d.style.color = color;
      d.innerHTML = msg;
      log.appendChild(d);
      log.scrollTop = log.scrollHeight;
    }

    function updateBar() {
      bar.style.width = Math.max(0, (dummyHp / dummyMax) * 100) + '%';
      num.textContent = `${dummyHp} / ${dummyMax}`;
      if (dummyHp <= 0) {
        window.MTG_SFX && window.MTG_SFX.play('victory');
        addLog('🏆 <b>Dummy defeated!</b> +50 $TCG & +100 XP gained!', '#fbbf24');
        if (window.MTG_RPG?.addGold) {
          window.MTG_RPG.addGold(50);
        }
        if (window.MTG?.toast) {
          window.MTG.toast('🎯 Sparring Dummy defeated! +50 $TCG!');
        }
        dummyHp = dummyMax;
        setTimeout(() => {
          updateBar();
          addLog('✨ The dummy reforms from enchanted wood and straw.', '#9aa4b2');
        }, 1200);
      }
    }

    addLog('⚔️ <i>Sparring match commenced. Cast spells to attack the dummy!</i>', '#d7b45c');

    ol.querySelector('#spar-fireball').onclick = () => {
      const dmg = 30 + Math.floor(Math.random() * 15);
      dummyHp = Math.max(0, dummyHp - dmg);
      window.MTG_SFX && window.MTG_SFX.play('cast');
      onSparringHit(dmg);
      addLog(`🔥 Fireball strikes with a fiery blast! <b>-${dmg} damage</b>`, '#f97316');
      updateBar();
    };

    ol.querySelector('#spar-frost').onclick = () => {
      const dmg = 20 + Math.floor(Math.random() * 10);
      dummyHp = Math.max(0, dummyHp - dmg);
      window.MTG_SFX && window.MTG_SFX.play('tap');
      onSparringHit(dmg);
      addLog(`❄️ Frost Nova freezes the training dummy! <b>-${dmg} damage</b>`, '#38bdf8');
      updateBar();
    };

    ol.querySelector('#spar-heal').onclick = () => {
      window.MTG_SFX && window.MTG_SFX.play('sparkle');
      if (window._rpgHero) {
        window._rpgHero.hp = Math.min(window._rpgHero.maxHp, window._rpgHero.hp + 30);
      }
      addLog('💚 You channel restorative mana and heal for <b>+30 Life</b>.', '#4ade80');
    };

    ol.querySelector('#spar-close').onclick = () => {
      ol.remove();
    };
  }

  // ── Boot ─────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', connectRpg);
  } else {
    connectRpg();
  }

  function sendChat(text) {
    if (socket && socket.connected && text) {
      socket.emit('chat', { text });
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────
  window.MTG_RPG_CLIENT = {
    getSocket: () => socket,
    getMyId:   () => myId,
    sendMove,
    sendChat,
    onCastSpell,
    onSparringHit,
    openSparring: openSparringOverlay,
    sendAuth,
  };
})();
