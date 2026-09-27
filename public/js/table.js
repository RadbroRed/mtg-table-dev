(() => {
  const { $, $$, api, toast, escapeHtml, nav, bindNav, manaPips, identity, go, openModal, closeModal, connectWS, getCachedUser, fetchMe } = window.MTG;

  const PHASES = ["untap", "upkeep", "draw", "main1", "combat", "main2", "end"];
  const PHASE_LABEL = { untap: "🌙 Untap", upkeep: "☕ Upkeep", draw: "🎴 Draw", main1: "📜 Main 1", combat: "⚔️ Combat", main2: "🛡️ Main 2", end: "🌌 End" };

  window.MTG.openTableModal = async function openTableModal(r) {
    document.body.classList.add("view-table");
    const me = identity(window.MTG_SECOND);
    // Create fullscreen overlay
    let overlay = document.getElementById("table-full-overlay");
    if (overlay) overlay.remove();
    overlay = document.createElement("div");
    overlay.id = "table-full-overlay";
    overlay.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:100050;background:var(--bg);";
    overlay.innerHTML = `<div class="table-screen" id="table-root" style="height:100%;"><div class="playmat"><div class="pregame"><h2>Connecting…</h2><p class="muted">Talking to the table on this computer.</p></div></div><aside class="sidebar"></aside><button type="button" id="sidebar-toggle" class="sidebar-toggle" title="Hide the side panel">⟩</button></div>
      <div class="preview" id="preview" hidden></div>
      <div class="menu" id="cmenu" hidden></div>
      <div id="atk-fx" class="atk-fx" hidden></div>
      <button type="button" id="leave-table" style="position:fixed;top:10px;left:10px;z-index:10000;background:rgba(0,0,0,0.6);" class="btn ghost small">⬅️ Leave Table</button>`;
    document.body.appendChild(overlay);

    let sidebarOpen = true;
    try { sidebarOpen = localStorage.getItem("mtg-sidebar") !== "0"; } catch { sidebarOpen = true; }
    function applySidebar() {
      const root = document.getElementById("table-root");
      const btn = document.getElementById("sidebar-toggle");
      if (root) root.classList.toggle("sidebar-shut", !sidebarOpen);
      if (btn) {
        btn.textContent = sidebarOpen ? "⟩" : "⟨";
        btn.title = sidebarOpen ? "Hide the side panel" : "Show the side panel";
      }
    }
    applySidebar();
    const sideBtn = document.getElementById("sidebar-toggle");
    if (sideBtn) {
      sideBtn.onclick = () => {
        sidebarOpen = !sidebarOpen;
        try { localStorage.setItem("mtg-sidebar", sidebarOpen ? "1" : "0"); } catch {}
        applySidebar();
      };
    }
    function leaveMatch(openLobby) {
      window.MTG_RECONNECT = null;
      const wrap = window.MTG_TABLE_CONN;
      if (wrap && wrap.ws) {
        window.MTG_WS = null;
        try { wrap.ws.close(); } catch {}
      }
      window.MTG_TABLE_CONN = null;
      overlay.remove();
      document.body.classList.remove("view-table");
      if (location.hash.indexOf("#/table") === 0) location.hash = "#/";
      if (openLobby) {
        setTimeout(() => window.MTG.openTablesModal && window.MTG.openTablesModal(), 60);
      }
    }
    const leaveBtn = document.getElementById("leave-table");
    if (leaveBtn) leaveBtn.onclick = () => leaveMatch(false);

    let state = null;
    let hovered = null;
    let selected = null;
    let conn = null; window.MTG_TABLE_CONN = null;
    let decks = [];
    let selectedDeckTab = "profile"; // "profile" | "starters" | "all"
    let autoPickedDeck = false;
    const firstSeen = new Map();
    const attacking = new Set();
    const attackPick = new Set();
    let pickingAttackers = false;
    let blockPick = null;
    const attachments = new Map();
    let primedBf = false;
    let lastActive = null;
    let lastHandCount = null;
    let drewKey = "";
    let prevSfx = null;
    let autoStepping = false;
    let autoStepsOn = true;
    try {
      autoStepsOn = localStorage.getItem("mtg-autostep") !== "0";
    } catch {
      autoStepsOn = true;
    }

    function myTurn() {
      return !!(state && state.started && state.activeSeat === state.you);
    }

    function isCreature(c) {
      return /\bCreature\b/i.test(c.type_line || "") || c.power != null;
    }
    function hasDefender(c) {
      return /\bDefender\b/i.test(`${c.type_line || ""} ${c.oracle_text || ""} ${(c.keywords || []).join(" ")}`);
    }
    function legalAttacker(c) {
      if (!isCreature(c)) return false;
      if (c.tapped || c.hasAttacked) return false;
      if (isSick(c) || hasDefender(c)) return false;
      return true;
    }
    function canAttack(c, mine) {
      if (!pickingAttackers) return false;
      if (!state || !state.started || state.ended) return false;
      if (state.combat && state.combat.step === "blockers") return false;
      if (!myTurn() || !mine) return false;
      if (c._zone !== "battlefield") return false;
      return legalAttacker(c);
    }
    function defenderSeat() {
      if (!state || !state.combat) return -1;
      return (state.combat.attackerSeat + 1) % 2;
    }
    function canBlock(c, mine) {
      if (!state || !state.combat || state.combat.step !== "blockers") return false;
      if (state.you !== defenderSeat()) return false;
      if (!mine || c._zone !== "battlefield") return false;
      if (!isCreature(c) || c.tapped) return false;
      return true;
    }
    function isInstant(c) {
      return /\bInstant\b/i.test(c.type_line || "");
    }
    function isLand(c) {
      return /\bLand\b/i.test(c.type_line || "") && !isInstant(c);
    }
    function isAura(c) {
      return /\bAura\b/i.test(c.type_line || "");
    }
    function isEnchantment(c) {
      return /\bEnchantment\b/i.test(c.type_line || "");
    }
    function hasHaste(c) {
      return /\bHaste\b/i.test(`${c.type_line || ""} ${c.oracle_text || ""} ${(c.keywords || []).join(" ")}`);
    }
    function isSick(c) {
      if (!isCreature(c) || hasHaste(c)) return false;
      const info = firstSeen.get(c.iid);
      const entTurn = c.enteredAtTurn != null ? c.enteredAtTurn : (info ? info.turn : 0);
      const entSeat = c.enteredAtSeat != null ? c.enteredAtSeat : (info ? info.seat : -1);
      if (entTurn === 0) return false;
      if (!state) return false;
      // Summoning sickness only lasts the 1 turn it entered for its controller
      return entTurn === state.turn && entSeat === state.activeSeat;
    }
    function isMine(iid) {
      const f = findInst(iid);
      if (!f) return false;
      return f.seat === state.you || f.card.ownerSeat === state.you;
    }
    function canDrag(iid) {
      const f = findInst(iid);
      if (!f) return false;
      if (f.zone === "stack") return true;
      return isMine(iid);
    }
    function enchantedSet() {
      const out = new Set();
      for (const [aura, target] of attachments) out.add(target);
      if (!state) return out;
      for (const s of state.seats) {
        for (const c of s.zones.battlefield || []) {
          if (c.attachedTo) out.add(c.attachedTo);
        }
      }
      return out;
    }
    function noteArrivals(st) {
      for (const s of st.seats || []) {
        for (const c of s.zones.battlefield || []) {
          if (!firstSeen.has(c.iid)) {
            firstSeen.set(c.iid, {
              turn: c.enteredAtTurn != null ? c.enteredAtTurn : (primedBf ? st.turn : 0),
              seat: c.enteredAtSeat != null ? c.enteredAtSeat : (primedBf ? st.activeSeat : -1),
              owner: c.ownerSeat ?? s.seat,
            });
          }
        }
      }
      primedBf = true;
      if (st.phase !== "combat" || (lastActive != null && st.activeSeat !== lastActive)) {
        attacking.clear();
      }
    }
    function handMax() {
      return 7;
    }

    function snapSeat(s) {
      const hand = s.zones?.hand;
      const lib = s.zones?.library;
      const bf = Array.isArray(s.zones?.battlefield) ? s.zones.battlefield : [];
      return {
        life: s.life,
        hand: hand && hand.hidden ? hand.count || 0 : (hand || []).length,
        lib: lib && lib.hidden ? lib.count || 0 : (lib || []).length,
        bf: bf.map((c) => ({ iid: c.iid, tapped: !!c.tapped, land: /\bLand\b/i.test(c.type_line || ""), name: c.name })),
      };
    }

    function playTableSounds(s) {
      const sfx = window.MTG_SFX;
      if (!sfx || !s) return;
      const now = {
        code: s.code,
        started: s.started,
        ended: s.ended,
        turn: s.turn,
        activeSeat: s.activeSeat,
        roll: s.lastRoll && s.lastRoll.at,
        log: (s.log || []).length,
        lastLog: (s.log || [])[s.log.length - 1]?.text || "",
        seats: (s.seats || []).map(snapSeat),
      };
      const prev = prevSfx;
      prevSfx = now;
      if (!prev || prev.code !== now.code) {
        if (now.started) sfx.play("start");
        return;
      }
      if (now.started && !prev.started) sfx.play("start");
      if (now.ended && !prev.ended) {
        if (s.winnerSeat != null && s.winnerSeat === s.you) {
          sfx.play("win");
          setTimeout(() => sfx.play("coin"), 400);
        } else {
          sfx.play("concede");
        }
        if (window.MTG && window.MTG.fetchMe) {
          window.MTG.fetchMe(window.MTG_SECOND).catch(() => {});
        }
      }
      if (now.turn !== prev.turn || now.activeSeat !== prev.activeSeat) sfx.play("turn");
      if (now.roll && now.roll !== prev.roll) sfx.play("roll");
      const log = now.lastLog.toLowerCase();
      if (now.log > prev.log) {
        if (log.includes("shuffled")) sfx.play("shuffle");
        if (log.includes("milled")) sfx.play("mill");
        if (log.includes("created")) sfx.play("token");
        if (log.includes("attacks with")) {
          const who = now.lastLog.replace(/^.*attacks with\s+/i, "").trim();
          showCombatFx(who);
        }
      }
      now.seats.forEach((seat, i) => {
        const p = prev.seats[i];
        if (!p) return;
        if (seat.life > p.life) sfx.play("lifeUp");
        if (seat.life < p.life) sfx.play("lifeDown");
        if (seat.hand > p.hand) sfx.play("draw");
        const prevIds = new Set(p.bf.map((c) => c.iid));
        const newcomers = seat.bf.filter((c) => !prevIds.has(c.iid));
        if (newcomers.some((c) => c.land)) sfx.play("land");
        if (newcomers.some((c) => !c.land)) sfx.play("play");
        const newlyTapped = seat.bf.filter((c) => c.tapped && !p.bf.find((x) => x.iid === c.iid && x.tapped));
        if (newlyTapped.length >= 2) sfx.play("mana");
        else if (newlyTapped.length === 1 && !newcomers.length) sfx.play("tap");
      });
    }

    function waitMs(ms) {
      return new Promise((r) => setTimeout(r, ms));
    }

    function waitUntil(pred, ms = 1800) {
      const t0 = Date.now();
      return new Promise((resolve) => {
        const tick = () => {
          if (pred() || Date.now() - t0 > ms) resolve();
          else setTimeout(tick, 35);
        };
        tick();
      });
    }

    async function autoStepToMain() {
      if (!autoStepsOn || autoStepping || !state || !state.started || !myTurn()) return;
      if (!["untap", "upkeep", "draw"].includes(state.phase)) return;
      autoStepping = true;
      try {
        while (state && myTurn() && ["untap", "upkeep", "draw"].includes(state.phase)) {
          const p = state.phase;
          sendAction("nextPhase");
          await waitUntil(() => !state || state.phase !== p || !myTurn());
          await waitMs(240);
        }
      } finally {
        autoStepping = false;
      }
    }

    function doPassTurn() {
      if (!state || !myTurn()) {
        toast("Not your turn to pass");
        return;
      }
      autoStepping = false;
      attacking.clear();
      sendAction("passTurn");
      window.MTG_SFX && window.MTG_SFX.play("turn");
      toast("Passed turn ✨");
    }
    const autoFinishTurn = doPassTurn;

    /* Phase Countdown Timer */
    const PHASE_DURATIONS = {
      combat: 35,
      main1: 45,
      main2: 45,
      end: 20,
      upkeep: 15,
      draw: 15,
      untap: 10,
    };

    let timerState = {
      remaining: 35,
      total: 35,
      phase: null,
      turn: null,
      activeSeat: null,
      interval: null,
    };

    function isTimerOn(st) {
      if (!st) return false;
      return !!st.timerEnabled;
    }

    function toggleTimer() {
      const cur = isTimerOn(state);
      const next = !cur;
      sendAction("setTimer", { enabled: next });
      if (state) state.timerEnabled = next;
      if (!next) {
        if (timerState.interval) clearInterval(timerState.interval);
        timerState.interval = null;
        updateTimerDOM();
        toast("⏱️ Phase timer disabled (casual / untimed mode)");
      } else {
        toast("⏱️ Phase countdown timer enabled");
        startPhaseTimer(state);
      }
    }

    function startPhaseTimer(st) {
      if (!st || !st.started || st.ended || !isTimerOn(st)) {
        if (timerState.interval) clearInterval(timerState.interval);
        timerState.interval = null;
        updateTimerDOM();
        return;
      }

      const key = `${st.turn}-${st.activeSeat}-${st.phase}`;
      const currentKey = `${timerState.turn}-${timerState.activeSeat}-${timerState.phase}`;
      if (key !== currentKey || !timerState.interval) {
        if (timerState.interval) clearInterval(timerState.interval);
        const duration = PHASE_DURATIONS[st.phase] || 35;
        timerState.remaining = duration;
        timerState.total = duration;
        timerState.phase = st.phase;
        timerState.turn = st.turn;
        timerState.activeSeat = st.activeSeat;

        updateTimerDOM();

        timerState.interval = setInterval(() => {
          if (!state || !state.started || state.ended || !isTimerOn(state)) {
            clearInterval(timerState.interval);
            timerState.interval = null;
            updateTimerDOM();
            return;
          }
          timerState.remaining = Math.max(0, timerState.remaining - 1);
          updateTimerDOM();

          // Sounds as timer counts down
          if (timerState.remaining <= 5 && timerState.remaining > 0) {
            if (timerState.remaining <= 3) {
              window.MTG_SFX && window.MTG_SFX.play("warningTick");
            } else {
              window.MTG_SFX && window.MTG_SFX.play("tick");
            }
          } else if (timerState.remaining === 0) {
            window.MTG_SFX && window.MTG_SFX.play("timeUp");
            clearInterval(timerState.interval);
            timerState.interval = null;
            updateTimerDOM();

            // Friendly non-intrusive reminder - NEVER auto pass or kick!
            if (myTurn()) {
              toast("⏱️ Phase time is up! Take your time, or pass when ready ✨");
            }
          }
        }, 1000);
      }
    }

    function updateTimerDOM() {
      const el = $("#phase-timer");
      const secEl = $("#phase-timer-sec");
      const barEl = $("#phase-timer-bar");
      if (!el || !secEl || !barEl) return;
      const on = isTimerOn(state);
      el.classList.toggle("timer-off", !on);
      if (!on) {
        secEl.textContent = "Untimed";
        barEl.style.width = "100%";
        el.classList.remove("warning");
        el.title = "Casual Untimed Mode (Click to enable timer)";
        return;
      }
      el.title = "Phase Time Remaining (Click to disable timer)";
      const rem = timerState.remaining;
      const tot = timerState.total || 35;
      secEl.textContent = `${rem}s`;
      const pct = Math.max(0, Math.min(100, (rem / tot) * 100));
      barEl.style.width = `${pct}%`;
      el.classList.toggle("warning", rem <= 5);
    }

    function combatTallyHTML(my) {
      const atks = (my.zones.battlefield || []).filter((c) => attacking.has(c.iid));
      if (!atks.length) return `<span class="combat-tally">(0 attacking · Click creature to attack)</span>`;
      let tot = 0;
      atks.forEach((c) => {
        const p = parseInt(c.power, 10);
        const p1 = (c.counters && c.counters.p1p1) || 0;
        tot += Math.max(0, (isNaN(p) ? 1 : p) + p1);
      });
      return `<span class="combat-tally">(${atks.length} attacking for <b>${tot}</b> total damage)</span>`;
    }

    function spawnFloatingDamage(dmg) {
      if (dmg <= 0) return;
      const playmat = $(".playmat");
      if (!playmat) return;
      let container = playmat.querySelector(".floating-dmg-container");
      if (!container) {
        container = document.createElement("div");
        container.className = "floating-dmg-container";
        playmat.appendChild(container);
      }
      const hit = document.createElement("div");
      hit.className = "floating-dmg-hit";
      hit.textContent = `-${dmg} HP!`;
      hit.style.left = `${40 + (Math.random() - 0.5) * 20}%`;
      hit.style.top = "26%";
      container.appendChild(hit);
      setTimeout(() => hit.remove(), 1300);
    }

    let lastSeatLife = {};
    function detectLifeChanges(s) {
      if (!s || !s.started) return;
      if (s.ended) {
        lastSeatLife = {};
        return;
      }
      (s.seats || []).forEach((seat, i) => {
        const prev = lastSeatLife[i];
        if (prev != null && seat.life != null && seat.life < prev && i !== s.you) {
          spawnFloatingDamage(prev - seat.life);
          if (window.MTG_SFX) window.MTG_SFX.play("strike");
        }
        if (seat.life != null) lastSeatLife[i] = seat.life;
      });
    }

    function maybeAutoDraw(s) {
      if (!s || !s.started || s.you < 0) return;
      const me = s.seats[s.you];
      const handN = Array.isArray(me?.zones?.hand) ? me.zones.hand.length : 0;
      const key = `${s.turn}-${s.activeSeat}`;
      const skipFirst = s.turn === 1 && s.activeSeat === 0;
      const myTurnNow = s.activeSeat === s.you;
      const becameMine = myTurnNow && lastActive !== s.activeSeat;
      if (myTurnNow && s.phase === "draw" && drewKey !== key && !skipFirst) {
        drewKey = key;
        lastActive = s.activeSeat;
        lastHandCount = handN;
        sendAction("draw", { n: 1 });
        return;
      }
      if (becameMine && !skipFirst && drewKey !== key && lastHandCount != null && handN <= lastHandCount) {
        drewKey = key;
        lastActive = s.activeSeat;
        lastHandCount = handN;
        sendAction("draw", { n: 1 });
        return;
      }
      lastActive = s.activeSeat;
      lastHandCount = handN;
    }

    function parseManaCost(cost, cmc) {
      const need = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, generic: 0 };
      const raw = String(cost || "");
      for (const m of raw.matchAll(/\{([^}]+)\}/g)) {
        const v = m[1];
        if (/^\d+$/.test(v)) need.generic += Number(v);
        else if (v === "X" || v === "Y" || v === "Z") continue;
        else if (v === "S") need.generic += 1;
        else if ("WUBRG".includes(v)) need[v] += 1;
        else if (v === "C") need.generic += 1;
        else if (v.includes("/")) {
          const parts = v.split("/");
          if (parts.includes("P")) need.generic += 2;
          else if (parts[0] === "2") need.generic += 2;
          else {
            const col = parts.find((p) => "WUBRG".includes(p));
            if (col) need[col] += 1;
            else need.generic += 1;
          }
        }
      }
      const colored = need.W + need.U + need.B + need.R + need.G;
      const parsed = colored + need.generic;
      if (cmc != null && Number(cmc) > parsed) need.generic += Number(cmc) - parsed;
      return need;
    }

    function sourceInfo(c) {
      if (!c || c.tapped || c.faceDown) return null;
      const t = c.type_line || "";
      const text = (c.oracle_text || "").replace(/\s+/g, " ");
      if (isCreature(c) && isSick(c)) return null;
      const colors = [];
      if (/\bPlains\b/.test(t)) colors.push("W");
      if (/\bIsland\b/.test(t)) colors.push("U");
      if (/\bSwamp\b/.test(t)) colors.push("B");
      if (/\bMountain\b/.test(t)) colors.push("R");
      if (/\bForest\b/.test(t)) colors.push("G");
      let amount = 1;
      let kind = colors.length > 1 ? "choice" : colors.length === 1 ? "fixed" : "any";
      let pips = colors.length === 1 ? colors.slice() : [];
      const add = text.match(/\{T\}:?[^.]*\bAdd\b([^.]+)/i) || text.match(/\bAdd\b((?: \{[WUBRGC]\})+)/i);
      if (add) {
        const chunk = add[1];
        const found = [...chunk.matchAll(/\{([WUBRGC])\}/g)].map((x) => x[1]);
        if (/any color/i.test(chunk)) {
          kind = "any";
          amount = Math.max(1, found.length);
        } else if (found.length > 1 && !/\bor\b/i.test(chunk)) {
          kind = "fixed";
          pips = found;
          amount = found.length;
        } else if (found.length) {
          kind = found.length === 1 ? "fixed" : "choice";
          pips = found.length === 1 ? found : [];
          colors.push(...found);
          amount = 1;
        }
      }
      if (!colors.length && !pips.length && !/\bLand\b|\bArtifact\b/i.test(t) && !/\bAdd\b/i.test(text)) return null;
      if (/\bLand\b/i.test(t) && kind === "any" && !pips.length && !colors.length) kind = "any";
      return { kind, colors: [...new Set(colors)], pips, amount };
    }

    function sourcePays(info, col) {
      if (!info) return false;
      if (col === "generic" || col === "C") return true;
      if (info.kind === "any") return true;
      if (info.kind === "choice") return info.colors.includes(col);
      if (info.kind === "fixed") return info.pips.includes(col) || info.colors.includes(col);
      return true;
    }

    function pickSource(sources, used, col) {
      let best = null;
      let bestScore = 99;
      for (const c of sources) {
        if (used.has(c.iid)) continue;
        const inf = sourceInfo(c);
        if (!inf || !sourcePays(inf, col)) continue;
        let score = 8;
        if (col !== "generic" && inf.kind === "fixed" && inf.pips.length === 1 && inf.pips[0] === col) score = 0;
        else if (col !== "generic" && inf.kind === "fixed" && inf.pips.includes(col)) score = 1;
        else if (col !== "generic" && inf.kind === "choice" && inf.colors.includes(col)) score = 2;
        else if (col !== "generic" && inf.kind === "any") score = 4;
        else if (col === "generic") {
          if (inf.kind === "fixed" && inf.pips.every((p) => p === "C")) score = 0;
          else if (inf.kind === "fixed") score = 1;
          else if (inf.kind === "choice") score = 2;
          else score = 3;
        }
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      }
      return best;
    }

    function applyYield(need, info, paidColor) {
      const n = Math.max(1, info?.amount || (info?.pips || []).length || 1);
      if (paidColor && paidColor !== "generic" && need[paidColor] > 0) {
        need[paidColor] -= 1;
        let extra = n - 1;
        while (extra > 0 && need.generic > 0) {
          need.generic -= 1;
          extra -= 1;
        }
        return;
      }
      need.generic = Math.max(0, need.generic - n);
    }

    function autoTapFor(card, fromZone) {
      if (!state || !card) return;
      const land = /\bLand\b/i.test(card.type_line || "");
      if (land && (!card.mana_cost || card.mana_cost === "{0}")) return;
      if (card.token) return;
      const need = parseManaCost(card.mana_cost, card.cmc);
      const meSeat = state.seats[state.you];
      if (fromZone === "command" && meSeat) need.generic += 2 * (meSeat.commanderTax || 0);
      const total = need.W + need.U + need.B + need.R + need.G + need.generic;
      if (!total) return;
      const sources = (meSeat?.zones.battlefield || []).filter((c) => !c.tapped && sourceInfo(c));
      const used = new Set();
      const tapped = [];
      for (const col of ["W", "U", "B", "R", "G"]) {
        while (need[col] > 0) {
          const src = pickSource(sources, used, col);
          if (!src) break;
          used.add(src.iid);
          tapped.push(src);
          applyYield(need, sourceInfo(src), col);
        }
      }
      while (need.generic > 0) {
        const src = pickSource(sources, used, "generic");
        if (!src) break;
        used.add(src.iid);
        tapped.push(src);
        applyYield(need, sourceInfo(src), "generic");
      }
      for (const src of tapped) sendAction("tap", { iid: src.iid, tapped: true });
      const unpaid = ["W", "U", "B", "R", "G"].filter((c) => need[c] > 0).map((c) => `{${c}}`.repeat(need[c])).join("");
      const gen = need.generic > 0 ? `{${need.generic}}` : "";
      if (tapped.length) {
        sendAction("chat", {
          text: `pays ${card.mana_cost || card.cmc || ""} (${tapped.length} mana) with ${tapped.map((s) => s.name).join(", ")}`,
        });
      }
      if (unpaid || gen) toast(`Not enough mana for ${card.name} — still need ${gen}${unpaid}`);
    }

    function sendAction(kind, extra = {}) {
      if (!conn) return;
      const turnOnly = kind === "nextPhase" || kind === "setPhase" || kind === "passTurn" || kind === "extraTurn";
      if (turnOnly && state && state.started && !myTurn()) {
        toast("Only the player whose turn it is can do that");
        return;
      }
      if (extra.iid && ["tap", "flip", "faceDown", "move", "pos", "counters"].includes(kind)) {
        const f = findInst(extra.iid);
        const stackMove = kind === "move" && f && f.zone === "stack";
        const counterBf = kind === "counters" && f && f.zone === "battlefield";
        if (!stackMove && !counterBf && !isMine(extra.iid)) {
          toast("You can only use your own cards");
          return;
        }
      }
      if (kind === "move" && state && extra.toSeat != null && extra.toSeat !== state.you) {
        extra.toSeat = state.you;
      }
      let played = null;
      if (kind === "move" && extra.iid) {
        const f = findInst(extra.iid);
        if (f && (f.zone === "hand" || f.zone === "command") && extra.toZone === "battlefield" && !isLand(f.card)) {
          extra.toZone = "stack";
          toast(`✨ ${f.card.name} cast to stack — click Resolve to enter battlefield`);
        }
        if (f && (f.zone === "hand" || f.zone === "command") && (extra.toZone === "stack" || extra.toZone === "battlefield")) {
          played = { card: f.card, zone: f.zone };
        }
      }
      conn.send({ t: "action", a: { kind, ...extra } });
      if (window.MTG_SFX) {
        if (kind === "draw") window.MTG_SFX.play("draw");
        else if (kind === "shuffle") window.MTG_SFX.play("shuffle");
        else if (kind === "mill") window.MTG_SFX.play("mill");
        else if (kind === "roll") window.MTG_SFX.play("roll");
        else if (kind === "token") window.MTG_SFX.play("token");
        else if (kind === "tap") window.MTG_SFX.play("tap");
        else if (kind === "passTurn" || kind === "nextPhase") window.MTG_SFX.play("turn");
        else if (kind === "life") window.MTG_SFX.play(Number(extra.delta) > 0 ? "lifeUp" : "lifeDown");
        else if (kind === "counters") window.MTG_SFX.play("sparkle");
        else if (kind === "move" && played) {
          const land = /\bLand\b/i.test(played.card.type_line || "");
          window.MTG_SFX.play(land ? "land" : "play");
        } else if (kind === "move" && extra.toZone === "stack") window.MTG_SFX.play("play");
      }
      if (played) autoTapFor(played.card, played.zone);
    }

    function cardImg(c) {
      if (!c || c.hidden || c.faceDown) return "/img/cardback.jpg";
      if (c.flipped && c.faces?.[1]?.image) return c.faces[1].image;
      return c.image || "/img/cardback.jpg";
    }

    function renderCard(c, cls = "") {
      const pt =
        c.power != null
          ? `<span class="badge">${c.power}/${c.toughness}</span>`
          : c.loyalty != null
            ? `<span class="badge">${c.loyalty}</span>`
            : "";
      const counters = Object.entries(c.counters || {})
        .map(([k, v]) => `<span class="ct">${k === "p1p1" ? "+" + v : v + " " + k}</span>`)
        .join("");
      const tapped = !c._style && c.tapped ? "tapped" : "";
      const down = c.faceDown || c.hidden ? "face-down" : "";
      const sick = c._zone === "battlefield" && isSick(c) ? "sick" : "";
      const atk = c._isAttacker || attacking.has(c.iid) ? "attacking" : "";
      const canAtk = c._canAttack ? "can-attack" : "";
      const picked = c._attackPicked ? "attack-picked" : "";
      const canBlk = c._canBlock ? "can-block" : "";
      const blkTgt = c._blockTarget ? "block-target" : "";
      const blocking = c._blocking ? "blocking" : "";
      const ench = c._enchanted ? "enchanted" : "";
      const aura = isAura(c) ? "aura" : "";
      const extra = c._extra ? "extra-hand" : "";
      const castable = c._castable ? "castable" : "";
      const flags = [
        c.tapped ? `<i>↷ Tapped</i>` : "",
        sick ? `<i class="sick">💤 Sick</i>` : "",
        canAtk ? `<i class="can-atk">⚔️ Can attack</i>` : "",
        picked ? `<i class="picked">✓ Selected</i>` : "",
        atk ? `<i class="atk">⚔️ Attacking${c._blockLabel ? " · " + escapeHtml(c._blockLabel) : ""}</i>` : "",
        blkTgt ? `<i class="tgt">🎯 Block this</i>` : "",
        canBlk ? `<i class="can-blk">🛡️ Can block</i>` : "",
        blocking ? `<i class="blk">🛡️ ${c._blockLabel ? escapeHtml(c._blockLabel) : "Blocking"}</i>` : "",
        isAura(c) ? `<i class="aura">✨ Aura</i>` : "",
        isEnchantment(c) && !isAura(c) ? `<i class="ench">✨ Enchant</i>` : "",
        c._enchanted ? `<i class="ench">✨ Enchanted</i>` : "",
        extra ? `<i class="over">+${handMax()}</i>` : "",
      ].filter(Boolean).join("");
      return `<div class="mtg-card ${cls} ${tapped} ${down} ${sick} ${atk} ${canAtk} ${picked} ${canBlk} ${blkTgt} ${blocking} ${ench} ${aura} ${extra} ${castable}"
        data-iid="${c.iid}" data-zone="${c._zone || ""}" data-seat="${c.ownerSeat}"
        style="${c._style || ""}">
        <img src="${cardImg(c)}" alt="${escapeHtml(c.name || "")}" />
        ${pt}${counters}
        ${flags ? `<span class="flags">${flags}</span>` : ""}
      </div>`;
    }

    function placeBattlefield(cards, mine) {
      const enchanted = enchantedSet();
      return (cards || [])
        .map((c) => {
          const declared = state.combat && state.combat.attackers.find((a) => a.iid === c.iid);
          const picked = attackPick.has(c.iid);
          const atk = !!(declared || picked);
          const assigned = state.combat && state.combat.attackers.find((a) => a.blockedBy === c.iid);
          const view = { ...c, _zone: "battlefield" };
          const rot = c.tapped ? " rotate(88deg)" : atk ? " translateY(-12px)" : "";
          const copy = {
            ...view,
            _enchanted: enchanted.has(c.iid),
            _canAttack: canAttack(view, mine),
            _attackPicked: picked,
            _canBlock: canBlock(view, mine),
            _isAttacker: atk,
            _blockTarget: !!(declared && state.combat.step === "blockers" && state.you === defenderSeat()),
            _blocking: blockPick === c.iid || !!assigned,
            _blockLabel: declared && declared.blockerName
              ? `blocked by ${declared.blockerName}`
              : assigned
                ? `blocking ${assigned.name}`
                : "",
            _style: `left:${(c.x || 0.5) * 100}%;top:${(c.y || 0.5) * 100}%;z-index:${c.z || 1};transform:translate(-50%,-50%)${rot}`,
          };
          return renderCard(copy, mine ? "mine" : "theirs locked");
        })
        .join("");
    }

    function handCards(list, mine) {
      if (list && list.hidden) {
        const n = list.count || 0;
        const over = n > handMax();
        return Array.from({ length: n }, (_, i) =>
          renderCard({ iid: "h" + i, hidden: true, faceDown: true, _zone: "hand", _extra: over && i >= handMax() }, "in-hand small" + (over && i >= handMax() ? " extra-hand" : ""))
        ).join("");
      }
      const max = handMax();
      const respond = (state.stack || []).length > 0;
      return (list || [])
        .map((c, i) =>
          renderCard(
            { ...c, _zone: "hand", _extra: i >= max, _castable: respond && isInstant(c) },
            "in-hand" + (i >= max ? " extra-hand" : "") + (respond && isInstant(c) ? " castable" : "")
          )
        )
        .join("");
    }

    function zoneCount(z) {
      if (!z) return 0;
      if (z.hidden) return z.count || 0;
      return z.length || 0;
    }

    function render() {
      if (!state) return;
      const you = state.you;
      const meSeat = you >= 0 ? state.seats[you] : null;
      const opp = state.seats.find((s, i) => i !== you) || state.seats[1];
      const my = meSeat || state.seats[0];

      const playmat = $(".playmat");
      playmat.classList.toggle("combat-on", state.phase === "combat");
      const mineTurn = state.activeSeat === you;
      const myHandN = zoneCount(my.zones.hand);
      if (!state.started) {
        if (my && !my.deckId && !autoPickedDeck) {
          const preselected = sessionStorage.getItem("mtg-selected-deck") || localStorage.getItem("mtg-selected-deck");
          if (preselected) {
            autoPickedDeck = true;
            sendAction("pickDeck", { deckId: preselected });
          }
        }
        playmat.innerHTML = pregameHTML();
        bindPregame();
      } else {
        playmat.innerHTML = `
          ${state.ended ? victoryBannerHTML() : ""}
          <div class="statrow ${mineTurn ? "your-turn" : ""}">
            ${lifeBox(opp, false)}
            ${lifeBox(my, true)}
            <div class="phase-timer-pill ${!isTimerOn(state) ? "timer-off" : (timerState.remaining <= 5 ? "warning" : "")}" id="phase-timer" title="${!isTimerOn(state) ? "Casual Untimed Mode (Click to enable timer)" : "Phase Time Remaining (Click to disable timer)"}">
              <span>⏱️</span>
              <span id="phase-timer-sec">${!isTimerOn(state) ? "Untimed" : `${timerState.remaining}s`}</span>
              <div class="timer-bar"><div id="phase-timer-bar" class="timer-fill" style="width:${!isTimerOn(state) ? "100%" : `${Math.max(0, Math.min(100, (timerState.remaining / (timerState.total || 35)) * 100))}%`}"></div></div>
            </div>
            <div class="phases">
              ${PHASES.map((p) => `<button class="phase ${state.phase === p ? "on" : ""} ${mineTurn ? "" : "locked"}" data-phase="${p}">${PHASE_LABEL[p]}</button>`).join("")}
            </div>
            <span class="chip ${mineTurn ? "your-turn" : ""}">T${state.turn}${mineTurn ? " · YOUR TURN" : " · " + escapeHtml(state.seats[state.activeSeat]?.name || "")}</span>
            ${state.pot > 0 || state.wager > 0 ? `
              <div class="pot-display" title="Match Pot: ${(state.pot || (state.wager * 2)).toLocaleString()} 🪙 Gold (${(state.wager || 0).toLocaleString()} 🪙 / player)">
                <span class="pot-badge">🏆 POT</span>
                <span class="pot-amount">${(state.pot || (state.wager * 2)).toLocaleString()} 🪙</span>
              </div>
            ` : ""}
          </div>
          ${myHandN > handMax() ? `<div class="hand-warn">Hand ${myHandN} (usual max ${handMax()}) — you can still play cards</div>` : ""}
          <div class="hand-row opp ${!mineTurn ? "active-side" : ""}">${handCards(opp.zones.hand, false)}</div>
          <div class="bf opp ${!mineTurn ? "active-side" : ""}" data-drop="battlefield" data-seat="${opp.seat}">
            <span class="bf-label">${escapeHtml(opp.name || "Opponent")} battlefield</span>
            ${placeBattlefield(opp.zones.battlefield, false)}
          </div>
          <div class="stack-row ${(state.stack || []).length ? "hot" : ""}" data-drop="stack" data-seat="${my.seat}">
            ${(state.stack || []).length
              ? (state.stack || [])
                  .map((c) => renderCard({ ...c, _zone: "stack" }, "in-stack"))
                  .join("") + `<button class="btn gold small" data-act="resolve">Resolve</button>`
              : combatBannerHTML(you)}
          </div>
          <div class="bf you ${mineTurn ? "active-side" : ""}" data-drop="battlefield" data-seat="${my.seat}">
            <span class="bf-label">Your battlefield</span>
            ${placeBattlefield(my.zones.battlefield, true)}
          </div>
          <div class="hand-row you ${mineTurn ? "active-side" : ""}" data-drop="hand" data-seat="${my.seat}">${handCards(my.zones.hand, true)}</div>
          <div class="zones left">
            ${zoneBtn("command", my)}
            ${zoneBtn("library", my)}
            ${zoneBtn("graveyard", my)}
            ${zoneBtn("exile", my)}
          </div>
          <div class="zones right">
            ${zoneBtn("library", opp)}
            ${zoneBtn("graveyard", opp)}
            ${zoneBtn("exile", opp)}
            ${zoneBtn("command", opp)}
          </div>
        `;
        bindPlay();
        if (playmat && window.MTG_FX && window.MTG_FX.attachTableOverlay) {
          window.MTG_FX.attachTableOverlay(playmat);
        }
      }

      $(".sidebar").innerHTML = `
        <div class="pad">
          <h3>${escapeHtml(state.name)} · ${escapeHtml(state.code)}</h3>
          <div class="actions">
            ${state.ended ? `<button class="btn gold pulse" data-act="rematch" style="grid-column: 1 / -1; font-weight: 700; padding: 10px; font-size: 14px">⚔️ Rematch</button>` : ""}
            ${state.phase === "combat" ? `<button class="btn gold pulse" data-act="passCombat" ${mineTurn ? "" : "disabled"}>⏭️ Pass Combat</button>` : `<button class="btn gold" data-act="nextPhase" ${mineTurn ? "" : "disabled"}>💫 Next phase</button>`}
            <button class="btn ${mineTurn ? "gold pulse" : ""}" data-act="passTurn" ${mineTurn ? "" : "disabled"}>✨ Pass turn</button>
            <button class="btn gold" data-act="attack" ${mineTurn && !(state.combat && state.combat.step === "blockers") ? "" : "disabled"}>⚔️ Attack</button>
            <button class="btn" data-act="draw">🎴 Draw</button>
            <button class="btn" data-act="untapAll">🌿 Untap all</button>
            <button class="btn" data-act="shuffle">🔮 Shuffle</button>
            <button class="btn" data-act="mulligan">🔄 Mulligan</button>
            <button class="btn" data-act="token">🐣 Token</button>
            <button class="btn" data-act="roll">🎲 d20</button>
            <button class="btn" data-act="mill">🍂 Mill</button>
            <button class="btn ghost" data-act="interrupt">⚡ Priority</button>
            <button class="btn gold" data-act="declareWin">👑 Award Win</button>
            <button class="btn danger" data-act="concede">🏳️ Concede</button>
          </div>
          <h3 style="margin-top:10px">Counters</h3>
          <div class="counter-tray">
            <button type="button" class="ctr-chip" data-ctr="p1p1">+1/+1</button>
            <button type="button" class="ctr-chip" data-ctr="m1m1">−1/−1</button>
            <button type="button" class="ctr-chip" data-ctr="loyalty">Loyalty</button>
            <button type="button" class="ctr-chip" data-ctr="charge">Charge</button>
            <button type="button" class="ctr-chip" data-ctr="stun">Stun</button>
            <button type="button" class="ctr-chip" data-ctr="kill">Kill</button>
            <button type="button" class="ctr-chip" data-ctr="time">Time</button>
            <button type="button" class="ctr-chip" data-ctr="flood">Flood</button>
          </div>
          <label class="muted" style="display:flex;gap:8px;align-items:center;margin-top:6px">
            <input type="checkbox" id="timer-toggle" ${isTimerOn(state) ? "checked" : ""} /> ⏱️ Turn countdown timer
          </label>
          <label class="muted" style="display:flex;gap:8px;align-items:center;margin-top:4px">
            <input type="checkbox" id="auto-steps" ${autoStepsOn ? "checked" : ""} /> Auto step turns
          </label>
          <p class="help faint"><kbd>D</kbd> draw <kbd>T</kbd> tap <kbd>G</kbd> gy <kbd>E</kbd> exile <kbd>H</kbd> hand <kbd>N</kbd> phase <kbd>P</kbd> pass</p>
        </div>
        <div class="logbox">${state.log.map((l) => `<div>${escapeHtml(l.text)}</div>`).join("")}</div>
        <div class="chatbox">${state.chat.map((c) => `<div><b>${escapeHtml(c.name)}:</b> ${escapeHtml(c.text)}</div>`).join("")}</div>
        <form class="chat-in" id="chat-form"><input name="text" placeholder="Chat" autocomplete="off" /><button class="btn small">Send</button></form>
      `;
      const logbox = $(".logbox");
      logbox.scrollTop = logbox.scrollHeight;
      $("#chat-form").onsubmit = (e) => {
        e.preventDefault();
        const inp = e.target.text;
        if (inp.value.trim()) sendAction("chat", { text: inp.value.trim() });
        inp.value = "";
      };
      $$("[data-act]").forEach((b) => {
        b.onclick = () => handleAct(b.dataset.act);
      });
      const timerPill = $("#phase-timer");
      if (timerPill) {
        timerPill.onclick = () => toggleTimer();
      }
      const timerBox = $("#timer-toggle");
      if (timerBox) {
        timerBox.onchange = () => toggleTimer();
      }
      const autoBox = $("#auto-steps");
      if (autoBox) {
        autoBox.onchange = () => {
          autoStepsOn = autoBox.checked;
          try {
            localStorage.setItem("mtg-autostep", autoStepsOn ? "1" : "0");
          } catch {
            /* ignore */
          }
        };
      }
      bindCounterTray();
      $$("[data-phase]").forEach((b) => {
        b.onclick = () => {
          if (!myTurn()) {
            toast("Only the player whose turn it is can change phases");
            return;
          }
          sendAction("setPhase", { phase: b.dataset.phase });
        };
      });
    }

    function lifeBox(s, mine) {
      if (!s) return "";
      return `<div class="life-box" data-seat="${s.seat}">
        <span class="who">${escapeHtml(s.name || "Open")}${mine ? " (you)" : ""}</span>
        <button class="btn small ghost" data-life="-1">−</button>
        <span class="n">💖 ${s.life}</span>
        <button class="btn small ghost" data-life="1">+</button>
        <span class="faint" title="poison">☠ ${s.poison}</span>
        <span class="faint" title="energy">⚡ ${s.energy}</span>
      </div>`;
    }

    const ZONE_NAME = { library: "Library", graveyard: "Graveyard", exile: "Exile", command: "Command" };
    function zoneBtn(z, s) {
      const label = ZONE_NAME[z] || z;
      return `<button type="button" class="zone" data-drop="${z}" data-seat="${s.seat}" data-open="${z}" title="Open ${label}">
        <b>${zoneCount(s.zones[z])}</b><span>${label}</span>
      </button>`;
    }

    function victoryBannerHTML() {
      if (!state || !state.ended) return "";
      const you = state.you;
      const isWinner = state.winnerSeat !== null && state.winnerSeat !== undefined;
      const won = isWinner && state.winnerSeat === you;
      const winnerName = isWinner
        ? (state.seats[state.winnerSeat]?.name || `Seat ${state.winnerSeat + 1}`)
        : null;
      const potAmount = state.payout?.payout || state.pot || (state.wager ? state.wager * 2 : 0);

      let title = "Match Concluded";
      let bannerType = "draw";
      let icon = "🤝";
      if (isWinner) {
        if (won) {
          title = "👑 VICTORY!";
          bannerType = "won";
          icon = "🏆";
          if (!victoryBannerHTML._shower) {
            victoryBannerHTML._shower = true;
            window.MTG_FX && window.MTG_FX.triggerVictoryShower && window.MTG_FX.triggerVictoryShower();
          }
        } else {
          title = `⚔️ ${escapeHtml(winnerName)} Wins!`;
          bannerType = "lost";
          icon = "💀";
        }
      } else {
        title = "🤝 Match Drawn!";
      }

      return `
        <div class="victory-banner ${bannerType}">
          <div class="victory-icon">${icon}</div>
          <div class="victory-info">
            <h2 class="victory-title">${title}</h2>
            <div class="victory-reason">${escapeHtml(state.payout?.reason || "The match has reached its conclusion.")}</div>
            ${potAmount > 0 ? `
              <div class="payout-pill ${won ? "payout-win" : ""}">
                ${won ? `🪙 <b>+${potAmount.toLocaleString()} Gold</b> won and deposited into your vault!` : `💰 Table Pot of <b>${potAmount.toLocaleString()} 🪙 Gold</b> awarded to ${escapeHtml(winnerName || "winner")}`}
              </div>
            ` : ""}
          </div>
          <div class="victory-actions">
            <button type="button" class="btn gold pulse" id="rematch-btn">⚔️ Rematch</button>
            <button type="button" class="btn ghost" id="return-tables">🚪 Return to Tables</button>
          </div>
        </div>
      `;
    }

    function pregameHTML() {
      const p0 = state.seats[0];
      const p1 = state.seats[1];
      const bothIn = !!(p0.playerId && p1.playerId);
      const bothDecks = !!(p0.deckId && p1.deckId);
      const mine = state.seats[state.you];
      const wager = state.wager || 0;
      const p0Afford = (p0.balance || 0) >= wager || p0.isBot;
      const p1Afford = !p1.playerId || (p1.balance || 0) >= wager || p1.isBot;
      const bothAfford = p0Afford && p1Afford;

      const title = !bothIn ? "Waiting for player 2" : !bothDecks ? "Each player picks a deck" : "Ready to start";
      const blurb = !bothIn
        ? "Send the https link below. Player 2 sits in the open seat, then you both pick a deck and press Start."
        : !mine?.deckId
          ? "Click one of your decks below."
          : !bothDecks
            ? `You chose ${mine.deckName}. Waiting for the other seat to pick a deck.`
            : !bothAfford
              ? "Lower the wager or claim gold, then press Start."
              : "Both seats have a deck. Press Start game.";

      const second = window.MTG_SECOND;
      const me = identity(second);
      const user = (getCachedUser && getCachedUser(second)) || null;

      const charDecks = (decks || []).filter((d) => {
        if (user && (d.userId === user.id || d.userId === me.id)) return true;
        if (!user && (d.userId === me.id || (!d.userId && !d.starter))) return true;
        return false;
      });
      const starterDecks = (decks || []).filter((d) => d.starter);
      const otherDecks = (decks || []).filter((d) => !d.starter && !charDecks.some((cd) => cd.id === d.id));

      if (!selectedDeckTab) {
        selectedDeckTab = charDecks.length > 0 ? "profile" : "starters";
      } else if (selectedDeckTab === "profile" && charDecks.length === 0) {
        selectedDeckTab = "starters";
      }

      let list = charDecks;
      if (selectedDeckTab === "starters") {
        list = starterDecks;
      } else if (selectedDeckTab === "all") {
        list = [...charDecks, ...starterDecks, ...otherDecks];
      }

      let startBtnLabel = "Start game";
      if (!bothIn) startBtnLabel = "Waiting for player 2";
      else if (!bothDecks) startBtnLabel = mine?.deckId ? "Waiting for the other deck" : "Pick a deck to start";
      else if (!p0Afford || !p1Afford) startBtnLabel = "Not enough Gold for this wager";

      return `<div class="pregame">
        <h2>${title}</h2>
        <p>${escapeHtml(blurb)}</p>

        <!-- Stakes & Pot Card -->
        <div class="stakes-card">
          <div class="stakes-header">
            <div class="stakes-title">
              <span class="stakes-icon">🪙</span>
              <div>
                <div class="stakes-label">MATCH STAKES & POT</div>
                <div class="stakes-pot">
                  ${wager > 0 ? `🏆 Match Pot: <b>${(wager * 2).toLocaleString()} 🪙 Gold</b> (${wager.toLocaleString()} 🪙 from each player)` : "🌱 Casual Match · No Gold Wagered"}
                </div>
              </div>
            </div>
          </div>

          <div class="wager-selector-row">
            <span class="wager-label">Set Wager:</span>
            <div class="wager-chip-group">
              <button type="button" class="btn small wager-btn ${wager === 0 ? "gold active" : "ghost"}" data-wager="0">Casual (0)</button>
              <button type="button" class="btn small wager-btn ${wager === 50 ? "gold active" : "ghost"}" data-wager="50">50 🪙</button>
              <button type="button" class="btn small wager-btn ${wager === 100 ? "gold active" : "ghost"}" data-wager="100">100 🪙</button>
              <button type="button" class="btn small wager-btn ${wager === 250 ? "gold active" : "ghost"}" data-wager="250">250 🪙</button>
              <button type="button" class="btn small wager-btn ${wager === 500 ? "gold active" : "ghost"}" data-wager="500">500 🪙</button>
            </div>
          </div>

          <div class="player-balances-row">
            ${state.seats
              .map((s, idx) => {
                if (!s.playerId) {
                  return `<div class="balance-pill empty">Seat ${idx + 1}: <i>Waiting for opponent…</i></div>`;
                }
                const canAfford = (s.balance || 0) >= wager || s.isBot;
                return `<div class="balance-pill ${canAfford ? "afford" : "broke"}">
                  <span class="seat-badge">Seat ${idx + 1}${s.you ? " (You)" : ""}</span>
                  <span class="seat-name"><b>${escapeHtml(s.name || "")}</b></span>
                  <span class="seat-gold">🪙 ${(s.balance || 0).toLocaleString()} Gold</span>
                  ${wager > 0 ? (canAfford ? `<span class="stake-tag ok">✓ Ready</span>` : `<span class="stake-tag need">⚠️ Needs ${(wager - (s.balance || 0)).toLocaleString()} more</span>`) : ""}
                </div>`;
              })
              .join("")}
          </div>
        </div>

        <div class="lan-banner" style="margin:12px 0">
          <span>Player 2 opens</span>
          <code>${escapeHtml(joinLink())}</code>
          <button class="btn small ghost" id="copy-join">Copy</button>
        </div>
        <div class="table-list">
          ${state.seats
            .map(
              (s) => `<div class="table-row">
              <div><b>Seat ${s.seat + 1}</b><div class="faint">${escapeHtml(s.name || "empty")}${s.you ? " · you" : ""}${s.connected || !s.name ? "" : " (offline)"}</div></div>
              <div>${s.deckName ? escapeHtml(s.deckName) : s.playerId ? "picking a deck…" : "open"}</div>
              <div>${s.playerId ? (s.deckId ? "ready" : "no deck") : `<button type="button" class="btn small gold" data-claim-seat="${s.seat}">Sit seat ${s.seat + 1}</button>`}</div>
            </div>`
            )
            .join("")}
        </div>
        <div class="toolbar" style="margin-top:14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <button class="btn gold" id="start" ${bothIn && bothDecks && bothAfford ? "" : "disabled"}>${startBtnLabel}</button>
          <button class="btn" id="open-p2">Open player 2 on this PC</button>
          ${!p1.playerId ? `<button class="btn ghost" id="add-bot">🤖 Add Sparky AI</button>` : ""}
          <button type="button" class="btn ${isTimerOn(state) ? "gold" : "ghost"}" id="pregame-timer-toggle" title="Toggle Turn / Phase Timer for this match">⏱️ Timer: ${isTimerOn(state) ? "ON (Timed)" : "OFF (Casual / Untimed)"}</button>
        </div>
        <div class="deck-picker-header" style="margin-top:20px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div>
            <div class="section-title" style="margin:0">
              🧙 Choose Your Deck ${user ? `(${escapeHtml(user.displayName || user.username)}'s Character Profile)` : `(${escapeHtml(me.name)}'s Character Profile)`}
            </div>
            <div class="faint" style="font-size:12px;margin-top:2px">
              ${
                selectedDeckTab === "profile"
                  ? `Showing ${charDecks.length} custom deck(s) from your character profile`
                  : selectedDeckTab === "starters"
                    ? `Showing ${starterDecks.length} Multiverse starter deck(s)`
                    : `Showing all ${decks.length} deck(s) on this system`
              }
            </div>
          </div>
          <div class="deck-filter-pills" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <button type="button" class="btn small ${selectedDeckTab === "profile" ? "gold" : "ghost"} deck-tab-btn" data-tab="profile">
              🧙 Character Decks (${charDecks.length})
            </button>
            <button type="button" class="btn small ${selectedDeckTab === "starters" ? "gold" : "ghost"} deck-tab-btn" data-tab="starters">
              🌟 Starter Decks (${starterDecks.length})
            </button>
            <button type="button" class="btn small ${selectedDeckTab === "all" ? "gold" : "ghost"} deck-tab-btn" data-tab="all">
              🌐 All (${decks.length})
            </button>
            <a class="btn small ghost" onclick="window.MTG.go('/builder'); return false;" href="#" target="_blank" title="Craft a new deck in Deck Builder">+ Build Deck</a>
          </div>
        </div>
        <div class="pick-grid" id="pick-grid">
          ${
            list.length
              ? list
                  .map(
                    (d) => `<button type="button" class="pick-deck ${d.id === mine?.deckId ? "on" : ""}" data-deck="${d.id}" title="${escapeHtml(d.name)} (${escapeHtml(d.format)})">
              <img src="${d.cover || "/img/cardback.jpg"}" alt="" />
              <span class="pick-name">${escapeHtml(d.name)}</span>
              <span class="pick-meta">${escapeHtml(d.format)} · ${d.counts.main + d.counts.command} cards ${d.starter ? "· Starter" : "· Custom"}</span>
              ${d.id === mine?.deckId ? '<span class="pick-selected-tag">✓ Chosen Deck</span>' : ""}
            </button>`
                  )
                  .join("")
              : `<div class="empty card-panel" style="grid-column:1/-1;text-align:center;padding:24px">
                  <span style="font-size:36px">📖</span>
                  <p class="muted" style="margin:8px 0 12px">No custom decks in your character profile yet.</p>
                  <button type="button" class="btn gold small deck-tab-btn" data-tab="starters">🌟 Pick a Starter Deck</button>
                </div>`
          }
        </div>
      </div>`;
    }

    function joinLink() {
      const code = state && state.code;
      const raw = (state && state.joinUrl) || "";
      try {
        const u = new URL(raw || `${location.origin}/#/table/${code}`);
        u.protocol = "https:";
        u.port = location.port || "8888";
        u.hash = `/table/${code}`;
        return u.toString();
      } catch {
        const host = location.hostname || "127.0.0.1";
        return `https://${host}:8888/#/table/${code}`;
      }
    }

    function bindPregame() {
      $$(".deck-tab-btn").forEach((btn) => {
        btn.onclick = () => {
          selectedDeckTab = btn.dataset.tab;
          render();
        };
      });
      $$("[data-deck]").forEach((el) => {
        el.onclick = () => sendAction("pickDeck", { deckId: el.dataset.deck });
      });
      const start = $("#start");
      if (start) start.onclick = () => sendAction("start");
      const ptt = $("#pregame-timer-toggle");
      if (ptt) ptt.onclick = () => toggleTimer();
      $("#copy-join").onclick = async () => {
        try {
          await navigator.clipboard.writeText(joinLink());
          toast("Join link copied");
        } catch {
          toast(joinLink());
        }
      };
      $("#open-p2").onclick = () => {
        const p2url = `${location.origin}/#/table/${state.code}?second=1`;
        const p2win = window.open("", "mtg-p2");
        if (p2win) {
          // Force navigation so the ?second=1 hash param is always processed fresh,
          // even if the named window was already open at a different route.
          p2win.location.href = p2url;
        } else {
          // Popup blocked — fall back
          window.open(p2url, "_blank");
        }
      };
      $$(".wager-btn").forEach((btn) => {
        btn.onclick = () => {
          const w = parseInt(btn.dataset.wager, 10) || 0;
          sendAction("setWager", { wager: w });
        };
      });
      const addBotBtn = $("#add-bot");
      if (addBotBtn) {
        addBotBtn.onclick = () => sendAction("addBot");
      }
      $$("[data-claim-seat]").forEach((btn) => {
        btn.onclick = () => {
          const want = Number(btn.dataset.claimSeat);
          if (state && state.you === want) return;
          if (state && state.you >= 0) {
            toast("You're already seated. The other player opens the https link, or use Open player 2 on this PC.");
            return;
          }
          conn.send({ t: "join", code: state.code, seat: want, takeOver: true });
        };
      });
    }

    function bindPlay() {
      const rematchBtn = $("#rematch-btn");
      if (rematchBtn) rematchBtn.onclick = () => sendAction("rematch");
      const returnBtn = $("#return-tables");
      if (returnBtn) returnBtn.onclick = () => leaveMatch(true);
      $$("[data-life]").forEach((b) => {
        b.onclick = () => {
          const seat = Number(b.closest("[data-seat]").dataset.seat);
          sendAction("life", { seat, delta: Number(b.dataset.life) });
        };
      });
      $$("[data-open]").forEach((z) => {
        z.onclick = () => openZone(Number(z.dataset.seat), z.dataset.open);
      });
      enableDrag();
      $$(".mtg-card").forEach((el) => {
        el.addEventListener("pointerenter", () => hoverCard(el.dataset.iid));
        el.addEventListener("pointerleave", () => {
          if (hovered === el.dataset.iid) {
            hovered = null;
            $("#preview").hidden = true;
          }
        });
        el.addEventListener("dblclick", (e) => {
          e.preventDefault();
          if (pickingAttackers || (state && state.combat && state.combat.step === "blockers")) return;
          if (!isMine(el.dataset.iid)) {
            toast("You can only tap your own cards");
            return;
          }
          sendAction("tap", { iid: el.dataset.iid });
        });
        el.addEventListener("contextmenu", (e) => {
          e.preventDefault();
          if (!isMine(el.dataset.iid)) {
            toast("You can only use your own cards");
            return;
          }
          selected = el.dataset.iid;
          showMenu(e.clientX, e.clientY, el.dataset.iid);
        });
        el.addEventListener("click", (e) => {
          if (e.detail === 2) return;
          const blockingNow = state && state.combat && state.combat.step === "blockers" && state.you === defenderSeat();
          if (blockingNow) {
            if (el.classList.contains("can-block")) {
              blockPick = blockPick === el.dataset.iid ? null : el.dataset.iid;
              render();
              return;
            }
            const atk = (state.combat.attackers || []).find((a) => a.iid === el.dataset.iid);
            if (atk) {
              if (!blockPick) {
                toast("Click one of your creatures first, then the attacker");
                return;
              }
              sendAction("assignBlock", {
                attacker: atk.iid,
                blocker: atk.blockedBy === blockPick ? null : blockPick,
              });
              blockPick = null;
              return;
            }
          }
          if (el.classList.contains("theirs")) return;
          selected = el.dataset.iid;
          $$(".mtg-card.selected").forEach((n) => n.classList.remove("selected"));
          el.classList.add("selected");
          if (pickingAttackers && el.classList.contains("can-attack")) {
            if (attackPick.has(el.dataset.iid)) attackPick.delete(el.dataset.iid);
            else attackPick.add(el.dataset.iid);
            render();
          }
        });
      });
    }

    function findInst(iid) {
      if (!state) return null;
      const stacked = (state.stack || []).find((x) => x.iid === iid);
      if (stacked) return { card: stacked, zone: "stack", seat: stacked.ownerSeat };
      for (const s of state.seats) {
        for (const [zone, list] of Object.entries(s.zones || {})) {
          if (!Array.isArray(list)) continue;
          const c = list.find((x) => x.iid === iid);
          if (c) return { card: c, zone, seat: s.seat };
        }
      }
      return null;
    }

    function hoverCard(iid) {
      const found = findInst(iid);
      hovered = iid;
      const pv = $("#preview");
      if (!found || found.card.hidden || found.card.faceDown) {
        pv.hidden = true;
        return;
      }
      const c = found.card;
      pv.hidden = false;
      pv.innerHTML = `<img src="${cardImg(c)}" alt=""><div class="oracle"><b>${escapeHtml(c.name)}</b> ${manaPips(c.mana_cost)}<div class="faint">${escapeHtml(c.type_line || "")}</div><div>${escapeHtml(c.oracle_text || "")}</div></div>`;
    }

    function showMenu(x, y, iid) {
      const menu = $("#cmenu");
      menu.hidden = false;
      menu.style.left = Math.min(x, innerWidth - 320) + "px";
      menu.style.top = Math.min(y, Math.max(10, innerHeight - 380)) + "px";
      const found = findInst(iid);
      const c = found ? found.card : null;
      let ctrSummary = "";
      if (c && c.counters) {
        const parts = Object.entries(c.counters).map(([k, v]) =>
          k === "p1p1" ? `+${v}/+${v}` : k === "m1m1" ? `-${v}/-${v}` : `${v} ${k}`
        );
        if (parts.length) ctrSummary = ` (${parts.join(", ")})`;
      }
      menu.innerHTML = `
        <div class="menu-label">Counters${escapeHtml(ctrSummary)}</div>
        <button class="ctr-act" data-m="p1">+1/+1</button>
        <button class="ctr-act" data-m="p1_dec">−1/+1</button>
        <button class="ctr-act" data-m="m1">−1/−1</button>
        <button class="ctr-act" data-m="clear">Clear counters</button>
        <button class="ctr-act" data-m="loy">Loyalty (+1)</button>
        <button class="ctr-act" data-m="loy_dec">Loyalty (−1)</button>
        <div class="sep"></div>
        <button data-m="tap">Tap / Untap</button>
        <button data-m="flip">Flip</button>
        <button data-m="fd">Face down</button>
        <button data-m="stack">Stack</button>
        <div class="sep"></div>
        <button data-m="bf">Battlefield</button>
        <button data-m="hand">Hand</button>
        <button data-m="gy">Graveyard</button>
        <button data-m="ex">Exile</button>
        <button data-m="libtop">Library top</button>
        <button data-m="libbot">Library bottom</button>
        <button data-m="cmd">Command</button>
        <button data-m="attach">Attach aura</button>
      `;
      menu.onclick = (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        const k = btn.dataset.m;
        if (!k) return;
        if (!isMine(iid)) return;
        if (k === "p1") sendAction("counters", { iid, counter: "p1p1", delta: 1 });
        if (k === "p1_dec") sendAction("counters", { iid, counter: "p1p1", delta: -1 });
        if (k === "m1") sendAction("counters", { iid, counter: "m1m1", delta: 1 });
        if (k === "clear") sendAction("counters", { iid, clear: true });
        if (k === "loy") sendAction("counters", { iid, counter: "loyalty", delta: 1 });
        if (k === "loy_dec") sendAction("counters", { iid, counter: "loyalty", delta: -1 });
        if (k === "tap") sendAction("tap", { iid });
        if (k === "flip") sendAction("flip", { iid });
        if (k === "fd") sendAction("faceDown", { iid, faceDown: true });
        if (k === "bf") sendAction("move", { iid, toZone: "battlefield", x: 0.5, y: 0.5 });
        if (k === "hand") sendAction("move", { iid, toZone: "hand" });
        if (k === "gy") sendAction("move", { iid, toZone: "graveyard" });
        if (k === "ex") sendAction("move", { iid, toZone: "exile" });
        if (k === "libtop") sendAction("move", { iid, toZone: "library", index: 0 });
        if (k === "libbot") sendAction("move", { iid, toZone: "library" });
        if (k === "cmd") sendAction("move", { iid, toZone: "command" });
        if (k === "stack") sendAction("move", { iid, toZone: "stack" });
        if (k === "attach") {
          const aura = findInst(iid);
          const tgt = selected && selected !== iid ? selected : null;
          if (!aura || !isAura(aura.card) || !tgt) toast("Select a creature, then attach from the aura");
          else {
            attachments.set(iid, tgt);
            toast("Aura attached");
          }
        }
        menu.hidden = true;
      };
    }

    document.addEventListener("click", (e) => {
      if (!e.target.closest("#cmenu")) $("#cmenu").hidden = true;
    });

    function openZone(seat, zone) {
      const s = state.seats[seat];
      const list = s.zones[zone];
      if (list && list.hidden) {
        toast(`${s.name}'s ${zone} (${list.count})`);
        return;
      }
      openModal(`<h2>${escapeHtml(s.name)} · ${zone} (${(list || []).length})</h2>
        <div class="zone-grid">${(list || [])
          .map(
            (c, i) => `<div class="result" data-iid="${c.iid}">
              <img src="${cardImg(c)}" alt="${escapeHtml(c.name)}" />
              <div class="meta"><b>${escapeHtml(c.name || "card")}</b></div>
            </div>`
          )
          .join("")}</div>
        <p class="muted">Click a card to draw it to the battlefield. Close to shuffle the library if you were browsing it.</p>
        <button class="btn" id="close-m">Close</button>`);
      $("#close-m").onclick = closeModal;
      $$(".result[data-iid]").forEach((el) => {
        el.onclick = () => {
          if (seat !== state.you) {
            toast("You can only play your own cards");
            return;
          }
          sendAction("move", { iid: el.dataset.iid, toZone: "battlefield", x: 0.5, y: 0.45 });
          closeModal();
        };
      });
      if (zone === "library" && seat === state.you) {
        /* browsing a library — shuffle when closed is Table Commander behaviour */
        const prev = closeModal;
      }
    }

    function handleAct(act) {
      if (act === "rematch") sendAction("rematch");
      if (act === "declareWin") {
        const s0 = state.seats[0];
        const s1 = state.seats[1];
        const potTxt = (state.pot || (state.wager * 2) || 0).toLocaleString();
        openModal(`<h2>👑 Award Match Victory</h2>
          <p>Declare the winner of this match. The pot of <b>${potTxt} 🪙 Gold</b> will be awarded immediately.</p>
          <div style="display:flex;flex-direction:column;gap:10px;margin:20px 0;">
            <button class="btn gold" id="win-0" style="padding:12px;font-size:15px;text-align:left">
              🏆 Award to <b>${escapeHtml(s0.name || "Player 1")}</b> (Seat 1)${s0.you ? " — You" : ""}
            </button>
            <button class="btn gold" id="win-1" style="padding:12px;font-size:15px;text-align:left">
              🏆 Award to <b>${escapeHtml(s1.name || "Player 2")}</b> (Seat 2)${s1.you ? " — You" : ""}
            </button>
          </div>
          <button class="btn ghost" id="close-m">Cancel</button>`);
        $("#close-m").onclick = closeModal;
        $("#win-0").onclick = () => {
          sendAction("declareWinner", { winnerSeat: 0 });
          closeModal();
        };
        $("#win-1").onclick = () => {
          sendAction("declareWinner", { winnerSeat: 1 });
          closeModal();
        };
      }
      if (act === "draw") sendAction("draw", { n: 1 });
      if (act === "untapAll") sendAction("untapAll");
      if (act === "shuffle") sendAction("shuffle");
      if (act === "mulligan") sendAction("mulligan");
      if (act === "nextPhase") sendAction("nextPhase");
      if (act === "passCombat") {
        if (state.combat && state.combat.step === "blockers") {
          toast("Wait for the other player to finish blocking");
          return;
        }
        pickingAttackers = false;
        attackPick.clear();
        attacking.clear();
        sendAction("setPhase", { phase: "main2" });
        render();
      }
      if (act === "passTurn") autoFinishTurn();
      if (act === "resolve") sendAction("resolve");
      if (act === "attack") beginAttackPick();
      if (act === "confirmAttackers") confirmAttackers();
      if (act === "confirmBlocks") sendAction("confirmBlocks");
      if (act === "clearBlock") {
        blockPick = null;
        render();
      }
      if (act === "roll") sendAction("roll", { sides: 20, n: 1 });
      if (act === "mill") sendAction("mill", { n: 1 });
      if (act === "interrupt") sendAction("interrupt");
      if (act === "concede") {
        if (confirm("Concede this game?")) sendAction("concede");
      }
      if (act === "token") {
        openModal(`<h2>Create token</h2>
          <div class="row">
            <input class="grow" id="tok-q" placeholder="Search tokens, or type a name" />
            <button class="btn" id="tok-search">Search</button>
          </div>
          <div class="results" id="tok-res" style="margin-top:10px"></div>
          <div class="row" style="margin-top:10px">
            <input id="tok-name" placeholder="Custom name" />
            <input id="tok-p" type="number" value="1" style="width:64px" /> /
            <input id="tok-t" type="number" value="1" style="width:64px" />
            <input id="tok-n" type="number" value="1" min="1" max="20" style="width:64px" />
            <button class="btn gold" id="tok-go">Create</button>
          </div>
          <button class="btn ghost" id="close-m" style="margin-top:10px">Close</button>`);
        $("#close-m").onclick = closeModal;
        const doSearch = async () => {
          const data = await api("/api/cards?token=1&limit=24&q=" + encodeURIComponent($("#tok-q").value));
          $("#tok-res").innerHTML = data.cards
            .map(
              (c) => `<div class="result" data-id="${c.id}" data-name="${escapeHtml(c.name)}">
                <img src="${c.image_small}" alt="" /><div class="meta"><b>${escapeHtml(c.name)}</b></div></div>`
            )
            .join("");
        };
        $("#tok-search").onclick = doSearch;
        $("#tok-q").addEventListener("keydown", (e) => {
          if (e.key === "Enter") doSearch();
        });
        $("#tok-res").onclick = (e) => {
          const el = e.target.closest("[data-id]");
          if (!el) return;
          sendAction("token", { cardId: el.dataset.id, n: Number($("#tok-n").value || 1) });
          closeModal();
        };
        $("#tok-go").onclick = () => {
          sendAction("token", {
            name: $("#tok-name").value || "Token",
            power: $("#tok-p").value,
            toughness: $("#tok-t").value,
            n: Number($("#tok-n").value || 1),
          });
          closeModal();
        };
      }
    }

    function combatBannerHTML(you) {
      const combat = state.combat;
      if (pickingAttackers) {
        const n = attackPick.size;
        return `<div class="combat-hud-banner">
          <div class="combat-hud-title">
            <span class="combat-icon">⚔️</span>
            <span>Click the glowing creatures, then confirm.</span>
            <span class="combat-tally">${n} selected</span>
          </div>
          <button type="button" class="btn gold pulse" data-act="confirmAttackers" ${n ? "" : "disabled"}>Confirm attack</button>
          <button type="button" class="btn ghost" data-act="passCombat">Cancel</button>
        </div>`;
      }
      if (combat && combat.step === "blockers") {
        const names = combat.attackers.map((a) => a.blockerName ? `${a.name} (blocked by ${a.blockerName})` : a.name).join(", ");
        if (you === defenderSeat()) {
          const pickedName = blockPick ? findInst(blockPick)?.card?.name : "";
          return `<div class="combat-hud-banner">
            <div class="combat-hud-title">
              <span class="combat-icon">🛡️</span>
              <span>${pickedName ? `Selected ${escapeHtml(pickedName)}. Click the attacker it blocks.` : "Block step. Click one of your creatures, then the attacker. Confirm with no blocks to take the damage."}</span>
              <span class="combat-tally">${escapeHtml(names)}</span>
            </div>
            <button type="button" class="btn gold pulse" data-act="confirmBlocks">Confirm blocks</button>
          </div>`;
        }
        return `<div class="combat-hud-banner">
          <div class="combat-hud-title">
            <span class="combat-icon">🛡️</span>
            <span>Waiting for blocks: ${escapeHtml(names)}</span>
          </div>
        </div>`;
      }
      if (state.phase === "combat") {
        return `<div class="combat-hud-banner">
          <div class="combat-hud-title"><span class="combat-icon">⚔️</span><span>Combat — press Attack to choose creatures.</span></div>
          <button type="button" class="btn gold pulse" data-act="passCombat">⏭️ Pass combat</button>
        </div>`;
      }
      return "— stack —";
    }

    function beginAttackPick() {
      if (!myTurn()) {
        toast("Not your turn");
        return;
      }
      if (state.combat && state.combat.step === "blockers") {
        toast("Waiting for the other player to block");
        return;
      }
      const any = (state.seats[state.you].zones.battlefield || []).some((c) => legalAttacker(c));
      pickingAttackers = true;
      attackPick.clear();
      if (state.phase !== "combat") sendAction("setPhase", { phase: "combat" });
      if (!any) toast("No creatures can attack right now");
      render();
    }

    function confirmAttackers() {
      if (!attackPick.size) {
        toast("Click at least one glowing creature");
        return;
      }
      const iids = [...attackPick];
      pickingAttackers = false;
      attackPick.clear();
      sendAction("declareAttackers", { iids });
      const names = iids.map((id) => findInst(id)?.card?.name).filter(Boolean);
      if (names.length) showCombatFx(names.join(", "));
    }

    let lastAtkFx = 0;
    function showCombatFx(cardOrName) {
      const el = document.getElementById("atk-fx");
      if (!el) return;
      const now = Date.now();
      if (now - lastAtkFx < 650) return;
      lastAtkFx = now;
      const name = typeof cardOrName === "string" ? cardOrName : cardOrName?.name || "Attack";
      let img = "";
      if (cardOrName && cardOrName.image) img = cardImg(cardOrName);
      else if (state) {
        for (const s of state.seats) {
          const hit = (s.zones.battlefield || []).find((c) => c.name === name);
          if (hit) {
            img = cardImg(hit);
            break;
          }
        }
      }
      const words = ["ATTACK!", "CLASH!", "SWOOSH!", "BONK!"];
      const word = words[Math.floor(Math.random() * words.length)];
      const sparks = Array.from({ length: 14 }, (_, i) => {
        const x = 18 + Math.random() * 64;
        const y = 22 + Math.random() * 56;
        const delay = (Math.random() * 0.2).toFixed(2);
        return `<i class="atk-spark" style="left:${x}%;top:${y}%;animation-delay:${delay}s"></i>`;
      }).join("");
      el.hidden = false;
      el.innerHTML = `
        <div class="atk-vignette"></div>
        <div class="atk-slash s1"></div>
        <div class="atk-slash s2"></div>
        ${img ? `<div class="atk-flyer" style="background-image:url('${img}')"></div>` : ""}
        <div class="atk-banner">${escapeHtml(word)}</div>
        <div class="atk-sub">${escapeHtml(name)}</div>
        ${sparks}`;
      if (window.MTG_SFX) window.MTG_SFX.play("attack");
      clearTimeout(showCombatFx._t);
      showCombatFx._t = setTimeout(() => {
        el.hidden = true;
        el.innerHTML = "";
      }, 1200);
    }

    function bindCounterTray() {
      $$("[data-ctr]").forEach((el) => {
        el.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          const kind = el.dataset.ctr;
          const ghost = document.createElement("div");
          ghost.className = "ctr-ghost";
          ghost.textContent = el.textContent;
          // Append to overlay so it's above z-index 9999
          const overlay = document.getElementById("table-full-overlay") || document.body;
          overlay.appendChild(ghost);
          ghost.style.transform = "rotate(3deg) scale(1.05)";
          ghost.style.transition = "transform 0.1s ease-out";
          ghost.style.zIndex = "10000";
          const move = (ev) => {
            ghost.style.left = ev.clientX + 8 + "px";
            ghost.style.top = ev.clientY + 8 + "px";
          };
          const up = (ev) => {
            ghost.remove();
            const hitCard = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".mtg-card[data-iid]");
            if (hitCard && !String(hitCard.dataset.iid).startsWith("h")) {
              sendAction("counters", { iid: hitCard.dataset.iid, counter: kind, delta: 1 });
            }
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          move(e);
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        });
      });
    }

    function enableDrag() {
      let drag = null;
      const ghost = document.createElement("div");
      ghost.className = "drag-ghost";
      const onMove = (e) => {
        if (!drag) return;
        ghost.style.left = e.clientX - 36 + "px";
        ghost.style.top = e.clientY - 50 + "px";
        $$("[data-drop]").forEach((z) => z.classList.toggle("over", hit(z, e)));
      };
      const onUp = (e) => {
        if (!drag) return;
        ghost.remove();
        const drop = $$("[data-drop]").find((z) => hit(z, e));
        $$("[data-drop]").forEach((z) => z.classList.remove("over"));
        if (drop) {
          const zone = drop.dataset.drop;
          const from = findInst(drag.iid);
          if (zone === "stack") {
            sendAction("move", { iid: drag.iid, toZone: "stack" });
          } else if (from && from.zone === "stack") {
            const rect = drop.getBoundingClientRect();
            const x = Math.max(0.02, Math.min(0.98, (e.clientX - rect.left) / rect.width));
            const y = Math.max(0.02, Math.min(0.98, (e.clientY - rect.top) / rect.height));
            sendAction("move", { iid: drag.iid, toZone: zone, toSeat: from.seat, x, y });
          } else if (!isMine(drag.iid)) {
            toast("You can only move your own cards");
          } else if (Number(drop.dataset.seat) !== state.you && zone !== "stack") {
            toast("Play only on your side");
          } else if (zone === "battlefield") {
            const rect = drop.getBoundingClientRect();
            const x = Math.max(0.02, Math.min(0.98, (e.clientX - rect.left) / rect.width));
            const y = Math.max(0.02, Math.min(0.98, (e.clientY - rect.top) / rect.height));
            if (from && from.zone === "battlefield") {
              sendAction("pos", { iid: drag.iid, x, y });
            } else {
              sendAction("move", { iid: drag.iid, toZone: "battlefield", toSeat: state.you, x, y });
            }
            if (window.MTG_FX && window.MTG_FX.triggerTableRipple) {
              window.MTG_FX.triggerTableRipple(e.clientX, e.clientY);
            }
          } else {
            sendAction("move", { iid: drag.iid, toZone: zone, toSeat: state.you });
          }
        } else {
          const from = findInst(drag.iid);
          if (from && from.zone === "battlefield" && isMine(drag.iid)) {
            const myBf = $(`.bf.you[data-seat="${state.you}"]`) || $(".bf.you");
            if (myBf) {
              const rect = myBf.getBoundingClientRect();
              const x = Math.max(0.02, Math.min(0.98, (e.clientX - rect.left) / rect.width));
              const y = Math.max(0.02, Math.min(0.98, (e.clientY - rect.top) / rect.height));
              sendAction("pos", { iid: drag.iid, x, y });
            }
          }
        }
        drag = null;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      $$(".mtg-card[data-iid]").forEach((el) => {
        if (el.dataset.iid.startsWith("h")) return; /* fake opp hand backs */
        el.ondragstart = (e) => e.preventDefault();
        el.addEventListener("pointerdown", (e) => {
          if (e.button !== 0) return;
          if (pickingAttackers && el.classList.contains("can-attack")) return;
          if (state && state.combat && state.combat.step === "blockers" && (el.classList.contains("can-block") || el.classList.contains("block-target") || el.classList.contains("attacking"))) return;
          if (!canDrag(el.dataset.iid)) return;
          const from = findInst(el.dataset.iid);
          drag = { iid: el.dataset.iid, zone: from ? from.zone : el.dataset.zone };
          ghost.style.backgroundImage = `url("${el.querySelector("img")?.src || "/img/cardback.jpg"}")`;
          
          const overlay = document.getElementById("table-full-overlay") || document.body;
          overlay.appendChild(ghost);
          ghost.style.transform = "rotate(3deg) scale(1.05)";
          ghost.style.transition = "transform 0.1s ease-out";
          ghost.style.zIndex = "10000";
          onMove(e);
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
        });
      });
    }

    function hit(el, e) {
      const r = el.getBoundingClientRect();
      return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    }

    window.addEventListener("keydown", onKey);
    function onKey(e) {
      if (e.target && e.target.matches && e.target.matches("input, textarea")) return;
      const iid = selected || hovered;
      if (e.key === "d" || e.key === "D") sendAction("draw");
      if (e.key === "n" || e.key === "N") sendAction("nextPhase");
      if (e.key === "p" || e.key === "P") autoFinishTurn();
      if (e.key === "a" || e.key === "A") beginAttackPick();
      if (e.key === "u" || e.key === "U") sendAction("untapAll");
      if (!iid || !isMine(iid)) return;
      if (e.key === "t" || e.key === "T") sendAction("tap", { iid });
      if (e.key === "g" || e.key === "G") sendAction("move", { iid, toZone: "graveyard" });
      if (e.key === "e" || e.key === "E") sendAction("move", { iid, toZone: "exile" });
      if (e.key === "h" || e.key === "H") sendAction("move", { iid, toZone: "hand" });
      if (e.key === "+" || e.key === "=") sendAction("counters", { iid, counter: "p1p1", delta: 1 });
      if (e.key === "-") sendAction("counters", { iid, counter: "p1p1", delta: -1 });
    }

    function attach() {
      let pendingDeckId = null;
      window.MTG_TABLE_CONN = conn = connectWS({
        playerId: me.id,
        name: me.name,
        onHello: () => {
          const currentCode = (state?.code || location.hash.match(/\/table\/([A-Za-z0-9]+)/)?.[1] || r.code || "").toUpperCase();
          if ((r.code === "NEW" || r.code === "") && (!currentCode || currentCode === "NEW")) {
            const pending = JSON.parse(sessionStorage.getItem("mtg-pending-create") || "null");
            sessionStorage.removeItem("mtg-pending-create");
            pendingDeckId = pending?.deckId || null;
            conn.send({
              t: "create",
              name: pending?.name || "Elves vs Goblins",
              format: pending?.format || "duel",
              wager: Number(pending?.wager) || 0,
              vsBot: !!pending?.vsBot,
              botDifficulty: pending?.botDifficulty || "normal",
              timerEnabled: !!pending?.timerEnabled,
            });
          } else {
            const joinCode = currentCode && currentCode !== "NEW" ? currentCode : r.code;
            conn.send({ t: "join", code: joinCode, takeOver: true });
          }
        },
        onState: (s) => {
          state = s;
          r.code = s.code;
          noteArrivals(s);
          if (s.code && (location.hash.indexOf(s.code) === -1 || r.code === "NEW")) {
            history.replaceState(null, "", `#/table/${s.code}${window.MTG_SECOND ? "?second=1" : ""}`);
          }
          if (pendingDeckId && s && !s.started) {
            const mySeat = s.seats && s.seats[s.you];
            if (mySeat && !mySeat.deckId) {
              conn.send({ t: "action", a: { kind: "pickDeck", deckId: pendingDeckId } });
              pendingDeckId = null;
            }
          }
          playTableSounds(s);
          startPhaseTimer(s);
          detectLifeChanges(s);
          render();
          maybeAutoDraw(s);
          autoStepToMain();
        },
        onError: (err) => {
          toast(err);
          const mat = document.querySelector(".playmat");
          if (mat && !state) {
            mat.innerHTML = `<div class="pregame"><h2>Could not sit</h2><p>${escapeHtml(err)}</p><p><a class="btn gold" onclick="window.MTG.openTablesModal && window.MTG.openTablesModal(); return false;" href="#">Back to tables</a></p></div>`;
          }
        },
      });
      window.MTG_WS = conn.ws;
      window.MTG_RECONNECT = attach;
    }
    attach();
    api("/api/decks")
      .then((d) => {
        decks = d;
        if (state && !state.started) render();
      })
      .catch(() => {});

    $("#player-name")?.addEventListener("change", () => {
      conn.send({ t: "rename", name: $("#player-name").value });
    });
  };

  window.MTG_VIEWS = window.MTG_VIEWS || {};
  window.MTG_VIEWS.table = window.MTG.openTableModal;
})();
