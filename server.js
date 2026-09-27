#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const https = require("https");
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const express = require("express");
const { WebSocketServer } = require("ws");
const { attachRpgWorld } = require("./rpg-world");
const { ethers } = require("ethers");

const ROOT = __dirname;

// The card catalog ships with the code and is read-only, so it stays in the
// checkout. Everything mutable — accounts, tables, guilds, decks, avatars,
// the image cache and the token secret — lives in DATA.
//
// DATA defaults to ./data for local dev, but a deployment should point it
// somewhere durable (DATA_DIR=/var/lib/mtg-table) so replacing the code
// directory on deploy can't destroy player data. The catalog is not looked
// up under DATA.
const DATA = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(ROOT, "data");

const CATALOG = path.join(ROOT, "data");

const DECKS_DIR = path.join(DATA, "decks");
const IMG_DIR = path.join(DATA, "images");
const PUBLIC = path.join(ROOT, "public");
const CARDS_PATH = path.join(CATALOG, "cards.json");
const META_PATH = path.join(CATALOG, "catalog-meta.json");

const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8888);

fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(DECKS_DIR, { recursive: true });
fs.mkdirSync(path.join(IMG_DIR, "normal"), { recursive: true });
fs.mkdirSync(path.join(IMG_DIR, "small"), { recursive: true });
const AVATARS_DIR = path.join(DATA, "avatars");
fs.mkdirSync(AVATARS_DIR, { recursive: true });

const USERS_PATH = path.join(DATA, "users.json");

let users = [];
function loadUsers() {
  if (fs.existsSync(USERS_PATH)) {
    try {
      users = JSON.parse(fs.readFileSync(USERS_PATH, "utf8"));
    } catch {
      users = [];
    }
  } else {
    users = [];
  }
}
function saveUsers() {
  const tmp = `${USERS_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), "utf8");
  fs.renameSync(tmp, USERS_PATH);
}
loadUsers();

const DAO_PATH = path.join(DATA, "dao.json");
let daoData = {
  balance: 15000,
  feePercent: 3,
  totalCollected: 0,
  transactions: [],
  proposals: [],
};
function loadDaoData() {
  if (fs.existsSync(DAO_PATH)) {
    try {
      daoData = JSON.parse(fs.readFileSync(DAO_PATH, "utf8"));
      if (typeof daoData.feePercent !== "number") daoData.feePercent = 3;
      if (!Array.isArray(daoData.transactions)) daoData.transactions = [];
      if (!Array.isArray(daoData.proposals)) daoData.proposals = [];
    } catch {
      /* ignore */
    }
  }
}
function saveDaoData() {
  const tmp = `${DAO_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(daoData, null, 2), "utf8");
  fs.renameSync(tmp, DAO_PATH);
}
loadDaoData();

// Sessions are stateless signed tokens now; there is no server-side session
// store to load or persist.
const SESSIONS_PATH = path.join(DATA, "sessions.json");
const GUILDS_PATH = path.join(DATA, "guilds.json");
const LEAGUES_PATH = path.join(DATA, "leagues.json");
const DND_PATH = path.join(DATA, "dnd.json");

let guilds = [];
function loadGuilds() {
  if (fs.existsSync(GUILDS_PATH)) {
    try {
      guilds = JSON.parse(fs.readFileSync(GUILDS_PATH, "utf8"));
      if (!Array.isArray(guilds)) guilds = [];
    } catch { guilds = []; }
  }
}
function saveGuilds() {
  try {
    const tmp = `${GUILDS_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(guilds, null, 2), "utf8");
    fs.renameSync(tmp, GUILDS_PATH);
  } catch {}
}
loadGuilds();

let leagues = [];
function loadLeagues() {
  if (fs.existsSync(LEAGUES_PATH)) {
    try {
      leagues = JSON.parse(fs.readFileSync(LEAGUES_PATH, "utf8"));
      if (!Array.isArray(leagues)) leagues = [];
    } catch { leagues = []; }
  }
}
function saveLeagues() {
  try {
    const tmp = `${LEAGUES_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(leagues, null, 2), "utf8");
    fs.renameSync(tmp, LEAGUES_PATH);
  } catch {}
}
loadLeagues();

let dndData = { campaigns: [], maps: [] };
function loadDndData() {
  if (fs.existsSync(DND_PATH)) {
    try {
      dndData = JSON.parse(fs.readFileSync(DND_PATH, "utf8"));
      if (!Array.isArray(dndData.campaigns)) dndData.campaigns = [];
      if (!Array.isArray(dndData.maps)) dndData.maps = [];
    } catch { dndData = { campaigns: [], maps: [] }; }
  }
}
function saveDndData() {
  try {
    const tmp = `${DND_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(dndData, null, 2), "utf8");
    fs.renameSync(tmp, DND_PATH);
  } catch {}
}
loadDndData();

const FRIENDS_PATH = path.join(DATA, "friends.json");
let friendsData = { friendships: [], requests: [] };
function loadFriends() {
  if (fs.existsSync(FRIENDS_PATH)) {
    try {
      friendsData = JSON.parse(fs.readFileSync(FRIENDS_PATH, "utf8"));
      if (!Array.isArray(friendsData.friendships)) friendsData.friendships = [];
      if (!Array.isArray(friendsData.requests)) friendsData.requests = [];
    } catch {
      friendsData = { friendships: [], requests: [] };
    }
  } else {
    friendsData = { friendships: [], requests: [] };
  }
}
function saveFriends() {
  try {
    const tmp = `${FRIENDS_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(friendsData, null, 2), "utf8");
    fs.renameSync(tmp, FRIENDS_PATH);
  } catch {}
}
loadFriends();

// ---------------------------------------------------------------------------
// Auth: wallet-only. No passwords are stored or accepted anywhere.
// ---------------------------------------------------------------------------

// Signing secret. Prefer AUTH_SECRET from the environment (required in prod);
// otherwise generate one once and persist it outside version control.
function loadAuthSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const p = path.join(DATA, ".auth-secret");
  try {
    if (fs.existsSync(p)) {
      const v = fs.readFileSync(p, "utf8").trim();
      if (v) return v;
    }
  } catch {}
  const generated = crypto.randomBytes(32).toString("hex");
  try {
    fs.writeFileSync(p, generated, "utf8");
    fs.chmodSync(p, 0o600);
  } catch {}
  return generated;
}

const AUTH_SECRET = loadAuthSecret();
const TOKEN_TTL_SEC = Number(process.env.AUTH_TTL_SEC || 24 * 60 * 60); // 24h default

// Revoked token ids (jti), so logout still works with stateless tokens.
const REVOKED_TOKENS = new Set();

// Users whose wallet was unlinked — all their tokens are rejected.
const REVOKED_BY_USER = new Set();

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

function issueToken(user) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const iat = Math.floor(Date.now() / 1000);
  const payload = b64url(
    JSON.stringify({
      sub: user.id,
      username: user.username,
      jti: crypto.randomBytes(12).toString("hex"),
      iat,
      exp: iat + TOKEN_TTL_SEC,
    })
  );
  const sig = crypto.createHmac("sha256", AUTH_SECRET).update(`${header}.${payload}`).digest("base64url");
  return { token: `${header}.${payload}.${sig}`, jti: JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).jti };
}

function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [header, payload, sig] = parts;
  const expected = crypto.createHmac("sha256", AUTH_SECRET).update(`${header}.${payload}`).digest("base64url");
  const a = Buffer.from(String(sig));
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!claims || !claims.sub || !claims.exp) return null;
  if (claims.exp * 1000 < Date.now()) return null;
  if (claims.jti && REVOKED_TOKENS.has(claims.jti)) return null;
  if (REVOKED_BY_USER.has(claims.sub)) return null;
  return claims;
}

// Single-use sign-in challenges. The server builds the canonical message, the
// wallet signs it verbatim, and the nonce is consumed on first successful use.
// This is what makes a captured signature useless to an attacker.
const SIGNIN_CHALLENGES = new Map();
const CHALLENGE_TTL_MS = Number(process.env.CHALLENGE_TTL_SEC || 300) * 1000;

function pruneChallenges() {
  const t = Date.now();
  for (const [nonce, c] of SIGNIN_CHALLENGES) {
    if (c.expiresAt < t) SIGNIN_CHALLENGES.delete(nonce);
  }
}

function buildSignInMessage({ domain, origin, address, chain, nonce }) {
  const issuedAt = new Date().toISOString();
  if (chain === "solana") {
    return `Sign in to The Crypto Game:\nAddress: ${address}\nURI: ${origin}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
  }
  return `${domain} wants you to sign in with your Ethereum account:\n${address}\n\nSign in to The Crypto Game on Sepolia Testnet (Chain ID: 11155111).\n\nURI: ${origin}\nVersion: 1\nChain ID: 11155111\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
}

// Returns an error string, or null when the challenge is valid. Consumes it.
function consumeChallenge(nonce, message, address) {
  pruneChallenges();
  const c = SIGNIN_CHALLENGES.get(nonce);
  if (!c) return "Sign-in challenge is unknown or expired. Please try again.";
  if (c.used) return "Sign-in challenge has already been used.";
  if (c.expiresAt < Date.now()) {
    SIGNIN_CHALLENGES.delete(nonce);
    return "Sign-in challenge has expired. Please try again.";
  }
  if (c.address.toLowerCase() !== String(address).toLowerCase()) {
    return "Sign-in challenge was issued for a different address.";
  }
  if (c.message !== message) return "Signed message does not match the issued challenge.";
  c.used = true;
  SIGNIN_CHALLENGES.delete(nonce);
  return null;
}

function findUserById(id) {
  return users.find((u) => u.id === id);
}

function findUserByUsername(username) {
  const un = String(username || "").trim().toLowerCase();
  return users.find((u) => u.username && u.username.toLowerCase() === un);
}

function isUserAdmin(u) {
  if (!u) return false;
  return !!u.isAdmin || (u.username && u.username.toLowerCase() === "amber");
}

function sanitizeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName || u.username,
    avatar: u.avatar || null,
    bio: u.bio || "",
    balance: typeof u.balance === "number" ? u.balance : 1000,
    wins: u.wins || 0,
    losses: u.losses || 0,
    stats: {
      streak: (u.stats && u.stats.streak) || 0,
      bestStreak: (u.stats && u.stats.bestStreak) || (u.wins ? 1 : 0),
      totalWon: (u.stats && u.stats.totalWon) || (u.wins ? u.wins * 200 : 0),
      spellsCast: (u.stats && u.stats.spellsCast) || 0,
      favoriteFormat: (u.stats && u.stats.favoriteFormat) || "duel",
      games: (u.stats && u.stats.games) || 0,
      botWins: (u.stats && u.stats.botWins) || 0,
      botLosses: (u.stats && u.stats.botLosses) || 0,
      packsOpened: (u.stats && u.stats.packsOpened) || 0,
      cardsOpened: (u.stats && u.stats.cardsOpened) || 0,
      goldEarned: (u.stats && u.stats.goldEarned) || 0,
      goldSpent: (u.stats && u.stats.goldSpent) || 0,
      draftsPlayed: (u.stats && u.stats.draftsPlayed) || 0,
      draftWins: (u.stats && u.stats.draftWins) || 0,
      questsDone: (u.stats && u.stats.questsDone) || 0,
      daoVotes: (u.stats && u.stats.daoVotes) || 0,
      friendsMade: (u.stats && u.stats.friendsMade) || 0,
    },
    collectionCount: Object.keys(u.collection || {}).length,
    achievements: u.achievements || {},
    badges: Array.isArray(u.badges) ? u.badges : [],
    walletAddress: u.walletAddress || null,
    walletChain: u.walletChain || null,
    isGuest: !!u.isGuest,
    isAdmin: isUserAdmin(u),
    created: u.created,
  };
}

const guestUsers = new Map(); // playerId -> { id, username, displayName, balance, wins, losses, isGuest }

function getPlayerRecord(seat) {
  if (!seat) return null;
  if (seat.userId) {
    const u = findUserById(seat.userId);
    if (u) return u;
  }
  if (seat.playerId) {
    if (!guestUsers.has(seat.playerId)) {
      guestUsers.set(seat.playerId, {
        id: seat.playerId,
        username: seat.name || "Guest",
        displayName: seat.name || "Guest",
        balance: 1000,
        wins: 0,
        losses: 0,
        isGuest: true,
      });
    }
    return guestUsers.get(seat.playerId);
  }
  return null;
}

function uid(n = 8) {
  return crypto.randomBytes(n).toString("hex").slice(0, n);
}

function now() {
  return Date.now();
}

const PHASES = ["untap", "upkeep", "draw", "main1", "combat", "main2", "end"];
const FORMAT_LIFE = { duel: 20, commander: 40, pauper: 20, modern: 20, casual: 20 };

function lanAddresses() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const [name, addrs] of Object.entries(ifs)) {
    if (!addrs) continue;
    for (const a of addrs) {
      if (a.family !== "IPv4" || a.internal) continue;
      if (name.startsWith("tailscale") || a.address.startsWith("100.")) continue;
      out.push({ iface: name, address: a.address });
    }
  }
  return out;
}

// The origin handed to clients in share links, and the one a wallet signs
// against. On a LAN box that is a local interface; behind a proxy or in the
// cloud there is no useful interface address, so PUBLIC_URL names the public
// origin. It must be the https origin with no trailing slash.
function preferLanUrl() {
  const configured = (process.env.PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const addrs = lanAddresses();
  const eth = addrs.find((a) => a.iface.startsWith("en") || a.iface.startsWith("eth"));
  const pick = eth || addrs[0];
  const host = pick ? pick.address : "127.0.0.1";
  return `https://${host}:${PORT}`;
}

console.log("loading card catalog…");
const cards = JSON.parse(fs.readFileSync(CARDS_PATH, "utf8"));
const OLD_PRINTINGS_PATH = path.join(CATALOG, "old-printings.json");
const OLD_SETS_PATH = path.join(CATALOG, "old-sets.json");
const oldPrintings = fs.existsSync(OLD_PRINTINGS_PATH)
  ? JSON.parse(fs.readFileSync(OLD_PRINTINGS_PATH, "utf8"))
  : [];
const oldSets = fs.existsSync(OLD_SETS_PATH)
  ? JSON.parse(fs.readFileSync(OLD_SETS_PATH, "utf8"))
  : [];

// Merge any unique cards from oldPrintings into cards if not already present
const existingCardNames = new Set(cards.map((c) => c.name.toLowerCase().trim()));
for (const c of oldPrintings) {
  const k = c.name.toLowerCase().trim();
  if (!existingCardNames.has(k)) {
    existingCardNames.add(k);
    cards.push(c);
  }
}

function computeCardHay(c) {
  const parts = [
    c.name,
    c.type_line,
    c.oracle_text,
    c.set,
    c.set_name,
    ...(c.keywords || []),
  ];
  if (c.faces) {
    for (const f of c.faces) {
      if (f.name) parts.push(f.name);
      if (f.type_line) parts.push(f.type_line);
      if (f.oracle_text) parts.push(f.oracle_text);
    }
  }
  const raw = parts.filter(Boolean).join(" ").toLowerCase();
  const noDiacritics = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const noPunct = noDiacritics.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");
  const noApos = noDiacritics.replace(/[\x27\x60\u2019]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ");
  return (raw + " " + noPunct + " " + noApos).toLowerCase();
}

for (const c of cards) c._hay = computeCardHay(c);
for (const c of oldPrintings) c._hay = computeCardHay(c);

// Build full sets list including Modern / Expansions from cards.json
const knownSetCodes = new Set();
for (const g of oldSets) {
  for (const s of g.sets || []) knownSetCodes.add(s.code);
}
const extraSetMap = new Map();
for (const c of cards) {
  const code = (c.set || "").toLowerCase();
  if (!code || knownSetCodes.has(code)) continue;
  if (!extraSetMap.has(code)) {
    extraSetMap.set(code, { code, name: c.set_name || code.toUpperCase(), count: 0 });
  }
  extraSetMap.get(code).count++;
}
const modernExpansions = [...extraSetMap.values()].sort((a, b) => a.name.localeCompare(b.name));
const allSetGroups = [...oldSets];
if (modernExpansions.length) {
  allSetGroups.push({
    id: "modern_expansions",
    name: "Modern & Other Expansions",
    sets: modernExpansions,
  });
}

const setsInGroup = new Map();
for (const g of allSetGroups) {
  setsInGroup.set(g.id, new Set((g.sets || []).map((s) => s.code)));
}
const byId = new Map();
const byName = new Map();
const tokens = [];

function indexName(name, card) {
  const key = name.toLowerCase().trim();
  if (!byName.has(key)) byName.set(key, card);
  const stripped = key.replace(/[^a-z0-9]+/g, " ").trim();
  if (stripped && !byName.has(stripped)) byName.set(stripped, card);
}

for (const c of cards) {
  byId.set(c.id, c);
  indexName(c.name, c);
  if (c.name.includes(" // ")) {
    for (const part of c.name.split(" // ")) indexName(part, c);
  }
  if (c.faces) {
    for (const f of c.faces) if (f.name) indexName(f.name, c);
  }
  if (c.token) tokens.push(c);
}
for (const c of oldPrintings) {
  if (!byId.has(c.id)) byId.set(c.id, c);
  indexName(c.name, c);
  if (c.name.includes(" // ")) {
    for (const part of c.name.split(" // ")) indexName(part, c);
  }
}
const catalogMeta = fs.existsSync(META_PATH)
  ? JSON.parse(fs.readFileSync(META_PATH, "utf8"))
  : { kept: cards.length };
console.log(
  `catalog ready: ${cards.length} cards, ${oldPrintings.length} old-school printings, ${tokens.length} tokens, ${allSetGroups.length} set groups`
);

function lookupName(name) {
  if (!name) return null;
  const raw = name.trim();
  const key = raw.toLowerCase();
  if (byName.has(key)) return byName.get(key);
  const stripped = key.replace(/[^a-z0-9]+/g, " ").trim();
  if (byName.has(stripped)) return byName.get(stripped);
  if (key.includes("/")) {
    const left = key.split("/")[0].replace(/[^a-z0-9]+/g, " ").trim();
    if (byName.has(left)) return byName.get(left);
  }
  return null;
}

function searchCards(query) {
  let q = (query.q || "").trim();

  // Extract set: or s: syntax
  let setCode = (query.set || "").toLowerCase();
  const setMatch = q.match(/\b(?:s|set):([a-z0-9_-]+)\b/i);
  if (setMatch) {
    setCode = setMatch[1].toLowerCase();
    q = q.replace(setMatch[0], "").trim();
  }

  // Extract type: or t: syntax
  let type = (query.type || "").toLowerCase();
  const typeMatch = q.match(/\b(?:t|type):([a-z]+)\b/i);
  if (typeMatch) {
    type = typeMatch[1].toLowerCase();
    q = q.replace(typeMatch[0], "").trim();
  }

  const rawTerms = q ? q.toLowerCase().split(/\s+/).filter(Boolean) : [];
  const terms = rawTerms.map((t) => {
    const clean = t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[\x27\x60\u2019]/g, "")
      .replace(/[^a-z0-9]/g, "");
    return { raw: t, clean };
  });

  const rawColors = (query.colors || "").toUpperCase();
  const hasColorless = query.colorless === "1" || rawColors.includes("C");
  const colors = rawColors.replace(/[^WUBRG]/g, "");
  const colorMode = query.colorMode || "identity";
  const rarity = (query.rarity || "").toLowerCase();
  const format = (query.format || "").toLowerCase();
  const token = query.token === "1" || query.token === "true";
  const cmcParam = String(query.cmc == null ? "" : query.cmc).trim();
  const group = query.group || "";
  const groupSet = group ? setsInGroup.get(group) : null;
  const limit = Math.min(250, Math.max(1, Number(query.limit || 60)));
  const offset = Math.max(0, Number(query.offset || 0));

  let pool;
  if (setCode) {
    const poolMap = new Map();
    for (const c of oldPrintings) if (c.set === setCode) poolMap.set(c.id, c);
    for (const c of cards) if (c.set === setCode && !poolMap.has(c.id)) poolMap.set(c.id, c);
    pool = [...poolMap.values()];
  } else if (group) {
    const poolMap = new Map();
    for (const c of oldPrintings) if (groupSet && groupSet.has(c.set)) poolMap.set(c.id, c);
    for (const c of cards) if (groupSet && groupSet.has(c.set) && !poolMap.has(c.id)) poolMap.set(c.id, c);
    pool = [...poolMap.values()];
  } else {
    pool = cards;
  }

  const cmcParts = cmcParam ? cmcParam.split(",").map((s) => s.trim()).filter(Boolean) : null;

  const hits = [];
  for (const c of pool) {
    if (token) {
      if (!c.token) continue;
    } else if (c.token) {
      continue;
    }
    if (type && !c.type_line.toLowerCase().includes(type)) continue;
    if (rarity && c.rarity !== rarity) continue;
    if (format && c.legalities?.[format] !== "legal") continue;
    if (setCode && c.set !== setCode) continue;
    if (groupSet && !groupSet.has(c.set)) continue;

    if (cmcParts && cmcParts.length) {
      const matchCmc = cmcParts.some((p) => {
        if (p.endsWith("+")) {
          const min = Number(p.slice(0, -1));
          return !Number.isNaN(min) && c.cmc >= min;
        }
        const val = Number(p);
        return !Number.isNaN(val) && c.cmc === val;
      });
      if (!matchCmc) continue;
    }

    if (hasColorless && !colors) {
      if ((c.colors || []).length > 0) continue;
    } else if (colors) {
      const ident = (colorMode === "identity" ? c.color_identity : c.colors) || [];
      const set = ident.join("");
      const isCardColorless = (c.colors || []).length === 0;

      if (hasColorless && isCardColorless) {
        // Allowed if colorless is selected alongside colors
      } else if (colorMode === "exact") {
        if ([...colors].sort().join("") !== [...set].sort().join("")) continue;
        if (colors.length === 0 && ident.length) continue;
      } else if (colorMode === "identity") {
        if ([...ident].some((x) => !colors.includes(x))) continue;
      } else if (colorMode === "any") {
        if (![...colors].some((x) => ident.includes(x))) continue;
      } else if (![...colors].every((x) => ident.includes(x))) {
        continue;
      }
    }

    if (terms.length) {
      const hay = c._hay || "";
      let matches = true;
      for (const t of terms) {
        if (!hay.includes(t.raw) && (!t.clean || !hay.includes(t.clean))) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
    }

    const name = c.name.toLowerCase();
    let score = 10;
    if (q) {
      const qLower = q.toLowerCase();
      const qClean = qLower.replace(/[\x27\x60\u2019]/g, "");
      const nameClean = name.replace(/[\x27\x60\u2019]/g, "");
      if (name === qLower || nameClean === qClean) score = 0;
      else if (name.startsWith(qLower) || nameClean.startsWith(qClean)) score = 1;
      else if (name.includes(qLower) || nameClean.includes(qClean)) score = 2;
      else if (terms.every((t) => name.includes(t.raw) || (t.clean && nameClean.includes(t.clean)))) score = 3;
      else score = 6;
    }
    if (c.name.startsWith("_")) score += 30;
    hits.push({ score, c });
  }

  hits.sort((a, b) => a.score - b.score || a.c.name.localeCompare(b.c.name));
  const slice = hits.slice(offset, offset + limit);
  return {
    cards: slice.map((h) => publicCard(h.c)),
    total: hits.length,
    offset,
    limit,
    hasMore: hits.length > offset + limit,
  };
}

function publicCard(c) {
  return {
    id: c.id,
    name: c.name,
    mana_cost: c.mana_cost,
    cmc: c.cmc,
    type_line: c.type_line,
    oracle_text: c.oracle_text,
    colors: c.colors,
    color_identity: c.color_identity,
    keywords: c.keywords,
    power: c.power,
    toughness: c.toughness,
    loyalty: c.loyalty,
    layout: c.layout,
    rarity: c.rarity,
    set: c.set,
    set_name: c.set_name,
    token: c.token,
    legalities: c.legalities,
    faces: c.faces,
    image: `/api/img/${c.id}?size=normal`,
    image_small: `/api/img/${c.id}?size=small`,
  };
}

/* ---------- decks ---------- */

function listDecks(filterUserId = null) {
  return fs
    .readdirSync(DECKS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, f), "utf8"));
        if (filterUserId && d.userId !== filterUserId) return null;
        return {
          id: d.id,
          userId: d.userId || null,
          authorName: d.authorName || null,
          name: d.name,
          format: d.format,
          commander: d.commander || null,
          counts: countDeck(d),
          updated: d.updated,
          starter: !!d.starter,
          cover: deckCover(d),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => (b.updated || 0) - (a.updated || 0));
}

