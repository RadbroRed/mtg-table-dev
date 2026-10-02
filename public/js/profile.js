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
    loginWithWallet,
    logout,
    openAuthModal,
    openFriendsModal,
    loginIcon,
    SKINS,
    getSkin,
    setSkin,
    applySkin,
    sparkle: spawnSparkles,
  } = window.MTG;

  const AVATAR_PRESETS = [
    { id: "preset:fairy", icon: "🧚", name: "Forest Fairy", desc: "Sylvan spirit of nature" },
    { id: "preset:unicorn", icon: "🦄", name: "Starlight Unicorn", desc: "Celestial beast of purity" },
    { id: "preset:wizard", icon: "🧙", name: "Grand Archmage", desc: "Master of arcane sorcery" },
    { id: "preset:dragon", icon: "🐉", name: "Elder Dragon", desc: "Ancient draconic tyrant" },
    { id: "preset:kitty", icon: "🐱", name: "Kawaii Familiar", desc: "Cute and playful companion" },
    { id: "preset:princess", icon: "👑", name: "Royal Princess", desc: "Sovereign of the realm" },
    { id: "preset:metal", icon: "🤘", name: "Metalhead", desc: "Headbanging pyromancer" },
    { id: "preset:cyber", icon: "🤖", name: "Cypherpunk", desc: "Net-art hacker wizard" },
    { id: "preset:skull", icon: "💀", name: "Dread Lich", desc: "Necromantic death lord" },
  ];

  window.MTG_VIEWS.profile = async function profile(params = {}) {
    const second = window.MTG_SECOND;
    const me = identity(second);
    let user = getCachedUser(second);

    if (fetchMe && !user && window.MTG.getToken && window.MTG.getToken(second)) {
      try {
        const fresh = await fetchMe(second);
        if (fresh) user = fresh;
      } catch {}
    }

    const authed = !!(user && user.username);
    const app = document.getElementById("app");
    app.innerHTML = `
      <div class="dfk-world-viewport" id="profile-root">
        <div class="dfk-world-container" id="homeroom-mount"></div>

        <!-- Slide-out Character Sheet Drawer (Opened via Player Card or [C] or Mirror) -->
        <div class="dfk-sheet-drawer" id="dfk-sheet-drawer" ${params.tab || !authed ? "" : "hidden"}>
          <div class="dfk-sheet-backdrop" id="dfk-sheet-backdrop"></div>
          <div class="dfk-sheet-panel">
            <div class="dfk-sheet-header">
              <div style="display:flex;align-items:center;gap:10px">
                <span style="font-size:24px">📜</span>
                <div>
                  <h2 style="margin:0;font-size:16px;color:var(--gold-2)">Planeswalker Character Profile</h2>
                  <div style="font-size:11px;color:var(--muted)">Avatars · Multiverse Skins · Saved Decks · Web3 Wallet</div>
                </div>
              </div>
              <button type="button" class="btn small ghost dfk-sheet-close" id="dfk-sheet-close-btn">✕ Close</button>
            </div>
            <div class="dfk-sheet-content" id="classic-profile-sheet">Loading Character Profile…</div>
          </div>
        </div>
      </div>
    `;

    // Drawer toggling
    const closeDrawer = () => {
      const drawer = document.getElementById("dfk-sheet-drawer");
      if (drawer) drawer.hidden = true;
    };
    const openDrawer = () => {
      const drawer = document.getElementById("dfk-sheet-drawer");
      if (drawer) {
        if (window.MTG?.bringToFront) window.MTG.bringToFront(drawer);
        drawer.hidden = false;
      }
    };
    const initDrawer = document.getElementById("dfk-sheet-drawer");
    if (initDrawer && !initDrawer.hidden && window.MTG?.bringToFront) {
      window.MTG.bringToFront(initDrawer);
    }
    const closeBtn = document.getElementById("dfk-sheet-close-btn");
    if (closeBtn) closeBtn.onclick = closeDrawer;
    const backdrop = document.getElementById("dfk-sheet-backdrop");
    if (backdrop) backdrop.onclick = closeDrawer;
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDrawer();
    });

    // Data fetching
    const [info, allDecks, openTables, lbData] = await Promise.all([
      getInfo().catch(() => ({ url: location.origin })),
      api("/api/decks").catch(() => []),
      api("/api/tables").catch(() => []),
      api("/api/leaderboard").catch(() => []),
    ]);

    // Active sub-tab state
    let activeTab = params.tab || (user ? "profile" : "login");
    let selectedPreset = user && user.avatar && user.avatar.startsWith("preset:") ? user.avatar : "preset:wizard";

    // Initialize RPGJS Homeroom Engine (DeFi Kingdoms Fullscreen)
    let homeroomInst = null;
    if (window.MTG_HOMEROOM_INST) {
      try { window.MTG_HOMEROOM_INST.destroy(); } catch {}
      window.MTG_HOMEROOM_INST = null;
    }
    const mountEl = document.getElementById("homeroom-mount");
    if (mountEl && window.MTG_RPG && window.MTG_RPG.initHomeroom) {
      try {
        homeroomInst = window.MTG_RPG.initHomeroom(mountEl, {
          user,
          me,
          onNavigate: (r) => go(r),
          onOpenSheet: openDrawer,
        });
        window.MTG_HOMEROOM_INST = homeroomInst;
      } catch (err) {
        console.error("Failed to initialize Homeroom canvas:", err);
      }
    }

    async function draw() {
      user = getCachedUser(second);
      if (homeroomInst && homeroomInst.updateUser) {
        homeroomInst.updateUser(user);
      }
      const isRegistered = !!(user && user.username);
      const curSkinId = getSkin ? getSkin(second) : "arcane";
      const balance = user && typeof user.balance === "number" ? user.balance : 0;
      const tcgBal = user && typeof user.tcgBalance === "number" ? user.tcgBalance : balance;
      const ggBal = user && typeof user.ggBalance === "number" ? user.ggBalance : ((user?.displayName === "Amber" || user?.walletAddress?.toLowerCase() === "0x8233b657d4a5713b606ba12321c4ec901dc85ce9") ? 1000000000 : 10000);
      const level = user && typeof user.level === "number" ? user.level : 1;
      const xp = user && typeof user.xp === "number" ? user.xp : 0;
      const xpNeeded = user && typeof user.xpNeeded === "number" ? user.xpNeeded : (level * 100);
      const xpPercent = Math.min(100, Math.max(0, Math.round((xp / xpNeeded) * 100)));

      // Filter decks for this user or local identity: player saved decks appear FIRST
      const myDecks = (allDecks || []).filter((d) => {
        if (user && d.userId === user.id) return true;
        if (!user && (d.userId === me.id || (!d.userId && !d.starter))) return true;
        return false;
      });
      // Default decks are not listed here — they live in the deck builder,
      // where forking one is what adds it to your own collection.
      const otherDecks = (allDecks || []).filter((d) => !myDecks.some((m) => m.id === d.id) && !d.starter);

      function renderDecksArmory() {
        return `
          <!-- Custom Decks Armory (Categorized) -->
          <div class="profile-decks-section card-panel" style="margin-top:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
              <div>
                <h2 style="margin:0;display:flex;align-items:center;gap:8px">
                  <span>🎴</span> Saved Decks Armory
                  <span class="chip gold" style="font-size:11px">${myDecks.length} Saved</span>
                  ${otherDecks.length ? `<span class="chip" style="font-size:11px">${otherDecks.length} From Other Players</span>` : ""}
                </h2>
                <p class="muted" style="margin:2px 0 0 0">Your personal spellbooks appear first. Take them into live matches or tweak them in the builder:</p>
              </div>
              <a class="btn gold small" onclick="window.MTG.go('/builder'); return false;" href="#">+ Create New Deck</a>
            </div>

            <div class="profile-deck-grid" style="margin-bottom: 16px;">
              ${
                myDecks.length
                  ? myDecks.map((d) => {
                      return `
                      <div class="profile-deck-card card-panel is-my-saved-deck">
                        <div class="profile-deck-cover" style="background-image:url('${d.cover || "/img/cardback.jpg"}')">
                          <span class="deck-format-badge">${escapeHtml(d.format)}</span>
                          <span class="deck-saved-pill">✨ Saved</span>
                        </div>
                        <div class="profile-deck-body">
                          <b class="profile-deck-title">${escapeHtml(d.name)}</b>
                          <div class="muted" style="font-size:11px;margin-top:4px">${d.counts && (d.counts.main + d.counts.command) || 0} cards</div>
                          <div class="profile-deck-actions" style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
                            <button type="button" class="btn small gold btn-char-play-deck" data-did="${d.id}" title="Play at tables with this deck">⚔️ Play</button>
                            <a class="btn small ghost" onclick="window.MTG.go('/builder/${d.id}'); return false;" href="#" title="Edit in deck builder">✏️ Edit</a>
                            <button type="button" class="btn small ghost btn-char-copy-deck" data-did="${d.id}" title="Duplicate deck">📋 Copy</button>
                            <button type="button" class="btn small danger btn-char-del-deck" data-did="${d.id}" title="Delete deck">🗑️</button>
                          </div>
                        </div>
                      </div>`;
                    }).join("")
                  : `
                    <div class="card-panel empty-deck-notice" style="grid-column:1/-1;text-align:center;padding:32px">
                      <h3>No Saved Decks Yet</h3>
                      <p class="muted">Craft your first signature commander or duel deck from over 1,500 cards!</p>
                      <a class="btn gold" onclick="window.MTG.go('/builder'); return false;" href="#" style="margin-top:8px">+ Open Deck Builder</a>
                    </div>
                  `
              }
            </div>
            
            ${
              otherDecks.length
                ? `
            <h3 style="margin:24px 0 12px 0; font-size:14px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:6px;">🗂️ Decks From Other Planeswalkers</h3>
            <div class="profile-deck-grid">
              ${
                otherDecks.map((d) => {
                      return `
                      <div class="profile-deck-card card-panel">
                        <div class="profile-deck-cover" style="background-image:url('${d.cover || "/img/cardback.jpg"}')">
                          <span class="deck-format-badge">${escapeHtml(d.format)}</span>
                        </div>
                        <div class="profile-deck-body">
                          <b class="profile-deck-title">${escapeHtml(d.name)}</b>
                          <div class="muted" style="font-size:11px;margin-top:4px">${d.counts && (d.counts.main + d.counts.command) || 0} cards</div>
                          <div class="profile-deck-actions" style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">
                            <button type="button" class="btn small gold btn-char-play-deck" data-did="${d.id}" title="Play at tables with this deck">⚔️ Play</button>
                            <a class="btn small ghost" onclick="window.MTG.go('/builder/${d.id}'); return false;" href="#" title="View in deck builder">👁️ View</a>
                            <button type="button" class="btn small ghost btn-char-copy-deck" data-did="${d.id}" title="Duplicate deck">📋 Copy</button>
                          </div>
                        </div>
                      </div>`;
                    }).join("")
              }
            </div>`
                : ""
            }
          </div>
        `;
      }

      const root = $("#classic-profile-sheet");
      if (!root) return;

      if (!isRegistered && (activeTab === "login" || activeTab === "register" || activeTab === "wallet" || activeTab === "guest")) {
        // ==========================================
        // VIEW: CHARACTER LOGIN & CREATION PORTAL
        // ==========================================
        root.innerHTML = `
          <div class="profile-portal-hero hero">
            <div>
              <div class="portal-badge-pill">
                <span class="pulse-dot"></span>
                <span>✨ MULTIVERSE HEARTH · CHARACTER PORTAL</span>
              </div>
              <h1>Step Into the Hearth · Forge Your Character ✨</h1>
              <p>Welcome, planeswalker! Create your wizard character, choose a familiar companion, connect your Web3 wallet, or log in to command the tables.</p>
              
              <div class="portal-perks-row">
                <span class="portal-perk-chip">🪙 +1,000 Starter $TCG</span>
                <span class="portal-perk-chip">🎴 Custom Deck Builder</span>
                <span class="portal-perk-chip">🦊 Sepolia Web3 Signer</span>
                <span class="portal-perk-chip">🏆 Multiverse Leaderboard</span>
              </div>

              <div class="toolbar" style="margin-top:18px">
                <a class="btn gold" onclick="window.MTG.openTablesModal && window.MTG.openTablesModal(); return false;" href="#">🏰 Jump Directly to Tables</a>
                <button type="button" class="btn ghost" id="btn-quick-guest-hero">🌱 Quick Guest Character</button>
                <a class="btn ghost" href="#/tables?second=1" target="mtg-p2">🧙 Player 2 Window</a>
              </div>
            </div>
          </div>

          <!-- Character Portal Tabs -->
          <div class="profile-portal-card card-panel">
            <div class="profile-portal-tabs">
              <button type="button" class="portal-tab-btn ${activeTab === "login" ? "active" : ""}" data-tab="login">
                🔑 Character Log In
              </button>
              <button type="button" class="portal-tab-btn ${activeTab === "register" ? "active" : ""}" data-tab="register">
                ✨ Create New Character
              </button>
              <button type="button" class="portal-tab-btn ${activeTab === "wallet" ? "active" : ""}" data-tab="wallet">
                👛 Web3 Wallet Signer
              </button>
              <button type="button" class="portal-tab-btn ${activeTab === "guest" ? "active" : ""}" data-tab="guest">
                🌱 Guest Planeswalker
              </button>
            </div>

            <div class="portal-tab-content">
              ${renderPortalTabContent(activeTab, me, selectedPreset)}
            </div>
          </div>

          <!-- Bottom Showcase: LAN Tables & Leaderboard Preview -->
          <div class="grid-2" style="margin-top:24px">
            <!-- Active LAN Tables Preview -->
            <div class="card-panel">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <h3 style="margin:0">✨ Active Tables on LAN</h3>
                <a class="btn small gold" onclick="window.MTG.openTablesModal && window.MTG.openTablesModal(); return false;" href="#">🏰 All Tables</a>
              </div>
              <div class="portal-tables-list">
                ${
                  openTables && openTables.length
                    ? openTables.slice(0, 3).map((t) => `
                        <div class="portal-table-item">
                          <div>
                            <b>${escapeHtml(t.name)}</b>
                            <div class="faint" style="font-size:11px">
                              ${escapeHtml(t.code)} · ${escapeHtml(t.format)} · 
                              ${t.wager ? `<span style="color:var(--gold)">🪙 ${t.wager} $TCG</span>` : "Casual"}
                            </div>
                          </div>
                          <a class="btn small gold" href="#/table/${escapeHtml(t.code)}">Sit</a>
                        </div>
                      `).join("")
                    : `<div class="empty" style="padding:16px 0">No open tables at this moment. Host the first one from the Tables page!</div>`
                }
              </div>
            </div>

            <!-- Top Multiverse Wizards Preview -->
            <div class="card-panel">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
                <h3 style="margin:0">🏆 Multiverse Leaderboard</h3>
                <span class="faint" style="font-size:11px">Top Ranked</span>
              </div>
              <div class="portal-lb-list">
                ${
                  lbData && lbData.length
                    ? lbData.slice(0, 4).map((u, i) => `
                        <div class="mini-lb-item">
                          <span class="mini-lb-rank">${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}</span>
                          <span class="mini-lb-name"><b>${escapeHtml(u.displayName || u.username)}</b></span>
                          <span class="mini-lb-score">🪙 ${(u.tcgBalance ?? u.balance ?? 0).toLocaleString()} $TCG</span>
                          <span class="mini-lb-wl faint">${u.wins || 0}W</span>
                        </div>
                      `).join("")
                    : `<div class="empty" style="padding:16px 0">No registered champions on the leaderboard yet.</div>`
                }
              </div>
            </div>
          </div>

          <!-- Saved Decks Armory -->
          ${renderDecksArmory()}

          <!-- Multiverse Visual Themes Chooser -->
          <div class="card-panel" style="margin-top:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <h3 style="margin:0;display:flex;align-items:center;gap:8px">🎨 Multiverse Visual Themes</h3>
              <span class="faint" style="font-size:12px">Select Interface Skin</span>
            </div>
            <div class="skin-chips-list" style="display:flex;flex-wrap:wrap;gap:8px">
              ${(SKINS || []).map((s) => `
                <button type="button" class="btn small ${s.id === curSkinId ? "gold active-skin-chip" : "ghost"} btn-skin-pick" data-skin="${s.id}">
                  <span>${s.icon}</span> <span>${escapeHtml(s.name)}</span>
                </button>
              `).join("")}
            </div>
          </div>
        `;
      } else {
        // ==========================================
        // VIEW: LOGGED-IN PLANESWALKER CHARACTER PROFILE
        // ==========================================
        const cur = user || { ...me, balance: 0, level: 1, xp: 0, wins: 0, losses: 0 };
        const totalGames = (cur.wins || 0) + (cur.losses || 0);
        const winrate = totalGames ? Math.round(((cur.wins || 0) / totalGames) * 100) : 0;
        const streak = (cur.stats && cur.stats.streak) || 0;
        const bestStreak = (cur.stats && cur.stats.bestStreak) || (cur.wins ? 1 : 0);
        const totalWon = (cur.stats && cur.stats.totalWon) || (cur.wins * 200);

        let rankTitle = "🌱 Novice Spellcaster";
        if (cur.wins >= 15) rankTitle = "👑 Multiverse Grandmaster";
        else if (cur.wins >= 7) rankTitle = "⚡ High Archmage";
        else if (cur.wins >= 3) rankTitle = "✨ Adept Planeswalker";

        let avatarEl = `<span style="font-size:68px">🧙</span>`;
        if (cur.avatar) {
          if (cur.avatar.startsWith("preset:")) {
            const pr = AVATAR_PRESETS.find((x) => x.id === cur.avatar);
            avatarEl = `<span style="font-size:68px">${pr ? pr.icon : "🧙"}</span>`;
          } else {
            avatarEl = `<img src="${escapeHtml(cur.avatar)}" class="profile-avatar-big" alt="avatar" />`;
          }
        }

        root.innerHTML = `
          <!-- Character Profile Grand Sanctuary Card -->
          <div class="profile-char-card card-panel">
            <div class="profile-char-layout">
              <div class="profile-char-avatar-col">
                <div class="profile-avatar-halo" id="profile-avatar-trigger" title="Click to pick avatar or upload portrait" style="cursor:pointer;" onclick="document.getElementById('char-avatar-file').click()">
                  ${avatarEl}
                  <div class="profile-avatar-overlay-badge">🎨</div>
                </div>
                <input type="file" id="char-avatar-file" accept="image/*" style="display:none" />
                <div class="profile-char-rank-tag">${rankTitle}</div>
              </div>

              <div class="profile-char-info-col">
                <div class="profile-name-row">
                  <h1 class="profile-char-name">${escapeHtml(cur.displayName || cur.username)}</h1>
                  <span class="chip gold profile-level-badge">⭐ Level ${cur.level || 1}</span>
                  ${cur.isAdmin ? `<span class="chip gold">👑 Admin</span>` : ""}
                  <button type="button" class="btn small ghost" id="btn-edit-displayname" title="Change Wizard Name">✏️ Name</button>
                </div>

                <div class="profile-wallet-row" style="margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                  ${
                    cur.walletAddress
                      ? `
                    <span class="wallet-icon">${cur.walletChain === "solana" ? "👻" : "🦊"}</span>
                    <span class="wallet-addr code-font">${escapeHtml(cur.walletAddress.slice(0, 10))}…${escapeHtml(cur.walletAddress.slice(-8))}</span>
                    <button type="button" class="btn small ghost" id="btn-copy-char-wallet" data-addr="${escapeHtml(cur.walletAddress)}" style="font-size:11px;padding:2px 8px">📋 Copy</button>
                    <button type="button" class="btn small ghost" id="btn-char-disconnect-wallet" title="Disconnect Web3 Wallet" style="font-size:11px;padding:2px 8px">🔌 Disconnect</button>
                    <span class="faint" style="font-size:11px">· Sepolia Testnet</span>
                  `
                      : `
                    <span class="wallet-icon">👛</span>
                    <span class="faint" style="font-size:12px">Web3 Wallet: Not linked</span>
                    <button type="button" class="btn small ghost" id="btn-char-connect-web3" style="font-size:11px;padding:2px 8px">⚡ Connect Wallet</button>
                  `
                  }
                </div>

                <!-- XP & Progression System Bar -->
                <div class="profile-xp-section" style="margin: 10px 0; background: rgba(0,0,0,0.25); border: 1px solid var(--line); border-radius: 8px; padding: 10px 14px;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                      <span style="font-weight:bold; color:var(--gold); font-size:13px;">⭐ Level ${cur.level || 1}</span>
                      <span class="muted" style="font-size:11px;">Rank Progress</span>
                    </div>
                    <span style="color:#c084fc; font-size:12px; font-weight:bold;">${(cur.xp || 0).toLocaleString()} / ${xpNeeded.toLocaleString()} XP <small class="muted">(${xpPercent}%)</small></span>
                  </div>
                  <div class="xp-bar-track" style="width:100%; height:10px; background:rgba(255,255,255,0.08); border-radius:5px; overflow:hidden; border:1px solid rgba(255,255,255,0.08);">
                    <div class="xp-bar-fill" style="width:${xpPercent}%; height:100%; background:linear-gradient(90deg, #7c3aed, #a855f7, #eab308); border-radius:5px; transition:width 0.4s ease;"></div>
                  </div>
                </div>

                <!-- Treasury Balance Bar -->
                <div class="profile-balance-strip" style="display:flex;gap:12px;flex-wrap:wrap;">
                  <div class="profile-balance-stat" style="flex:1;min-width:140px;">
                    <span class="balance-label">$TCG TOKEN TREASURY</span>
                    <span class="balance-gold">🪙 <b>${tcgBal.toLocaleString()}</b> <small style="font-size:12px;font-weight:700;">$TCG</small></span>
                  </div>
                  <div class="profile-balance-stat" style="flex:1;min-width:140px;">
                    <span class="balance-label">$GG GUILD RESERVE</span>
                    <span class="balance-gold" style="color:#c084fc;">💎 <b>${ggBal.toLocaleString()}</b> <small style="font-size:12px;font-weight:700;">$GG</small></span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Command Center Fast Action Bar -->
            <div class="profile-command-bar">
              <a class="btn gold pulse" onclick="window.MTG.openTablesModal && window.MTG.openTablesModal(); return false;" href="#">🏰 Enter Tables & Host Match</a>
              <button type="button" class="btn ghost" id="btn-char-friends">🤝 Friends Hub</button>
              <a class="btn ghost" onclick="window.MTG.go('/guilds'); return false;" href="#">⚔️ Guilds</a>
            </div>
          </div>

          <!-- Battle Record & Stats Grid -->
          <div class="section-title" style="margin-top:24px">🏆 Planeswalker Achievements & Battle Records</div>
          <div class="profile-stats-grid" style="display:grid;grid-template-columns:repeat(5, 1fr);gap:10px;">
            <div class="stat-box card-panel" style="padding:14px;text-align:center">
              <div class="faint" style="font-size:11px">WIN STREAK</div>
              <div style="font-size:24px;font-weight:900;color:var(--gold);margin-top:4px">🔥 ${streak}</div>
              <div class="faint" style="font-size:10px">Best Record: ${bestStreak}</div>
            </div>
            <div class="stat-box card-panel" style="padding:14px;text-align:center">
              <div class="faint" style="font-size:11px">MATCH RECORD</div>
              <div style="font-size:24px;font-weight:900;margin-top:4px">${cur.wins || 0}W · ${cur.losses || 0}L</div>
              <div class="faint" style="font-size:10px">${winrate}% Winrate</div>
            </div>
            <div class="stat-box card-panel" style="padding:14px;text-align:center">
              <div class="faint" style="font-size:11px">WAGER SPOILS</div>
              <div style="font-size:24px;font-weight:900;color:var(--life);margin-top:4px">+${totalWon.toLocaleString()}</div>
              <div class="faint" style="font-size:10px">TCG from tables</div>
            </div>
            <div class="stat-box card-panel" style="padding:14px;text-align:center">
              <div class="faint" style="font-size:11px">$TCG BALANCE</div>
              <div style="font-size:24px;font-weight:900;color:var(--gold);margin-top:4px">🪙 ${tcgBal.toLocaleString()}</div>
              <div class="faint" style="font-size:10px">Available wagers</div>
            </div>
            <div class="stat-box card-panel" style="padding:14px;text-align:center">
              <div class="faint" style="font-size:11px">$GG BALANCE</div>
              <div style="font-size:24px;font-weight:900;color:#c084fc;margin-top:4px">💎 ${ggBal.toLocaleString()}</div>
              <div class="faint" style="font-size:10px">Guild reserve</div>
            </div>
          </div>

          <!-- Cute Badges Rack -->
          <div class="profile-badges-shelf" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
            <span class="chip ${cur.wins > 0 ? "gold" : "muted"}" title="Won at least 1 match">⚔️ First Blood</span>
            <span class="chip ${totalWon >= 500 ? "gold" : "muted"}" title="Won over 500 gold in wagers">🪙 High Roller</span>
            <span class="chip ${cur.wins >= 5 ? "gold" : "muted"}" title="Won 5 or more matches">🏆 Spell Titan</span>
            <span class="chip ${streak >= 3 ? "gold" : "muted"}" title="3 wins in a row without defeat">🔥 On Fire</span>
            <span class="chip gold" title="Verified Multiverse Planeswalker">✨ Hearth Citizen</span>
            ${cur.walletAddress ? '<span class="chip gold" title="Verified Web3 Crypto Signer">🦊 Web3 Sovereign</span>' : ''}
          </div>

          <!-- Adventure Systems: Achievements Grid -->
          <div class="card-panel" style="margin-top:18px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <h3 style="margin:0;display:flex;align-items:center;gap:8px"><span>🏅</span> Multiverse Achievements</h3>
              <span class="faint" id="ach-count-hint" style="font-size:11px">…</span>
            </div>
            <div id="ach-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px;margin-top:12px">
              <span class="muted" style="font-size:11px;grid-column:1/-1">Loading achievements…</span>
            </div>
          </div>

          <!-- Multiverse Leaderboard Placement -->
          <div class="card-panel" style="margin-top:28px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <h3 style="margin:0">🏆 Global Multiverse Leaderboard Standing</h3>
              <span class="faint" style="font-size:12px">Updated Live</span>
            </div>
            <div style="overflow-x:auto;margin-top:12px">
              <table class="leaderboard-table" style="width:100%;border-collapse:collapse">
                <thead>
                  <tr style="text-align:left;border-bottom:1px solid var(--line)">
                    <th style="padding:8px">#</th>
                    <th style="padding:8px">Wizard</th>
                    <th style="padding:8px">🪙 $TCG Balance</th>
                    <th style="padding:8px">Record</th>
                  </tr>
                </thead>
                <tbody>
                  ${
                    lbData && lbData.length
                      ? lbData.map((u, i) => `
                          <tr style="border-bottom:1px solid rgba(255,255,255,0.05);background:${user && user.id === u.id ? "rgba(215,180,92,0.12)" : "transparent"}">
                            <td style="padding:8px">${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
                            <td style="padding:8px">
                              <b>${escapeHtml(u.displayName || u.username)}</b>
                              ${user && user.id === u.id ? ' <span class="chip gold" style="font-size:9px;padding:1px 6px">YOU</span>' : ""}
                            </td>
                            <td style="padding:8px;color:var(--gold);font-weight:bold">🪙 ${(u.tcgBalance ?? u.balance ?? 0).toLocaleString()} $TCG</td>
                            <td style="padding:8px">${u.wins || 0}W / ${u.losses || 0}L</td>
                          </tr>
                        `).join("")
                      : `<tr><td colspan="4" class="empty" style="padding:16px">No ranked wizards yet. Lead the charge!</td></tr>`
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- Account Session Controls -->
          <div class="card-panel" style="margin-top:28px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:24px">🧙</span>
              <div>
                <b style="font-size:14px">Account: ${escapeHtml(cur.username || cur.name)}</b>
                <div class="faint" style="font-size:12px">Switch character or log out to access another spellbook.</div>
              </div>
            </div>
            <div style="display:flex;gap:8px">
              <button type="button" class="btn small ghost" id="btn-char-switch-acc">🔄 Switch Character</button>
              <button type="button" class="btn small danger" id="btn-char-logout">🚪 Log Out</button>
            </div>
          </div>

          <!-- Saved Decks Armory -->
          ${renderDecksArmory()}

          <!-- Multiverse Visual Themes Chooser -->
          <div class="card-panel" style="margin-top:28px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <h3 style="margin:0;display:flex;align-items:center;gap:8px">🎨 Multiverse Visual Themes</h3>
              <span class="faint" style="font-size:12px">Select Interface Skin</span>
            </div>
            <div class="skin-chips-list" style="display:flex;flex-wrap:wrap;gap:8px">
              ${(SKINS || []).map((s) => `
                <button type="button" class="btn small ${s.id === curSkinId ? "gold active-skin-chip" : "ghost"} btn-skin-pick" data-skin="${s.id}">
                  <span>${s.icon}</span> <span>${escapeHtml(s.name)}</span>
                </button>
              `).join("")}
            </div>
          </div>
        `;
      }

      // Bind all dynamic event listeners
      bindProfileEvents({ user, me, isRegistered, draw, second });
      renderAchievementsGrid(second);
    }

    async function renderAchievementsGrid(second) {
      const grid = document.getElementById("ach-grid");
      const hint = document.getElementById("ach-count-hint");
      if (!grid || !hint) return;
      try {
        const res = await window.MTG.api("/api/achievements", { second });
        const list = res.list || [];
        hint.textContent = `Unlocked ${res.unlockedCount || 0} of ${res.total || list.length}`;
        grid.innerHTML = list.map((a) => `
          <div class="card-panel" style="padding:8px 10px;display:flex;gap:8px;align-items:center;border-color:${a.unlocked ? "rgba(215,180,92,0.5)" : "var(--line,#ffffff22)"};background:${a.unlocked ? "rgba(215,180,92,0.07)" : "rgba(255,255,255,0.02)"}" title="${escapeHtml(a.desc)} · ${a.unlocked ? `Unlocked ${new Date(a.unlockedAt).toLocaleDateString()}` : `Reward: ${a.reward} 🪙`}">
            <span style="font-size:18px;filter:${a.unlocked ? "none" : "grayscale(1);opacity:.45"}">${a.icon || "🎴"}</span>
            <div style="flex:1;min-width:0">
              <div style="font-size:11px;font-weight:700;color:${a.unlocked ? "var(--gold-2)" : "var(--muted)"};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(a.name)}</div>
              <div style="font-size:9.5px;color:var(--muted);line-height:1.3">${escapeHtml(a.desc)}</div>
            </div>
            <span style="font-size:10px;color:var(--gold)">${a.unlocked ? "✔" : `${a.reward} 🪙`}</span>
          </div>`).join("");
      } catch (err) {
        grid.innerHTML = `<span class="muted" style="font-size:11px;grid-column:1/-1">${escapeHtml(err.message || "Achievements unavailable.")}</span>`;
      }
    }

    function renderPortalTabContent(tab, me, selectedPreset) {
      if (tab === "login") {
        return `
          <div class="portal-form-wrap">
            <div id="portal-auth-err" class="auth-err-banner" style="display:none"></div>
            <form id="portal-login-form" class="auth-form" style="margin-top:12px">
              <div class="field">
                <label>Wizard Username</label>
                <input type="text" id="portal-un" required autocomplete="username" placeholder="e.g. jace_beleren" autofocus />
              </div>
              <div class="field">
                <label>Password</label>
                <input type="password" id="portal-pw" required autocomplete="current-password" placeholder="••••••••" />
              </div>
              <div class="row" style="margin-top:18px;gap:10px;flex-wrap:wrap">
                <button type="submit" class="btn gold pulse" id="btn-portal-login-submit" style="padding:10px 24px">
                  🔑 Log In to Hearth
                </button>
                <button type="button" class="btn ghost" id="btn-switch-to-reg">✨ Need a character? Create one (+1,000 🪙)</button>
              </div>
            </form>
          </div>
        `;
      } else if (tab === "register") {
        return `
          <div class="portal-form-wrap">
            <div id="portal-auth-err" class="auth-err-banner" style="display:none"></div>
            <form id="portal-reg-form" class="auth-form" style="margin-top:12px">
              <div class="field">
                <label>Username (3-24 characters, letters/numbers/_-)</label>
                <input type="text" id="portal-reg-un" required autocomplete="username" pattern="[a-zA-Z0-9_-]+" placeholder="archmage_lily" autofocus />
              </div>
              <div class="field">
                <label>Planeswalker Display Name</label>
                <input type="text" id="portal-reg-dn" placeholder="e.g. Chandra the Pyromancer" maxlength="32" />
              </div>
              <div class="field">
                <label>Password (min 4 characters)</label>
                <input type="password" id="portal-reg-pw" required minlength="4" autocomplete="new-password" placeholder="••••••••" />
              </div>

              <!-- Starting Familiar Selector -->
              <div class="field" style="margin-top:14px">
                <label>Choose Your Starting Familiar / Avatar:</label>
                <div class="profile-presets-grid" style="margin-top:8px">
                  ${AVATAR_PRESETS.map((p) => `
                    <button type="button" class="profile-preset-tile ${selectedPreset === p.id ? "active" : ""}" data-preset-select="${p.id}" title="${p.name} · ${p.desc}">
                      <span class="preset-tile-icon">${p.icon}</span>
                      <span class="preset-tile-name">${p.name}</span>
                    </button>
                  `).join("")}
                </div>
              </div>

              <div class="row" style="margin-top:20px;gap:10px;flex-wrap:wrap">
                <button type="submit" class="btn gold pulse" id="btn-portal-reg-submit" style="padding:10px 24px">
                  ✨ Create Character & Claim 1,000 🪙 $TCG
                </button>
                <button type="button" class="btn ghost" id="btn-switch-to-log">Already have a character? Log In</button>
              </div>
            </form>
          </div>
        `;
      } else if (tab === "wallet") {
        return `
          <div class="card-panel auth-card" style="max-width:440px;margin:0 auto;text-align:center;padding:28px 20px">
            <span style="font-size:44px;display:block;margin-bottom:8px">👛</span>
            <h3 style="margin-bottom:6px">Web3 Crypto Identity</h3>
            <p class="muted" style="font-size:13px;margin-bottom:20px">Connect your Ethereum (MetaMask / Phantom ETH) or Solana (Phantom) wallet to authenticate.</p>
            ${user && user.walletAddress ? `
              <div style="background:rgba(215,180,92,0.08);border:1px solid var(--gold);border-radius:8px;padding:14px;margin-bottom:18px">
                <div style="font-size:12px;color:var(--gold);margin-bottom:4px">● Connected Wallet</div>
                <div class="code-font" style="font-size:12px;word-break:break-all;color:#fff">${escapeHtml(user.walletAddress)}</div>
              </div>
              <button type="button" class="btn ghost danger" id="btn-portal-disconnect-phantom">Disconnect Wallet</button>
            ` : `
              <div style="display:flex;flex-direction:column;gap:10px">
                <button type="button" class="btn gold large" style="width:100%" id="btn-portal-connect-metamask">🦊 Connect MetaMask (Sepolia)</button>
                <button type="button" class="btn small" style="width:100%;background:linear-gradient(135deg, #7c3aed, #581c87);color:#fff;border:1px solid #c084fc;" id="btn-portal-connect-phantom">${loginIcon}Login</button>
              </div>
            `}
          </div>
        `;
      } else if (tab === "guest") {
        return `
          <div class="portal-form-wrap">
            <p class="muted">Prefer to jump in instantly without a password? Pick a guest wizard name and familiar to begin playing right away. You can register anytime later!</p>
            <div class="field" style="margin-top:12px">
              <label>Guest Wizard Name</label>
              <input type="text" id="portal-guest-name" value="${escapeHtml(me.name)}" maxlength="32" placeholder="Wandering Mage" />
            </div>
            <div class="field" style="margin-top:14px">
              <label>Pick Starting Familiar:</label>
              <div class="profile-presets-grid" style="margin-top:8px">
                ${AVATAR_PRESETS.map((p) => `
                  <button type="button" class="profile-preset-tile ${selectedPreset === p.id ? "active" : ""}" data-preset-select="${p.id}" title="${p.name}">
                    <span class="preset-tile-icon">${p.icon}</span>
                    <span class="preset-tile-name">${p.name}</span>
                  </button>
                `).join("")}
              </div>
            </div>
            <div class="row" style="margin-top:20px;gap:10px">
              <button type="button" class="btn gold pulse" id="btn-portal-guest-start" style="padding:10px 24px">
                🚀 Enter as Guest Planeswalker
              </button>
              <a class="btn ghost" onclick="window.MTG.openTablesModal && window.MTG.openTablesModal(); return false;" href="#">🏰 Skip to Tables</a>
            </div>
          </div>
        `;
      }
      return "";
    }

    function bindProfileEvents({ user, me, isRegistered, draw, second }) {
      // Portal tab switching
      $$(".portal-tab-btn").forEach((btn) => {
        btn.onclick = () => {
          activeTab = btn.dataset.tab;
          draw();
        };
      });

      const toReg = $("#btn-switch-to-reg");
      if (toReg) toReg.onclick = () => { activeTab = "register"; draw(); };
      const toLog = $("#btn-switch-to-log");
      if (toLog) toLog.onclick = () => { activeTab = "login"; draw(); };
      const qgh = $("#btn-quick-guest-hero");
      if (qgh) qgh.onclick = () => { activeTab = "guest"; draw(); };

      // Select preset familiar on registration or guest form
      $$("[data-preset-select]").forEach((btn) => {
        btn.onclick = () => {
          selectedPreset = btn.dataset.presetSelect;
          $$("[data-preset-select]").forEach((b) => b.classList.toggle("active", b === btn));
        };
      });

      // Password sign-in was removed — both forms now route users to their wallet.
      const walletOnlyNotice = (errElId, btnId, wasCreating) => {
        const notice = (e) => {
          e.preventDefault();
          const errEl = $(`#${errElId}`);
          if (errEl) {
            errEl.textContent = "🔮 Password accounts were retired. Connect a wallet to sign in — it takes one signature.";
            errEl.style.display = "block";
          }
          const b = $(`#${btnId}`);
          if (b) b.disabled = false;
          toast("Connect a wallet to sign in. 🔮");
        };
        return notice;
      };
      const loginForm = $("#portal-login-form");
      if (loginForm) {
        loginForm.onsubmit = walletOnlyNotice("portal-auth-err", "btn-portal-login-submit", false);
      }

      // Register form submission
      const regForm = $("#portal-reg-form");
      if (regForm) {
        regForm.onsubmit = walletOnlyNotice("portal-auth-err", "btn-portal-reg-submit", true);
      }

      // Guest start button
      const guestBtn = $("#btn-portal-guest-start");
      if (guestBtn) {
        guestBtn.onclick = async () => {
          const gn = $("#portal-guest-name").value.trim() || me.name;
          setName(gn, second);
          me.name = gn;
          try {
            const res = await api("/api/auth/profile", {
              method: "POST",
              second,
              body: { avatar: selectedPreset, displayName: gn, playerId: me.id },
            });
            if (res && res.user) setCachedUser(res.user, second);
            else {
              const cur = getCachedUser(second) || { ...me, balance: 0, level: 1, xp: 0, wins: 0, losses: 0 };
              cur.displayName = gn;
              cur.avatar = selectedPreset;
              setCachedUser(cur, second);
            }
          } catch {}
          if (window.MTG_HOMEROOM_INST?.updateUser) window.MTG_HOMEROOM_INST.updateUser(getCachedUser(second));
          toast(`Welcome, Guest Planeswalker ${gn}! ✨`);
          activeTab = "profile";
          draw();
        };
      }

      // Portal Web3 buttons (Sepolia Testnet)
      const portalMm = $("#btn-portal-connect-metamask");
      if (portalMm) {
        portalMm.onclick = async () => {
          if (window.MTG?.connectWeb3) {
            const u = await window.MTG.connectWeb3("metamask");
            if (u) { activeTab = "profile"; draw(); }
          }
        };
      }
      const portalPh = $("#btn-portal-connect-phantom");
      if (portalPh) {
        portalPh.onclick = async () => {
          if (window.MTG?.connectPhantom) {
            const u = await window.MTG.connectPhantom(second, "ethereum");
            if (u) { activeTab = "profile"; draw(); }
          }
        };
      }
      const portalDiscW3 = $("#btn-portal-disconnect-phantom");
      if (portalDiscW3) portalDiscW3.onclick = () => unlinkCharacterWallet();

      // ==========================================
      // LOGGED-IN PROFILE EVENTS
      // ==========================================

      // Preset avatar clicking in customizer
      $$(".profile-preset-tile[data-preset]").forEach((btn) => {
        btn.onclick = async () => {
          const preset = btn.dataset.preset;
          try {
            const res = await api("/api/auth/profile", {
              method: "POST",
              second,
              body: { avatar: preset, playerId: me.id },
            });
            if (res && res.user) setCachedUser(res.user, second);
            toast("Avatar familiar updated! ✨");
            draw();
            const navEl = $(".topnav");
            if (navEl) {
              const temp = document.createElement("div");
              temp.innerHTML = nav("profile");
              navEl.replaceWith(temp.firstElementChild);
              bindNav();
            }
          } catch (err) {
            toast(err.message || "Failed to set avatar");
          }
        };
      });

      // Custom avatar file upload
      const fileUpload = $("#char-avatar-file");
      if (fileUpload) {
        fileUpload.onchange = (e) => {
          const file = e.target.files[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) {
            toast("Image file is too large! Maximum 5MB.");
            return;
          }
          const reader = new FileReader();
          reader.onload = async (ev) => {
            const base64 = ev.target.result;
            try {
              const res = await api("/api/auth/profile", {
                method: "POST",
                second,
                body: { avatar: base64, playerId: me.id },
              });
              if (res && res.user) setCachedUser(res.user, second);
              toast("Custom avatar uploaded successfully! ✨");
              draw();
              const navEl = $(".topnav");
              if (navEl) {
                const temp = document.createElement("div");
                temp.innerHTML = nav("profile");
                navEl.replaceWith(temp.firstElementChild);
                bindNav();
              }
            } catch (err) {
              toast(err.message || "Could not upload photo");
            }
          };
          reader.readAsDataURL(file);
        };
      }

      // Edit Display Name
      const editNameBtn = $("#btn-edit-displayname");
      if (editNameBtn) {
        editNameBtn.onclick = async () => {
          const curName = (user && user.displayName) || me.name;
          const newName = prompt("Enter your Planeswalker Display Name:", curName);
          if (newName == null || !newName.trim()) return;
          try {
            const res = await api("/api/auth/profile", {
              method: "POST",
              second,
              body: { displayName: newName.trim(), playerId: me.id },
            });
            if (res && res.user) setCachedUser(res.user, second);
            setName(newName.trim(), second);
            toast("Wizard name updated! ✨");
            draw();
          } catch (err) {
            toast(err.message || "Could not update name");
          }
        };
      }

      // Edit Bio
      const editBioBtn = $("#btn-edit-bio-inline");
      if (editBioBtn) {
        editBioBtn.onclick = async () => {
          const curBio = (user && user.bio) || "";
          const newBio = prompt("Enter your wizard bio / flavor quote:", curBio);
          if (newBio == null) return;
          try {
            const res = await api("/api/auth/profile", {
              method: "POST",
              second,
              body: { bio: newBio, playerId: me.id },
            });
            if (res && res.user) setCachedUser(res.user, second);
            toast("Bio updated! ✨");
            draw();
          } catch (err) {
            toast(err.message || "Could not save bio");
          }
        };
      }

      // Skin picker inside customizer
      $$(".btn-skin-pick").forEach((btn) => {
        btn.onclick = () => {
          const skinId = btn.dataset.skin;
          if (setSkin) setSkin(skinId, second);
          if (applySkin) applySkin(skinId);
          toast(`Multiverse theme changed! 🎨`);
          draw();
        };
      });

      // Friends button
      const friendsBtn = $("#btn-char-friends");
      if (friendsBtn && openFriendsModal) {
        friendsBtn.onclick = () => openFriendsModal();
      }

      // Deck actions
      $$(".btn-char-play-deck").forEach((btn) => {
        btn.onclick = () => {
          sessionStorage.setItem("mtg-selected-deck", btn.dataset.did);
          go("/table/new");
        };
      });

      $$(".btn-char-copy-deck").forEach((btn) => {
        btn.onclick = async () => {
          try {
            const deckData = await api(`/api/decks/${btn.dataset.did}`);
            await api("/api/decks", {
              method: "POST",
              body: { ...deckData, name: `${deckData.name} (Copy)` },
            });
            toast("📋 Deck duplicated!");
            // Refresh decks
            const updatedDecks = await api("/api/decks");
            allDecks.length = 0;
            allDecks.push(...updatedDecks);
            draw();
          } catch (err) {
            toast("Copy failed: " + (err.message || err));
          }
        };
      });

      $$(".btn-char-del-deck").forEach((btn) => {
        btn.onclick = async () => {
          if (!confirm("Are you sure you want to delete this custom deck?")) return;
          try {
            await api(`/api/decks/${btn.dataset.did}`, { method: "DELETE" });
            toast("Deck deleted");
            const updatedDecks = await api("/api/decks");
            allDecks.length = 0;
            allDecks.push(...updatedDecks);
            draw();
          } catch (err) {
            toast(err.message || "Failed to delete deck");
          }
        };
      });

      async function unlinkCharacterWallet() {
        try {
          const res = await api("/api/auth/profile", {
            method: "POST",
            second,
            body: { unlinkWallet: true, playerId: me.id },
          });
          if (res && res.loggedOut) {
            if (window.MTG.setToken) window.MTG.setToken(null, second);
            setCachedUser(null, second);
            if (window.MTG_HOMEROOM_INST?.updateUser) window.MTG_HOMEROOM_INST.updateUser(null);
            if (window.MTG_RPG?.updateUser) window.MTG_RPG.updateUser(null);
            activeTab = "login";
            toast("Web3 account signed out.");
            const drawer = document.getElementById("dfk-sheet-drawer");
            if (drawer) drawer.hidden = false;
            draw();
            return;
          }
          if (res && res.user) {
            setCachedUser(res.user, second);
            if (window.MTG_HOMEROOM_INST?.updateUser) window.MTG_HOMEROOM_INST.updateUser(res.user);
          }
          toast("Wallet unlinked. This character stays signed in.");
          draw();
        } catch (err) {
          toast(err.message || "Could not disconnect wallet");
        }
      }

      // Web3 Wallet buttons
      const linkW3 = $("#btn-link-web3");
      if (linkW3) linkW3.onclick = async () => {
        linkW3.disabled = true;
        try {
          if (window.MTG.connectWeb3) await window.MTG.connectWeb3();
          else if (window.MTG.connectPhantom) await window.MTG.connectPhantom();
        } finally {
          linkW3.disabled = false;
        }
      };

      const connW3 = $("#btn-char-connect-web3");
      if (connW3) connW3.onclick = async () => {
        connW3.disabled = true;
        try {
          if (window.MTG.connectWeb3) await window.MTG.connectWeb3();
          else if (window.MTG.connectPhantom) await window.MTG.connectPhantom();
        } finally {
          connW3.disabled = false;
        }
      };

      const copyCharW3 = $("#btn-copy-char-wallet");
      if (copyCharW3) {
        copyCharW3.onclick = () => {
          navigator.clipboard.writeText(copyCharW3.dataset.addr || "").catch(() => {});
          toast("📋 Wallet address copied to clipboard!");
        };
      }

      const discW3 = $("#btn-char-disconnect-wallet");
      if (discW3) discW3.onclick = () => unlinkCharacterWallet();

      const swW3 = $("#btn-char-switch-wallet");
      if (swW3) {
        swW3.onclick = () => {
          openAuthModal("wallet");
        };
      }

      // Switch Account button
      const swAcc = $("#btn-char-switch-acc");
      if (swAcc) {
        swAcc.onclick = async () => {
          await logout(second);
        };
      }

      // Log out button
      const logoutBtn = $("#btn-char-logout");
      if (logoutBtn) {
        logoutBtn.onclick = async () => {
          await logout(second);
        };
      }
    }

    window.MTG_PROFILE_REDRAW = draw;
    await draw();
  };
})();
