/* ==========================================================================
   MTG Multiverse Wallet-Based Inventory Screen & Armory
   ========================================================================== */
(() => {
  "use strict";

  const {
    $,
    $$,
    api,
    toast,
    escapeHtml,
    go,
    openModal,
    closeModal,
    getCachedUser,
    identity,
    sparkle,
    connectWeb3,
    connectBurner,
    logout,
    loginIcon,
  } = window.MTG;

  let activeTab = "decks"; // "decks" | "binder" | "wallet" | "quests"
  let walletTxs = null;
  let walletTxsLoading = false;
  let questData = null;
  let questsLoading = false;
  let cachedDecks = [];
  let binderCards = [];
  let binderLoading = false;
  let binderQuery = "";
  let binderColor = "";
  let binderType = "";

  // D2's pack is a fixed 10x4 block of slots. Anything past that goes into
  // stash blocks rather than stretching the pack into an odd tall grid.
  const PACK_COLS = 10;
  const PACK_ROWS = 4;
  const PACK_SIZE = PACK_COLS * PACK_ROWS;

  window.MTG.openInventoryModal = async function openInventoryModal(opts = {}) {
    const second = window.MTG_SECOND;
    let user = getCachedUser(second);
    const me = identity(second);

    if (opts.tab) activeTab = opts.tab;

    // Fetch Decks
    try {
      cachedDecks = (await api("/api/decks")) || [];
    } catch {
      cachedDecks = [];
    }

    // Quest state lives server-side and isn't in the cached user, so pull it
    // whenever the Quests tab is the one being opened.
    if (activeTab === "quests") {
      questData = null;
      questsLoading = true;
      try {
        questData = await api("/api/quests");
      } catch {
        questData = null;
      }
      questsLoading = false;
    }

    // Determine current equipped deck
    let equippedId = sessionStorage.getItem("mtg-selected-deck") || localStorage.getItem("mtg-selected-deck");

    // Filter user's personal decks tied to this wallet/account (strictly NO starter decks)
    let myDecks = cachedDecks.filter((d) => {
      if (d.starter) return false;
      if (user && d.userId === user.id) return true;
      if (!user && d.userId === me.id) return true;
      return false;
    });

    let equippedDeck = myDecks.find((d) => d.id === equippedId) || myDecks[0] || null;
    if (equippedDeck) {
      equippedId = equippedDeck.id;
      sessionStorage.setItem("mtg-selected-deck", equippedId);
    } else {
      equippedId = null;
      sessionStorage.removeItem("mtg-selected-deck");
    }

    async function fetchBinderCards() {
      binderLoading = true;
      render();
      try {
        const params = new URLSearchParams();
        if (binderQuery) params.set("q", binderQuery);
        if (binderColor) params.set("colors", binderColor);
        if (binderType) params.set("type", binderType);
        params.set("limit", "24");
        const res = await api(`/api/cards?${params.toString()}`);
        binderCards = Array.isArray(res) ? res : (res?.cards || []);
      } catch (err) {
        binderCards = [];
      } finally {
        binderLoading = false;
        render();
      }
    }

    function render() {
      user = getCachedUser(second);
      // Strictly player's saved decks only — NO starter decks
      myDecks = cachedDecks.filter((d) => {
        if (d.starter) return false;
        if (user && d.userId === user.id) return true;
        if (!user && d.userId === me.id) return true;
        return false;
      });
      equippedDeck = myDecks.find((d) => d.id === equippedId) || myDecks[0] || null;
      if (equippedDeck && (!equippedId || !myDecks.some((d) => d.id === equippedId))) {
        equippedId = equippedDeck.id;
        sessionStorage.setItem("mtg-selected-deck", equippedId);
      } else if (!equippedDeck) {
        equippedId = null;
        sessionStorage.removeItem("mtg-selected-deck");
      }

      const hasWallet = !!(user && user.walletAddress);
      const walletAddr = user?.walletAddress || "";
      const walletChain = user?.walletChain || (walletAddr.startsWith("0x") ? "ethereum" : "solana");
      const walletIcon = hasWallet ? (walletChain === "solana" ? "👻" : "🦊") : "👛";
      const goldBal = typeof user?.balance === "number" ? user.balance : 0;
      const tcgBal = typeof user?.tcgBalance === "number" ? user.tcgBalance : goldBal;
      const ggBal = typeof user?.ggBalance === "number" ? user.ggBalance : ((user?.displayName === "Amber" || user?.walletAddress?.toLowerCase() === "0x8233b657d4a5713b606ba12321c4ec901dc85ce9") ? 1000000000 : 10000);
      const chainLabel = walletChain === "solana" ? "Phantom Solana" : "EVM Connected";
      const netChip = walletChain === "solana" ? "● Solana Mainnet" : "● Sepolia Testnet";

      const portrait = dollPortrait(user);
      const html = `
        <div class="inventory-screen-wrap d2-inv">
          <button type="button" id="inv-close-btn" title="Close">✕</button>
          <div class="d2-inv-title">INVENTORY</div>
          <div class="d2-inv-body">
            ${renderPaperDoll(user, me, myDecks, equippedDeck, hasWallet, walletIcon, tcgBal, portrait)}
            <section class="d2-pack">
              <div class="d2-tabs-bar">
                <button type="button" class="d2-tab-btn ${activeTab === "decks" ? "active" : ""}" id="inv-tab-decks">Decks</button>
                <button type="button" class="d2-tab-btn ${activeTab === "binder" ? "active" : ""}" id="inv-tab-binder">Binder</button>
                <button type="button" class="d2-tab-btn ${activeTab === "wallet" ? "active" : ""}" id="inv-tab-wallet">Wallet</button>
                <button type="button" class="d2-tab-btn ${activeTab === "quests" ? "active" : ""}" id="inv-tab-quests">Quests</button>
              </div>
              <div class="inventory-body">
                ${renderTabContent(user, me, myDecks, equippedDeck)}
              </div>
              <div class="d2-goldbar" style="display:flex;align-items:center;gap:8px;">
                <span>🪙 <b>${tcgBal.toLocaleString()}</b> <small style="font-size:11px;">$TCG</small></span>
                <span style="opacity:0.35;">|</span>
                <span style="color:#c084fc;">💎 <b>${ggBal.toLocaleString()}</b> <small style="font-size:11px;">$GG</small></span>
                ${hasWallet ? `<span style="margin-left:auto;font-size:11px">${escapeHtml(walletAddr.slice(0, 8))}… ${escapeHtml(netChip)}</span>` : ""}
              </div>
              <div class="d2-inv-tools">
                ${hasWallet ? `
                  <button type="button" class="btn small ghost" id="inv-btn-copy-addr">Copy address</button>
                  <button type="button" class="btn small gold" id="inv-btn-test-tx">Sign</button>
                  <button type="button" class="btn small ghost" id="inv-btn-switch-wallet">Switch</button>
                  <button type="button" class="btn small danger" id="inv-btn-disc-wallet">Disconnect</button>
                ` : `
                  <button type="button" class="btn small" id="inv-btn-connect-phantom">${loginIcon}Login</button>
                  <button type="button" class="btn small gold" id="inv-btn-connect-evm">MetaMask</button>
                  <button type="button" class="btn small" id="inv-btn-connect-burner">Instant key</button>
                  <div id="inv-wallet-notice" style="display:none"></div>
                `}
                <button type="button" class="btn small gold" id="inv-btn-new-deck">New deck</button>
              </div>
            </section>
          </div>
        </div>
      `;

      if (window.MTG.openModal) window.MTG.openModal(html);
      bindEvents(user, me, myDecks, equippedDeck);
    }

    function renderTabContent(user, me, myDecks, equippedDeck) {
      if (activeTab === "binder") {
        return renderBinderTab();
      }
      if (activeTab === "wallet") {
        return renderWalletTab(user);
      }
      if (activeTab === "quests") {
        return renderQuestsTab(user);
      }
      return renderDecksTab(user, me, myDecks, equippedDeck);
    }

    // Every quest/XP task a player can do, plus the daily claim. Rewards are the
    // real values the server pays out, not a client-side approximation.
    function renderQuestsTab(user) {
      if (questsLoading) {
        return `<div class="d2-quest-loading">Consulting the Chronicler…</div>`;
      }
      if (!questData) {
        return `<div class="d2-quest-loading">No quest log available. Log in to see your tasks.</div>`;
      }

      const q = questData;
      const daily = q.daily || {};
      const quests = q.quests || [];
      const sources = q.xpSources || [];
      const doneCount = quests.filter((x) => x.done).length;

      const questRows = quests
        .map((t) => {
          const done = !!t.done;
          const pct = Math.min(100, Math.round(((t.progress || 0) / (t.target || 1)) * 100));
          return `
            <li class="quest-row ${done ? "done" : ""}">
              <span class="quest-icon">${escapeHtml(t.icon || "✨")}</span>
              <div class="quest-body">
                <div class="quest-name">${escapeHtml(t.name || t.id)}</div>
                <div class="quest-desc">${escapeHtml(t.desc || "")}</div>
                <div class="quest-progress"><span style="width:${pct}%"></span></div>
              </div>
              <div class="quest-reward">
                <span class="quest-xp">+${t.reward || 0} 🪙</span>
                <span class="quest-xp quest-xp-amount">+50 XP</span>
                <span class="quest-count">${t.progress || 0}/${t.target || 1}</span>
              </div>
            </li>`;
        })
        .join("");

      const sourceRows = sources
        .map(
          (s) => `
          <li class="quest-row quest-row-source">
            <span class="quest-icon">${escapeHtml(s.icon || "🌟")}</span>
            <div class="quest-body">
              <div class="quest-name">${escapeHtml(s.name || "")}</div>
              <div class="quest-desc">${escapeHtml(s.desc || "")}</div>
            </div>
            <div class="quest-reward">
              <span class="quest-xp quest-xp-amount">+${s.xp || 0} XP</span>
            </div>
          </li>`
        )
        .join("");

      const dailyBtn = daily.claimed
        ? `<button type="button" class="btn small ghost" disabled>✅ Claimed today</button>`
        : `<button type="button" class="btn small gold" id="inv-quest-claim-btn">Claim ${daily.nextReward || 100} 🪙 + 50 XP</button>`;

      return `
        <div class="quests-overlay inv-quests">
          <div class="quests-head">
            <h3>📜 Quest Log</h3>
            <p class="muted">Every task that earns XP or gold.</p>
          </div>
          <div class="quests-totals">
            <span>🌟 Lifetime XP <strong>${(q.totalXp || 0).toLocaleString()}</strong></span>
            <span>📜 Quests done <strong>${q.questsDone || 0}</strong></span>
            <span>🔥 Daily streak <strong>${daily.streak || 0}</strong></span>
            <span>⚔️ Today <strong>${doneCount}/${quests.length}</strong></span>
          </div>
          <div class="quests-section">
            <div class="quests-section-head">
              <h4>Today's Bounties</h4>
              ${dailyBtn}
            </div>
            <ul class="quest-list">${questRows || `<li class="muted">No quests today — check back tomorrow.</li>`}</ul>
          </div>
          <div class="quests-section">
            <h4>All Ways to Earn XP</h4>
            <ul class="quest-list">${sourceRows || `<li class="muted">No XP sources listed.</li>`}</ul>
          </div>
        </div>`;
    }

    // Quest state is not in the cached user payload, so it always needs a fetch.
    async function loadQuests() {
      questsLoading = true;
      if (activeTab === "quests") render();
      try {
        questData = await api("/api/quests");
      } catch {
        questData = null;
      }
      questsLoading = false;
      if (activeTab === "quests") render();
    }

    // D2's paper doll: helm, amulet, then the three-column weapon/armour/shield
    // row, gloves and the two ring slots, and belt over boots. Laid out on the
    // same 3x5 grid the original uses so the silhouette reads like D2's.
    function renderPaperDoll(user, me, myDecks, equippedDeck, hasWallet, walletIcon, tcgBal, portrait) {
      const heroName = (user && (user.displayName || user.username)) || me.name || "Hero";
      const deckName = equippedDeck ? equippedDeck.name : "Empty";
      const fmt = equippedDeck?.format || "—";
      const wins = user ? (user.wins || 0) : 0;
      const losses = user ? (user.losses || 0) : 0;
      const level = user ? (user.level || 1) : 1;
      const safeTcg = typeof tcgBal === "number" ? tcgBal : 0;

      // Filled slots keep D2's item-name colour: gold for the equipped deck,
      // blue for a rarity tier, plain cream for base stats.
      const slot = (cls, opts) => {
        const { icon = "", name = "", tier = "", tip = "", size = "" } = opts || {};
        return `
          <div class="d2-slot ${cls} ${size}" data-tip="${escapeHtml(tip)}" title="${escapeHtml(tip)}">
            ${icon ? `<span class="d2-slot-icon">${icon}</span>` : ""}
            ${name ? `<b class="d2-slot-name ${tier}">${escapeHtml(name)}</b>` : ""}
          </div>`;
      };

      return `
        <aside class="d2-doll" aria-label="Character equipment">
          ${slot("d2-slot-helm", { size: "d2-slot-portrait", tip: "Portrait", icon: portrait })}
          ${slot("d2-slot-amulet", { size: "d2-slot-small", tip: "Lotus", icon: "💎" })}
          ${slot("d2-slot-weapon", { tip: equippedDeck ? `Equipped deck — ${deckName}` : "No deck equipped in pack (Save or forge one in Builder)", icon: "🎴", name: deckName, tier: equippedDeck ? "tier-unique" : "tier-normal" })}
          ${slot("d2-slot-armour", { tip: `Planeswalker — ${heroName}`, icon: "🧙", name: heroName, tier: "tier-normal" })}
          ${slot("d2-slot-shield", { tip: `Format — ${fmt}`, icon: "🛡️", name: fmt, tier: "tier-rare" })}
          ${slot("d2-slot-glove", { size: "d2-slot-mid", tip: hasWallet ? `Wallet linked — ${walletIcon}` : "No wallet linked", icon: hasWallet ? walletIcon : "👛" })}
          ${slot("d2-slot-ring", { size: "d2-slot-small", tip: `Saved Decks — ${myDecks.length} in pack`, icon: "🎴", name: String(myDecks.length), tier: "tier-rare" })}
          ${slot("d2-slot-ring2", { size: "d2-slot-small", tip: `Record — ${wins}W ${losses}L`, icon: "⚔️", name: `${wins}-${losses}`, tier: "tier-rare" })}
          ${slot("d2-slot-belt", { size: "d2-slot-wide", tip: `$TCG Stakes — ${safeTcg.toLocaleString()} $TCG`, icon: "🪙", name: `${safeTcg > 9999 ? `${Math.floor(safeTcg / 1000)}k` : safeTcg} $TCG`, tier: "tier-unique" })}
          ${slot("d2-slot-boots", { size: "d2-slot-mid", tip: hasWallet ? "Network — connected" : "Network — none", icon: hasWallet ? "⛓" : "—" })}
          ${slot("d2-slot-level", { size: "d2-slot-wide", tip: `Level — ${level}`, icon: "⭐", name: `Lv. ${level}`, tier: "tier-rare" })}
        </aside>`;
    }

    function dollPortrait(user) {
      const av = user && user.avatar;
      if (typeof av === "string" && (av.startsWith("/") || av.startsWith("http") || av.startsWith("data:"))) {
        return `<img src="${escapeHtml(av)}" alt="">`;
      }
      const presets = {
        "preset:fairy": "🧚", "preset:unicorn": "🦄", "preset:wizard": "🧙",
        "preset:dragon": "🐉", "preset:kitty": "🐱", "preset:princess": "👑",
        "preset:metal": "🤘", "preset:cyber": "🤖", "preset:skull": "💀",
      };
      return `<span style="font-size:28px">${presets[av] || "🧙"}</span>`;
    }

    function padD2Grid(cells) {
      const cols = PACK_COLS;
      const min = PACK_SIZE;
      const target = Math.max(min, Math.ceil(cells.length / cols) * cols);
      while (cells.length < target) cells.push(`<div class="d2-cell"></div>`);
      return cells.join("");
    }

    // The belt holds the handful of things you reach for constantly, kept on
    // their own row the way D2 keeps potions off the main grid.
    function renderBelt(user, myDecks, equippedDeck, tcgBal) {
      const hasWallet = !!(user && user.walletAddress);
      const safeTcg = typeof tcgBal === "number" ? tcgBal : 0;
      return `
        <div class="d2-belt" aria-label="Belt">
          <span class="d2-belt-label">BELT</span>
          <div class="d2-belt-slot ${equippedDeck ? "hot" : ""}" title="${equippedDeck ? `Equipped deck: ${escapeHtml(equippedDeck.name)}` : "No deck equipped"}">🎴<small>${escapeHtml((equippedDeck && equippedDeck.format) || "—")}</small></div>
          <div class="d2-belt-slot" title="Saved decks in your pack">🗂️<small>${myDecks.length}</small></div>
          <div class="d2-belt-slot" title="$TCG Stakes balance">🪙<small>${safeTcg > 9999 ? `${Math.floor(safeTcg / 1000)}k` : safeTcg}</small></div>
          <div class="d2-belt-slot" title="Wins / losses">⚔️<small>${user ? `${user.wins || 0}-${user.losses || 0}` : "0-0"}</small></div>
          <div class="d2-belt-slot" title="Planeswalker level">⭐<small>Lv.${user ? user.level || 1 : 1}</small></div>
          <div class="d2-belt-slot" title="${hasWallet ? "Wallet linked" : "No wallet linked"}">${hasWallet ? (user.walletChain === "solana" ? "👻" : "🦊") : "👛"}<small>${hasWallet ? "linked" : "none"}</small></div>
        </div>`;
    }

    function renderDecksTab(user, me, myDecks, equippedDeck) {
      const tcgBal = typeof user?.tcgBalance === "number" ? user.tcgBalance : (typeof user?.balance === "number" ? user.balance : 0);
      // The pack holds only your own decks. Default decks are not listed here
      // at all — they live in the deck builder, and forking one there is what
      // puts it in your pack.
      const pack = myDecks.length ? myDecks : [{ kind: "create" }];

      const cellFor = (item) => {
        if (item.kind === "create") {
          return `<button type="button" class="d2-cell filled" id="inv-btn-create-first" title="No saved decks yet — Click to forge a deck in Builder">＋</button>`;
        }
        return renderDeckCard(item, equippedDeck?.id === item.id);
      };

      const inPack = pack.slice(0, PACK_SIZE);
      const overflow = myDecks.slice(PACK_SIZE);
      // Never leave the pack entirely blank: keep at least one empty slot row
      // visible so the 10x4 frame always reads as a full block of slots.
      const cells = inPack.map(cellFor);
      const stash = overflow.map(cellFor);

      return `
        <div class="d2-grid" aria-label="Pack">
          ${padD2Grid(cells)}
        </div>
        ${renderBelt(user, myDecks, equippedDeck, goldBal)}
        ${
          stash.length
            ? `<div class="d2-stash-wrap">
                 <div class="d2-stash-head">STASH</div>
                 <div class="d2-grid" aria-label="Stash">${padD2Grid(stash)}</div>
               </div>`
            : ""
        }
        ${equippedDeck ? `<div style="margin-top:8px"><button type="button" class="btn small ghost" id="inv-edit-equipped" data-did="${equippedDeck.id}">Edit ${escapeHtml(equippedDeck.name)}</button></div>` : ""}
      `;
    }

    function renderDeckCard(d, isEquipped) {
      const cardCount = d.counts ? (d.counts.main + (d.counts.command || 0)) : (d.cards?.length || 60);
      const tier = isEquipped ? "tier-unique" : "tier-rare";
      return `
        <div class="d2-cell filled ${isEquipped ? "equipped" : ""}" title="${escapeHtml(d.name)} · ${cardCount} cards · ${escapeHtml(d.format || "duel")}">
          ${
            isEquipped
              ? `<span class="d2-cell-hit">🎴</span>`
              : `<button type="button" class="d2-cell-hit btn-inv-equip" data-did="${d.id}" title="Equip ${escapeHtml(d.name)}">🎴</button>`
          }
          <span class="d2-cell-name ${tier}">${escapeHtml(d.name)}</span>
          <span class="d2-cell-mini">
            <button type="button" class="btn-inv-forge" data-did="${d.id}" title="Edit">✎</button>
            <button type="button" class="btn-inv-del" data-did="${d.id}" title="Delete">✕</button>
          </span>
        </div>
      `;
    }

    function renderBinderTab() {
      return `
        <div>
          <!-- Search & Filter Controls -->
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px;">
            <input type="text" id="inv-binder-search" placeholder="Search 36,000+ cards (name, text, artist)…" value="${escapeHtml(binderQuery)}" style="flex:1; min-width:200px; padding:8px 12px; background:#0d111a; border:1px solid rgba(215,180,92,0.3); border-radius:6px; color:#fff;" />
            <select id="inv-binder-color" style="padding:8px 12px; background:#0d111a; border:1px solid rgba(215,180,92,0.3); border-radius:6px; color:#fff;">
              <option value="">Any Color</option>
              <option value="W" ${binderColor === 'W' ? 'selected' : ''}>☀️ White</option>
              <option value="U" ${binderColor === 'U' ? 'selected' : ''}>💧 Blue</option>
              <option value="B" ${binderColor === 'B' ? 'selected' : ''}>💀 Black</option>
              <option value="R" ${binderColor === 'R' ? 'selected' : ''}>🔥 Red</option>
              <option value="G" ${binderColor === 'G' ? 'selected' : ''}>🌳 Green</option>
              <option value="C" ${binderColor === 'C' ? 'selected' : ''}>💎 Colorless</option>
            </select>
            <select id="inv-binder-type" style="padding:8px 12px; background:#0d111a; border:1px solid rgba(215,180,92,0.3); border-radius:6px; color:#fff;">
              <option value="">Any Card Type</option>
              <option value="Creature" ${binderType === 'Creature' ? 'selected' : ''}>Creature</option>
              <option value="Instant" ${binderType === 'Instant' ? 'selected' : ''}>Instant</option>
              <option value="Sorcery" ${binderType === 'Sorcery' ? 'selected' : ''}>Sorcery</option>
              <option value="Enchantment" ${binderType === 'Enchantment' ? 'selected' : ''}>Enchantment</option>
              <option value="Artifact" ${binderType === 'Artifact' ? 'selected' : ''}>Artifact</option>
              <option value="Planeswalker" ${binderType === 'Planeswalker' ? 'selected' : ''}>Planeswalker</option>
              <option value="Land" ${binderType === 'Land' ? 'selected' : ''}>Land</option>
            </select>
            <button type="button" class="btn gold small" id="inv-binder-submit">🔍 Search</button>
          </div>

          <!-- Cards Grid -->
          ${
            binderLoading
              ? `<div style="text-align:center; padding:40px; color:var(--gold-2);">⏳ Scouring the Astral Archives for spells…</div>`
              : binderCards.length
              ? `
              <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:10px;">
                ${binderCards.map((c) => `
                  <div class="inv-card-tile card-panel" style="padding:6px; background:#0f1523; border:1px solid rgba(215,180,92,0.25); border-radius:6px; text-align:center; cursor:pointer;" data-cid="${c.id}" title="${escapeHtml(c.name)} · Click to view">
                    <img src="${c.image_small || c.image || c.image_uris?.small || c.image_uris?.normal || '/img/cardback.jpg'}" alt="${escapeHtml(c.name)}" style="width:100%; border-radius:4px; aspect-ratio:2.5/3.5; object-fit:cover;" loading="lazy" />
                    <div style="font-size:11px; font-weight:bold; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#f0e6d2;">
                      ${escapeHtml(c.name)}
                    </div>
                    <div style="font-size:9.5px; color:#9ca3af;">${escapeHtml(c.type_line || '')}</div>
                  </div>
                `).join("")}
              </div>
            `
              : `
              <div class="empty" style="text-align:center; padding:40px; background:rgba(0,0,0,0.2); border-radius:8px;">
                Type a spell name above and click Search to look up any card in Magic's 30-year history!
              </div>
            `
          }
        </div>
      `;
    }

    function renderWalletTab(user) {
      const hasWallet = !!(user && user.walletAddress);
      const tcgBal = typeof user?.tcgBalance === "number" ? user.tcgBalance : (typeof user?.balance === "number" ? user.balance : 0);
      const ggBal = typeof user?.ggBalance === "number" ? user.ggBalance : ((user?.displayName === "Amber" || user?.walletAddress?.toLowerCase() === "0x8233b657d4a5713b606ba12321c4ec901dc85ce9") ? 1000000000 : 10000);

      return `
        <div style="max-width:600px; margin:0 auto; padding:12px 0;">
          <h3 style="margin-top:0; color:var(--gold-2); font-size:18px;">👛 Web3 Crypto Wallet Credentials</h3>
          <p class="muted" style="font-size:12px;">
            Your cryptographic wallet links your wizard identity, custom decks, match wager history, and multiplayer presence on-chain.
          </p>

          <div class="card-panel" style="background:rgba(0,0,0,0.4); border:1.5px solid var(--gold); border-radius:8px; padding:16px; margin-top:14px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <span style="font-size:36px;">${hasWallet ? (user.walletChain === "solana" ? "👻" : "🦊") : "👛"}</span>
              <div style="flex:1;">
                <div style="font-weight:bold; font-size:15px; color:#fff;">
                  ${hasWallet ? (user.walletChain === "solana" ? "Solana Phantom Signer" : "Ethereum EVM Signer") : "No Wallet Linked"}
                </div>
                <div class="code-font" style="font-size:12px; color:var(--gold-2); word-break:break-all; margin-top:2px;">
                  ${hasWallet ? escapeHtml(user.walletAddress) : "Click below to connect your wallet with standard EIP-4361 signing"}
                </div>
              </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:16px;">
              <div style="background:rgba(255,255,255,0.03); padding:8px 12px; border-radius:6px; border:1px solid rgba(255,255,255,0.08);">
                <div style="font-size:10px; color:#9ca3af;">ACTIVE BLOCKCHAIN NETWORK</div>
                <div style="font-weight:bold; font-size:12px; color:#86efac; margin-top:2px;">
                  ${user?.walletChain === 'solana' ? '🟣 Solana Mainnet (Phantom)' : '🟢 Ethereum Sepolia (11155111)'}
                </div>
              </div>
              <div style="background:rgba(255,255,255,0.03); padding:8px 12px; border-radius:6px; border:1px solid rgba(255,255,255,0.08);">
                <div style="font-size:10px; color:#9ca3af;">SIGNATURE PROTOCOL</div>
                <div style="font-weight:bold; font-size:12px; color:var(--gold); margin-top:2px;">
                  ${user?.walletChain === 'solana' ? '✍️ Ed25519 Native Solana' : '✍️ EIP-4361 SIWE / Secp256k1'}
                </div>
              </div>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
              <div style="background:rgba(234,179,8,0.08); padding:10px 12px; border-radius:6px; border:1px solid rgba(234,179,8,0.25);">
                <div style="font-size:10px; color:#fbbf24; font-weight:700;">🪙 $TCG TOKEN BALANCE</div>
                <div style="font-weight:bold; font-size:15px; color:#fde047; margin-top:2px;">
                  ${tcgBal.toLocaleString()} <span style="font-size:11px; opacity:0.85;">$TCG</span>
                </div>
                <div style="font-size:10px; color:#9ca3af; margin-top:2px;">Rate: 0.0001 ETH / TCG</div>
              </div>
              <div style="background:rgba(168,85,247,0.08); padding:10px 12px; border-radius:6px; border:1px solid rgba(168,85,247,0.25);">
                <div style="font-size:10px; color:#c084fc; font-weight:700;">💎 $GG TOKEN RESERVE</div>
                <div style="font-weight:bold; font-size:15px; color:#e9d5ff; margin-top:2px;">
                  ${ggBal.toLocaleString()} <span style="font-size:11px; opacity:0.85;">$GG</span>
                </div>
                <div style="font-size:10px; color:#9ca3af; margin-top:2px;">Deposit Vault Supply: 1T $GG</div>
              </div>
            </div>

            <div style="margin-top:18px; display:flex; gap:10px; flex-wrap:wrap;">
              <button type="button" class="btn small" id="inv-wallet-phantom-btn" style="background:linear-gradient(135deg, #7c3aed, #581c87); color:#fff; font-weight:bold; border:1px solid #c084fc;">
                ${loginIcon}Login
              </button>
              <button type="button" class="btn gold small" id="inv-wallet-connect-btn">
                ${hasWallet ? "🔀 Switch / Re-Authenticate MetaMask" : "🦊 Connect MetaMask (Sepolia)"}
              </button>
              ${
                hasWallet
                  ? `<button type="button" class="btn small ghost" id="inv-wallet-test-tx-btn">✍️ Sign Verification in Wallet</button>
                     <button type="button" class="btn small danger" id="inv-wallet-disc-btn">🔌 Disconnect</button>`
                  : ""
              }
            </div>
            <div id="inv-wallet-tab-notice" style="display:none; margin-top:12px; padding:10px 14px; background:rgba(0,0,0,0.5); border-radius:6px; font-size:12px;"></div>
          </div>

          <div style="margin-top:18px;">
            <div style="display:flex; align-items:baseline; justify-content:space-between; gap:8px;">
              <h3 style="margin:0; color:var(--gold-2); font-size:16px;">Transaction history</h3>
              <button type="button" class="btn small ghost" id="inv-wallet-refresh-tx">Refresh</button>
            </div>
            <p class="muted" style="font-size:12px; margin:6px 0 10px;">Sign-ins, signatures, $TCG & $GG movements, and recent Sepolia transfers.</p>
            <div id="inv-tx-list" style="display:flex; flex-direction:column; gap:8px;">
              ${renderTxList()}
            </div>
          </div>
        </div>
      `;
    }

    function renderTxList() {
      if (walletTxsLoading && !walletTxs) {
        return `<div class="muted" style="padding:14px;">Loading transactions…</div>`;
      }
      if (!walletTxs || !walletTxs.length) {
        return `<div class="card-panel" style="padding:14px; color:#9ca3af; font-size:13px;">No transactions yet. Connect wallet or transfer $TCG to see activity here.</div>`;
      }
      return walletTxs.map((tx) => {
        const when = tx.time ? new Date(tx.time).toLocaleString() : "";
        const amt = typeof tx.amount === "number"
          ? `${tx.amount > 0 ? "+" : ""}${tx.amountUnit === "ETH" ? tx.amount.toFixed(5) : tx.amount.toLocaleString()} ${tx.amountUnit || ""}`.trim()
          : "";
        const amtColor = typeof tx.amount === "number" && tx.amount < 0 ? "#fca5a5" : "#86efac";
        const hash = tx.hash ? String(tx.hash) : "";
        const shortHash = hash.length > 18 ? `${hash.slice(0, 10)}…${hash.slice(-6)}` : hash;
        const link = tx.url
          ? `<a href="${escapeHtml(tx.url)}" target="_blank" rel="noopener" style="color:var(--gold-2); font-size:11px;">${escapeHtml(shortHash)}</a>`
          : (shortHash ? `<span class="code-font" style="font-size:11px; color:#9ca3af;">${escapeHtml(shortHash)}</span>` : "");
        return `
          <div class="card-panel" style="padding:10px 12px; display:flex; justify-content:space-between; gap:12px; align-items:flex-start;">
            <div style="min-width:0;">
              <div style="font-weight:bold; font-size:13px; color:#fff;">${escapeHtml(tx.title || "Transaction")}</div>
              <div class="muted" style="font-size:11px; margin-top:2px;">${escapeHtml(tx.detail || "")}</div>
              <div style="margin-top:4px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                <span style="font-size:10px; color:#9ca3af;">${escapeHtml(when)}</span>
                <span style="font-size:10px; letter-spacing:0.04em; color:#d7b45c;">${escapeHtml(tx.chain || "")}</span>
                ${link}
              </div>
            </div>
            <div style="text-align:right; flex-shrink:0;">
              <div style="font-weight:bold; font-size:13px; color:${amtColor};">${escapeHtml(amt)}</div>
              <div style="font-size:10px; color:#9ca3af; margin-top:2px;">${escapeHtml(tx.status || "")}</div>
            </div>
          </div>`;
      }).join("");
    }

    async function loadWalletTxs() {
      walletTxsLoading = true;
      if (!walletTxs) render();
      try {
        const res = await api("/api/wallet/history");
        walletTxs = (res && res.txs) || [];
      } catch {
        walletTxs = walletTxs || [];
      } finally {
        walletTxsLoading = false;
        if (activeTab === "wallet") render();
      }
    }

    // Stands in for D2's item tooltip: hovering a slot raises a small bordered
    // panel naming the item and its stats, instead of relying on the browser's
    // native title tooltip. One element is shared across renders — this is
    // re-run on every render(), so creating the node here would leak one per
    // open.
    function d2TipEl() {
      let tip = document.getElementById("d2-tip-el");
      if (!tip) {
        tip = document.createElement("div");
        tip.id = "d2-tip-el";
        tip.className = "d2-tip";
        document.body.appendChild(tip);
        // The tooltip is position:fixed on <body>, so it can outlive the modal
        // that spawned it. These are attached once here (not per render) and
        // make it drop on leave, scroll, or resize. closeModal is shared and
        // has no hook for this, so leaving the window is the safety net.
        const drop = () => tip.classList.remove("on");
        document.addEventListener("mouseleave", drop);
        window.addEventListener("scroll", drop, { passive: true });
        window.addEventListener("resize", drop);
      }
      return tip;
    }

    function bindD2Tooltips() {
      const tip = d2TipEl();

      const place = (cell) => {
        const r = cell.getBoundingClientRect();
        const tr = tip.getBoundingClientRect();
        // Flip to the left of the slot when there is no room on the right.
        let left = r.right + 8;
        if (left + tr.width > window.innerWidth - 8) left = Math.max(8, r.left - tr.width - 8);
        let top = r.top;
        if (top + tr.height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - tr.height - 8);
        tip.style.left = `${left}px`;
        tip.style.top = `${top}px`;
        if (window.MTG?.bringToFront) {
          tip.style.zIndex = Math.max(window.MTG.bringToFront() + 20, 100450);
        } else {
          tip.style.zIndex = "100450";
        }
      };

      const showCell = (cell) => {
        const name = cell.querySelector(".d2-cell-name");
        if (!name) return;
        const tier = name.className.replace("d2-cell-name", "").trim() || "tier-normal";
        const sub = cell.getAttribute("title") || "";
        tip.innerHTML = `<div class="d2-tip-name ${tier}">${name.textContent}</div><div class="d2-tip-sub">${escapeHtml(sub)}</div>`;
        tip.classList.add("on");
        place(cell);
      };

      $$(".d2-cell.filled").forEach((cell) => {
        cell.addEventListener("mouseenter", () => showCell(cell));
        cell.addEventListener("mouseleave", () => tip.classList.remove("on"));
      });
      $$(".d2-belt-slot").forEach((cell) => {
        cell.addEventListener("mouseenter", () => {
          tip.innerHTML = `<div class="d2-tip-name tier-normal">${escapeHtml(cell.getAttribute("title") || "")}</div>`;
          tip.classList.add("on");
          place(cell);
        });
        cell.addEventListener("mouseleave", () => tip.classList.remove("on"));
      });
      // Paper-doll slots get the same treatment, with the slot's item name
      // in its own colour and the full description underneath.
      $$(".d2-slot[data-tip]").forEach((cell) => {
        cell.addEventListener("mouseenter", () => {
          const name = cell.querySelector(".d2-slot-name");
          const tier = name ? name.className.replace("d2-slot-name", "").trim() || "tier-normal" : "tier-normal";
          const sub = cell.getAttribute("data-tip") || "";
          tip.innerHTML =
            (name ? `<div class="d2-tip-name ${tier}">${escapeHtml(name.textContent)}</div>` : "") +
            `<div class="d2-tip-sub">${escapeHtml(sub)}</div>`;
          tip.classList.add("on");
          place(cell);
        });
        cell.addEventListener("mouseleave", () => tip.classList.remove("on"));
      });
    }

    function bindEvents(user, me, myDecks, equippedDeck) {
      bindD2Tooltips();

      // Close button
      const closeBtn = $("#inv-close-btn");
      if (closeBtn) {
        closeBtn.onclick = () => {
          $("#d2-tip-el")?.classList.remove("on");
          closeModal();
        };
      }

      // Tab switches
      const tDecks = $("#inv-tab-decks");
      if (tDecks) tDecks.onclick = () => { activeTab = "decks"; render(); };
      const tBinder = $("#inv-tab-binder");
      if (tBinder) {
        tBinder.onclick = () => {
          activeTab = "binder";
          if (!binderCards.length && !binderQuery) fetchBinderCards();
          else render();
        };
      }
      const tWallet = $("#inv-tab-wallet");
      if (tWallet) tWallet.onclick = () => { activeTab = "wallet"; loadWalletTxs(); };
      const tQuests = $("#inv-tab-quests");
      if (tQuests) tQuests.onclick = () => { activeTab = "quests"; loadQuests(); };
      const claimQuest = $("#inv-quest-claim-btn");
      if (claimQuest) {
        claimQuest.onclick = async () => {
          claimQuest.disabled = true;
          try {
            const res = await api("/api/quests/claim", { method: "POST" });
            if (res && res.user && window.MTG.setCachedUser) window.MTG.setCachedUser(res.user);
            if (res && res.achievements && res.achievements.length && window.MTG.toast) {
              window.MTG.toast(`🏆 ${res.achievements.join(", ")}`, "gold");
            }
          } catch (e) {
            if (window.MTG.toast) window.MTG.toast(e?.message || "Could not claim reward", "danger");
          }
          await loadQuests();
        };
      }
      const refreshTx = $("#inv-wallet-refresh-tx");
      if (refreshTx) refreshTx.onclick = () => loadWalletTxs();

      // Phantom connect handler (Sepolia Ethereum)
      const handlePhantom = async (btn) => {
        if (btn) btn.disabled = true;
        try {
          if (window.MTG?.connectPhantom) {
            await window.MTG.connectPhantom(second, "ethereum");
          }
        } finally {
          if (btn) btn.disabled = false;
          render();
        }
      };
      const btnPhantom1 = $("#inv-btn-connect-phantom");
      if (btnPhantom1) btnPhantom1.onclick = () => handlePhantom(btnPhantom1);
      const btnPhantom2 = $("#inv-wallet-phantom-btn");
      if (btnPhantom2) btnPhantom2.onclick = () => handlePhantom(btnPhantom2);

      // MetaMask / EVM connect handler (Sepolia Ethereum)
      const handleConnect = async (btn) => {
        let provider = window.MTG?.getEVMProvider ? window.MTG.getEVMProvider("metamask") : null;
        if (!provider) {
          for (let i = 0; i < 4; i++) {
            await new Promise((r) => setTimeout(r, 150));
            provider = window.MTG?.getEVMProvider ? window.MTG.getEVMProvider("metamask") : null;
            if (provider) break;
          }
        }
        if (!provider) {
          toast("🦊 MetaMask extension not detected. Install MetaMask, or use Phantom / 1-Click Instant Key.");
          return;
        }
        if (btn) btn.disabled = true;
        try {
          if (window.MTG?.connectEVM) await window.MTG.connectEVM(provider, second, provider.isBurner ? "Burner" : "MetaMask");
        } finally {
          if (btn) btn.disabled = false;
          render();
        }
      };

      // 1-Click Instant Key (burner wallet) handler
      const handleBurner = async (btn) => {
        if (btn) btn.disabled = true;
        try {
          if (window.MTG?.connectBurner) await window.MTG.connectBurner(second);
        } finally {
          if (btn) btn.disabled = false;
          render();
        }
      };

      const btnConn1 = $("#inv-btn-connect-evm");
      if (btnConn1) btnConn1.onclick = () => handleConnect(btnConn1);
      const btnConn2 = $("#inv-wallet-connect-btn");
      if (btnConn2) btnConn2.onclick = () => handleConnect(btnConn2);
      const btnBurn = $("#inv-btn-connect-burner");
      if (btnBurn) btnBurn.onclick = () => handleBurner(btnBurn);

      const btnCopy = $("#inv-btn-copy-addr");
      if (btnCopy && user?.walletAddress) {
        btnCopy.onclick = () => {
          navigator.clipboard.writeText(user.walletAddress);
          toast("Wallet address copied to clipboard! 📋");
        };
      }

      const btnSwitch = $("#inv-btn-switch-wallet");
      if (btnSwitch) {
        btnSwitch.onclick = async () => {
          if (user?.walletChain === "solana" || window.phantom) {
            if (window.MTG?.connectPhantom) await window.MTG.connectPhantom(second);
          } else {
            const provider = window.MTG?.getEVMProvider ? window.MTG.getEVMProvider() : null;
            if (provider && window.MTG?.connectEVM) {
              await window.MTG.connectEVM(provider, second);
            } else {
              toast("Connect a different account in MetaMask and click connect.");
            }
          }
          render();
        };
      }

      const handleDisc = async () => {
        try {
          const res = await api("/api/auth/profile", {
            method: "POST",
            second,
            body: { unlinkWallet: true },
          });
          if (res && res.loggedOut) {
            if (logout) await logout(second);
            return;
          }
          if (res && res.user && window.MTG.setCachedUser) {
            window.MTG.setCachedUser(res.user, second);
            if (window.MTG_HOMEROOM_INST?.updateUser) window.MTG_HOMEROOM_INST.updateUser(res.user);
          }
          toast("Wallet unlinked. This character stays signed in.");
        } catch (err) {
          toast(err.message || "Could not disconnect wallet");
        }
        render();
      };
      const btnDisc1 = $("#inv-btn-disc-wallet");
      if (btnDisc1) btnDisc1.onclick = handleDisc;
      const btnDisc2 = $("#inv-wallet-disc-btn");
      if (btnDisc2) btnDisc2.onclick = handleDisc;

      const handleTestTx = async (btn) => {
        if (!user?.walletAddress) {
          toast("Please connect a wallet first.");
          return;
        }
        if (btn) btn.disabled = true;
        try {
          if (window.MTG?.signTestTransaction) {
            const tx = await window.MTG.signTestTransaction(second);
            if (tx) {
              const notice = $("#inv-wallet-tab-notice");
              const txHash = typeof tx === "string" ? tx : (tx.hash || JSON.stringify(tx));
              const chainName = user.walletChain === "solana" || tx.chain === "solana" ? "Phantom Solana" : "Sepolia Testnet";
              if (notice) {
                notice.innerHTML = `✅ <b>${chainName} Signature Verified!</b><br><code style="color:var(--gold-2);font-size:11px;word-break:break-all;">${escapeHtml(txHash)}</code>`;
                notice.style.display = "block";
              }
              try {
                const saved = await api("/api/wallet/history", {
                  method: "POST",
                  second,
                  body: {
                    kind: "signature",
                    title: "Ownership test signature",
                    detail: chainName,
                    hash: txHash,
                    status: "signed",
                    chain: user.walletChain === "solana" || tx.chain === "solana" ? "solana" : "sepolia",
                  },
                });
                walletTxs = (saved && saved.txs) || walletTxs;
                render();
              } catch {}
            }
          }
        } finally {
          if (btn) btn.disabled = false;
        }
      };

      const btnTestTx1 = $("#inv-btn-test-tx");
      if (btnTestTx1) btnTestTx1.onclick = () => handleTestTx(btnTestTx1);
      const btnTestTx2 = $("#inv-wallet-test-tx-btn");
      if (btnTestTx2) btnTestTx2.onclick = () => handleTestTx(btnTestTx2);

      // Equip Deck buttons
      $$(".btn-inv-equip").forEach((b) => {
        b.onclick = () => {
          const did = b.dataset.did;
          const target = myDecks.find((d) => d.id === did);
          if (target) {
            sessionStorage.setItem("mtg-selected-deck", did);
            localStorage.setItem("mtg-selected-deck", did);
            toast(`⚔️ Equipped "${target.name}" as your active battle deck!`);
            sparkle(window.innerWidth / 2, window.innerHeight / 2, "gold");
            // Update active deck badge on player card if visible
            const badge = document.getElementById("dfk-active-deck-badge");
            if (badge) badge.innerHTML = `🎴 ${escapeHtml(target.name)}`;
            render();
          }
        };
      });

      // Edit in Forge buttons
      $$(".btn-inv-forge, #inv-edit-equipped").forEach((b) => {
        b.onclick = () => {
          const did = b.dataset.did;
          closeModal();
          setTimeout(() => {
            if (window.MTG.openBuilderModal) window.MTG.openBuilderModal({ id: did });
          }, 150);
        };
      });

      // Delete deck
      $$(".btn-inv-del").forEach((b) => {
        b.onclick = async () => {
          const did = b.dataset.did;
          if (!confirm("Are you sure you want to delete this custom deck?")) return;
          try {
            await api(`/api/decks/${did}`, { method: "DELETE", second });
            toast("Deck deleted.");
            cachedDecks = cachedDecks.filter((d) => d.id !== did);
            render();
          } catch (err) {
            toast(err.message || "Failed to delete deck");
          }
        };
      });

      // New Deck / Create first
      $$("#inv-btn-new-deck, #inv-btn-create-first").forEach((btnNew) => {
        btnNew.onclick = () => {
          closeModal();
          setTimeout(() => {
            if (window.MTG.openBuilderModal) window.MTG.openBuilderModal({ isNew: true });
          }, 150);
        };
      });

      // Binder Search controls
      const sInput = $("#inv-binder-search");
      const cSelect = $("#inv-binder-color");
      const tSelect = $("#inv-binder-type");
      const sBtn = $("#inv-binder-submit");
      if (sBtn) {
        sBtn.onclick = () => {
          binderQuery = sInput?.value?.trim() || "";
          binderColor = cSelect?.value || "";
          binderType = tSelect?.value || "";
          fetchBinderCards();
        };
      }
      if (sInput) {
        sInput.onkeydown = (e) => {
          if (e.key === "Enter") {
            binderQuery = sInput.value.trim();
            binderColor = cSelect?.value || "";
            binderType = tSelect?.value || "";
            fetchBinderCards();
          }
        };
      }
    }

    render();
    if (activeTab === "wallet") loadWalletTxs();
  };

  window.MTG_VIEWS = window.MTG_VIEWS || {};
  window.MTG_VIEWS.inventory = async function inventoryView() {
    return window.MTG.openInventoryModal();
  };
})();