function deckCover(d) {
  const rows = d.cards || [];
  const cmd = rows.find((r) => r.board === "command") || d.commander;
  const creature = rows.find((r) => /Creature/i.test(r.type_line || "") && r.board !== "side");
  const first = cmd || creature || rows.find((r) => r.board !== "side") || rows[0];
  const id = first && (first.id || first);
  if (!id || typeof id !== "string") return "/img/cardback.jpg";
  return `/api/img/${id}?size=normal`;
}

function countDeck(d) {
  let main = 0;
  let side = 0;
  let command = 0;
  for (const row of d.cards || []) {
    const n = row.count || 1;
    if (row.board === "side") side += n;
    else if (row.board === "command") command += n;
    else main += n;
  }
  return { main, side, command };
}

function readDeck(id) {
  const p = path.join(DECKS_DIR, `${id}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeDeck(deck) {
  deck.updated = now();
  fs.writeFileSync(path.join(DECKS_DIR, `${deck.id}.json`), JSON.stringify(deck, null, 2));
  return deck;
}

function parseDeckText(text) {
  const lines = String(text || "").split(/\r?\n/);
  let board = "main";
  const cardsOut = [];
  const unknown = [];
  for (let raw of lines) {
    let line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    if (/^(NAME|AUTHOR|LAYOUT|COMMENTS)\s*:/i.test(line)) continue;
    const header = line.toLowerCase().replace(/:$/, "");
    if (["sideboard", "side", "sb"].includes(header)) {
      board = "side";
      continue;
    }
    if (["commander", "commanders", "command"].includes(header)) {
      board = "command";
      continue;
    }
    if (["maybeboard", "maybe", "wishlist"].includes(header)) continue;
    let useBoard = board;
    const sb = line.match(/^SB:\s*(.*)$/i);
    if (sb) {
      useBoard = "side";
      line = sb[1];
    }
    const cmdr = line.match(/^(?:CMDR|COMMANDER):\s*(.*)$/i);
    if (cmdr) {
      useBoard = "command";
      line = cmdr[1];
    }
    const m = line.match(/^(?:(\d+)[xX]?\s*[xX]?\s*)?(.+?)(?:\s+\([A-Z0-9]{2,5}\)\s+\d+\s*)?(?:\s+\*[A-Za-z].*)?$/);
    if (!m) {
      unknown.push(line);
      continue;
    }
    const count = m[1] ? Number(m[1]) : 1;
    let name = m[2].trim();
    name = name
      .replace(/^\[[^\]]+\]\s+/, "")
      .replace(/\s+\([A-Z0-9]{2,5}\).*$/, "")
      .replace(/\s+#[0-9].*$/, "")
      .trim();
    const card = lookupName(name);
    if (!card) {
      unknown.push(name);
      continue;
    }
    cardsOut.push({
      id: card.id,
      name: card.name,
      count,
      board: useBoard,
      mana_cost: card.mana_cost,
      type_line: card.type_line,
      cmc: card.cmc,
      colors: card.colors,
      image_small: `/api/img/${card.id}?size=small`,
    });
  }
  return { cards: cardsOut, unknown };
}

function importXmageDuelDecks() {
  const root = path.join(DATA, "xmage", "xmage", "mage-client", "sample-decks", "Duel Decks");
  if (!fs.existsSync(root)) return 0;
  let n = 0;
  for (const pair of fs.readdirSync(root)) {
    const dir = path.join(root, pair);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".dck"))) {
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const text = raw
        .split(/\r?\n/)
        .map((line) => line.replace(/\[[^\]]+\]\s+/, ""))
        .join("\n");
      const parsed = parseDeckText(text);
      if (!parsed.cards.length) continue;
      const sideName = file.replace(/\.dck$/i, "");
      writeDeck({
        id: uid(10),
        name: `Duel: ${pair} — ${sideName}`,
        format: "duel",
        commander: null,
        cards: parsed.cards,
        unknown: parsed.unknown,
        starter: true,
        source: "xmage-duel-decks",
        created: now(),
        updated: now(),
      });
      n += 1;
      if (parsed.unknown.length) {
        console.log(`  ${pair}/${sideName} unknown: ${parsed.unknown.slice(0, 8).join(", ")}`);
      }
    }
  }
  return n;
}

function seedDecksIfEmpty() {
  if (listDecks().length) return;
  const seeds = [
    {
      name: "Red Burn",
      format: "duel",
      text: `4 Goblin Guide
4 Monastery Swiftspear
4 Eidolon of the Great Revel
2 Vexing Devil
4 Lightning Bolt
4 Lava Spike
4 Rift Bolt
4 Skewer the Critics
4 Lightning Strike
4 Searing Blaze
2 Fireblast
2 Skullcrack
18 Mountain`,
    },
    {
      name: "Green Stompy",
      format: "duel",
      text: `4 Llanowar Elves
4 Elvish Mystic
4 Experiment One
4 Strangleroot Geist
4 Pelt Collector
4 Leatherback Baloth
4 Kalonian Tusker
4 Rancor
4 Giant Growth
2 Aspect of Hydra
2 Dungrove Elder
20 Forest`,
    },
    {
      name: "White-Blue Flyers",
      format: "duel",
      text: `4 Healer's Hawk
4 Judge's Familiar
4 Spectral Sailor
4 Mausoleum Wanderer
4 Empyrean Eagle
3 Watcher of the Spheres
4 Favorable Winds
4 Counterspell
3 Spell Pierce
4 Plains
14 Island
4 Glacial Fortress
4 Hallowed Fountain`,
    },
    {
      name: "Krenko Goblins",
      format: "commander",
      text: `Commander:
1 Krenko, Mob Boss
1 Muxus, Goblin Grandee
1 Goblin Chieftain
1 Goblin Warchief
1 Goblin King
1 Goblin Recruiter
1 Goblin Matron
1 Goblin Trashmaster
1 Goblin Instigator
1 Goblin Piledriver
1 Goblin Rabblemaster
1 Goblin Motivator
1 Goblin Chirurgeon
1 Goblin Sharpshooter
1 Goblin Lackey
1 Goblin Bushwhacker
1 Goblin Bombardment
1 Goblin War Strike
1 Legion Warboss
1 Krenko, Tin Street Kingpin
1 Skirk Prospector
1 Siege-Gang Commander
1 Wort, Boggart Auntie
1 Purphoros, God of the Forge
1 Impact Tremors
1 Shared Animosity
1 Coat of Arms
1 Skullclamp
1 Sol Ring
1 Arcane Signet
1 Ruby Medallion
1 Lightning Bolt
1 Chaos Warp
1 Blasphemous Act
1 Faithless Looting
1 Dockside Extortionist
1 Treasure Nabber
1 Hobgoblin Bandit Lord
1 Conspicuous Snoop
1 Goblin Welder
1 Goblin Engineer
1 Mogg War Marshal
1 Reckless Bushwhacker
1 Foundry Street Denizen
1 Battle Hymn
1 Brightstone Ritual
1 Empty the Warrens
1 Krenko's Command
1 Hordeling Outburst
1 Dragon Fodder
1 Lightning Greaves
1 Swiftfoot Boots
1 Herald's Horn
1 Vanquisher's Banner
1 The Ozolith
1 Throne of the God-Pharaoh
1 Relentless Assault
1 Aggravated Assault
1 Fervor
1 Blood Moon
1 Ruination
1 Vandalblast
1 Gamble
1 Jeska's Will
1 Deflecting Swat
1 Tibalt's Trickery
1 Goblin Wizardry
1 Dropkick Bomber
1 Rundvelt Hordemaster
1 Battle Cry Goblin
1 Goblin Anarchomancer
1 Goblin Ringleader
1 Warren Instigator
1 Goblin Guide
1 Monastery Swiftspear
1 Boggart Shenanigans
1 Pashalik Mons
1 Kiki-Jiki, Mirror Breaker
1 Combat Celebrant
1 Beetleback Chief
1 Moggcatcher
1 Goblin Settler
1 Imperial Recruiter
1 Magus of the Moon
1 Shivan Reef
1 Ancient Tomb
1 Cavern of Souls
1 Nykthos, Shrine to Nyx
1 Buried Ruin
1 Castle Embereth
1 Dwarven Mine
1 Forgotten Cave
1 Ghitu Encampment
1 Great Furnace
1 Hanweir Battlements
1 Kher Keep
1 Valakut, the Molten Pinnacle
1 Phyrexian Tower
1 Reliquary Tower
1 Rogue's Passage
1 Scavenger Grounds
1 Sokenzan, Crucible of Defiance
32 Mountain`,
    },
  ];

  for (const s of seeds) {
    const parsed = parseDeckText(s.text);
    const deck = {
      id: uid(10),
      name: s.name,
      format: s.format,
      commander: parsed.cards.find((c) => c.board === "command") || null,
      cards: parsed.cards,
      unknown: parsed.unknown,
      starter: true,
      created: now(),
      updated: now(),
    };
    writeDeck(deck);
    console.log(
      `seeded ${deck.name}: ${countDeck(deck).main + countDeck(deck).command} cards, unknown=${parsed.unknown.length}`
    );
    if (parsed.unknown.length) console.log("  unknown:", parsed.unknown.join(", "));
  }
  const n = importXmageDuelDecks();
  if (n) console.log(`imported ${n} XMage duel decks`);
}

// When DATA is a separate durable directory (DATA_DIR), the deck library ships
// in the checkout and would otherwise be missing on a fresh deploy. Copy the
// shipped decks across once, only while the state directory is still empty,
// so player-created decks are never overwritten.
function seedShippedDecks() {
  if (DATA === CATALOG) return;
  const shipped = path.join(CATALOG, "decks");
  if (!fs.existsSync(shipped)) return;
  const existing = fs.readdirSync(DECKS_DIR).filter((f) => f.endsWith(".json"));
  if (existing.length) return;
  let copied = 0;
  for (const f of fs.readdirSync(shipped)) {
    if (!f.endsWith(".json")) continue;
    try {
      fs.copyFileSync(path.join(shipped, f), path.join(DECKS_DIR, f));
      copied++;
    } catch (err) {
      console.log(`  could not seed deck ${f}: ${err.message}`);
    }
  }
  if (copied) console.log(`seeded ${copied} shipped decks into ${DECKS_DIR}`);
}

// Shipped decks first: seedDecksIfEmpty() bails as soon as any deck exists, so
// on a fresh DATA_DIR the library has to be populated before it runs.
seedShippedDecks();
seedDecksIfEmpty();

/* ---------- images ---------- */

const imgQueue = [];
let imgActive = 0;
const IMG_CONCURRENCY = 6;

function enqueueImg(job) {
  return new Promise((resolve, reject) => {
    imgQueue.push({ job, resolve, reject });
    pumpImg();
  });
}

function pumpImg() {
  while (imgActive < IMG_CONCURRENCY && imgQueue.length) {
    const { job, resolve, reject } = imgQueue.shift();
    imgActive += 1;
    job()
      .then(resolve, reject)
      .finally(() => {
        imgActive -= 1;
        pumpImg();
      });
  }
}

async function fetchImage(card, size) {
  const dir = path.join(IMG_DIR, size);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${card.id}.jpg`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 500) return dest;

  const src =
    size === "small"
      ? card.image_small && card.image_small.startsWith("http")
        ? card.image_small
        : (card.image || "").replace("/normal/", "/small/")
      : card.image;

  /* catalog stores remote URLs originally; after slim, image is scryfall URL */
  let url = src;
  if (!url || url.startsWith("/")) {
    url = `https://cards.scryfall.io/${size === "small" ? "small" : "normal"}/front/${card.id[0]}/${card.id[1]}/${card.id}.jpg`;
    if (card.faces?.[0]?.image) {
      url = size === "small" ? card.faces[0].image.replace("/normal/", "/small/") : card.faces[0].image;
    }
  }
  if (url && url.startsWith("/")) {
    url = `https://cards.scryfall.io/${size === "small" ? "small" : "normal"}/front/${card.id[0]}/${card.id[1]}/${card.id}.jpg`;
  }

  const res = await fetch(url, { headers: { "User-Agent": "mtg-table/1.0 (LAN fan table; jane@arc)" } });
  if (!res.ok) throw new Error(`scryfall ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return dest;
}

/* ---------- game tables ---------- */

const tables = new Map();
const sockets = new Set();
const TABLES_PATH = path.join(DATA, "tables.json");

function saveTables() {
  try {
    const list = [...tables.values()].filter((t) => t.started || !t.ended);
    const tmp = `${TABLES_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(list, null, 2), "utf8");
    fs.renameSync(tmp, TABLES_PATH);
  } catch (err) {
    /* ignore */
  }
}

function loadTables() {
  if (fs.existsSync(TABLES_PATH)) {
    try {
      const list = JSON.parse(fs.readFileSync(TABLES_PATH, "utf8"));
      for (const t of list) {
        if (t && t.code) {
          for (const s of t.seats || []) {
            s.connected = false;
          }
          tables.set(t.code, t);
        }
      }
    } catch {
      /* ignore */
    }
  }
}
loadTables();

function getOnlinePlayers() {
  const byKey = new Map();
  for (const ws of sockets) {
    if (!ws.playerId && !ws.userId) continue;
    const key = ws.userId || ws.playerId;
    const u = ws.userId ? findUserById(ws.userId) : null;

    let status = ws.statusText || "In Lobby";
    if (ws.tableCode) {
      status = `At Table ${ws.tableCode}`;
    }

    const existing = byKey.get(key);
    if (!existing || (ws.tableCode && !existing.tableCode)) {
      byKey.set(key, {
        id: key,
        userId: ws.userId || null,
        playerId: ws.playerId,
        username: u ? u.username : null,
        displayName: (u ? (u.displayName || u.username) : ws.playerName) || "Planeswalker",
        avatar: u ? u.avatar : null,
        balance: u ? u.balance : 1000,
        wins: u ? u.wins : 0,
        losses: u ? u.losses : 0,
        location: ws.location || (ws.tableCode ? "table" : "lobby"),
        status: status,
        tableCode: ws.tableCode || null,
        isGuest: !ws.userId,
        lastSeen: ws.lastSeen || now(),
      });
    }
  }
  return [...byKey.values()].sort((a, b) => {
    if (a.tableCode && !b.tableCode) return -1;
    if (!a.tableCode && b.tableCode) return 1;
    return a.displayName.localeCompare(b.displayName);
  });
}

let lastPresenceBroadcast = 0;
let presenceTimer = null;
function broadcastPresence() {
  const t = now();
  if (t - lastPresenceBroadcast < 250) {
    if (!presenceTimer) {
      presenceTimer = setTimeout(() => {
        presenceTimer = null;
        broadcastPresence();
      }, 300);
    }
    return;
  }
  lastPresenceBroadcast = t;
  const online = getOnlinePlayers();
  const payload = JSON.stringify({ t: "presence", online });
  for (const ws of sockets) {
    if (ws.readyState === 1) {
      try { ws.send(payload); } catch {}
    }
  }
}

function notifyPlayer(targetId, payload) {
  if (!targetId) return;
  const data = JSON.stringify(payload);
  for (const ws of sockets) {
    if (ws.readyState === 1 && (ws.userId === targetId || ws.playerId === targetId)) {
      try { ws.send(data); } catch {}
    }
  }
}

function getFriendIds(id) {
  const set = new Set();
  for (const f of friendsData.friendships) {
    if (f.userA === id) set.add(f.userB);
    if (f.userB === id) set.add(f.userA);
  }
  return set;
}

function getFriendsList(myId) {
  const onlineMap = new Map(getOnlinePlayers().map((p) => [p.userId || p.playerId, p]));
  const friends = [];
  for (const f of friendsData.friendships) {
    const friendId = f.userA === myId ? f.userB : (f.userB === myId ? f.userA : null);
    if (!friendId) continue;
    const u = findUserById(friendId);
    const online = onlineMap.get(friendId) || (u && onlineMap.get(u.id));
    friends.push({
      friendshipId: f.id,
      id: friendId,
      userId: u ? u.id : (friendId.startsWith("u-") ? friendId : null),
      playerId: !u && friendId.startsWith("p-") ? friendId : (online ? online.playerId : null),
      username: u ? u.username : (f.names && f.names[friendId]) || "Player",
      displayName: u ? (u.displayName || u.username) : (f.names && f.names[friendId]) || (online ? online.displayName : "Player"),
      avatar: u ? u.avatar : (online ? online.avatar : null),
      balance: u ? u.balance : (online ? online.balance : 1000),
      wins: u ? u.wins : (online ? online.wins : 0),
      losses: u ? u.losses : (online ? online.losses : 0),
      isOnline: !!online,
      status: online ? online.status : "Offline",
      location: online ? online.location : null,
      tableCode: online ? online.tableCode : null,
      since: f.created,
    });
  }
  return friends;
}

function getIncomingRequests(myId, myUsername) {
  const unLower = myUsername ? myUsername.toLowerCase() : "";
  return friendsData.requests.filter((r) => {
    if (r.status !== "pending") return false;
    if (r.to === myId) return true;
    if (unLower && r.toUsername && r.toUsername.toLowerCase() === unLower) return true;
    return false;
  });
}

function getOutgoingRequests(myId) {
  return friendsData.requests.filter((r) => r.status === "pending" && r.from === myId);
}

function tableCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[crypto.randomInt(alphabet.length)];
  return s;
}

function makeInst(card, ownerSeat, extra = {}) {
  return {
    iid: uid(12),
    cardId: card.id,
    name: card.name,
    mana_cost: card.mana_cost,
    type_line: card.type_line,
    oracle_text: card.oracle_text,
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    layout: card.layout,
    faces: card.faces,
    image: `/api/img/${card.id}?size=normal`,
    colors: card.colors,
    ownerSeat,
    tapped: false,
    faceDown: false,
    flipped: 0,
    counters: {},
    x: extra.x ?? 0.5,
    y: extra.y ?? 0.5,
    z: extra.z ?? now(),
    attachedTo: null,
    token: !!card.token || !!extra.token,
    ptMod: { p: 0, t: 0 },
    enteredAtTurn: extra.enteredAtTurn ?? null,
    enteredAtSeat: extra.enteredAtSeat ?? null,
    hasAttacked: extra.hasAttacked ?? false,
    ...extra,
  };
}

