/**
 * rpg-world/index.js
 *
 * Attaches an RPGJS v4 server engine to the existing http.Server instance.
 * Uses socket.io on /rpg-socket so it does NOT conflict with the existing
 * native WebSocket at /ws used for card game tables.
 */

'use strict';

const { Server: SocketIoServer } = require('socket.io');
const { Transmitter } = require('simple-room');
// Disable msgpack binary encoding so packets arrive as standard JS objects/arrays
Transmitter.encode = false;

const {
  entryPoint,
  RpgModule,
  RpgPlayer,
  RpgEvent,
  EventMode,
  RpgMap,
  Speed,
  MapData,
  EventData,
} = require('@rpgjs/server');

// ── Sparring Dummy event ─────────────────────────────────────────────────────
class SparringDummy extends RpgEvent {}
EventData({
  name: 'sparring-dummy',
  mode: EventMode.Shared,
  hitbox: { width: 36, height: 36 },
})(SparringDummy);

SparringDummy.prototype.onInit = function() {
  this.speed = Speed.Slow;
  this.hp = 100;
  this.maxHp = 100;
};
SparringDummy.prototype.onAction = async function(event, player) {
  player.emit('open-sparring', { dummyId: this.id, hp: this.hp, maxHp: this.maxHp });
};

// ── Sparky Familiar NPC event ────────────────────────────────────────────────
class SparkyNPC extends RpgEvent {}
EventData({
  name: 'sparky-familiar',
  mode: EventMode.Shared,
  hitbox: { width: 32, height: 32 },
})(SparkyNPC);

SparkyNPC.prototype.onInit = function() {
  this.speed = Speed.Slow;
};
SparkyNPC.prototype.onAction = async function(event, player) {
  player.emit('open-sparky', { npcId: this.id });
};

// ── Map files ─────────────────────────────────────────────────────────────────
// MapData.file must be a PATH STRING. Passing a plain object throws inside
// TiledParserFile.typeOfFile(), which calls file.trim() before any type check.
// Two further constraints the format imposes, both learned the hard way:
//   1. the tilesets list must contain at least one inline tileset, or
//      parseFile()'s callback is never invoked and parseTmx() hangs forever;
//   2. a layer of all-zero gids is read as solid everywhere (a zero gid has no
//      tileset entry, so the collision lookup falls back to "blocked"), so
//      walkable ground must carry a real non-collision gid.
const path = require('path');

const homeroomFile = path.join(__dirname, 'maps', 'homeroom.tmx');
const arenaFile    = path.join(__dirname, 'maps', 'arena.tmx');

// ── Homeroom Map (1280 × 800 — 40×25 32px tiles) ──────────────────────────────
class HomeroomMap extends RpgMap {}
MapData({
  id: 'homeroom',
  name: 'Overworld',
  events: [
    { event: SparringDummy, x: 680, y: 320 },
    { event: SparkyNPC, x: 520, y: 220 },
  ],
  file: homeroomFile,
})(HomeroomMap);

// ── Arena Map (960 × 640 — 30×20 32px tiles) ──────────────────────────────────
class ArenaMap extends RpgMap {}
MapData({
  id: 'arena',
  name: 'The Grand Arena',
  events: [],
  file: arenaFile,
})(ArenaMap);

// ── RPG Module ────────────────────────────────────────────────────────────────
class MtgWorldModule {}
RpgModule({
  player: {
    props: {
      avatar: String,
      displayName: String,
      activeDeck: String,
      gold: Number,
    },
    onConnected(player) {
      console.log('🎮 [RPGJS SERVER] Player onConnected hook fired for player:', player.id);
      player.setHitbox(24, 24);
      player.speed = Speed.Normal;
      player.hp    = 100;
      player.maxHp = 100;

      // Listen for custom client signals over socket
      const socket = player._socket;
      if (socket) {
        socket.on('auth', (info) => {
          if (!info) return;
          if (info.displayName) {
            player.name = String(info.displayName).slice(0, 32);
            player.displayName = player.name;
          }
          if (info.avatar) player.avatar = String(info.avatar);
          if (info.activeDeck) player.activeDeck = String(info.activeDeck);
          if (typeof info.gold === 'number') player.gold = info.gold;
        });

        socket.on('playerMove', (data) => {
          if (!data) return;
          if (typeof data.x === 'number' && typeof data.y === 'number') {
            player.position.x = data.x;
            player.position.y = data.y;
          }
          if (typeof data.dir === 'number') player.direction = data.dir;
          player.moving = !!data.moving;
        });

        socket.on('castSpell', (spellData) => {
          if (!spellData) return;
          socket.broadcast.emit('remoteSpell', {
            playerId: player.id,
            spell: spellData,
          });
        });

        socket.on('sparringDamage', (data) => {
          const dmg = (data && data.damage) || 25;
          socket.broadcast.emit('remoteSparringDamage', {
            playerId: player.id,
            damage: dmg,
          });
        });

        socket.on('chat', (data) => {
          if (!data || !data.text) return;
          const map = player.getCurrentMap();
          const chatMsg = {
            id: player.id,
            name: player.name || 'Planeswalker',
            avatar: player.avatar || '🧙',
            text: String(data.text).slice(0, 140),
            time: Date.now(),
          };
          if (map) {
            for (let uid in map.users) {
              const u = map.users[uid];
              u?._socket?.emit('chat', chatMsg);
            }
          }
        });
      }

      player.changeMap('homeroom', { x: 600, y: 440 }).then(() => {
        console.log('🎮 [RPGJS SERVER] player.changeMap homeroom complete for player:', player.id);
      }).catch((e) => console.error('🎮 [RPGJS SERVER] changeMap error:', e));
    },
    onDead(player) {
      player.hp = player.maxHp;
      player.teleport({ x: 600, y: 440 });
    },
  },
  maps:   [HomeroomMap, ArenaMap],
  events: [SparringDummy, SparkyNPC],
})(MtgWorldModule);

// ── Public API ────────────────────────────────────────────────────────────────
async function attachRpgWorld(httpServer) {
  const servers = Array.isArray(httpServer) ? httpServer : [httpServer];
  const io = new SocketIoServer({
    path:  '/rpg-socket',
    cors: { origin: '*', methods: ['GET', 'POST'] },
    maxHttpBufferSize: 1e8,
  });
  for (const s of servers) io.attach(s);

  let engine;
  try {
    engine = await entryPoint([{ server: MtgWorldModule }], {
      io,
      globalConfig: {
        stepRate:           60,
        updateRate:         10,
        timeoutInterval:    0,
        countConnections:   false,
      },
    });
    await engine.start();
    console.log('🎮 RPGJS world engine started (socket.io on /rpg-socket)');
  } catch (err) {
    console.error('⚠️  RPGJS failed to start:', err.message);
  }

  return engine;
}

module.exports = { attachRpgWorld };
