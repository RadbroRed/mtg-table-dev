(() => {
  const {
    $,
    $$,
    api,
    toast,
    escapeHtml,
    nav,
    bindNav,
    go,
    getInfo,
    identity,
    setName,
    getCachedUser,
    setCachedUser,
    fetchMe,
    claimFaucet,
    openAuthModal,
    SKINS,
    getSkin,
  } = window.MTG;

  window.MTG.openTablesModal = async function openTablesModal() {
    const second = window.MTG_SECOND;
    const me = identity(second);
    let user = getCachedUser(second);
    const curSkin = (SKINS && getSkin) ? (SKINS.find((s) => s.id === getSkin(second)) || SKINS[0]) : { name: "Classic Arcane", icon: "✨" };

    if(window.MTG.openModal) window.MTG.openModal(`<div class="wrap" id="lobby-root" style="padding:16px; width: 100%; box-sizing: border-box; max-height: 80vh; overflow-y: auto;"><div class="pregame"><h2>🏰 Loading Grand Arena Tables…</h2><p class="muted">Fetching available multiplayer tables, wagers, and AI duel arenas…</p></div></div>`);

    let info = { url: location.origin };
    let decks = [];
    let tables = [];
    let lb = [];
    try {
      const res = await Promise.all([
        getInfo().catch(() => ({ url: location.origin })),
        api("/api/decks").catch(() => []),
        api("/api/tables").catch(() => []),
        api("/api/leaderboard").catch(() => []),
      ]);
      info = res[0] || info;
      decks = res[1] || decks;
      tables = res[2] || tables;
      lb = res[3] || lb;
    } catch(err) {
      console.warn("Error fetching tables lobby data:", err);
    }

    if (fetchMe && !user && window.MTG.getToken && window.MTG.getToken(second)) {
      try {
        const freshUser = await fetchMe(second);
        if (freshUser) {
          user = freshUser;
          const navEl = $(".topnav");
          if (navEl) {
            const temp = document.createElement("div");
            temp.innerHTML = nav("lobby");
            navEl.replaceWith(temp.firstElementChild);
            bindNav();
          }
        }
      } catch {}
    }

    let myBalance = user && typeof user.balance === "number" ? user.balance : 0;
    let myLevel = user && typeof user.level === "number" ? user.level : 1;
    let myXp = user && typeof user.xp === "number" ? user.xp : 0;
    let myXpNeeded = user && typeof user.xpNeeded === "number" ? user.xpNeeded : (myLevel * 100);
    let myXpPct = Math.min(100, Math.max(0, Math.round((myXp / myXpNeeded) * 100)));

    $("#lobby-root").innerHTML = `
      <div class="hero" style="display:block; margin-bottom:20px;">
        <div>
          <h1 style="font-size:32px; margin-bottom:8px;">Gather 'Round · Cast · Play ✨</h1>
          <p style="margin-bottom:14px; max-width:65ch;">Cozy two-player Magic over the LAN. Stake Gold on matches, climb the multiverse leaderboard, or play casually by the hearth!</p>
          <div class="lan-banner" style="margin-bottom:14px;">
            <span>Other player opens</span>
            <code id="lan-url">${escapeHtml(info.url)}</code>
            <button class="btn small ghost" id="copy-url">📋 Copy</button>
          </div>
          <div class="toolbar">
            <a class="btn gold" href="#/table/new">✨ Play Casual</a>
            <a class="btn" href="#/table/new?second=1" target="mtg-p2">🧙 Player 2 window</a>
          </div>
        </div>
      </div>

      <!-- Player Profile & Gold Vault Sanctuary Banner -->
      <div class="lobby-vault-banner">
        <div class="lobby-vault-left">
          <span class="vault-coin-icon">${user && user.avatar ? (user.avatar.startsWith("preset:") ? ({"preset:fairy":"🧚","preset:unicorn":"🦄","preset:wizard":"🧙","preset:dragon":"🐉","preset:kitty":"🐱","preset:princess":"👑","preset:metal":"🤘","preset:cyber":"🤖","preset:skull":"💀"}[user.avatar] || "🧙") : `<img src="${escapeHtml(user.avatar)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:1.5px solid var(--gold)" alt="avatar" />`) : "🪙"}</span>
          <div class="vault-meta">
            <div class="vault-badge-row">
              <span class="vault-badge ${user ? "registered" : "guest"}">${user ? "✨ Registered Wizard" : "🌱 Guest Planeswalker"}</span>
              <span class="vault-badge gold" style="font-weight:bold;">⭐ Lv. ${myLevel}</span>
              <span class="vault-id">${escapeHtml(user ? user.displayName || user.username : me.name)}</span>
            </div>
            <div class="vault-balance-row">
              <span class="gold-amount"><b>${myBalance.toLocaleString()}</b> 🪙 Gold</span>
              <span class="vault-xp" style="font-size:11px; color:#c084fc; margin-left:8px;" title="${myXp} / ${myXpNeeded} XP">⭐ ${myXp} / ${myXpNeeded} XP (${myXpPct}%)</span>
              <span class="vault-record" style="margin-left:8px;">${user ? `🏆 ${user.wins || 0}W · 💀 ${user.losses || 0}L` : "Log in to save balance & records permanently"}</span>
            </div>
          </div>
        </div>
        <div class="lobby-vault-right">
          <button type="button" class="btn small ghost" id="lobby-skin-btn" title="Change Multiverse Theme">🎨 Skin: <span id="lobby-skin-label">${escapeHtml(curSkin.name)}</span></button>
          ${user ? `<button type="button" class="btn small ghost" id="lobby-account-btn">🧙 Profile & Decks</button>` : `<button type="button" class="btn small ghost" id="lobby-account-btn">🔑 Log In / Register</button>`}
          <a class="btn small ghost" onclick="window.MTG.go('/dao'); return false;" href="#">🏛️ DAO</a>
          <a class="btn small ghost" href="#/dnd">🎲 D&D</a>
          <button type="button" class="btn small ghost" id="lobby-leaderboard-btn">🏆 Leaderboard</button>
        </div>
      </div>

      <div class="grid-2">
        <div class="card-panel">
          <h2>🏰 Host a Table</h2>
          <div class="field">
            <label>Table name</label>
            <input id="t-name" type="text" value="✨ Cozy Kitchen Table" />
          </div>
          <div class="field">
            <label>Format</label>
            <select id="t-format">
              <option value="duel">⚔️ Duel (20 life, 60 cards)</option>
              <option value="commander">👑 Commander (40 life)</option>
              <option value="casual">🌸 Casual (20 life, freeform)</option>
            </select>
          </div>
          <div class="field">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <label style="margin:0">Match Wager (🪙 Stakes)</label>
              <span class="faint" style="font-size:12px">Your Vault: <b style="color:var(--gold)">🪙 <span id="host-user-gold">${myBalance.toLocaleString()}</span> Gold</b></span>
            </div>
            <div class="wager-chips" id="wager-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
              <button type="button" class="btn small gold wager-chip active" data-wager="0">🌸 Casual (0 🪙)</button>
              <button type="button" class="btn small ghost wager-chip" data-wager="50">50 🪙</button>
              <button type="button" class="btn small ghost wager-chip" data-wager="100">100 🪙</button>
              <button type="button" class="btn small ghost wager-chip" data-wager="250">250 🪙</button>
              <button type="button" class="btn small ghost wager-chip" data-wager="500">500 🪙</button>
              <button type="button" class="btn small ghost wager-chip" data-wager="custom">✨ Custom 🪙</button>
            </div>
            <div id="custom-wager-box" style="display:none;margin-top:8px;align-items:center;gap:8px">
              <label style="font-size:12px;margin:0">Custom Wager:</label>
              <input type="number" id="custom-wager-input" min="0" max="100000" placeholder="e.g. 75 or 1000" style="width:140px;padding:4px 8px;border-radius:6px;background:var(--bg);border:1px solid var(--line)" />
            </div>
            <div class="faint" id="wager-preview" style="margin-top:6px">Casual friendly match · No gold staked</div>
            <input id="t-wager" type="hidden" value="0" />
          </div>
          <label class="muted" style="display:flex;gap:8px;margin:12px 0 6px;align-items:center">
            <input type="checkbox" id="t-vs-bot" /> 🤖 Play vs Sparky (AI) — Sparky matches your wager!
          </label>
          <label class="muted" style="display:flex;gap:8px;margin:6px 0 16px;align-items:center">
            <input type="checkbox" id="t-timer" /> ⏱️ Turn countdown timer (Untimed by default)
          </label>
          <button class="btn gold" id="create">✨ Create table</button>
        </div>
        <div class="card-panel">
          <h2>🔮 Join by Code</h2>
          <p class="muted">Every table has a 6-character invite code. Paste it here, or open the link the host sent.</p>
          <div class="row">
            <input class="grow" id="join-code" type="text" maxlength="8" placeholder="XK7M2P" style="text-transform:uppercase" />
            <button class="btn gold" id="join">🌟 Join</button>
          </div>
          <label class="muted" style="display:flex;gap:8px;margin-top:12px;align-items:center">
            <input type="checkbox" id="second" /> I’m a second player on this computer
          </label>

          <!-- Mini Multiverse Leaderboard -->
          <div class="lobby-mini-leaderboard">
            <div class="mini-lb-head">
              <span>🏆 Multiverse Leaderboard</span>
              <button type="button" class="btn small ghost" id="lobby-open-lb">View all</button>
            </div>
            <div class="mini-lb-list">
              ${
                lb && lb.length
                  ? lb
                      .slice(0, 4)
                      .map(
                        (u, i) => `
                <div class="mini-lb-item ${user && user.id === u.id ? "is-me" : ""}">
                  <span class="mini-lb-rank">${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}</span>
                  <span class="mini-lb-name"><b>${escapeHtml(u.displayName || u.username)}</b>${user && user.id === u.id ? ' <small style="color:var(--gold)">(you)</small>' : ""}</span>
                  <span class="mini-lb-score">🪙 ${(u.balance || 0).toLocaleString()}</span>
                  <span class="mini-lb-wl faint">${u.wins || 0}W</span>
                </div>
              `
                      )
                      .join("")
                  : '<div class="faint" style="font-size:12px;padding:6px 0">No ranked wizards yet. Win the first match!</div>'
              }
            </div>
          </div>
        </div>
      </div>

      <div class="section-title">✨ Open Tables</div>
      <div class="table-list" id="tables">${
        tables.length
          ? tables
              .map(
                (t) => `
          <div class="table-row">
            <div>
              <b>${escapeHtml(t.name)}</b>
              <div class="faint">
                ${escapeHtml(t.code)} · ${escapeHtml(t.format)}${t.started ? " · in play" : ""}
                ${t.wager ? ` · <span class="chip gold" style="padding:1px 6px;font-size:0.75rem">🪙 ${t.wager} (Pot: ${t.pot || t.wager * 2} 🪙)</span>` : ` · <span class="chip" style="padding:1px 6px;font-size:0.75rem">Casual</span>`}
              </div>
            </div>
            <div class="muted">${t.seats.filter((s) => s.name).length}/2 seated</div>
            <div>
              ${t.seats
                .map(
                  (s) =>
                    `<span><i class="seat-dot ${s.name ? "" : "empty"}"></i>${escapeHtml(s.name || "open")}${s.deckName ? " · " + escapeHtml(s.deckName) : ""}</span>`
                )
                .join("<br>")}
            </div>
            <button class="btn" data-join="${escapeHtml(t.code)}">${t.seats.every((s) => s.name) ? "Rejoin" : "Sit"}</button>
          </div>`
              )
              .join("")
          : `<div class="empty">No open tables. Host one and send the LAN link.</div>`
      }</div>

      <div class="section-title">Decks on this machine</div>
      <div class="deck-strip">
        ${decks
          .map(
            (d) => `
          <div class="deck-tile" data-deck="${d.id}">
            <h3>${escapeHtml(d.name)}</h3>
            <p>${escapeHtml(d.format)} · ${d.counts.main + d.counts.command} cards${d.starter ? " · starter" : ""}</p>
          </div>`
          )
          .join("")}
        <div class="deck-tile" id="new-deck">
          <h3>+ New deck</h3>
          <p>Search the full catalog, or paste a list.</p>
        </div>
      </div>
      <p class="faint" style="margin-top:28px">Unofficial fan content. Card names and text are © Wizards of the Coast. Images via Scryfall. XMage client files live under <code>data/xmage</code> if you also want the Java rules engine.</p>
    `;

    $("#copy-url").onclick = async () => {
      try {
        await navigator.clipboard.writeText(info.url);
        toast("LAN URL copied");
      } catch {
        toast(info.url);
      }
    };

    const lab = $("#lobby-account-btn");
    if (lab) lab.onclick = () => go("/");

    const lsb = $("#lobby-skin-btn");
    if (lsb) {
      lsb.onclick = (e) => {
        e.preventDefault();
        const skinBtn = $("#skin-btn");
        if (skinBtn) skinBtn.click();
      };
    }

    const llb = $("#lobby-leaderboard-btn");
    if (llb) llb.onclick = () => openAuthModal("leaderboard");

    const lolb = $("#lobby-open-lb");
    if (lolb) lolb.onclick = () => openAuthModal("leaderboard");

    $("#create").onclick = () => {
      try { sessionStorage.removeItem("mtg-second"); } catch {}
      window.MTG_SECOND = false;
      const vsBot = $("#t-vs-bot")?.checked || false;
      const timerEnabled = $("#t-timer")?.checked || false;
      const deckId = sessionStorage.getItem("mtg-selected-deck") || localStorage.getItem("mtg-selected-deck") || null;
      sessionStorage.setItem("mtg-pending-create", JSON.stringify({
        name: $("#t-name")?.value || "Kitchen table",
        format: $("#t-format")?.value || "duel",
        wager: parseInt($("#t-wager")?.value, 10) || 0,
        vsBot,
        timerEnabled,
        deckId,
      }));
      if (window.MTG.closeModal) window.MTG.closeModal();
      go("/table/new");
    };

    function updateWagerPreview(w) {
      const prev = $("#wager-preview");
      if (!prev) return;
      if (w > 0) {
        const pot = w * 2;
        const fee = Math.max(0, Math.floor(pot * 0.03));
        const payout = pot - fee;
        const extra = w > myBalance ? ` <span style="color:#ff9d8c">(⚠️ You have ${myBalance.toLocaleString()} Gold — claim refill or lower wager)</span>` : "";
        prev.innerHTML = `🏆 Total Match Pot: <b>${pot.toLocaleString()} 🪙 Gold</b> (${w.toLocaleString()} 🪙 each) · Winner claims ~<b>${payout.toLocaleString()} 🪙</b> (3% DAO fee: ${fee.toLocaleString()} 🪙)${extra}`;
      } else {
        prev.textContent = "Casual friendly match · No gold staked";
      }
    }

    const customBox = $("#custom-wager-box");
    const customInput = $("#custom-wager-input");

    $$(".wager-chip").forEach((btn) => {
      btn.onclick = () => {
        $$(".wager-chip").forEach((b) => {
          b.classList.remove("gold", "active");
          b.classList.add("ghost");
        });
        btn.classList.remove("ghost");
        btn.classList.add("gold", "active");

        const isCustom = btn.dataset.wager === "custom";
        if (customBox) customBox.style.display = isCustom ? "flex" : "none";

        let w = 0;
        if (isCustom) {
          if (customInput) {
            customInput.focus();
            w = Math.max(0, parseInt(customInput.value, 10) || 0);
          }
        } else {
          w = parseInt(btn.dataset.wager, 10) || 0;
        }

        const input = $("#t-wager");
        if (input) input.value = w;
        updateWagerPreview(w);
      };
    });

    if (customInput) {
      customInput.oninput = () => {
        const w = Math.max(0, parseInt(customInput.value, 10) || 0);
        const input = $("#t-wager");
        if (input) input.value = w;
        updateWagerPreview(w);
      };
    }

    const join = (code) => {
      if ($("#second")?.checked) {
        try { sessionStorage.setItem("mtg-second", "1"); } catch {}
        window.MTG_SECOND = true;
      } else {
        try { sessionStorage.removeItem("mtg-second"); } catch {}
        window.MTG_SECOND = false;
      }
      go(`/table/${code.toUpperCase()}${window.MTG_SECOND ? "?second=1" : ""}`);
    };
    $("#join").onclick = () => {
      const code = $("#join-code").value.trim();
      if (code) join(code);
    };
    $("#join-code").addEventListener("keydown", (e) => {
      if (e.key === "Enter") $("#join").click();
    });
    $("#tables").addEventListener("click", (e) => {
      const b = e.target.closest("[data-join]");
      if (b) join(b.dataset.join);
    });
    $$("[data-deck]").forEach((el) => {
      el.onclick = () => go(`/builder/${el.dataset.deck}`);
    });
    $("#new-deck").onclick = () => go("/builder");
  };

  window.MTG_VIEWS = window.MTG_VIEWS || {};
  window.MTG_VIEWS.lobby = async function lobbyView() {
    return window.MTG.openTablesModal();
  };
  window.MTG_VIEWS.tables = window.MTG_VIEWS.lobby;
})();