function emptySeat() {
  return {
    playerId: null,
    userId: null,
    name: null,
    ready: false,
    connected: false,
    isBot: false,
    wagerAgreed: false,
    life: 20,
    poison: 0,
    energy: 0,
    experience: 0,
    commanderTax: 0,
    commanderDamage: [0, 0],
    deckId: null,
    deckName: null,
    mulligans: 0,
    zones: {
      library: [],
      hand: [],
      battlefield: [],
      graveyard: [],
      exile: [],
      command: [],
      sideboard: [],
    },
  };
}

function createTable({ name, format, hostId, hostName, hostUserId = null, wager = 0, timerEnabled = false }) {
  const fmt = format || "duel";
  const w = Math.max(0, parseInt(wager) || 0);
  const t = {
    id: uid(10),
    code: tableCode(),
    name: name || "Kitchen table",
    format: fmt,
    wager: w,
    pot: 0,
    escrowed: false,
    winnerSeat: null,
    payout: null,
    hostId,
    started: false,
    ended: false,
    turn: 1,
    phase: "main1",
    activeSeat: 0,
    firstTurn: true,
    autoUntap: true,
    autoDraw: true,
    timerEnabled: !!timerEnabled,
    monarch: null,
    dayNight: null,
    created: now(),
    seats: [emptySeat(), emptySeat()],
    chat: [],
    log: [],
    lastRoll: null,
    stack: [],
  };
  const life = FORMAT_LIFE[fmt] || 20;
  t.seats[0].life = life;
  t.seats[1].life = life;
  sit(t, 0, hostId, hostName, hostUserId);
  tables.set(t.code, t);
  saveTables();
  return t;
}

function starterPair() {
  const all = listDecks();
  const by = (re) => all.find((d) => re.test(d.name));
  const a = by(/Elves vs\. Goblins — Elves/) || by(/^Red Burn$/) || all[0];
  const b = by(/Elves vs\. Goblins — Goblins/) || by(/^Green Stompy$/) || all[1];
  return [a, b].filter(Boolean);
}

function giveStarterDeck(t, seat) {
  const s = t.seats[seat];
  if (!s || s.deckId) return;
  const pair = starterPair();
  const taken = t.seats.map((x) => x.deckId).filter(Boolean);
  const pick = pair.find((d) => d && !taken.includes(d.id)) || pair[seat] || pair[0];
  if (!pick) return;
  s.deckId = pick.id;
  s.deckName = pick.name;
  s.ready = true;
}

function addBotToTable(t, opts = {}) {
  const diff = resolveBotDifficulty(opts.difficulty || t.botDifficulty);
  t.botDifficulty = diff;
  const skin = BOT_SKIN[diff] || BOT_SKIN.normal;
  const botName = opts.botName || skin.name;
  let seat = t.seats.findIndex((s) => !s.playerId);
  if (seat < 0) return null;
  const botId = "bot-" + uid(6);
  sit(t, seat, botId, botName, null);
  t.seats[seat].isBot = true;
  giveStarterDeck(t, seat);
  t.seats[seat].ready = true;
  t.seats[seat].wagerAgreed = true;
  log(t, `${botName} joined the match with ${t.seats[seat].deckName || "a starter deck"}! 🤖✨`, seat);
  tryStart(t);
  return t.seats[seat];
}

function tryStart(t) {
  if (t.started || t.ended) return;
  if (!t.seats.every((s) => s.playerId && s.deckId)) return;
  if (t.wager > 0) {
    for (let i = 0; i < t.seats.length; i++) {
      const s = t.seats[i];
      if (s.isBot) continue;
      const rec = getPlayerRecord(s);
      if (rec && rec.balance < t.wager) {
        log(t, `⚠️ Cannot start match: ${s.name} only has ${rec.balance} 🪙 Gold (required wager is ${t.wager} 🪙)!`, i);
        return;
      }
    }
  }
  for (const s of t.seats) s.ready = true;
  startGame(t);
}

function sit(t, seat, playerId, name, userId = null) {
  const s = t.seats[seat];
  if (!s) return false;
  if (s.playerId && s.playerId !== playerId) return false;
  /* leave other seat if same player */
  for (const [i, other] of t.seats.entries()) {
    if (i !== seat && other.playerId === playerId) {
      other.playerId = null;
      other.userId = null;
      other.name = null;
      other.ready = false;
      other.connected = false;
      other.wagerAgreed = false;
    }
  }
  s.playerId = playerId;
  s.userId = userId || s.userId || null;
  s.name = name || s.name || "Player";
  s.connected = true;
  return true;
}

function findSeat(t, playerId) {
  return t.seats.findIndex((s) => s.playerId === playerId);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function log(t, text, seat = null) {
  t.log.push({ at: now(), seat, text });
  if (t.log.length > 400) t.log.splice(0, t.log.length - 400);
}

function expandDeck(deck, ownerSeat, format) {
  const library = [];
  const command = [];
  const sideboard = [];
  for (const row of deck.cards || []) {
    const card = byId.get(row.id) || lookupName(row.name);
    if (!card) continue;
    const n = row.count || 1;
    const board = row.board || "main";
    for (let i = 0; i < n; i++) {
      const inst = makeInst(card, ownerSeat);
      if (board === "command") command.push(inst);
      else if (board === "side") sideboard.push(inst);
      else library.push(inst);
    }
  }
  if (format === "commander" && command.length === 0) {
    const legendary = library.find((c) => /Legendary/.test(c.type_line) && /Creature/.test(c.type_line));
    if (legendary) {
      library.splice(library.indexOf(legendary), 1);
      command.push(legendary);
    }
  }
  shuffle(library);
  return { library, command, sideboard };
}

function endGame(t, winnerSeat, reason) {
  if (t.ended) return;
  t.ended = true;
  t.winnerSeat = winnerSeat;
  trackMatchOutcome(t, winnerSeat, reason);

  if (winnerSeat != null && t.seats[winnerSeat]) {
    const winnerSeatObj = t.seats[winnerSeat];
    const loserSeatObj = t.seats[(winnerSeat + 1) % 2];
    const winRec = getPlayerRecord(winnerSeatObj);
    const loseRec = getPlayerRecord(loserSeatObj);

    if (t.pot > 0 && t.escrowed) {
      const feePct = typeof daoData.feePercent === "number" ? daoData.feePercent : 3;
      const fee = Math.max(0, Math.floor(t.pot * (feePct / 100)));
      const payout = t.pot - fee;

      if (fee > 0) {
        daoData.balance = (daoData.balance || 0) + fee;
        daoData.totalCollected = (daoData.totalCollected || 0) + fee;
        daoData.transactions.unshift({
          id: "tx-" + uid(8),
          timestamp: now(),
          type: "wager_fee",
          amount: fee,
          pot: t.pot,
          feePercent: feePct,
          tableCode: t.code,
          tableName: t.name,
          winner: winnerSeatObj.name,
          description: `${feePct}% DAO Treasury fee from Match ${t.code} (${winnerSeatObj.name} won ${payout} 🪙 of ${t.pot} 🪙 pot)`
        });
        if (daoData.transactions.length > 250) daoData.transactions.length = 250;
        saveDaoData();
      }

      if (winRec) {
        winRec.balance = (winRec.balance || 0) + payout;
        recordTx(winRec, {
          kind: "gold",
          title: "Match payout",
          detail: `Won ${payout} Gold from ${t.name || t.code}`,
          amount: payout,
          amountUnit: "GOLD",
          status: "confirmed",
          chain: "table",
        });
        winRec.wins = (winRec.wins || 0) + 1;
        if (!winRec.stats) winRec.stats = {};
        winRec.stats.totalWon = (winRec.stats.totalWon || 0) + payout;
        winRec.stats.streak = (winRec.stats.streak || 0) + 1;
        winRec.stats.bestStreak = Math.max(winRec.stats.bestStreak || 0, winRec.stats.streak);
        if (!winRec.isGuest) saveUsers();
      }
      if (loseRec) {
        loseRec.losses = (loseRec.losses || 0) + 1;
        if (!loseRec.stats) loseRec.stats = {};
        loseRec.stats.streak = 0;
        if (!loseRec.isGuest) saveUsers();
      }
      t.payout = {
        winnerSeat,
        winnerName: winnerSeatObj.name,
        amount: payout,
        pot: t.pot,
        fee,
        reason: reason || "Match concluded",
      };
      log(t, `👑 ${winnerSeatObj.name} won the match (${reason || "Victory"}) and claimed ${payout} 🪙! (${fee} 🪙 [${feePct}%] contributed to Multiverse DAO Treasury ✨) 🎉`, winnerSeat);
    } else {
      if (winRec) {
        winRec.wins = (winRec.wins || 0) + 1;
        if (!winRec.stats) winRec.stats = {};
        winRec.stats.streak = (winRec.stats.streak || 0) + 1;
        winRec.stats.bestStreak = Math.max(winRec.stats.bestStreak || 0, winRec.stats.streak);
        if (!winRec.isGuest) saveUsers();
      }
      if (loseRec) {
        loseRec.losses = (loseRec.losses || 0) + 1;
        if (!loseRec.stats) loseRec.stats = {};
        loseRec.stats.streak = 0;
        if (!loseRec.isGuest) saveUsers();
      }
      t.payout = {
        winnerSeat,
        winnerName: winnerSeatObj.name,
        amount: t.botReward || 0,
        botReward: t.botReward || null,
        reason: reason || "Match concluded",
      };
      log(t, `👑 ${winnerSeatObj.name} won the match! (${reason || "Victory"}) 🏆${t.botReward ? ` (+${t.botReward} 🪙 AI bounty)` : ""}`, winnerSeat);
    }
  } else {
    // Draw or refund
    if (t.pot > 0 && t.escrowed) {
      const refund = Math.floor(t.pot / 2);
      for (const s of t.seats) {
        if (!s.isBot) {
          const rec = getPlayerRecord(s);
          if (rec) {
            rec.balance = (rec.balance || 0) + refund;
            recordTx(rec, {
              kind: "gold",
              title: "Wager refund",
              detail: `Draw on ${t.name || t.code}`,
              amount: refund,
              amountUnit: "GOLD",
              status: "confirmed",
              chain: "table",
            });
            if (!rec.isGuest) saveUsers();
          }
        }
      }
      log(t, `🤝 Match ended in a draw. ${refund} 🪙 refunded to each player.`);
    }
    t.pot = 0;
    t.escrowed = false;
  }
}

function startGame(t) {
  if (t.started) return;
  if (!t.seats.every((s) => s.playerId && s.deckId)) {
    throw new Error("wait for both players to join and pick a deck");
  }
  for (let i = 0; i < 2; i++) {
    const s = t.seats[i];
    const deck = readDeck(s.deckId);
    if (!deck) throw new Error(`${s.name} is missing a deck`);
    const exp = expandDeck(deck, i, t.format);
    s.zones.library = exp.library;
    s.zones.command = exp.command;
    s.zones.sideboard = exp.sideboard;
    s.zones.hand = [];
    s.zones.battlefield = [];
    s.zones.graveyard = [];
    s.zones.exile = [];
    s.life = FORMAT_LIFE[t.format] || 20;
    s.poison = 0;
    s.energy = 0;
    s.mulligans = 0;
    for (let d = 0; d < 7 && s.zones.library.length; d++) {
      s.zones.hand.push(s.zones.library.shift());
    }
  }

  // Escrow wager if applicable
  if (t.wager > 0 && !t.escrowed) {
    for (const s of t.seats) {
      if (!s.isBot) {
        const rec = getPlayerRecord(s);
        if (rec && (rec.balance || 0) < t.wager) {
          throw new Error(`${s.name} does not have enough Gold for this wager (${rec.balance || 0} / ${t.wager})`);
        }
      }
    }
    let pot = 0;
    for (const s of t.seats) {
      if (s.isBot) {
        pot += t.wager;
      } else {
        const rec = getPlayerRecord(s);
        if (rec) {
          rec.balance = Math.max(0, (rec.balance || 0) - t.wager);
          recordTx(rec, {
            kind: "gold",
            title: "Wager locked",
            detail: `${t.wager} Gold escrowed for ${t.name || t.code}`,
            amount: -t.wager,
            amountUnit: "GOLD",
            status: "confirmed",
            chain: "table",
          });
          if (!rec.isGuest) saveUsers();
          pot += t.wager;
        }
      }
    }
    t.pot = pot;
    t.escrowed = true;
    log(t, `💰 Wagers locked: ${t.wager} 🪙 per player! Total pot: ${t.pot} 🪙! ✨`);
  }

  t.started = true;
  t.ended = false;
  t.winnerSeat = null;
  t.payout = null;
  t.turn = 1;
  t.phase = "main1";
  t.activeSeat = 0;
  t.firstTurn = true;
  t.stack = [];
  log(t, "Game started. Both players drew 7.");
  saveTables();
}

function findCard(t, iid) {
  if (t.stack) {
    const idx = t.stack.findIndex((c) => c.iid === iid);
    if (idx >= 0) return { seat: t.stack[idx].ownerSeat, zone: "stack", idx, card: t.stack[idx], list: t.stack };
  }
  for (let seat = 0; seat < t.seats.length; seat++) {
    const s = t.seats[seat];
    for (const [zone, list] of Object.entries(s.zones)) {
      const idx = list.findIndex((c) => c.iid === iid);
      if (idx >= 0) return { seat, zone, idx, card: list[idx], list };
    }
  }
  return null;
}

function isLandCard(c) {
  return /\bLand\b/i.test(c.type_line || "") && !/\bInstant\b|\bSorcery\b/i.test(c.type_line || "");
}

function isPermanentCard(c) {
  return /\b(Creature|Artifact|Enchantment|Planeswalker|Battle|Land|Kindred)\b/i.test(c.type_line || "") && !/\bInstant\b|\bSorcery\b/i.test(c.type_line || "");
}

function hideCard(c) {
  return {
    iid: c.iid,
    hidden: true,
    faceDown: true,
    tapped: c.tapped,
    ownerSeat: c.ownerSeat,
    x: c.x,
    y: c.y,
    z: c.z,
    token: c.token,
  };
}

function viewFor(t, playerId) {
  const mySeat = findSeat(t, playerId);
  const seats = t.seats.map((s, seat) => {
    const mine = seat === mySeat;
    const zones = {};
    for (const [z, list] of Object.entries(s.zones)) {
      if (mine) {
        zones[z] = list;
      } else if (z === "hand" || z === "library" || z === "sideboard") {
        zones[z] = { count: list.length, hidden: true };
      } else {
        zones[z] = list.map((c) => (c.faceDown ? hideCard(c) : c));
      }
    }
    const rec = getPlayerRecord(s);
    return {
      seat,
      playerId: s.playerId,
      userId: s.userId,
      name: s.name,
      isBot: !!s.isBot,
      ready: s.ready,
      wagerAgreed: !!s.wagerAgreed,
      balance: rec ? (rec.balance || 0) : 1000,
      wins: rec ? (rec.wins || 0) : 0,
      losses: rec ? (rec.losses || 0) : 0,
      connected: s.connected,
      life: s.life,
      poison: s.poison,
      energy: s.energy,
      experience: s.experience,
      commanderTax: s.commanderTax,
      commanderDamage: s.commanderDamage,
      deckId: s.deckId,
      deckName: s.deckName,
      mulligans: s.mulligans,
      you: mine,
      zones,
    };
  });
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    format: t.format,
    wager: t.wager || 0,
    pot: t.pot || 0,
    escrowed: !!t.escrowed,
    winnerSeat: t.winnerSeat,
    payout: t.payout,
    hostId: t.hostId,
    started: t.started,
    ended: t.ended,
    turn: t.turn,
    phase: t.phase,
    activeSeat: t.activeSeat,
    monarch: t.monarch,
    dayNight: t.dayNight,
    lastRoll: t.lastRoll,
    stack: t.stack || [],
    timerEnabled: !!t.timerEnabled,
    botDifficulty: t.botDifficulty || "normal",
    you: mySeat,
    seats,
    combat: t.combat
      ? {
          step: t.combat.step,
          attackerSeat: t.combat.attackerSeat,
          attackers: (t.combat.attackers || []).map((a) => ({
            iid: a.iid,
            name: a.name,
            power: a.power,
            blockedBy: a.blockedBy || null,
            blockerName: a.blockerName || null,
          })),
        }
      : null,
    chat: t.chat.slice(-80),
    log: t.log.slice(-120),
    joinUrl: `${preferLanUrl()}/#/table/${t.code}`,
  };
}

function creaturePower(card) {
  const base = parseInt(card.power, 10);
  const plus = (card.counters && card.counters.p1p1) || 0;
  const minus = (card.counters && card.counters.m1m1) || 0;
  return Math.max(0, (Number.isNaN(base) ? 0 : base) + plus - minus);
}

function creatureToughness(card) {
  const base = parseInt(card.toughness, 10);
  const plus = (card.counters && card.counters.p1p1) || 0;
  const minus = (card.counters && card.counters.m1m1) || 0;
  return Math.max(0, (Number.isNaN(base) ? 0 : base) + plus - minus);
}

function isCreatureCard(card) {
  return /\bCreature\b/i.test(card.type_line || "") || card.power != null;
}

function hasHasteCard(card) {
  return /\bHaste\b/i.test(`${card.type_line || ""} ${card.oracle_text || ""} ${(card.keywords || []).join(" ")}`);
}

function isSummoningSick(t, card) {
  if (hasHasteCard(card)) return false;
  if (card.enteredAtTurn == null || card.enteredAtTurn === 0) return false;
  return card.enteredAtTurn === t.turn && card.enteredAtSeat === t.activeSeat;
}

function buryCreature(t, iid) {
  const found = findCard(t, iid);
  if (!found || found.zone !== "battlefield") return null;
  const [card] = found.list.splice(found.idx, 1);
  t.seats[found.seat].zones.graveyard.unshift(card);
  return card;
}

function scheduleBotEnd(table, seatIdx) {
  if (!table) return;
  setTimeout(() => {
    if (!table.started || table.ended || table.activeSeat !== seatIdx || table.combat) return;
    table.phase = "end";
    table._botThinking = false;
    passTurnInternal(table, true);
    broadcast(table);
  }, 800);
}

function resolveCombat(t) {
  const combat = t.combat;
  if (!combat || combat.step !== "blockers") return;
  const atkSeat = combat.attackerSeat;
  const defSeat = (atkSeat + 1) % 2;
  const def = t.seats[defSeat];
  let playerDmg = 0;
  const deaths = [];
  for (const a of combat.attackers) {
    const atkFound = findCard(t, a.iid);
    const aPow = atkFound ? creaturePower(atkFound.card) : a.power;
    if (!a.blockedBy) {
      playerDmg += aPow;
      log(t, `⚔️ ${a.name} is not blocked (${aPow} damage)`, atkSeat);
      continue;
    }
    const blkFound = findCard(t, a.blockedBy);
    if (!blkFound) {
      playerDmg += aPow;
      continue;
    }
    const bPow = creaturePower(blkFound.card);
    const bTou = creatureToughness(blkFound.card);
    const aTou = atkFound ? creatureToughness(atkFound.card) : 0;
    log(t, `🛡️ ${blkFound.card.name} blocks ${a.name}`, defSeat);
    if (aPow >= bTou && bTou >= 0) deaths.push(a.blockedBy);
    if (atkFound && bPow >= aTou) deaths.push(a.iid);
  }
  for (const iid of deaths) {
    const dead = buryCreature(t, iid);
    if (dead) log(t, `💀 ${dead.name} dies in combat`);
  }
  if (def && playerDmg > 0) {
    def.life = Math.max(0, def.life - playerDmg);
    log(t, `⚔️ ${playerDmg} combat damage to ${def.name} (life ${def.life})`, atkSeat);
    if (!t.ended && def.life <= 0) {
      endGame(t, atkSeat, `${def.name}'s life reached 0 from combat damage`);
    }
  }
  const attackerWasBot = !!(t.seats[atkSeat] && t.seats[atkSeat].isBot);
  t.combat = null;
  if (!t.ended) t.phase = "main2";
  if (attackerWasBot && !t.ended) scheduleBotEnd(t, atkSeat);
}

function applyAction(t, playerId, a) {
  const seat = findSeat(t, playerId);
  if (seat < 0) throw new Error("not seated");
  const me = t.seats[seat];
  const kind = a.kind;

  if (!t.started && !["chat", "ready", "pickDeck", "setName", "setWager", "agreeWager", "claimFaucet", "setTimer"].includes(kind)) {
    if (kind === "addBot") {
      addBotToTable(t);
      return;
    }
    if (kind === "start") {
      startGame(t);
      return;
    }
  }

  switch (kind) {
    case "setTimer": {
      t.timerEnabled = !!a.enabled;
      log(t, `⏱️ ${me.name} ${t.timerEnabled ? "enabled phase countdown timer" : "disabled phase timer (relaxed casual mode)"}`, seat);
      saveTables();
      return;
    }
    case "chat": {
      const text = String(a.text || "").slice(0, 400);
      if (!text) return;
      t.chat.push({ at: now(), seat, name: me.name, text });
      return;
    }
    case "pickDeck": {
      if (t.started) throw new Error("game already started");
      const deck = readDeck(a.deckId);
      if (!deck) throw new Error("deck not found");
      me.deckId = deck.id;
      me.deckName = deck.name;
      me.ready = true;
      log(t, `${me.name} chose ${deck.name}`, seat);
      // Bot matches can begin as soon as the human has a deck. Two players
      // wait for the Start button so a failed auto-start cannot discard the pick.
      if (t.seats.some((s) => s.isBot)) {
        try {
          tryStart(t);
        } catch (err) {
          log(t, err.message || String(err), seat);
        }
      }
      return;
    }
    case "ready": {
      if (!me.deckId) throw new Error("pick a deck first");
      me.ready = !!a.ready;
      log(t, `${me.name} is ${me.ready ? "ready" : "not ready"}`, seat);
      return;
    }
    case "start": {
      startGame(t);
      return;
    }
    case "draw": {
      const n = Math.max(1, Math.min(20, Number(a.n || 1)));
      let drawn = 0;
      for (let i = 0; i < n && me.zones.library.length; i++) {
        me.zones.hand.push(me.zones.library.shift());
        drawn += 1;
      }
      log(t, `${me.name} drew ${drawn}`, seat);
      return;
    }
    case "mulligan": {
      if (!t.started) return;
      const cardsInHand = me.zones.hand.splice(0);
      me.zones.library.push(...cardsInHand);
      shuffle(me.zones.library);
      me.mulligans += 1;
      for (let i = 0; i < 7 && me.zones.library.length; i++) {
        me.zones.hand.push(me.zones.library.shift());
      }
      log(t, `${me.name} mulliganed to 7 (London: bottom ${me.mulligans} yourself)`, seat);
      return;
    }
    case "shuffle": {
      shuffle(me.zones.library);
      log(t, `${me.name} shuffled`, seat);
      return;
    }
    case "untapAll": {
      for (const c of me.zones.battlefield) c.tapped = false;
      log(t, `${me.name} untapped all`, seat);
      return;
    }
    case "tap": {
      const found = findCard(t, a.iid);
      if (!found) return;
      if (found.seat !== seat) return;
      found.card.tapped = a.tapped == null ? !found.card.tapped : !!a.tapped;
      return;
    }
    case "flip": {
      const found = findCard(t, a.iid);
      if (!found || found.seat !== seat) return;
      found.card.flipped = found.card.flipped ? 0 : 1;
      found.card.faceDown = false;
      return;
    }
    case "faceDown": {
      const found = findCard(t, a.iid);
      if (!found || found.seat !== seat) return;
      found.card.faceDown = !!a.faceDown;
      return;
    }
    case "move": {
      const found = findCard(t, a.iid);
      if (!found) return;
      if (found.zone !== "stack" && found.seat !== seat) return;
      let toZone = a.toZone;
      const toSeat = found.zone === "stack" ? found.seat : seat;
      if (found.zone === "hand" && toZone === "battlefield" && !isLandCard(found.card)) toZone = "stack";
      if (found.zone === "command" && toZone === "battlefield") toZone = "stack";
      const [card] = found.list.splice(found.idx, 1);
      card.tapped = toZone === "battlefield" ? card.tapped : false;
      if (a.x != null) card.x = clamp01(a.x);
      if (a.y != null) card.y = clamp01(a.y);
      card.z = now();
      if (toZone !== "battlefield") {
        card.x = 0.5;
        card.y = 0.5;
      }
      if (toZone === "stack") {
        if (!t.stack) t.stack = [];
        t.stack.push(card);
        log(t, `${me.name} casts ${card.name}`, seat);
        return;
      }
      const dest = t.seats[toSeat]?.zones[toZone];
      if (toZone === "battlefield" && found.zone !== "battlefield") {
        card.enteredAtTurn = t.turn;
        card.enteredAtSeat = t.activeSeat;
        card.hasAttacked = false;
      }
      if (!dest) return;
      if (a.index == null || a.index >= dest.length) dest.push(card);
      else dest.splice(a.index, 0, card);
      if (found.zone !== toZone || found.seat !== toSeat) {
        log(t, `${me.name} moved ${card.faceDown && found.seat !== seat ? "a card" : card.name} → ${toZone}`, seat);
      }
      return;
    }
    case "resolve": {
      if (!t.stack || !t.stack.length) return;
      const card = t.stack.pop();
      const owner = t.seats[card.ownerSeat] || me;
      if (isPermanentCard(card)) {
        card.enteredAtTurn = t.turn;
        card.enteredAtSeat = t.activeSeat;
        card.hasAttacked = false;
        owner.zones.battlefield.push(card);
      } else {
        owner.zones.graveyard.unshift(card);
      }
      log(t, `${card.name} resolved → ${isPermanentCard(card) ? "battlefield" : "graveyard"}`, seat);
      return;
    }
    case "pos": {
      const found = findCard(t, a.iid);
      if (!found || found.zone !== "battlefield") return;
      if (found.seat !== seat) return;
      found.card.x = clamp01(a.x);
      found.card.y = clamp01(a.y);
      found.card.z = now();
      return;
    }
    case "counters": {
      const found = findCard(t, a.iid);
      if (!found) return;
      if (found.zone !== "battlefield" && found.seat !== seat) return;
      if (a.clear) {
        found.card.counters = {};
        log(t, `${found.card.name} counters cleared ✨`, seat);
        return;
      }
      const key = String(a.counter || "p1p1").slice(0, 24);
      const delta = Number(a.delta || 0);
      const cur = found.card.counters[key] || 0;
      const next = cur + delta;
      if (next <= 0) delete found.card.counters[key];
      else found.card.counters[key] = next;
      const label = key === "p1p1" ? "+1/+1" : key === "m1m1" ? "−1/−1" : key;
      log(t, `${found.card.name} ${delta > 0 ? "+" + delta : delta} ${label} (${next <= 0 ? 0 : next})`, seat);
      return;
    }
    case "life": {
      const target = a.seat == null ? seat : Number(a.seat);
      if (!t.seats[target]) return;
      t.seats[target].life += Number(a.delta || 0);
      log(t, `${t.seats[target].name} life ${a.delta > 0 ? "+" : ""}${a.delta} → ${t.seats[target].life}`, seat);
      if (t.started && !t.ended && t.seats[target].life <= 0) {
        const oppSeat = (target + 1) % 2;
        endGame(t, oppSeat, `${t.seats[target].name}'s life reached 0`);
      }
      return;
    }
    case "poison": {
      me.poison = Math.max(0, me.poison + Number(a.delta || 0));
      log(t, `${me.name} poison ${me.poison}`, seat);
      if (t.started && !t.ended && me.poison >= 10) {
        const oppSeat = (seat + 1) % 2;
        endGame(t, oppSeat, `${me.name} reached 10 poison counters`);
      }
      return;
    }
    case "energy": {
      me.energy = Math.max(0, me.energy + Number(a.delta || 0));
      return;
    }
    case "nextPhase": {
      if (t.started && t.activeSeat !== seat) return;
      if (t.combat && t.combat.step === "blockers") return;
      const i = PHASES.indexOf(t.phase);
      t.phase = PHASES[(i + 1) % PHASES.length];
      if (t.phase === "untap") passTurnInternal(t, false);
      if (t.phase === "draw") drawForTurn(t);
      return;
    }
    case "setPhase": {
      if (t.combat && t.combat.step === "blockers") return;
      if (t.started && t.activeSeat !== seat) return;
      if (PHASES.includes(a.phase)) t.phase = a.phase;
      if (t.phase === "draw") drawForTurn(t);
      return;
    }
    case "passTurn": {
      if (t.started && t.activeSeat !== seat) return;
      if (t.combat && t.combat.step === "blockers") return;
      passTurnInternal(t, true);
      return;
    }
    case "extraTurn": {
      log(t, `${me.name} takes an extra turn`, seat);
      t.activeSeat = seat;
      t.phase = "untap";
      beginTurn(t);
      return;
    }
    case "declareAttackers": {
      if (t.started && t.activeSeat !== seat) return;
      if (t.combat && t.combat.step === "blockers") return;
      const iids = Array.isArray(a.iids) ? a.iids : [];
      const attackers = [];
      for (const iid of iids) {
        const found = findCard(t, iid);
        if (!found || found.zone !== "battlefield" || found.seat !== seat) continue;
        const card = found.card;
        if (card.tapped || card.hasAttacked) continue;
        if (!isCreatureCard(card)) continue;
        if (isSummoningSick(t, card)) continue;
        if (/\bDefender\b/i.test(`${card.type_line || ""} ${card.oracle_text || ""}`)) continue;
        card.tapped = true;
        card.hasAttacked = true;
        attackers.push({
          iid: card.iid,
          name: card.name,
          power: creaturePower(card),
          blockedBy: null,
          blockerName: null,
        });
      }
      if (!attackers.length) {
        log(t, `${me.name} has no legal attackers`, seat);
        return;
      }
      t.phase = "combat";
      t.combat = { step: "blockers", attackerSeat: seat, attackers };
      const def = t.seats[(seat + 1) % 2];
      log(t, `⚔️ ${me.name} attacks with ${attackers.map((x) => x.name).join(", ")}. ${def ? def.name : "Opponent"} may block.`, seat);
      if (def && def.isBot) {
        setTimeout(() => {
          if (!t.combat || t.combat.step !== "blockers" || t.ended) return;
          log(t, `${def.name} does not block.`);
          resolveCombat(t);
          broadcast(t);
        }, 700);
      }
      return;
    }
    case "assignBlock": {
      if (!t.combat || t.combat.step !== "blockers") return;
      const defSeat = (t.combat.attackerSeat + 1) % 2;
      if (seat !== defSeat) return;
      const atk = t.combat.attackers.find((x) => x.iid === a.attacker);
      if (!atk) return;
      if (!a.blocker) {
        atk.blockedBy = null;
        atk.blockerName = null;
        log(t, `${atk.name} is no longer blocked`, seat);
        return;
      }
      const blocker = findCard(t, a.blocker);
      if (!blocker || blocker.zone !== "battlefield" || blocker.seat !== seat) return;
      if (blocker.card.tapped || !isCreatureCard(blocker.card)) return;
      for (const other of t.combat.attackers) {
        if (other.blockedBy === blocker.card.iid) {
          other.blockedBy = null;
          other.blockerName = null;
        }
      }
      atk.blockedBy = blocker.card.iid;
      atk.blockerName = blocker.card.name;
      log(t, `🛡️ ${blocker.card.name} will block ${atk.name}`, seat);
      return;
    }
    case "confirmBlocks": {
      if (!t.combat || t.combat.step !== "blockers") return;
      const defSeat = (t.combat.attackerSeat + 1) % 2;
      if (seat !== defSeat && !t.seats[defSeat].isBot) return;
      resolveCombat(t);
      return;
    }
    case "attack": {
      if (t.started && t.activeSeat !== seat) return;
      if (!a.iid) return;
      a.iids = [a.iid];
      a.kind = "declareAttackers";
      return applyAction(t, playerId, a);
    }
    case "token": {
      let card = a.cardId ? byId.get(a.cardId) : lookupName(a.name);
      if (!card) {
        card = {
          id: "token-custom",
          name: a.name || "Token",
          mana_cost: "",
          type_line: a.type_line || "Token Creature",
          oracle_text: "",
          power: a.power ?? "1",
          toughness: a.toughness ?? "1",
          loyalty: null,
          layout: "token",
          faces: null,
          image: null,
          colors: a.colors || [],
          token: true,
        };
      }
      const n = Math.max(1, Math.min(20, Number(a.n || 1)));
      for (let i = 0; i < n; i++) {
        const inst = makeInst(card, seat, {
          token: true,
          x: 0.35 + Math.random() * 0.3,
          y: 0.35 + Math.random() * 0.3,
          enteredAtTurn: t.turn,
          enteredAtSeat: t.activeSeat,
          hasAttacked: false,
        });
        if (a.power != null) inst.power = String(a.power);
        if (a.toughness != null) inst.toughness = String(a.toughness);
        me.zones.battlefield.push(inst);
      }
      log(t, `${me.name} created ${n}× ${card.name}`, seat);
      return;
    }
    case "roll": {
      const sides = Math.max(2, Math.min(100, Number(a.sides || 20)));
      const n = Math.max(1, Math.min(20, Number(a.n || 1)));
      const rolls = [];
      for (let i = 0; i < n; i++) rolls.push(1 + crypto.randomInt(sides));
      t.lastRoll = { seat, sides, rolls, total: rolls.reduce((x, y) => x + y, 0), at: now() };
      log(t, `${me.name} rolled d${sides}${n > 1 ? "×" + n : ""}: ${rolls.join(", ")}`, seat);
      return;
    }
    case "mill": {
      const n = Math.max(1, Math.min(50, Number(a.n || 1)));
      let k = 0;
      for (let i = 0; i < n && me.zones.library.length; i++) {
        me.zones.graveyard.unshift(me.zones.library.shift());
        k += 1;
      }
      log(t, `${me.name} milled ${k}`, seat);
      return;
    }
    case "scryBottom": {
      /* client sends ordered iids of the current top N, with bottoms[] to put on bottom */
      const bottoms = new Set(a.bottoms || []);
      const top = me.zones.library.splice(0, Number(a.n || 0));
      const keep = [];
      const bot = [];
      for (const c of top) (bottoms.has(c.iid) ? bot : keep).push(c);
      me.zones.library = [...keep, ...me.zones.library, ...bot];
      log(t, `${me.name} scried ${top.length}`, seat);
      return;
    }
    case "concede": {
      const oppSeat = (seat + 1) % 2;
      endGame(t, oppSeat, `${me.name} conceded`);
      return;
    }
    case "declareWinner": {
      const winSeat = Number(a.winnerSeat);
      if (winSeat === 0 || winSeat === 1) {
        endGame(t, winSeat, `Declared winner by ${me.name}`);
      }
      return;
    }
    case "setWager": {
      if (t.started) throw new Error("match already started");
      const w = Math.max(0, Math.min(100000, Number(a.wager || 0)));
      t.wager = w;
      for (const s of t.seats) s.wagerAgreed = false;
      log(t, `${me.name} set table wager to ${t.wager} 🪙 Gold (pot: ${t.wager * 2} 🪙)`, seat);
      return;
    }
    case "agreeWager": {
      me.wagerAgreed = true;
      log(t, `${me.name} agreed to the ${t.wager} 🪙 Gold wager`, seat);
      return;
    }
    case "claimFaucet": {
      const rec = getPlayerRecord(me);
      if (rec) {
        rec.balance = (rec.balance || 0) + 500;
        recordTx(rec, {
          kind: "gold",
          title: "Hearth refill",
          detail: "Claimed 500 Gold",
          amount: 500,
          amountUnit: "GOLD",
          status: "confirmed",
          chain: "table",
        });
        if (!rec.isGuest) {
          rec.lastFaucet = now();
          saveUsers();
        }
      }
      log(t, `🪙 ${me.name} claimed 500 Gold from the Hearth Refill! ✨`, seat);
      return;
    }
    case "rematch": {
      if (!t.ended) return;
      t.started = false;
      t.ended = false;
      t.escrowed = false;
      t.pot = 0;
      t.winnerSeat = null;
      t.payout = null;
      t.turn = 1;
      t.phase = "main1";
      t.activeSeat = 0;
      t.firstTurn = true;
      t.stack = [];
      const startingLife = FORMAT_LIFE[t.format] || 20;
      for (const s of t.seats) {
        s.ready = false;
        s.life = startingLife;
        s.poison = 0;
        s.energy = 0;
        s.commanderTax = 0;
        s.mulligans = 0;
        s.wagerAgreed = false;
        s.zones = {
          library: [],
          hand: [],
          battlefield: [],
          graveyard: [],
          exile: [],
          command: [],
          sideboard: [],
        };
      }
      log(t, "⚔️ Rematch initiated! Pick your decks and get ready.");
      return;
    }
    case "interrupt": {
      log(t, `${me.name} has a response`, seat);
      t.interrupt = { seat, at: now() };
      return;
    }
    case "clearInterrupt": {
      t.interrupt = null;
      return;
    }
    default:
      throw new Error("unknown action " + kind);
  }
}

function clamp01(n) {
  n = Number(n);
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0.02, Math.min(0.98, n));
}

function drawForTurn(t) {
  if (!t.autoDraw || t.drewThisTurn) return;
  const skipDraw = t.firstTurn && t.activeSeat === 0;
  if (skipDraw) {
    t.drewThisTurn = true;
    return;
  }
  const s = t.seats[t.activeSeat];
  if (!s || !s.zones.library.length) return;
  s.zones.hand.push(s.zones.library.shift());
  t.drewThisTurn = true;
  log(t, `${s.name} drew for turn`);
}

function passTurnInternal(t, announce) {
  if (t.combat && t.combat.step === "blockers") resolveCombat(t);
  t.combat = null;
  t.activeSeat = (t.activeSeat + 1) % 2;
  t.phase = "untap";
  t.drewThisTurn = false;
  if (t.activeSeat === 0) t.turn += 1;
  if (announce) log(t, `Turn ${t.turn} — ${t.seats[t.activeSeat].name}`);
  beginTurn(t);
}

function beginTurn(t) {
  const s = t.seats[t.activeSeat];
  for (const st of t.seats) {
    for (const c of st.zones.battlefield) {
      c.hasAttacked = false;
    }
  }
  if (t.autoUntap) {
    for (const c of s.zones.battlefield) c.tapped = false;
  }
  t.phase = "upkeep";
  drawForTurn(t);
  t.phase = "main1";
  t.firstTurn = false;
}

function summarizeTable(t) {
  return {
    code: t.code,
    name: t.name,
    format: t.format,
    wager: t.wager || 0,
    pot: t.pot || 0,
    started: t.started,
    ended: t.ended,
    timerEnabled: !!t.timerEnabled,
    botDifficulty: t.botDifficulty || "normal",
    winnerSeat: t.winnerSeat,
    seats: t.seats.map((s) => ({
      name: s.name,
      isBot: !!s.isBot,
      ready: s.ready,
      connected: s.connected,
      deckName: s.deckName,
      life: s.life,
      wagerAgreed: !!s.wagerAgreed,
    })),
    joinUrl: `${preferLanUrl()}/#/table/${t.code}`,
  };
}

function broadcast(t) {
  for (const ws of sockets) {
    if (ws.readyState !== 1) continue;
    if (ws.tableCode !== t.code) continue;
    try {
      ws.send(JSON.stringify({ t: "state", state: viewFor(t, ws.playerId) }));
    } catch {
      /* ignore */
    }
  }
  maybeRunBot(t);
}

function maybeRunBot(t) {
  if (!t || !t.started || t.ended) return;
  const botSeatIdx = t.seats.findIndex((s) => s.isBot);
  if (botSeatIdx < 0) return;
  const bot = t.seats[botSeatIdx];
  const oppSeatIdx = (botSeatIdx + 1) % 2;
  const opp = t.seats[oppSeatIdx];

  // If stack has cards, resolve after brief delay
  if (t.stack && t.stack.length > 0 && !t._botStackTimer) {
    t._botStackTimer = setTimeout(() => {
      t._botStackTimer = null;
      if (t.stack && t.stack.length > 0 && !t.ended) {
        applyAction(t, bot.playerId, { kind: "resolve" });
        broadcast(t);
      }
    }, 850);
    return;
  }

  // If it's bot's turn:
  if (t.activeSeat === botSeatIdx && !t._botThinking) {
    t._botThinking = true;
    setTimeout(() => {
      executeBotTurn(t, botSeatIdx);
    }, 700);
  }
}

function executeBotTurn(t, seatIdx) {
  if (!t || !t.started || t.ended || t.activeSeat !== seatIdx) {
    if (t) t._botThinking = false;
    return;
  }
  const bot = t.seats[seatIdx];
  const opp = t.seats[(seatIdx + 1) % 2];
  const diff = resolveBotDifficulty(t.botDifficulty);

  // 1. Untap all bot cards
  for (const c of bot.zones.battlefield) c.tapped = false;
  // 2. Draw card if not already drawn
  if (!t.drewThisTurn && !(t.turn === 1 && seatIdx === 0)) {
    const skipDraw = diff === "easy" && Math.random() < 0.3;
    if (!skipDraw && bot.zones.library.length) {
      bot.zones.hand.push(bot.zones.library.shift());
      log(t, `${bot.name} drew a card 🎴`, seatIdx);
      if (diff === "hard" && Math.random() < 0.3 && bot.zones.library.length) {
        bot.zones.hand.push(bot.zones.library.shift());
        log(t, `${bot.name} drew an extra card 🎴✨ (${diff} AI)`, seatIdx);
      }
    }
    t.drewThisTurn = true;
  }
  t.phase = "main1";
  broadcast(t);

  setTimeout(() => {
    if (!t || !t.started || t.ended || t.activeSeat !== seatIdx) {
      if (t) t._botThinking = false;
      return;
    }

    // 2. Play Land from Hand (1 land per turn)
    const landIdx = bot.zones.hand.findIndex((c) => isLandCard(c));
    if (landIdx >= 0) {
      const [land] = bot.zones.hand.splice(landIdx, 1);
      land.x = 0.25 + Math.random() * 0.5;
      land.y = 0.35 + Math.random() * 0.12;
      land.z = now();
      land.tapped = false;
      land.enteredAtTurn = t.turn;
      land.enteredAtSeat = seatIdx;
      land.hasAttacked = false;
      bot.zones.battlefield.push(land);
      log(t, `${bot.name} played ${land.name} 🌿`, seatIdx);
      broadcast(t);
    }

    // 3. Play Creatures or Spells from Hand (hard AI may cast twice, easy once)
    const maxCasts = diff === "hard" ? 2 : 1;
    function castStep(attempt) {
      if (!t || !t.started || t.ended || t.activeSeat !== seatIdx) {
        if (t) t._botThinking = false;
        return;
      }
      if (attempt >= maxCasts) {
        combatStep();
        return;
      }
      const untappedLands = bot.zones.battlefield.filter((c) => isLandCard(c) && !c.tapped);
      const castables = bot.zones.hand
        .map((c, idx) => ({ c, idx, cmc: c.cmc || 0 }))
        .filter((x) => !isLandCard(x.c) && x.cmc <= untappedLands.length)
        .sort((a, b) => b.cmc - a.cmc);

      // easy AI fumbles a bit: 25% chance to skip casting
      const skipCast = diff === "easy" && Math.random() < 0.25;
      if (castables.length > 0 && !skipCast) {
        const pickDiff = diff === "hard" ? 0 : 0;
        const pick = castables[Math.min(pickDiff, castables.length - 1)];
        const [card] = bot.zones.hand.splice(pick.idx, 1);
        const cost = Math.max(0, pick.cmc);
        for (let i = 0; i < cost && i < untappedLands.length; i++) {
          untappedLands[i].tapped = true;
        }
        if (isPermanentCard(card)) {
          card.x = 0.2 + Math.random() * 0.6;
          card.y = 0.18 + Math.random() * 0.14;
          card.z = now();
          card.tapped = false;
          card.enteredAtTurn = t.turn;
          card.enteredAtSeat = seatIdx;
          card.hasAttacked = false;
          bot.zones.battlefield.push(card);
          log(t, `${bot.name} cast ${card.name} ✨`, seatIdx);
        } else {
          bot.zones.graveyard.unshift(card);
          if (/deal.*damage/i.test(card.oracle_text || "")) {
            opp.life = Math.max(0, opp.life - (diff === "hard" ? 4 : 3));
            log(t, `${bot.name} blasted ${opp.name} with ${card.name} for ${diff === "hard" ? 4 : 3} damage! ⚡`, seatIdx);
          } else {
            log(t, `${bot.name} cast ${card.name} 📜`, seatIdx);
          }
        }
        broadcast(t);
        setTimeout(() => castStep(attempt + 1), 500);
      } else {
        combatStep();
      }
    }

    function combatStep() {
      if (!t || !t.started || t.ended || t.activeSeat !== seatIdx) {
        if (t) t._botThinking = false;
        return;
      }

      // 4. Combat Phase: Attack with eligible creatures
      t.phase = "combat";
      let attackers = bot.zones.battlefield.filter(
        (c) => !isLandCard(c) && !c.tapped && !/\bDefender\b/i.test(c.keywords?.join(" ") || "")
      );

      // easy AI sometimes holds back; hard AI always swings
      const holdBack = diff === "easy" && Math.random() < 0.5;
      if (holdBack && attackers.length > 0) {
        log(t, `${bot.name} bided their time and held back this turn 🐣`, seatIdx);
        attackers = [];
      }

      if (attackers.length > 0) {
        t.combat = {
          step: "blockers",
          attackerSeat: seatIdx,
          attackers: attackers.map((c) => {
            c.tapped = true;
            c.hasAttacked = true;
            return {
              iid: c.iid,
              name: c.name,
              power: creaturePower(c),
              blockedBy: null,
              blockerName: null,
            };
          }),
        };
        log(t, `⚔️ ${bot.name} attacks with ${attackers.map((c) => c.name).join(", ")}. You may block.`, seatIdx);
        broadcast(t);
        if (t) t._botThinking = false;
        return;
      }

      scheduleBotEnd(t, seatIdx);
      return;
    }

    setTimeout(() => castStep(0), 650);
  }, 600);
}

/* ═══════════════════════════════════════════════════════════════════════
   ADVENTURE SYSTEMS — booster packs & collection, daily quests & streaks,
   achievements, bot difficulty & rewards, limited draft mode
   ═══════════════════════════════════════════════════════════════════════ */

function dayKey(ts = now()) {
  const d = new Date(ts);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${d.getUTCFullYear()}-${mm}-${dd}`;
}

function ensureUserVitals(u) {
  if (!u) return;
  if (typeof u.balance !== "number") u.balance = 1000;
  if (!u.stats) u.stats = {};
  if (!u.collection) u.collection = {}; // cardName(lower) -> count
  if (!u.achievements) u.achievements = {}; // achievementId -> unlockedAt ts
  if (!u.quests) u.quests = { day: null, list: [], claimedDay: null, streak: 0, lastClaim: null };
}

function collectionCount(u) {
  if (!u || !u.collection) return 0;
  let n = 0;
  for (const k of Object.keys(u.collection)) n += u.collection[k] || 0;
  return n;
}

function recordTx(user, entry) {
  if (!user || user.isGuest) return;
  if (!Array.isArray(user.txHistory)) user.txHistory = [];
  const hash = entry.hash ? String(entry.hash) : null;
  user.txHistory.unshift({
    id: "tx-" + uid(8),
    time: now(),
    kind: entry.kind || "note",
    title: String(entry.title || "Transaction").slice(0, 80),
    detail: String(entry.detail || "").slice(0, 180),
    amount: typeof entry.amount === "number" ? entry.amount : null,
    amountUnit: entry.amountUnit || null,
    hash,
    status: entry.status || "confirmed",
    chain: entry.chain || "table",
    url: entry.url || (hash && /^0x[0-9a-fA-F]{64}$/.test(hash) ? `https://sepolia.etherscan.io/tx/${hash}` : null),
  });
  if (user.txHistory.length > 40) user.txHistory.length = 40;
}

function grantGold(u, amount, reason) {
  ensureUserVitals(u);
  u.balance = (u.balance || 0) + amount;
  u.stats.goldEarned = (u.stats.goldEarned || 0) + amount;
  recordTx(u, {
    kind: "gold",
    title: "Gold received",
    detail: reason || "Credit",
    amount,
    amountUnit: "GOLD",
    status: "confirmed",
    chain: "table",
  });
}

function spendGold(u, amount, reason) {
  ensureUserVitals(u);
  if ((u.balance || 0) < amount) return false;
  u.balance -= amount;
  u.stats.goldSpent = (u.stats.goldSpent || 0) + amount;
  recordTx(u, {
    kind: "gold",
    title: "Gold spent",
    detail: reason || "Debit",
    amount: -amount,
    amountUnit: "GOLD",
    status: "confirmed",
    chain: "table",
  });
  return true;
}

/* ---- seeded PRNG (deterministic per day+player) ---- */
function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ---- booster packs & collection ---- */
const PACK_CATALOG = (() => {
  const bySet = new Map();
  const RARITY_KEY = { common: "c", uncommon: "u", rare: "r", mythic: "m" };
  const sources = [cards, oldPrintings];
  for (const src of sources) {
    for (const c of src) {
      const code = (c.set || "").toLowerCase();
      if (!code) continue;
      let e = bySet.get(code);
      if (!e) {
        e = { code, name: c.set_name || code.toUpperCase(), c: 0, u: 0, r: 0, m: 0 };
        bySet.set(code, e);
      }
      const rk = RARITY_KEY[(c.rarity || "").toLowerCase()];
      if (rk) e[rk] += 1;
    }
  }
  const pick = (code) => bySet.get(code) || null;
  const curated = [
    { code: "lea", name: null, price: 120, icon: "🏛️", tier: "Classic Old School" },
    { code: "4ed", name: null, price: 120, icon: "📜", tier: "Classic Old School" },
    { code: "ice", name: null, price: 120, icon: "❄️", tier: "Classic Old School" },
    { code: "mir", name: null, price: 120, icon: "🪞", tier: "Classic Old School" },
    { code: "m20", name: "Core Set 2020", price: 200, icon: "🟡", tier: "Core Set" },
    { code: "fdn", name: "Foundations", price: 200, icon: "🟢", tier: "Core Set" },
    { code: "neo", name: "Kamigawa: Neon Dynasty", price: 200, icon: "🌸", tier: "Modern Expansion" },
    { code: "znr", name: "Zendikar Rising", price: 200, icon: "🏔️", tier: "Modern Expansion" },
    { code: "snc", name: "Streets of New Capenna", price: 200, icon: "🏙️", tier: "Modern Expansion" },
    { code: "khm", name: "Kaldheim", price: 200, icon: "🪓", tier: "Modern Expansion" },
    { code: "lci", name: "The Lost Caverns of Ixalan", price: 200, icon: "🦖", tier: "Modern Expansion" },
    { code: "mom", name: "March of the Machine", price: 200, icon: "🤖", tier: "Modern Expansion" },
    { code: "woe", name: "Wilds of Eldraine", price: 200, icon: "🍄", tier: "Modern Expansion" },
    { code: "one", name: "Phyrexia: All Will Be One", price: 200, icon: "💉", tier: "Modern Expansion" },
    { code: "bro", name: "The Brothers' War", price: 200, icon: "⚙️", tier: "Modern Expansion" },
  ];
  const out = [];
  for (const p of curated) {
    const e = pick(p.code);
    if (!e) continue;
    out.push({
      id: p.code,
      name: p.name || e.name,
      tier: p.tier,
      icon: p.icon,
      price: p.price,
      counts: { common: e.c, uncommon: e.u, rare: e.r, mythic: e.m },
      cardCount: bySet.get(p.code) ? e.c + e.u + e.r + e.m : 0,
    });
  }
  return out;
})();

function sampleRandom(arr, n) {
  const out = [];
  const used = new Set();
  const max = Math.min(n, arr.length);
  let guard = 0;
  while (out.length < max && guard++ < 2000) {
    const i = (Math.random() * arr.length) | 0;
    if (!used.has(i)) {
      used.add(i);
      out.push(arr[i]);
    }
  }
  return out;
}

function rarityPools(setCode) {
  const pools = { c: [], u: [], r: [], m: [] };
  const code = setCode.toLowerCase();
  const RARITY_KEY = { common: "c", uncommon: "u", rare: "r", mythic: "m" };
  const sources = [cards, oldPrintings];
  for (const src of sources) {
    for (const c of src) {
      if ((c.set || "").toLowerCase() !== code) continue;
      const rk = RARITY_KEY[(c.rarity || "").toLowerCase()];
      if (rk) pools[rk].push(c);
    }
  }
  return pools;
}

const CARD_INDEX = (() => {
  const idx = new Map(); // "name|set" -> card instance
  for (const c of cards) {
    const k = `${c.name.toLowerCase()}|${(c.set || "").toLowerCase()}`;
    if (!idx.has(k)) idx.set(k, c);
  }
  return idx;
})();

function craftPack(setCode) {
  const pools = rarityPools(setCode);
  const pack = [];
  for (const c of sampleRandom(pools.c, 10)) pack.push(summarizeCardForPack(c));
  for (const c of sampleRandom(pools.u, 3)) pack.push(summarizeCardForPack(c));
  let rarePool = pools.r;
  if (pools.m.length > 0 && Math.random() < 0.45) rarePool = pools.m;
  for (const c of sampleRandom(rarePool, 1)) pack.push(summarizeCardForPack(c));
  // top up with commons if a rarity bucket ran dry
  let guard = 0;
  while (pack.length < 14 && guard++ < 60) pack.push(summarizeCardForPack(sampleRandom(pools.c, 1)[0] || cards[(Math.random() * cards.length) | 0]));
  return pack;
}

function summarizeCardForPack(c) {
  return {
    id: c.id,
    name: c.name,
    set: c.set,
    set_name: c.set_name,
    rarity: c.rarity,
    mana_cost: c.mana_cost,
    cmc: c.cmc,
    type_line: c.type_line,
    oracle_text: c.oracle_text,
    power: c.power,
    toughness: c.toughness,
    colors: c.colors,
    color_identity: c.color_identity,
    image: `/api/img/${c.id}?size=normal`,
  };
}

function addToCollection(u, pack) {
  ensureUserVitals(u);
  const added = {};
  for (const c of pack) {
    const k = String(c.name).toLowerCase();
    u.collection[k] = (u.collection[k] || 0) + 1;
    added[k] = (added[k] || 0) + 1;
  }
  return added;
}

/* ---- daily quests & streaks ---- */
const QUEST_POOL = [
  { id: "play_game", name: "Practice Sparring", desc: "Finish a game of Magic", icon: "⚔️", target: 1, reward: 75 },
  { id: "win_game", name: "Claim Victory", desc: "Win a game of Magic", icon: "👑", target: 1, reward: 100 },
  { id: "win_bot", name: "Bot Slayer", desc: "Win a match against the AI", icon: "🤖", target: 1, reward: 100 },
  { id: "open_pack", name: "Crack Open a Booster", desc: "Open a booster pack", icon: "🎁", target: 1, reward: 60 },
  { id: "draft_game", name: "Limited Strategist", desc: "Play a boosters draft game", icon: "🎲", target: 1, reward: 120 },
  { id: "donate_guild", name: "Guild Patron", desc: "Donate gold to a guild", icon: "🛡️", target: 1, reward: 80 },
  { id: "play_commander", name: "Commander Session", desc: "Play a Commander game", icon: "🦾", target: 1, reward: 90 },
];

function todayQuests(u) {
  const day = dayKey();
  const rnd = mulberry32(hashStr(day + (u.id || "guest")));
  const order = [...QUEST_POOL].sort(() => rnd() - 0.5);
  return order.slice(0, 4);
}

function resetQuests(day) {
  return { day, list: todayQuests({ id: "" }).map((q) => ({ id: q.id, progress: 0, done: false })), claimedDay: null };
}

function getQuestData(u) {
  ensureUserVitals(u);
  const day = dayKey();
  if (!u.quests || u.quests.day !== day) {
    const fresh = resetQuests(day);
    // preserve streak across a missed day
    if (u.quests && u.quests.lastClaim && u.quests.lastClaim !== dayKey(now() - 86400000)) {
      fresh.streak = 0;
      fresh.lastClaim = null;
    }
    u.quests = { ...fresh, streak: u.quests ? u.quests.streak || 0 : 0, lastClaim: u.quests ? u.quests.lastClaim : null };
  }
  return u.quests;
}

function bumpQuest(u, questId, n = 1) {
  ensureUserVitals(u);
  const qd = getQuestData(u);
  const q = qd.list.find((x) => x.id === questId);
  if (!q || q.done) return false;
  const def = QUEST_POOL.find((d) => d.id === questId);
  q.progress = Math.min(def ? def.target : 1, (q.progress || 0) + n);
  if (q.progress >= (def ? def.target : 1)) {
    q.done = true;
    grantGold(u, def ? def.reward : 50, "quest");
    u.stats.questsDone = (u.stats.questsDone || 0) + 1;
    return true; // completed this tick
  }
  return false;
}

function claimDailyReward(u) {
  ensureUserVitals(u);
  const qd = getQuestData(u);
  if (qd.claimedDay === dayKey()) return null;
  const reward = 100 + Math.min(12, qd.streak || 0) * 25;
  qd.claimedDay = dayKey();
  qd.streak = (qd.streak || 0) + 1;
  qd.lastClaim = dayKey();
  grantGold(u, reward, "daily");
  return reward;
}

function dailyRewardInfo(u) {
  const qd = getQuestData(u);
  const claimed = qd.claimedDay === dayKey();
  return {
    claimed,
    streak: qd.streak || 0,
    nextReward: claimed ? 0 : 100 + Math.min(12, qd.streak || 0) * 25,
  };
}

/* ---- achievements ---- */
const ACHIEVEMENTS = [
  { id: "first_game", name: "First Steps", desc: "Play your very first game", icon: "🌱", reward: 50, check: (u) => (u.stats.games || 0) >= 1 },
  { id: "first_win", name: "Path of Victory", desc: "Win your first game", icon: "⚔️", reward: 50, check: (u) => (u.wins || 0) >= 1 },
  { id: "streak_3", name: "On Fire", desc: "Reach a 3-win streak", icon: "🔥", reward: 75, check: (u) => (u.stats.bestStreak || 0) >= 3 },
  { id: "win_10", name: "Deckmaster", desc: "Win 10 games", icon: "🏆", reward: 150, check: (u) => (u.wins || 0) >= 10 },
  { id: "bot_slayer", name: "Bot Bane", desc: "Win 5 matches against the AI", icon: "🤖", reward: 100, check: (u) => (u.stats.botWins || 0) >= 5 },
  { id: "pack_rat", name: "Pack Rat", desc: "Crack 5 booster packs", icon: "🎁", reward: 75, check: (u) => (u.stats.packsOpened || 0) >= 5 },
  { id: "collector_50", name: "Curator", desc: "Collect 50 unique cards", icon: "🗂️", reward: 75, check: (u) => Object.keys(u.collection || {}).length >= 50 },
  { id: "collector_200", name: "Archivist", desc: "Collect 200 unique cards", icon: "📚", reward: 200, check: (u) => Object.keys(u.collection || {}).length >= 200 },
  { id: "draft_win", name: "First Pick", desc: "Win a Limited draft game", icon: "🎲", reward: 100, check: (u) => (u.stats.draftWins || 0) >= 1 },
  { id: "draft_master", name: "Draft Master", desc: "Win 3 Limited draft games", icon: "🧠", reward: 250, check: (u) => (u.stats.draftWins || 0) >= 3 },
  { id: "wealthy", name: "Landowner", desc: "Hold 2,000 gold at once", icon: "🪙", reward: 100, check: (u) => (u.balance || 0) >= 2000 },
  { id: "tycoon", name: "Gold Baron", desc: "Hold 10,000 gold at once", icon: "💎", reward: 300, check: (u) => (u.balance || 0) >= 10000 },
  { id: "make_friend", name: "Bonded", desc: "Make your first friend", icon: "🤝", reward: 50, check: (u) => (u.stats.friendsMade || 0) >= 1 },
  { id: "guild_initiate", name: "Guild Initiate", desc: "Join a guild", icon: "🛡️", reward: 75, check: (u) => !!u.guildId || guilds.some((g) => (g.members || []).some((m) => m.id === u.id)) },
  { id: "dao_voter", name: "Voice of the Realm", desc: "Vote on a DAO proposal", icon: "🗳️", reward: 75, check: (u) => (u.stats.daoVotes || 0) >= 1 },
  { id: "loyal", name: "Loyal Subject", desc: "Claim a 3-day login streak", icon: "📅", reward: 100, check: (u) => (u.quests ? u.quests.streak || 0 : 0) >= 3 },
];

function evaluateAchievements(u) {
  ensureUserVitals(u);
  const out = [];
  let newly = 0;
  for (const a of ACHIEVEMENTS) {
    const unlocked = !!u.achievements[a.id];
    if (!unlocked && a.check(u)) {
      u.achievements[a.id] = now();
      grantGold(u, a.reward, "achievement");
      newly += 1;
    }
    out.push({
      id: a.id,
      name: a.name,
      desc: a.desc,
      icon: a.icon,
      reward: a.reward,
      unlocked: unlocked || !!u.achievements[a.id],
      unlockedAt: u.achievements[a.id] || null,
    });
  }
  if (newly > 0) saveUsers();
  return { list: out, newly };
}

/* ---- limited draft mode (single-player vs 7 bots) ---- */
const drafts = new Map(); // userId -> draft session
const DRAFT_SETS = [...PACK_CATALOG.filter((p) => p.counts.common >= 10)].slice(0, 8).map((p) => p);

function createDraft(user, setCode) {
  const packDef = PACK_CATALOG.find((p) => p.id === setCode) || DRAFT_SETS[0];
  const session = {
    setCode: packDef.id,
    setIcon: packDef.icon,
    packs: [craftPack(packDef.id), craftPack(packDef.id), craftPack(packDef.id)],
    picks: [], // card summaries picked by the player
    round: 0, // 0..20 (7 per pack)
    startedAt: now(),
    complete: false,
  };
  drafts.set(user.id, session);
  return session;
}

function draftState(user) {
  const s = drafts.get(user.id);
  if (!s) return null;
  const packIdx = Math.floor(s.round / 7);
  const inPack = s.round % 7;
  if (packIdx >= 3) {
    s.complete = true;
    return { complete: true, packsDone: 3, picks: s.picks, setCode: s.setCode };
  }
  return {
    complete: false,
    setCode: s.setCode,
    setIcon: s.setIcon,
    packIndex: packIdx,
    packPick: inPack,
    packSize: s.packs[packIdx].length,
    pack: s.packs[packIdx].map(summarizeCardForPack),
    picks: s.picks,
    totalPicks: s.picks.length,
    setCircle: 0,
  };
}

function draftPick(user, index) {
  const s = drafts.get(user.id);
  if (!s) throw new Error("No active draft — start one first");
  const packIdx = Math.floor(s.round / 7);
  if (packIdx >= 3) throw new Error("Draft already complete");
  const pack = s.packs[packIdx];
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= pack.length) throw new Error("Invalid pick index");
  const picked = pack.splice(idx, 1)[0];
  s.picks.push(summarizeCardForPack(picked));
  // bots take 1 card each round from this pack
  if (pack.length > 1) pack.splice((Math.random() * pack.length) | 0, 1);
  s.round += 1;
  const done = Math.floor(s.round / 7) >= 3;
  if (done) s.complete = true;
  return { ...draftState(user), lastPick: summarizeCardForPack(picked) };
}

const BASIC_LANDS = {
  W: "Plains",
  U: "Island",
  B: "Swamp",
  R: "Mountain",
  G: "Forest",
};

function buildDraftDeck(user) {
  const s = drafts.get(user.id);
  if (!s || !s.complete) throw new Error("Draft is not complete yet");
  ensureUserVitals(user);
  // count picks
  const cardsByName = {};
  for (const c of s.picks) {
    const k = String(c.name).toLowerCase();
    cardsByName[k] = (cardsByName[k] || 0) + 1;
  }
  const colorCount = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const c of s.picks) {
    for (const col of c.color_identity || []) if (colorCount[col] !== undefined) colorCount[col] += 1;
  }
  const total = Object.values(colorCount).reduce((a, b) => a + b, 0) || 1;
  // add basics until 40 cards total
  const mainEntry = s.picks.find((c) => /^Legendary Creature .*Commander|^Legendary/i.test(c.type_line || ""));
  let lack = 40 - s.picks.length;
  const landCounts = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const colors = Object.keys(colorCount).filter((c) => colorCount[c] > 0);
  while (lack > 0 && colors.length > 0) {
    const col = colors[(Math.random() * colors.length) | 0];
    landCounts[col] += 1;
    lack -= 1;
  }
  if (lack > 0) landCounts.G += lack; // safety fallback
  const cardList = [];
  for (const c of s.picks) cardList.push({ name: c.name, count: 1 });
  for (const col of Object.keys(landCounts)) {
    const landName = BASIC_LANDS[col];
    if (!landName || landCounts[col] <= 0) continue;
    const existing = cardList.find((x) => x.name === landName);
    if (existing) existing.count += landCounts[col];
    else cardList.push({ name: landName, count: landCounts[col] });
  }
  const deck = {
    id: uid(10),
    userId: user.id,
    authorName: user.displayName || user.username,
    name: `🎲 Limited Draft · ${new Date(s.startedAt).toISOString().slice(0, 10)}`,
    format: "duel",
    commander: mainEntry && /Commander/i.test(mainEntry.type_line || "") ? mainEntry.name : null,
    cards: cardList,
    starter: false,
    draft: true,
    draftSet: s.setCode,
    created: now(),
    updated: now(),
  };
  writeDeck(deck);
  drafts.delete(user.id);
  return deck;
}

function playDraftInfo(t, seatIdx) {
  const s = t.seats[seatIdx];
  if (!s || !s.deckId) return null;
  const d = readDeck(s.deckId);
  return d && d.draft ? d : null;
}

/* ---- bot difficulty ---- */
const BOT_REWARDS = { easy: 50, normal: 100, hard: 200 };
const BOT_DIFFS = ["easy", "normal", "hard"];
const BOT_SKIN = {
  easy: { name: "🐣 Pip (apprentice AI)", color: "#4ade80" },
  normal: { name: "🤖 Sparky (AI)", color: "#38bdf8" },
  hard: { name: "👹 Titan (AI overlord)", color: "#ef4444" },
};

function resolveBotDifficulty(d) {
  const v = String(d || "normal").toLowerCase();
  return BOT_DIFFS.includes(v) ? v : "normal";
}

function trackMatchOutcome(t, winnerSeat, reason) {
  // award human stats + bot rewards + quests for a finished match
  let botReward = 0;
  for (let i = 0; i < t.seats.length; i++) {
    const s = t.seats[i];
    if (!s || s.isBot || !s.playerId) continue;
    const rec = getPlayerRecord(s);
    if (!rec) continue;
    ensureUserVitals(rec);
    rec.stats.games = (rec.stats.games || 0) + 1;
    const opp = t.seats[(i + 1) % t.seats.length];
    const iWon = winnerSeat === i;
    const vsBot = !!opp && opp.isBot;
    const isDraft = !!playDraftInfo(t, i);
    if (isDraft) rec.stats.draftsPlayed = (rec.stats.draftsPlayed || 0) + 1;
    if (iWon) {
      if (vsBot) {
        const diff = resolveBotDifficulty(t.botDifficulty);
        const reward = BOT_REWARDS[diff] || 100;
        rec.stats.botWins = (rec.stats.botWins || 0) + 1;
        grantGold(rec, reward, "bot_win");
        botReward += reward;
        t.botReward = (t.botReward || 0) + reward;
        t.botWinnerName = s.name;
        bumpQuest(rec, "win_bot", 1);
      }
      if (isDraft) rec.stats.draftWins = (rec.stats.draftWins || 0) + 1;
      bumpQuest(rec, "win_game", 1);
    } else if (vsBot) {
      rec.stats.botLosses = (rec.stats.botLosses || 0) + 1;
    }
    bumpQuest(rec, "play_game", 1);
    if ((t.format || "").toLowerCase() === "commander") bumpQuest(rec, "play_commander", 1);
    if (isDraft) bumpQuest(rec, "draft_game", 1);
    if (!rec.isGuest) saveUsers();
  }
  if (botReward > 0) {
    log(t, `🤖 Reward: ${t.botWinnerName || "You"} earned ${botReward} 🪙 for defeating the AI!`, winnerSeat);
  }
  return botReward;
}

/* ---------- http ---------- */

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "8mb" }));
app.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, cards: cards.length, tables: tables.size });
});

function getAuthToken(req) {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
  if (req.query && req.query.token) return String(req.query.token).trim();
  return null;
}

function authUser(req) {
  const token = getAuthToken(req);
  if (!token) return null;
  const claims = verifyToken(token);
  if (!claims) return null;
  return findUserById(claims.sub) || null;
}

// Issue a single-use, server-signed sign-in challenge. The wallet must sign
// the exact message returned here.
app.post("/api/auth/challenge", (req, res) => {
  const { address, chain = "ethereum" } = req.body || {};
  let addr = String(address || "").trim();
  if (!addr || addr.length < 8 || addr.length > 90) {
    return res.status(400).json({ error: "A valid wallet address is required" });
  }
  const ch = chain === "solana" ? "solana" : "ethereum";
  if (ch === "ethereum" && ethers.isAddress(addr)) {
    try {
      addr = ethers.getAddress(addr);
    } catch {}
  }

  pruneChallenges();
  const nonce = crypto.randomBytes(16).toString("hex");
  const host = req.get("host") || "localhost";
  const origin = `${req.protocol}://${host}`;
  const domain = host || "localhost";
  const message = buildSignInMessage({ domain, origin, address: addr, chain: ch, nonce });

  SIGNIN_CHALLENGES.set(nonce, {
    message,
    address: addr,
    chain: ch,
    expiresAt: Date.now() + CHALLENGE_TTL_MS,
    used: false,
  });

  res.json({ ok: true, nonce, message, chain: ch, expiresIn: Math.floor(CHALLENGE_TTL_MS / 1000) });
});

const BS58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function decodeBase58(s) {
  const str = String(s || "");
  let zeros = 0;
  while (zeros < str.length && str[zeros] === "1") zeros++;
  const b256 = [];
  for (let i = zeros; i < str.length; i++) {
    const v = BS58_ALPHABET.indexOf(str[i]);
    if (v < 0) throw new Error("invalid base58");
    let carry = v;
    for (let j = 0; j < b256.length; j++) {
      carry += b256[j] * 58;
      b256[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      b256.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const out = Buffer.alloc(zeros + b256.length);
  for (let i = 0; i < b256.length; i++) out[zeros + i] = b256[b256.length - 1 - i];
  return out;
}

function verifySolanaSignature(message, signatureHex, address) {
  const pubkey = decodeBase58(address);
  if (pubkey.length !== 32) return false;
  const sig = Buffer.from(String(signatureHex || "").replace(/^0x/, ""), "hex");
  if (sig.length !== 64) return false;
  const spki = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), pubkey]);
  const key = crypto.createPublicKey({ key: spki, format: "der", type: "spki" });
  return crypto.verify(null, Buffer.from(String(message), "utf8"), key, sig);
}

app.post(["/api/auth/wallet", "/api/auth/web3"], (req, res) => {
  const { address, chain = "ethereum", signature, message, nonce, displayName, network } = req.body || {};
  const addr = String(address || "").trim();
  if (!addr || addr.length < 8 || addr.length > 90) {
    return res.status(400).json({ error: "A valid wallet address is required" });
  }

  const isSolana = chain === "solana";
  const lowerAddr = addr.toLowerCase();

  if (!signature || !message) {
    return res.status(400).json({ error: "Cryptographic signature and sign-in message required for wallet authentication" });
  }
  if (!nonce) {
    return res.status(400).json({ error: "Missing sign-in challenge. Request /api/auth/challenge first." });
  }

  // Replay protection: the signed message must match a live, single-use
  // challenge the server issued for this exact address.
  const challengeErr = consumeChallenge(nonce, message, addr);
  if (challengeErr) {
    console.warn(`[auth/wallet] ❌ Challenge rejected for ${addr}: ${challengeErr}`);
    return res.status(400).json({ error: challengeErr });
  }

  // Cryptographically verify authentic signature from a real wallet
  if (chain === "ethereum") {
    try {
      const recovered = ethers.verifyMessage(message, signature);
      if (recovered.toLowerCase() !== lowerAddr) {
        console.warn(`[auth/wallet] ❌ Signature mismatch: recovered ${recovered} vs expected ${addr}`);
        return res.status(400).json({
          error: `Signature verification failed: recovered ${recovered} does not match ${addr}`
        });
      }
      console.log(`[auth/wallet] ✅ Verified authentic on-chain EVM signature for ${addr} on ${network || "sepolia"}`);
    } catch (verifyErr) {
      console.warn(`[auth/wallet] ❌ EVM verify error:`, verifyErr.message);
      return res.status(400).json({
        error: "Cryptographic signature verification failed: " + (verifyErr.message || verifyErr)
      });
    }
  } else if (isSolana) {
    try {
      if (!verifySolanaSignature(message, signature, addr)) {
        return res.status(400).json({ error: "Solana signature verification failed" });
      }
      console.log(`[auth/wallet] ✅ Verified Solana signature for ${addr}`);
    } catch (verifyErr) {
      console.warn(`[auth/wallet] ❌ Solana verify error:`, verifyErr.message);
      return res.status(400).json({
        error: "Solana signature verification failed: " + (verifyErr.message || verifyErr)
      });
    }
  } else {
    return res.status(400).json({ error: "Unsupported wallet chain" });
  }

  let user = users.find((u) => {
    if (!u.walletAddress) return false;
    return isSolana ? u.walletAddress === addr : u.walletAddress.toLowerCase() === lowerAddr;
  });

  // If already logged in, link wallet to this existing account
  const currentAuthed = authUser(req);
  if (currentAuthed && !user) {
    currentAuthed.walletAddress = addr;
    currentAuthed.walletChain = chain;
    if (!Array.isArray(currentAuthed.badges)) currentAuthed.badges = [];
    if (!currentAuthed.badges.includes("web3_verified")) currentAuthed.badges.push("web3_verified");
    saveUsers();
    // Reuse the caller's existing valid token if present, otherwise mint one.
    const existing = getAuthToken(req);
    const claims = existing ? verifyToken(existing) : null;
    const token = claims && claims.sub === currentAuthed.id ? existing : issueToken(currentAuthed).token;
    return res.json({ ok: true, token, user: sanitizeUser(currentAuthed) });
  }

  if (!user) {
    // Provision new decentralized wizard account
    const shortAddr = addr.startsWith("0x") ? addr.slice(2, 8).toLowerCase() : addr.slice(0, 6).toLowerCase();
    let un = `web3_${shortAddr}`;
    let counter = 1;
    while (findUserByUsername(un)) {
      un = `web3_${shortAddr}_${counter++}`;
    }

    const defaultDn = addr.startsWith("0x")
      ? `${addr.slice(0, 6)}…${addr.slice(-4)}`
      : `${addr.slice(0, 4)}…${addr.slice(-4)}`;

    user = {
      id: "u-" + uid(10),
      username: un,
      displayName: String(displayName || defaultDn).trim().slice(0, 32),
      walletAddress: addr,
      walletChain: chain,
      balance: 1000,
      wins: 0,
      losses: 0,
      badges: ["web3_verified", "remilia_citizen"],
      created: now(),
      lastFaucet: now(),
      bio: `Decentralized Planeswalker [${chain.toUpperCase()}] · Verified Web3 Hearth Citizen`,
    };
    users.push(user);
    saveUsers();
  } else {
    if (chain) user.walletChain = chain;
    if (!Array.isArray(user.badges)) user.badges = [];
    if (!user.badges.includes("web3_verified")) user.badges.push("web3_verified");
    saveUsers();
  }

  recordTx(user, {
    kind: "signin",
    title: "Proved wallet ownership",
    detail: chain === "solana" ? "Signed in with Phantom on Solana" : "Signed in on Ethereum Sepolia",
    hash: signature ? String(signature) : null,
    status: "signed",
    chain: chain === "solana" ? "solana" : "sepolia",
  });
  saveUsers();

  const { token } = issueToken(user);
  res.json({ ok: true, token, user: sanitizeUser(user) });
});

app.get("/api/auth/me", (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Not logged in" });
  res.json({ ok: true, user: sanitizeUser(user) });
});

app.post("/api/auth/logout", (req, res) => {
  const token = getAuthToken(req);
  const claims = token ? verifyToken(token) : null;
  if (claims && claims.jti) REVOKED_TOKENS.add(claims.jti);
  res.json({ ok: true });
});

app.post("/api/auth/faucet", (req, res) => {
  const user = authUser(req);
  if (!user) {
    const guestId = req.body && req.body.playerId;
    if (guestId) {
      if (!guestUsers.has(guestId)) {
        guestUsers.set(guestId, {
          id: guestId,
          username: "guest_" + guestId.slice(0, 6),
          displayName: "Guest Planeswalker",
          balance: 1000,
          wins: 0,
          losses: 0,
          isGuest: true,
        });
      }
      const g = guestUsers.get(guestId);
      g.balance = (g.balance || 0) + 500;
      for (const t of tables.values()) {
        if (t.seats.some((s) => s.playerId === guestId)) broadcast(t);
      }
      return res.json({ ok: true, balance: g.balance, user: sanitizeUser(g) });
    }
    return res.status(401).json({ error: "Not logged in" });
  }
  user.balance = (user.balance || 0) + 500;
  user.lastFaucet = now();
  recordTx(user, {
    kind: "gold",
    title: "Hearth refill",
    detail: "Claimed 500 Gold",
    amount: 500,
    amountUnit: "GOLD",
    status: "confirmed",
    chain: "table",
  });
  saveUsers();
  for (const t of tables.values()) {
    if (t.seats.some((s) => s.userId === user.id)) broadcast(t);
  }
  res.json({ ok: true, balance: user.balance, user: sanitizeUser(user) });
});

async function sepoliaAddressTxs(address) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`https://eth-sepolia.blockscout.com/api/v2/addresses/${address}/transactions`, { signal: ctrl.signal });
    if (!res.ok) return [];
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    return items.slice(0, 15).map((tx) => {
      let eth = null;
      try {
        if (tx.value != null) eth = Number(BigInt(tx.value)) / 1e18;
      } catch {}
      const inbound = tx.to && tx.to.hash && tx.to.hash.toLowerCase() === address.toLowerCase();
      return {
        id: tx.hash,
        time: tx.timestamp ? Date.parse(tx.timestamp) : now(),
        kind: "chain",
        title: tx.method || (inbound ? "Received on Sepolia" : "Sent on Sepolia"),
        detail: `${(tx.from && tx.from.hash || "").slice(0, 8)}… → ${(tx.to && tx.to.hash || "").slice(0, 8)}…`,
        amount: eth,
        amountUnit: "ETH",
        hash: tx.hash,
        status: tx.status || tx.result || "confirmed",
        chain: "sepolia",
        url: tx.hash ? `https://sepolia.etherscan.io/tx/${tx.hash}` : null,
      };
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

app.get("/api/wallet/history", async (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Log in to see wallet history" });
  const local = Array.isArray(user.txHistory) ? user.txHistory.map((tx) => ({ ...tx })) : [];
  let chain = [];
  if (user.walletAddress && user.walletChain !== "solana") {
    chain = await sepoliaAddressTxs(user.walletAddress);
  }
  const seen = new Set(local.map((tx) => tx.hash).filter(Boolean));
  const merged = local.slice();
  for (const tx of chain) {
    if (tx.hash && seen.has(tx.hash)) continue;
    merged.push(tx);
  }
  merged.sort((a, b) => (b.time || 0) - (a.time || 0));
  res.json({ ok: true, txs: merged.slice(0, 40) });
});

app.post("/api/wallet/history", (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Log in to record a transaction" });
  const body = req.body || {};
  recordTx(user, {
    kind: body.kind || "signature",
    title: body.title || "Wallet signature",
    detail: body.detail || "",
    amount: typeof body.amount === "number" ? body.amount : null,
    amountUnit: body.amountUnit || null,
    hash: body.hash || null,
    status: body.status || "signed",
    chain: body.chain || (user.walletChain === "solana" ? "solana" : "sepolia"),
    url: body.url || null,
  });
  saveUsers();
  res.json({ ok: true, txs: user.txHistory });
});

app.get("/api/leaderboard", (_req, res) => {
  const list = users
    .map(sanitizeUser)
    .sort((a, b) => (b.balance || 0) - (a.balance || 0) || (b.wins || 0) - (a.wins || 0))
    .slice(0, 25);
  res.json(list);
});

/* ---------- Player Profile & Avatar Upload ---------- */

app.post("/api/auth/profile", (req, res) => {
  let user = authUser(req);
  const { displayName, avatar, bio, playerId } = req.body || {};
  if (!user) {
    const pid = playerId || req.headers["x-player-id"];
    if (pid) {
      if (!guestUsers.has(pid)) {
        guestUsers.set(pid, {
          id: pid,
          username: "guest_" + pid.slice(0, 6),
          displayName: "Player",
          balance: 1000,
          wins: 0,
          losses: 0,
          isGuest: true,
          stats: { streak: 0, bestStreak: 0, totalWon: 0 },
          badges: [],
        });
      }
      user = guestUsers.get(pid);
    }
  }
  if (!user) return res.status(401).json({ error: "Not logged in" });
  const unlinkWallet = req.body && (req.body.unlinkWallet === true || req.body.walletAddress === "" || req.body.walletAddress === null);
  if (unlinkWallet) {
    user.walletAddress = null;
    user.walletChain = null;
    if (Array.isArray(user.badges)) {
      user.badges = user.badges.filter((b) => b !== "web3_verified");
    }
    if (!user.isGuest) saveUsers();
    // Auth is wallet-only: without a linked wallet the account can never
    // sign in again, so always revoke outstanding tokens.
    const tok = getAuthToken(req);
    const claims = tok ? verifyToken(tok) : null;
    if (claims && claims.jti) REVOKED_TOKENS.add(claims.jti);
    if (!user.isGuest) {
      REVOKED_BY_USER.add(user.id);
    }
    return res.json({ ok: true, loggedOut: true, user: null });
  }
  if (displayName) {
    user.displayName = String(displayName).trim().slice(0, 32);
  }
  if (bio != null) {
    user.bio = String(bio).trim().slice(0, 240);
  }
  if (avatar) {
    if (avatar.startsWith("data:image/")) {
      try {
        const match = avatar.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (match) {
          const ext = match[1] === "jpeg" ? "jpg" : match[1];
          const buffer = Buffer.from(match[2], "base64");
          const avatarFilename = `${user.id}.${ext}`;
          const avatarPath = path.join(AVATARS_DIR, avatarFilename);
          fs.writeFileSync(avatarPath, buffer);
          user.avatar = `/api/avatars/${user.id}?v=${now()}`;
        } else {
          user.avatar = avatar;
        }
      } catch {
        user.avatar = avatar;
      }
    } else {
      user.avatar = String(avatar).trim();
    }
  }
  if (!user.isGuest) {
    saveUsers();
  }
  for (const t of tables.values()) {
    if (t.seats.some((s) => s.userId === user.id || s.playerId === user.id)) broadcast(t);
  }
  res.json({ ok: true, user: sanitizeUser(user) });
});

app.get("/api/avatars/:id", (req, res) => {
  const userId = req.params.id;
  const extensions = ["png", "jpg", "jpeg", "webp", "gif"];
  for (const ext of extensions) {
    const file = path.join(AVATARS_DIR, `${userId}.${ext}`);
    if (fs.existsSync(file)) {
      res.setHeader("Cache-Control", "public, max-age=86400");
      return res.sendFile(file);
    }
  }
  return res.sendFile(path.join(PUBLIC, "img", "cardback.jpg"));
});

/* ---------- DAO Treasury & Governance ---------- */

app.get("/api/dao", (_req, res) => {
  res.json(daoData);
});

app.post("/api/dao/vote", (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Log in to vote in the Multiverse DAO" });
  const { proposalId, vote } = req.body || {};
  const prop = daoData.proposals.find((p) => p.id === proposalId);
  if (!prop) return res.status(404).json({ error: "Proposal not found" });
  if (prop.status !== "active") return res.status(400).json({ error: "Proposal voting is closed" });
  if (!prop.voters) prop.voters = {};
  if (prop.voters[user.id]) {
    return res.status(400).json({ error: "You already cast a vote on this proposal!" });
  }
  const weight = Math.max(100, user.balance || 100);
  if (vote === "for") {
    prop.votesFor = (prop.votesFor || 0) + weight;
  } else {
    prop.votesAgainst = (prop.votesAgainst || 0) + weight;
  }
  prop.voters[user.id] = { vote, weight, time: now() };
  ensureUserVitals(user);
  user.stats.daoVotes = (user.stats.daoVotes || 0) + 1;
  saveDaoData();
  saveUsers();
  res.json({ ok: true, proposal: prop, message: `Voted ${vote.toUpperCase()} with ${weight.toLocaleString()} voting power! ✨` });
});

app.post("/api/dao/propose", (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Log in to create a proposal" });
  const { title, description, cost } = req.body || {};
  const t = String(title || "").trim();
  if (!t || t.length < 5) return res.status(400).json({ error: "Proposal title must be at least 5 characters" });
  const d = String(description || "").trim();
  if (!d || d.length < 10) return res.status(400).json({ error: "Proposal description must be at least 10 characters" });
  const c = Math.max(0, parseInt(cost, 10) || 0);
  const prop = {
    id: "prop-" + uid(8),
    title: t.slice(0, 100),
    description: d.slice(0, 1000),
    creator: user.username,
    creatorName: user.displayName || user.username,
    cost: c,
    votesFor: Math.max(100, user.balance || 100),
    votesAgainst: 0,
    status: "active",
    created: now(),
    voters: {
      [user.id]: { vote: "for", weight: Math.max(100, user.balance || 100), time: now() },
    },
  };
  daoData.proposals.unshift(prop);
  saveDaoData();
  res.json({ ok: true, proposal: prop });
});

app.post("/api/dao/fee", (req, res) => {
  const { feePercent } = req.body || {};
  const fee = Math.max(0, Math.min(25, Math.round(Number(feePercent) || 3)));
  const oldFee = daoData.feePercent || 3;
  daoData.feePercent = fee;
  const user = authUser(req);
  const authorName = user ? (user.displayName || user.username) : "DAO Community";
  daoData.transactions.unshift({
    id: "tx-" + uid(8),
    timestamp: now(),
    type: "fee_update",
    amount: fee,
    feePercent: fee,
    description: `DAO Governance updated match wager fee from ${oldFee}% to ${fee}% (authorized by ${authorName})`,
  });
  saveDaoData();
  res.json({ ok: true, feePercent: fee, message: `Match wager fee updated to ${fee}%! ✨` });
});

/* ---------- Admin Panel Endpoints ---------- */

function checkAdmin(req) {
  const key = req.headers["x-admin-key"];
  if (key === "arcane-dao-2026") return true;
  const user = authUser(req);
  return isUserAdmin(user);
}

app.get("/api/admin/overview", (req, res) => {
  if (!checkAdmin(req)) return res.status(403).json({ error: "Admin access required" });
  const totalGold = users.reduce((sum, u) => sum + (u.balance || 0), 0);
  res.json({
    ok: true,
    stats: {
      totalUsers: users.length,
      totalGold,
      activeTables: tables.size,
      daoBalance: daoData.balance,
      daoFeePercent: daoData.feePercent,
      daoTotalCollected: daoData.totalCollected || 0,
    },
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      displayName: u.displayName || u.username,
      balance: u.balance || 0,
      wins: u.wins || 0,
      losses: u.losses || 0,
      stats: u.stats || {},
      isAdmin: isUserAdmin(u),
      created: u.created,
    })),
    tables: [...tables.values()].map(summarizeTable),
    dao: daoData,
  });
});

app.post("/api/admin/user/gold", (req, res) => {
  if (!checkAdmin(req)) return res.status(403).json({ error: "Admin access required" });
  const { targetUserId, amount, reason } = req.body || {};
  const u = findUserById(targetUserId) || findUserByUsername(targetUserId);
  if (!u) return res.status(404).json({ error: "User not found" });
  const delta = parseInt(amount, 10) || 0;
  u.balance = Math.max(0, (u.balance || 0) + delta);
  recordTx(u, {
    kind: "gold",
    title: delta < 0 ? "Gold adjusted down" : "Gold adjusted up",
    detail: reason || "Admin adjustment",
    amount: delta,
    amountUnit: "GOLD",
    status: "confirmed",
    chain: "table",
  });
  saveUsers();
  for (const t of tables.values()) {
    if (t.seats.some((s) => s.userId === u.id)) broadcast(t);
  }
  res.json({ ok: true, user: sanitizeUser(u), delta, reason });
});

app.post("/api/admin/dao/fee", (req, res) => {
  if (!checkAdmin(req)) return res.status(403).json({ error: "Admin access required" });
  const { feePercent } = req.body || {};
  const fee = Math.max(0, Math.min(25, Number(feePercent) || 3));
  daoData.feePercent = fee;
  saveDaoData();
  res.json({ ok: true, feePercent: fee });
});

app.post("/api/admin/dao/adjust", (req, res) => {
  if (!checkAdmin(req)) return res.status(403).json({ error: "Admin access required" });
  const { amount, description } = req.body || {};
  const delta = parseInt(amount, 10) || 0;
  daoData.balance = Math.max(0, (daoData.balance || 0) + delta);
  daoData.transactions.unshift({
    id: "tx-" + uid(8),
    timestamp: now(),
    type: delta >= 0 ? "admin_grant" : "admin_spend",
    amount: Math.abs(delta),
    description: description || (delta >= 0 ? "Admin grant to DAO Treasury" : "Admin withdrawal from DAO Treasury"),
  });
  saveDaoData();
  res.json({ ok: true, balance: daoData.balance });
});

app.post("/api/admin/tables/close", (req, res) => {
  if (!checkAdmin(req)) return res.status(403).json({ error: "Admin access required" });
  const code = String(req.body.code || "").toUpperCase();
  const t = tables.get(code);
  if (t) {
    if (t.escrowed && t.pot > 0) {
      const refund = Math.floor(t.pot / 2);
      for (const s of t.seats) {
        const r = getPlayerRecord(s);
        if (r) {
          r.balance = (r.balance || 0) + refund;
          if (!r.isGuest) saveUsers();
        }
      }
    }
    tables.delete(code);
    saveTables();
    return res.json({ ok: true, closed: code });
  }
  res.status(404).json({ error: "Table not found" });
});

/* ---------- Guilds System ---------- */

app.get("/api/guilds", (_req, res) => {
  res.json(guilds);
});

app.post("/api/guilds", (req, res) => {
  const user = authUser(req);
  const { name, crest, motto } = req.body || {};
  const n = String(name || "").trim().slice(0, 40);
  if (!n) return res.status(400).json({ error: "Guild name is required" });
  const g = {
    id: "guild-" + uid(8),
    name: n,
    crest: String(crest || "🛡️").slice(0, 4),
    motto: String(motto || "Strength and Honor").slice(0, 120),
    level: 1,
    vault: 0,
    leader: user ? (user.displayName || user.username) : "Founder",
    members: user ? [{ id: user.id, username: user.username, displayName: user.displayName || user.username, role: "Guildmaster", donated: 0 }] : [],
    messages: [{
      id: "m-" + uid(6),
      author: user ? (user.displayName || user.username) : "Founder",
      text: `Welcome to ${n}! A new order rises in the multiverse. ✨`,
      timestamp: now(),
    }],
  };
  guilds.push(g);
  saveGuilds();
  res.json({ ok: true, guild: g });
});

app.post("/api/guilds/:id/join", (req, res) => {
  const g = guilds.find((x) => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: "Guild not found" });
  const user = authUser(req);
  const uidVal = user ? user.id : (req.body.playerId || "guest-" + uid(6));
  const name = user ? (user.displayName || user.username) : (req.body.playerName || "Adventurer");
  if (!g.members) g.members = [];
  if (g.members.some((m) => m.id === uidVal)) {
    return res.status(400).json({ error: "You are already a member of this guild" });
  }
  g.members.push({ id: uidVal, username: name, displayName: name, role: "Member", donated: 0 });
  saveGuilds();
  res.json({ ok: true, guild: g, message: `Joined ${g.name}! 🛡️` });
});

app.post("/api/guilds/:id/donate", (req, res) => {
  const g = guilds.find((x) => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: "Guild not found" });
  const user = authUser(req);
  const amount = Math.max(1, parseInt(req.body.amount, 10) || 100);
  if (user) {
    if ((user.balance || 0) < amount) return res.status(400).json({ error: "Insufficient gold balance" });
    user.balance -= amount;
    recordTx(user, {
      kind: "gold",
      title: "Guild donation",
      detail: `Donated to ${g.name}`,
      amount: -amount,
      amountUnit: "GOLD",
      status: "confirmed",
      chain: "table",
    });
    bumpQuest(user, "donate_guild", 1);
    saveUsers();
  }
  g.vault = (g.vault || 0) + amount;
  g.level = 1 + Math.floor(g.vault / 2500);
  if (!g.members) g.members = [];
  const mem = user && g.members.find((m) => m.id === user.id);
  if (mem) mem.donated = (mem.donated || 0) + amount;
  saveGuilds();
  res.json({ ok: true, vault: g.vault, level: g.level, userBalance: user ? user.balance : null, message: `Donated ${amount.toLocaleString()} Gold to ${g.name} Vault! 🪙` });
});

app.post("/api/guilds/:id/message", (req, res) => {
  const g = guilds.find((x) => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: "Guild not found" });
  const user = authUser(req);
  const author = user ? (user.displayName || user.username) : (req.body.author || "Adventurer");
  const text = String(req.body.text || "").trim().slice(0, 300);
  if (!text) return res.status(400).json({ error: "Message text cannot be empty" });
  if (!g.messages) g.messages = [];
  g.messages.push({
    id: "m-" + uid(6),
    author,
    text,
    timestamp: now(),
  });
  if (g.messages.length > 50) g.messages = g.messages.slice(-50);
  saveGuilds();
  res.json({ ok: true, message: g.messages[g.messages.length - 1] });
});

/* ---------- Leagues & Tournaments ---------- */

app.get("/api/leagues", (_req, res) => {
  res.json(leagues);
});

app.post("/api/leagues", (req, res) => {
  const user = authUser(req);
  const { name, description, format, entryFee, rules } = req.body || {};
  const n = String(name || "").trim().slice(0, 60);
  if (!n) return res.status(400).json({ error: "League name is required" });
  const fee = Math.max(0, parseInt(entryFee, 10) || 100);
  const leg = {
    id: "league-" + uid(8),
    name: n,
    description: String(description || "").slice(0, 300),
    format: format || "duel",
    entryFee: fee,
    prizePool: fee * 4,
    status: "active",
    season: "Season 1",
    rules: String(rules || "Standard Tournament Rules. 3 points per win.").slice(0, 200),
    standings: user ? [{ userId: user.id, name: user.displayName || user.username, wins: 0, losses: 0, points: 0, deck: "Main Deck" }] : [],
  };
  leagues.push(leg);
  saveLeagues();
  res.json({ ok: true, league: leg });
});

app.post("/api/leagues/:id/join", (req, res) => {
  const leg = leagues.find((x) => x.id === req.params.id);
  if (!leg) return res.status(404).json({ error: "League not found" });
  const user = authUser(req);
  const uidVal = user ? user.id : (req.body.playerId || "player-" + uid(6));
  const name = user ? (user.displayName || user.username) : (req.body.playerName || "Challenger");
  const deck = req.body.deck || "Custom Deck";
  if (!leg.standings) leg.standings = [];
  if (leg.standings.some((s) => s.userId === uidVal)) {
    return res.status(400).json({ error: "You are already registered in this league" });
  }
  if (user && leg.entryFee > 0) {
    if ((user.balance || 0) < leg.entryFee) {
      return res.status(400).json({ error: `Insufficient balance for ${leg.entryFee} Gold entry fee` });
    }
    user.balance -= leg.entryFee;
    recordTx(user, {
      kind: "gold",
      title: "League entry",
      detail: leg.name || "League",
      amount: -leg.entryFee,
      amountUnit: "GOLD",
      status: "confirmed",
      chain: "table",
    });
    saveUsers();
  }
  leg.prizePool = (leg.prizePool || 0) + leg.entryFee;
  leg.standings.push({ userId: uidVal, name, wins: 0, losses: 0, points: 0, deck });
  saveLeagues();
  res.json({ ok: true, league: leg, message: `Registered for ${leg.name}! Entry fee added to prize pool. 🏆` });
});

app.post("/api/leagues/:id/match", (req, res) => {
  const leg = leagues.find((x) => x.id === req.params.id);
  if (!leg) return res.status(404).json({ error: "League not found" });
  const { winnerId, loserId } = req.body || {};
  if (!leg.standings) leg.standings = [];
  const w = leg.standings.find((s) => s.userId === winnerId);
  const l = leg.standings.find((s) => s.userId === loserId);
  if (w) {
    w.wins = (w.wins || 0) + 1;
    w.points = (w.points || 0) + 3;
  }
  if (l) {
    l.losses = (l.losses || 0) + 1;
  }
  leg.standings.sort((a, b) => (b.points || 0) - (a.points || 0) || (b.wins || 0) - (a.wins || 0));
  saveLeagues();
  res.json({ ok: true, standings: leg.standings });
});

/* ---------- D&D Campaigns & Map Builder ---------- */

app.get("/api/dnd/data", (_req, res) => {
  res.json(dndData);
});

app.post("/api/dnd/campaigns", (req, res) => {
  const user = authUser(req);
  const { title, realm, synopsis, notes } = req.body || {};
  const t = String(title || "New Adventure").trim().slice(0, 80);
  const camp = {
    id: "camp-" + uid(8),
    title: t,
    dm: user ? (user.displayName || user.username) : "Dungeon Master",
    realm: String(realm || "Forgotten Realms").slice(0, 60),
    status: "Active",
    synopsis: String(synopsis || "An epic journey into unknown danger...").slice(0, 600),
    notes: String(notes || "# DM Notes\n- Party gathers at the tavern.").slice(0, 2000),
    chapters: [{ id: "ch-1", title: "Chapter 1: The Beginning", status: "in_progress", xp: 300 }],
    npcs: [],
    activeMapId: null,
  };
  dndData.campaigns.unshift(camp);
  saveDndData();
  res.json({ ok: true, campaign: camp });
});

app.put("/api/dnd/campaigns/:id", (req, res) => {
  const camp = dndData.campaigns.find((c) => c.id === req.params.id);
  if (!camp) return res.status(404).json({ error: "Campaign not found" });
  const { title, realm, synopsis, notes, chapters, npcs, activeMapId, status } = req.body || {};
  if (title) camp.title = String(title).slice(0, 80);
  if (realm) camp.realm = String(realm).slice(0, 60);
  if (synopsis) camp.synopsis = String(synopsis).slice(0, 600);
  if (notes != null) camp.notes = String(notes).slice(0, 2000);
  if (Array.isArray(chapters)) camp.chapters = chapters;
  if (Array.isArray(npcs)) camp.npcs = npcs;
  if (activeMapId !== undefined) camp.activeMapId = activeMapId;
  if (status) camp.status = status;
  saveDndData();
  res.json({ ok: true, campaign: camp });
});

app.post("/api/dnd/maps", (req, res) => {
  const { name, width, height, campaignId, tiles, tokens } = req.body || {};
  const map = {
    id: "map-" + uid(8),
    name: String(name || "Encounter Battlemap").slice(0, 60),
    width: Math.max(10, Math.min(40, parseInt(width, 10) || 20)),
    height: Math.max(8, Math.min(30, parseInt(height, 10) || 14)),
    campaignId: campaignId || null,
    tiles: tiles || {},
    tokens: Array.isArray(tokens) ? tokens : [],
  };
  dndData.maps.unshift(map);
  saveDndData();
  res.json({ ok: true, map });
});

app.put("/api/dnd/maps/:id", (req, res) => {
  let map = dndData.maps.find((m) => m.id === req.params.id);
  if (!map) {
    map = { id: req.params.id, name: "Battlemap", width: 20, height: 14, tiles: {}, tokens: [] };
    dndData.maps.unshift(map);
  }
  const { name, width, height, campaignId, tiles, tokens } = req.body || {};
  if (name) map.name = String(name).slice(0, 60);
  if (width) map.width = Math.max(10, Math.min(40, parseInt(width, 10) || 20));
  if (height) map.height = Math.max(8, Math.min(30, parseInt(height, 10) || 14));
  if (campaignId !== undefined) map.campaignId = campaignId;
  if (tiles) map.tiles = tiles;
  if (Array.isArray(tokens)) map.tokens = tokens;
  saveDndData();
  res.json({ ok: true, map });
});

app.get("/api/info", (_req, res) => {
  const lan = lanAddresses();
  res.json({
    name: "The Crypto Game",
    port: PORT,
    lan,
    url: preferLanUrl(),
    urls: lan.map((a) => `http://${a.address}:${PORT}`),
    catalog: catalogMeta,
    cardCount: cards.length,
    oldPrintings: oldPrintings.length,
    tokenCount: tokens.length,
    formats: Object.keys(FORMAT_LIFE),
    xmage: fs.existsSync(path.join(DATA, "xmage")) ? "/data/xmage on disk" : null,
  });
});

app.get("/api/sets", (_req, res) => {
  res.json(allSetGroups);
});

app.get("/api/cards", (req, res) => {
  res.json(searchCards(req.query));
});

app.get("/api/cards/:id", (req, res) => {
  const c = byId.get(req.params.id);
  if (!c) return res.status(404).json({ error: "not found" });
  res.json(publicCard(c));
});

app.get("/api/img/:id", async (req, res) => {
  const c = byId.get(req.params.id);
  const size = req.query.size === "small" ? "small" : "normal";
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  if (!c) {
    return res.sendFile(path.join(PUBLIC, "img", "cardback.jpg"));
  }
  try {
    const file = await enqueueImg(() => fetchImage(c, size));
    res.type("jpg").sendFile(file);
  } catch (err) {
    res.sendFile(path.join(PUBLIC, "img", "cardback.jpg"));
  }
});

app.get("/api/decks", (req, res) => {
  const user = authUser(req);
  const filterUserId = req.query.userId || (req.query.my === "1" && user ? user.id : null);
  res.json(listDecks(filterUserId));
});

app.get("/api/decks/:id", (req, res) => {
  const d = readDeck(req.params.id);
  if (!d) return res.status(404).json({ error: "not found" });
  res.json(d);
});

app.post("/api/decks", (req, res) => {
  const user = authUser(req);
  const deck = {
    id: uid(10),
    userId: user ? user.id : (req.body.userId || null),
    authorName: user ? (user.displayName || user.username) : (req.body.authorName || null),
    name: String(req.body.name || "Untitled deck").slice(0, 80),
    format: req.body.format || "duel",
    commander: req.body.commander || null,
    cards: req.body.cards || [],
    starter: false,
    created: now(),
    updated: now(),
  };
  writeDeck(deck);
  res.json(deck);
});

app.put("/api/decks/:id", (req, res) => {
  const user = authUser(req);
  const prev = readDeck(req.params.id);
  if (!prev) return res.status(404).json({ error: "not found" });

  const isStarter = !!prev.starter;
  const isOwnedByOther = prev.userId && user && prev.userId !== user.id && !user.isAdmin;
  const shouldFork = isStarter || isOwnedByOther || req.body.fork === true;

  if (shouldFork) {
    const forkedId = uid(10);
    const deck = {
      id: forkedId,
      userId: user ? user.id : (req.body.userId || null),
      authorName: user ? (user.displayName || user.username) : (req.body.authorName || null),
      name: String(req.body.name || prev.name).slice(0, 80),
      format: req.body.format || prev.format,
      commander: req.body.commander ?? prev.commander,
      cards: req.body.cards || prev.cards,
      starter: false,
      forkedFrom: prev.id,
      created: now(),
      updated: now(),
    };
    writeDeck(deck);
    return res.json({ ...deck, forked: true, originalId: prev.id });
  }

  const deck = {
    ...prev,
    userId: user ? user.id : (prev.userId || req.body.userId || null),
    authorName: user ? (user.displayName || user.username) : (prev.authorName || req.body.authorName || null),
    name: String(req.body.name || prev.name).slice(0, 80),
    format: req.body.format || prev.format,
    commander: req.body.commander ?? prev.commander,
    cards: req.body.cards || prev.cards,
    starter: false,
    updated: now(),
  };
  writeDeck(deck);
  res.json(deck);
});

app.delete("/api/decks/:id", (req, res) => {
  const p = path.join(DECKS_DIR, `${req.params.id}.json`);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  res.json({ ok: true });
});

app.post("/api/decks/parse", (req, res) => {
  res.json(parseDeckText(req.body.text || ""));
});

/* ---------- online presence & friends ---------- */

app.get("/api/presence", (_req, res) => {
  res.json(getOnlinePlayers());
});

app.post("/api/presence/update", (req, res) => {
  const user = authUser(req);
  const myId = user ? user.id : (req.body.playerId || null);
  const { location, statusText, tableCode } = req.body || {};
  for (const ws of sockets) {
    if (ws.userId === myId || ws.playerId === myId) {
      if (location) ws.location = location;
      if (statusText) ws.statusText = statusText;
      if (tableCode !== undefined) ws.tableCode = tableCode;
      ws.lastSeen = now();
    }
  }
  broadcastPresence();
  res.json({ ok: true });
});

app.get("/api/friends", (req, res) => {
  const user = authUser(req);
  const myId = user ? user.id : (req.query.playerId || null);
  if (!myId) return res.json({ friends: [], incoming: [], outgoing: [] });
  res.json({
    friends: getFriendsList(myId),
    incoming: getIncomingRequests(myId, user ? user.username : null),
    outgoing: getOutgoingRequests(myId),
  });
});

app.post("/api/friends/request", (req, res) => {
  const user = authUser(req);
  const myId = user ? user.id : (req.body.fromPlayerId || null);
  const myName = user ? (user.displayName || user.username) : (req.body.fromName || "Player");
  if (!myId) return res.status(401).json({ error: "Sender identification required" });

  const { toUsername, toUserId, toPlayerId } = req.body || {};
  let targetUser = null;
  let targetId = null;
  let targetName = null;

  if (toUserId) {
    targetUser = findUserById(toUserId);
    targetId = toUserId;
    if (targetUser) targetName = targetUser.displayName || targetUser.username;
  } else if (toUsername) {
    targetUser = findUserByUsername(toUsername);
    if (targetUser) {
      targetId = targetUser.id;
      targetName = targetUser.displayName || targetUser.username;
    } else {
      const onlineMatch = getOnlinePlayers().find(
        (p) =>
          (p.username && p.username.toLowerCase() === toUsername.toLowerCase()) ||
          (p.displayName && p.displayName.toLowerCase() === toUsername.toLowerCase())
      );
      if (onlineMatch) {
        targetId = onlineMatch.userId || onlineMatch.playerId;
        targetName = onlineMatch.displayName;
      }
    }
  } else if (toPlayerId) {
    targetId = toPlayerId;
    const onlineMatch = getOnlinePlayers().find((p) => p.playerId === toPlayerId);
    if (onlineMatch) targetName = onlineMatch.displayName;
  }

  if (!targetId) return res.status(404).json({ error: "Player not found" });
  if (targetId === myId) return res.status(400).json({ error: "Cannot send friend request to yourself" });

  const existingFriends = getFriendIds(myId);
  if (existingFriends.has(targetId)) return res.status(400).json({ error: "Already friends" });

  const pending = friendsData.requests.find(
    (r) =>
      r.status === "pending" &&
      ((r.from === myId && r.to === targetId) || (r.from === targetId && r.to === myId))
  );
  if (pending) return res.status(400).json({ error: "Friend request already pending" });

  const reqObj = {
    id: "freq-" + uid(8),
    from: myId,
    to: targetId,
    fromName: myName,
    fromUsername: user ? user.username : null,
    toUsername: targetName || null,
    status: "pending",
    created: now(),
  };
  friendsData.requests.push(reqObj);
  saveFriends();

  notifyPlayer(targetId, {
    t: "friend:request",
    request: reqObj,
  });

  res.json({ ok: true, request: reqObj });
});

app.post("/api/friends/respond", (req, res) => {
  const user = authUser(req);
  const myId = user ? user.id : (req.body.playerId || null);
  const { requestId, action } = req.body || {};
  const reqObj = friendsData.requests.find((r) => r.id === requestId);
  if (!reqObj) return res.status(404).json({ error: "Request not found" });

  if (
    reqObj.to !== myId &&
    (!user || (reqObj.toUsername && reqObj.toUsername.toLowerCase() !== user.username.toLowerCase()))
  ) {
    return res.status(403).json({ error: "Not authorized to respond to this request" });
  }

  friendsData.requests = friendsData.requests.filter((r) => r.id !== requestId);

  if (action === "accept") {
    const friendship = {
      id: "fr-" + uid(8),
      userA: reqObj.from,
      userB: myId,
      names: {
        [reqObj.from]: reqObj.fromName,
        [myId]: user ? (user.displayName || user.username) : "Player",
      },
      created: now(),
    };
    friendsData.friendships.push(friendship);
    saveFriends();

    const fromUser = findUserById(reqObj.from);
    if (fromUser) {
      ensureUserVitals(fromUser);
      fromUser.stats.friendsMade = (fromUser.stats.friendsMade || 0) + 1;
      saveUsers();
    }
    if (user) {
      ensureUserVitals(user);
      user.stats.friendsMade = (user.stats.friendsMade || 0) + 1;
      saveUsers();
    }

    notifyPlayer(reqObj.from, {
      t: "friend:accepted",
      byName: user ? (user.displayName || user.username) : "Player",
      friendship,
    });

    return res.json({ ok: true, accepted: true, friendship });
  }

  saveFriends();
  res.json({ ok: true, accepted: false });
});

app.delete("/api/friends/:id", (req, res) => {
  const user = authUser(req);
  const myId = user ? user.id : (req.query.playerId || null);
  const fid = req.params.id;
  friendsData.friendships = friendsData.friendships.filter((f) => {
    if (f.id === fid) {
      if (myId && f.userA !== myId && f.userB !== myId) return true;
      return false;
    }
    return true;
  });
  saveFriends();
  res.json({ ok: true });
});

app.post("/api/friends/challenge", (req, res) => {
  const user = authUser(req);
  const myId = req.body.fromPlayerId || (user ? user.id : uid(12));
  const myName = user ? (user.displayName || user.username) : (req.body.fromName || "Player");
  const { toId, wager = 100, format = "duel" } = req.body || {};

  const t = createTable({
    name: `⚔️ Duel: ${myName} vs Friend`,
    format,
    wager: Number(wager) || 0,
    hostId: myId,
    hostName: myName,
    hostUserId: user ? user.id : null,
  });
  t.seats[0].connected = false;

  notifyPlayer(toId, {
    t: "friend:challenge",
    from: myName,
    fromId: myId,
    tableCode: t.code,
    wager: Number(wager) || 0,
    format,
  });

  res.json({ ok: true, tableCode: t.code });
});

app.get("/api/tables", (_req, res) => {
  res.json([...tables.values()].filter((t) => !t.ended).map(summarizeTable));
});

app.get("/api/tables/:code", (req, res) => {
  const t = tables.get(String(req.params.code || "").toUpperCase());
  if (!t) return res.status(404).json({ error: "no table" });
  res.json(summarizeTable(t));
});

app.delete("/api/tables/:code", (req, res) => {
  const code = String(req.params.code || "").toUpperCase();
  const t = tables.get(code);
  if (!t) return res.status(404).json({ error: "no table" });
  if (t.started && !t.ended) {
    return res.status(400).json({ error: "Cannot delete an active table that has already started" });
  }
  t.ended = true;
  tables.delete(code);
  saveTables();
  for (const ws of sockets) {
    if (ws.tableCode === code) {
      ws.tableCode = null;
      try {
        ws.send(JSON.stringify({ t: "closed", error: "Table was closed" }));
      } catch {}
    }
  }
  res.json({ ok: true });
});

app.post("/api/tables/:code/bot", (req, res) => {
  const code = String(req.params.code || "").toUpperCase();
  const t = tables.get(code);
  if (!t) return res.status(404).json({ error: "no table" });
  const botSeat = addBotToTable(t, { difficulty: req.body && req.body.difficulty, botName: req.body && req.body.botName });
  broadcast(t);
  saveTables();
  res.json({ ok: true, botSeat, difficulty: t.botDifficulty });
});

/* ---- adventure systems HTTP ---- */

app.get("/api/shop/packs", (_req, res) => {
  res.json({ ok: true, packs: PACK_CATALOG });
});

app.post("/api/shop/packs/open", (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Log in to open booster packs" });
  const setCode = String((req.body && req.body.setCode) || "").toLowerCase();
  const packDef = PACK_CATALOG.find((p) => p.id === setCode);
  if (!packDef) return res.status(404).json({ error: "Unknown booster set" });
  ensureUserVitals(user);
  if (!spendGold(user, packDef.price, packDef.name || "Booster pack")) {
    return res.status(400).json({ error: `Not enough Gold! A ${packDef.name} booster costs ${packDef.price} 🪙.` });
  }
  const pack = craftPack(packDef.id);
  const added = addToCollection(user, pack);
  user.stats.packsOpened = (user.stats.packsOpened || 0) + 1;
  user.stats.cardsOpened = (user.stats.cardsOpened || 0) + pack.length;
  bumpQuest(user, "open_pack", 1);
  const achievs = evaluateAchievements(user);
  saveUsers();
  const me = sanitizeUser(user);
  res.json({
    ok: true,
    pack,
    packDef,
    added,
    balance: user.balance,
    collectionCount: collectionCount(user),
    uniqueCards: Object.keys(user.collection || {}).length,
    progress: { quests: getQuestData(user).list, achievements: achievs.newly },
    user: me,
  });
});

app.get("/api/collection", (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Log in to view your collection" });
  ensureUserVitals(user);
  const items = Object.entries(user.collection || {})
    .map(([name, count]) => ({ name, count }))
    .filter((x) => x.count > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({ ok: true, total: collectionCount(user), unique: items.length, items });
});

app.get("/api/quests", (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Log in to view your quests" });
  ensureUserVitals(user);
  const qd = getQuestData(user);
  const daily = dailyRewardInfo(user);
  saveUsers();
  res.json({
    ok: true,
    day: qd.day,
    quests: qd.list.map((q) => {
      const def = QUEST_POOL.find((d) => d.id === q.id);
      return { id: q.id, name: def ? def.name : q.id, desc: def ? def.desc : "", icon: def ? def.icon : "✨", reward: def ? def.reward : 0, target: def ? def.target : 1, progress: q.progress, done: q.done };
    }),
    daily,
    balance: user.balance,
  });
});

app.post("/api/quests/claim", (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Log in to claim rewards" });
  ensureUserVitals(user);
  const reward = claimDailyReward(user);
  if (reward == null) return res.status(400).json({ error: "Daily reward already claimed today!" });
  const achievs = evaluateAchievements(user);
  saveUsers();
  res.json({ ok: true, reward, streak: getQuestData(user).streak, balance: user.balance, achievements: achievs.newly, user: sanitizeUser(user) });
});

app.get("/api/achievements", (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Log in to view achievements" });
  ensureUserVitals(user);
  evaluateAchievements(user);
  saveUsers();
  const unlockedCount = Object.keys(user.achievements || {}).length;
  res.json({ ok: true, total: ACHIEVEMENTS.length, unlockedCount, list: ACHIEVEMENTS.map((a) => ({ id: a.id, name: a.name, desc: a.desc, icon: a.icon, reward: a.reward, unlocked: !!user.achievements[a.id], unlockedAt: user.achievements[a.id] || null })) });
});

app.get("/api/draft/sets", (_req, res) => {
  res.json({ ok: true, sets: DRAFT_SETS });
});

app.post("/api/draft/start", (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Log in to start a Limited draft" });
  const setCode = String((req.body && req.body.setCode) || "").toLowerCase();
  const packDef = PACK_CATALOG.find((p) => p.id === setCode) || DRAFT_SETS[0];
  const entry = 300;
  ensureUserVitals(user);
  if (!spendGold(user, entry, "Limited draft entry")) {
    return res.status(400).json({ error: `A Limited draft costs ${entry} 🪙 Gold.` });
  }
  const session = createDraft(user, packDef.id);
  saveUsers();
  res.json({ ok: true, state: draftState(user), balance: user.balance, packDef: PACK_CATALOG.find((p) => p.id === session.setCode) });
});

app.get("/api/draft/state", (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Log in first" });
  res.json({ ok: true, state: draftState(user) });
});

app.post("/api/draft/pick", (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Log in to pick" });
  try {
    const result = draftPick(user, req.body && req.body.index);
    saveUsers();
    res.json({ ok: true, state: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/draft/deck", (req, res) => {
  const user = authUser(req);
  if (!user) return res.status(401).json({ error: "Log in to build your draft deck" });
  try {
    const deck = buildDraftDeck(user);
    saveUsers();
    res.json({ ok: true, deck });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.use(express.static(PUBLIC));
app.get(/^(?!\/api\/).*/, (_req, res) => {
  res.sendFile(path.join(PUBLIC, "index.html"));
});

const wss = new WebSocketServer({ noServer: true });

function attachUpgrade(httpServer) {
  httpServer.on("upgrade", (request, socket, head) => {
    const url = request.url || "";
    if (url.startsWith("/ws")) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    }
  });
}

function ensureLanCert() {
  const dir = path.join(ROOT, "certs");
  fs.mkdirSync(dir, { recursive: true });
  const keyPath = path.join(dir, "lan-key.pem");
  const certPath = path.join(dir, "lan-cert.pem");
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    const ips = ["127.0.0.1", ...lanAddresses().map((a) => a.address)];
    const dns = ["localhost"];
    const hostName = os.hostname().split(".")[0];
    if (hostName) dns.push(hostName);
    const san = [...dns.map((d) => `DNS:${d}`), ...ips.map((ip) => `IP:${ip}`)].join(",");
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048",
      "-keyout", keyPath, "-out", certPath,
      "-days", "825", "-nodes",
      "-subj", "/CN=The Crypto Game LAN",
      "-addext", `subjectAltName=${san}`,
    ], { stdio: "pipe" });
    console.log(`Created LAN certificate for ${san}`);
  }
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) };
}

// TLS material. By default we mint a self-signed cert for the local
// interfaces, which browsers and wallets warn about. A deployment should
// point TLS_CERT/TLS_KEY at a real certificate — on a tailnet,
// `tailscale cert <host>.<tailnet>.ts.net` issues a publicly-trusted one.
//
// BEHIND_PROXY says the front end already terminates TLS and forwards plain
// HTTP (Fly.io, a reverse proxy, a load balancer). Returning null makes the
// listener speak http, so the app is not forced to hold a certificate it
// cannot get a publicly-trusted one for.
function loadTls() {
  if (process.env.BEHIND_PROXY) {
    if (process.env.TLS_CERT || process.env.TLS_KEY) {
      throw new Error("BEHIND_PROXY is set, so TLS_CERT/TLS_KEY must not be");
    }
    console.log("BEHIND_PROXY is set: serving plain HTTP, TLS is terminated upstream");
    return null;
  }
  const cert = process.env.TLS_CERT;
  const key = process.env.TLS_KEY;
  if (cert && key) {
    if (!fs.existsSync(cert) || !fs.existsSync(key)) {
      throw new Error(`TLS_CERT/TLS_KEY not readable: ${cert} / ${key}`);
    }
    console.log(`using TLS certificate ${cert}`);
    return { cert: fs.readFileSync(cert), key: fs.readFileSync(key) };
  }
  if (cert || key) {
    throw new Error("set both TLS_CERT and TLS_KEY, or neither");
  }
  return ensureLanCert();
}

const tls = loadTls();
const server = tls ? https.createServer(tls, app) : http.createServer(app);
attachUpgrade(server);

wss.on("connection", (ws) => {
  sockets.add(ws);
  ws.playerId = null;
  ws.playerName = "Player";
  ws.tableCode = null;

  ws.on("message", (buf) => {
    let msg;
    try {
      msg = JSON.parse(String(buf));
    } catch {
      return;
    }
    try {
      handleWs(ws, msg);
    } catch (err) {
      ws.send(JSON.stringify({ t: "error", error: err.message || String(err) }));
    }
  });

  ws.on("close", () => {
    sockets.delete(ws);
    if (ws.tableCode) {
      const t = tables.get(ws.tableCode);
      if (t && ws.playerId) {
        const seat = findSeat(t, ws.playerId);
        if (seat >= 0) t.seats[seat].connected = false;
        broadcast(t);
        saveTables();
      }
    }
    broadcastPresence();
  });
});

function handleWs(ws, msg) {
  const type = msg.t;
  if (type === "hello") {
    // A second hello on an already-identified socket is a re-auth, not an
    // arrival: the client sends one after a wallet login so ws.userId can bind
    // to the account it just earned. Keep the seat and status the player
    // already holds, otherwise logging in from the table drops them to the
    // lobby. isGuest is derived from ws.userId, so without this re-hello a
    // successful login still showed as Guest until a full page reload.
    const isReAuth = Boolean(ws.playerId);
    ws.playerId = String(msg.playerId || uid(12));
    ws.token = msg.token || null;
    ws.userId = null;
    ws.location = isReAuth ? ws.location : (msg.location || "lobby");
    ws.statusText = isReAuth ? ws.statusText : (msg.statusText || "In Lobby");
    ws.lastSeen = now();
    let authUserObj = null;
    if (ws.token) {
      const claims = verifyToken(ws.token);
      const u = claims ? findUserById(claims.sub) : null;
      if (u) {
        ws.userId = u.id;
        ws.playerName = u.displayName || u.username;
        authUserObj = sanitizeUser(u);
      }
    }
    if (!authUserObj) {
      ws.playerName = String(msg.name || "Player").slice(0, 32);
      const guestRec = getPlayerRecord({ playerId: ws.playerId, name: ws.playerName });
      authUserObj = sanitizeUser(guestRec);
    }
    ws.send(JSON.stringify({ t: "hello", playerId: ws.playerId, name: ws.playerName, user: authUserObj }));
    broadcastPresence();
    return;
  }
  if (!ws.playerId) throw new Error("say hello first");

  if (type === "rpg_update") {
    ws.rpgX = msg.x;
    ws.rpgY = msg.y;
    ws.rpgDir = msg.dir;
    ws.rpgMoving = msg.moving;
    ws.rpgAvatar = msg.avatar;
    ws.rpgName = msg.name;
    const payload = JSON.stringify({
      t: "rpg_state",
      id: ws.playerId,
      x: ws.rpgX,
      y: ws.rpgY,
      dir: ws.rpgDir,
      moving: ws.rpgMoving,
      avatar: ws.rpgAvatar,
      name: ws.rpgName
    });
    for (const other of sockets) {
      if (other !== ws && other.readyState === 1 && other.location === ws.location) {
        other.send(payload);
      }
    }
    return;
  }

  if (type === "presence:update") {
    if (msg.location) ws.location = msg.location;
    if (msg.statusText) ws.statusText = msg.statusText;
    if (msg.tableCode !== undefined) ws.tableCode = msg.tableCode;
    ws.lastSeen = now();
    broadcastPresence();
    return;
  }

  if (type === "presence:ping") {
    ws.lastSeen = now();
    ws.send(JSON.stringify({ t: "presence:pong", time: now() }));
    return;
  }

  if (type === "ping") {
    ws.send(JSON.stringify({ t: "pong", time: now() }));
    return;
  }

  if (type === "create") {
    const t = createTable({
      name: String(msg.name || "Kitchen table").slice(0, 60),
      format: msg.format || "duel",
      wager: msg.wager || 0,
      hostId: ws.playerId,
      hostName: ws.playerName,
      hostUserId: ws.userId,
      timerEnabled: !!msg.timerEnabled,
    });
    if (msg.vsBot) {
      addBotToTable(t, { difficulty: msg.botDifficulty });
    }
    ws.tableCode = t.code;
    ws.send(JSON.stringify({ t: "joined", code: t.code }));
    broadcast(t);
    broadcastPresence();
    saveTables();
    return;
  }

  if (type === "addBot") {
    const t = tables.get(ws.tableCode);
    if (t) {
      addBotToTable(t, { difficulty: msg.difficulty, botName: msg.botName });
      broadcast(t);
      saveTables();
    }
    return;
  }

  if (type === "join") {
    const code = String(msg.code || "").toUpperCase().trim();
    const t = tables.get(code);
    if (!t) throw new Error("no table with that code");
    let seat = findSeat(t, ws.playerId);
    if (seat < 0 && ws.userId) {
      const uSeat = t.seats.findIndex((s) => s.userId === ws.userId && (!s.connected || s.playerId === ws.playerId));
      if (uSeat >= 0) {
        seat = uSeat;
        t.seats[seat].playerId = ws.playerId;
      }
    }
    if (seat < 0) {
      const want = Number(msg.seat);
      if ((want === 0 || want === 1) && t.seats[want] && !t.seats[want].playerId && !t.seats[want].isBot) {
        seat = want;
      } else {
        seat = t.seats.findIndex((s) => !s.playerId && !s.isBot);
      }
      if (seat < 0) {
        /* reconnect by name? otherwise spectator-as-seat-fail */
        const disconnected = t.seats.findIndex((s) => s.playerId && !s.connected);
        if (disconnected >= 0 && (msg.takeOver || t.started)) {
          t.seats[disconnected].playerId = ws.playerId;
          t.seats[disconnected].userId = ws.userId || t.seats[disconnected].userId;
          t.seats[disconnected].name = ws.playerName || t.seats[disconnected].name;
          t.seats[disconnected].connected = true;
          seat = disconnected;
        } else {
          throw new Error("table is full");
        }
      } else {
        sit(t, seat, ws.playerId, ws.playerName, ws.userId);
      }
    } else {
      t.seats[seat].connected = true;
      if (ws.userId) t.seats[seat].userId = ws.userId;
      t.seats[seat].name = ws.playerName || t.seats[seat].name;
    }
    ws.tableCode = t.code;
    ws.send(JSON.stringify({ t: "joined", code: t.code }));
    broadcast(t);
    broadcastPresence();
    saveTables();
    return;
  }

  if (type === "leave") {
    const t = tables.get(ws.tableCode);
    if (t) {
      const seat = findSeat(t, ws.playerId);
      if (seat >= 0 && !t.started) {
        t.seats[seat] = emptySeat();
      } else if (seat >= 0) {
        t.seats[seat].connected = false;
      }
      broadcast(t);
      saveTables();
    }
    ws.tableCode = null;
    broadcastPresence();
    return;
  }

  const t = tables.get(ws.tableCode);
  if (!t) throw new Error("not at a table");

  if (type === "action") {
    applyAction(t, ws.playerId, msg.a || {});
    broadcast(t);
    return;
  }

  if (type === "rename") {
    ws.playerName = String(msg.name || ws.playerName).slice(0, 32);
    const seat = findSeat(t, ws.playerId);
    if (seat >= 0) t.seats[seat].name = ws.playerName;
    broadcast(t);
  }
}

server.listen(PORT, HOST, () => {
  const scheme = tls ? "https" : "http";
  console.log(`The Crypto Game ${scheme.toUpperCase()} on ${HOST}:${PORT}`);
  console.log(`Local:  ${scheme}://127.0.0.1:${PORT}`);
  for (const a of lanAddresses()) console.log(`LAN:    ${scheme}://${a.address}:${PORT}`);
  if (tls) {
    console.log("Do not use Tailscale for this — share the LAN URL.");
    console.log("The browser will warn about the certificate once. Proceed, then Phantom can connect.");
  }
  attachRpgWorld(server).catch((e) => console.error("RPGJS boot error:", e.message));
});
