/* ==========================================================================
   Multiverse Guilds & Competitive Leagues View
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
    go,
    sparkle,
    getCachedUser,
    openAuthModal,
    identity,
  } = window.MTG;

  window.MTG.openGuildsModal = async function openGuildsModal(routeParams = {}) {
    const second = window.MTG_SECOND;
    const user = getCachedUser(second);
    const me = identity(second);
    if(window.MTG.openModal) window.MTG.openModal(`<div class="wrap" id="guilds-root" style="padding:16px; width: 100%; box-sizing: border-box; max-height: 80vh; overflow-y: auto;">Loading Guilds & Leagues… ⚔️</div>`);

    let activeTab = (routeParams && routeParams.tab === "leagues") ? "leagues" : "guilds";
    let guildsData = [];
    let leaguesData = [];

    async function loadData() {
      try {
        const [gRes, lRes] = await Promise.all([
          api("/api/guilds"),
          api("/api/leagues"),
        ]);
        guildsData = Array.isArray(gRes) ? gRes : [];
        leaguesData = Array.isArray(lRes) ? lRes : [];
      } catch (err) {
        $("#guilds-root").innerHTML = `<div class="card-panel"><h2>Could not load data</h2><p class="muted">${escapeHtml(err.message)}</p></div>`;
        return false;
      }
      return true;
    }

    const loaded = await loadData();
    if (!loaded) return;

    function renderView() {
      const myId = user ? user.id : me.id;
      const myGuild = guildsData.find((g) => g.members && g.members.some((m) => m.id === myId));

      $("#guilds-root").innerHTML = `
        <div class="hero">
          <div>
            <h1>⚔️ Multiverse Guilds & Competitive Leagues</h1>
            <p>Pledge allegiance to a legendary order, pool gold into guild vaults, and battle for glory in competitive tournament circuits with massive staked prize pools!</p>
            <div class="toolbar" style="margin-top:16px">
              <button type="button" class="btn ${activeTab === "guilds" ? "gold" : "ghost"}" id="tab-guilds-btn">🛡️ Guilds Sanctum (${guildsData.length})</button>
              <button type="button" class="btn ${activeTab === "leagues" ? "gold" : "ghost"}" id="tab-leagues-btn">🏆 Tournament Leagues (${leaguesData.length})</button>
              ${activeTab === "guilds" ? `<button type="button" class="btn gold" id="btn-create-guild">✨ Form New Guild</button>` : `<button type="button" class="btn gold" id="btn-create-league">🏆 Host New League</button>`}
            </div>
          </div>
        </div>

        ${activeTab === "guilds" ? renderGuildsTab(myGuild, myId) : renderLeaguesTab(myId)}
      `;

      bindEvents(myGuild, myId);
      const m = document.getElementById("modal");
      if (m && window.MTG?.bringToFront) window.MTG.bringToFront(m);
    }

    function renderGuildsTab(myGuild, myId) {
      return `
        <!-- My Guild Banner if enrolled -->
        ${
          myGuild
            ? `
          <div class="card-panel my-guild-card" style="margin-bottom:24px;border-left:5px solid var(--accent, #f59e0b);background:linear-gradient(135deg, rgba(245,158,11,0.08), rgba(0,0,0,0.3))">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px">
              <div style="display:flex;align-items:center;gap:16px">
                <span style="font-size:42px">${escapeHtml(myGuild.crest)}</span>
                <div>
                  <div style="display:flex;align-items:center;gap:8px">
                    <h2 style="margin:0">${escapeHtml(myGuild.name)}</h2>
                    <span class="chip gold">Level ${myGuild.level || 1}</span>
                    <span class="chip green">Enrolled</span>
                  </div>
                  <p class="muted" style="margin:4px 0 0 0;font-style:italic">"${escapeHtml(myGuild.motto)}"</p>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:12px">
                <div style="text-align:right">
                  <div class="faint" style="font-size:12px">Guild Vault</div>
                  <div style="font-size:18px;font-weight:700;color:var(--gold, #fbbf24)">${(myGuild.vault || 0).toLocaleString()} 🪙 $TCG</div>
                </div>
                <button type="button" class="btn gold small btn-donate-guild" data-gid="${myGuild.id}">🪙 Donate $TCG</button>
              </div>
            </div>
          </div>
        `
            : `
          <div class="card-panel" style="margin-bottom:24px;padding:16px 20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;background:rgba(255,255,255,0.02)">
            <div>
              <div style="font-weight:600">🛡️ You are currently unaligned.</div>
              <div class="muted" style="font-size:13px">Join a guild below to pool vault resources, unlock collective battle aura perks, and chat on the guild board!</div>
            </div>
            <button type="button" class="btn gold small" id="banner-create-guild">✨ Form a Guild</button>
          </div>
        `
        }

        <!-- Guilds Grid -->
        <div class="guilds-grid" style="display:grid;grid-template-columns:repeat(auto-fill, minmax(320px, 1fr));gap:16px">
          ${guildsData
            .map((g) => {
              const isMember = g.members && g.members.some((m) => m.id === myId);
              const memCount = (g.members || []).length;
              return `
              <div class="card-panel guild-card" style="display:flex;flex-direction:column;justify-content:space-between;position:relative;border:1px solid rgba(255,255,255,0.1)">
                <div>
                  <div style="display:flex;justify-content:space-between;align-items:flex-start">
                    <div style="display:flex;align-items:center;gap:12px">
                      <span style="font-size:36px">${escapeHtml(g.crest || "🛡️")}</span>
                      <div>
                        <h3 style="margin:0;font-size:17px">${escapeHtml(g.name)}</h3>
                        <div class="faint" style="font-size:12px">Leader: <b>${escapeHtml(g.leader || "Founder")}</b></div>
                      </div>
                    </div>
                    <span class="chip gold" style="font-size:11px">Lvl ${g.level || 1}</span>
                  </div>
                  <p class="muted" style="margin:12px 0;font-size:13px;line-height:1.4">"${escapeHtml(g.motto)}"</p>
                  
                  <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(0,0,0,0.25);border-radius:6px;margin-bottom:12px;font-size:12px">
                    <span>👥 Members: <b>${memCount}</b></span>
                    <span>🪙 Vault: <b>${(g.vault || 0).toLocaleString()}</b></span>
                  </div>

                  <!-- Recent Guild Message preview -->
                  ${
                    g.messages && g.messages.length
                      ? `
                    <div style="font-size:11px;padding:6px 10px;background:rgba(255,255,255,0.03);border-radius:4px;margin-bottom:12px" class="faint">
                      💬 <b>${escapeHtml(g.messages[g.messages.length - 1].author)}</b>: "${escapeHtml(g.messages[g.messages.length - 1].text)}"
                    </div>
                  `
                      : ""
                  }
                </div>

                <div class="toolbar" style="margin-top:8px;gap:8px">
                  ${
                    isMember
                      ? `<button type="button" class="btn small disabled" style="opacity:0.8">✓ Enrolled</button>
                         <button type="button" class="btn small gold btn-donate-guild" data-gid="${g.id}">🪙 Donate</button>`
                      : `<button type="button" class="btn small gold btn-join-guild" data-gid="${g.id}">🛡️ Join Guild</button>`
                  }
                  <button type="button" class="btn small ghost btn-view-guild" data-gid="${g.id}">📜 Hall & Chat</button>
                </div>
              </div>
            `;
            })
            .join("")}
        </div>
      `;
    }

    function renderLeaguesTab(myId) {
      return `
        <div class="leagues-grid" style="display:flex;flex-direction:column;gap:24px">
          ${leaguesData
            .map((leg) => {
              const standings = leg.standings || [];
              const isJoined = standings.some((s) => s.userId === myId);
              return `
              <div class="card-panel league-card" style="padding:22px;border-left:5px solid var(--gold, #fbbf24)">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px">
                  <div>
                    <div style="display:flex;align-items:center;gap:10px">
                      <h2 style="margin:0">${escapeHtml(leg.name)}</h2>
                      <span class="chip gold">${escapeHtml(leg.season || "Active")}</span>
                      <span class="chip ${leg.format === "commander" ? "purple" : "blue"}">${leg.format.toUpperCase()}</span>
                    </div>
                    <p class="muted" style="margin:6px 0 0 0;font-size:13px">${escapeHtml(leg.description)}</p>
                  </div>
                  
                  <div style="display:flex;align-items:center;gap:16px">
                    <div style="text-align:right">
                      <div class="faint" style="font-size:12px">Entry Wager</div>
                      <div style="font-size:16px;font-weight:700;color:var(--gold, #fbbf24)">${(leg.entryFee || 0).toLocaleString()} 🪙</div>
                    </div>
                    <div style="text-align:right">
                      <div class="faint" style="font-size:12px">Prize Pool</div>
                      <div style="font-size:18px;font-weight:700;color:#10b981">🏆 ${(leg.prizePool || 0).toLocaleString()} 🪙</div>
                    </div>
                    ${
                      isJoined
                        ? `<button type="button" class="btn small disabled" style="opacity:0.8">✓ Registered</button>
                           <button type="button" class="btn small gold btn-report-match" data-lid="${leg.id}">⚔️ Report Win</button>`
                        : `<button type="button" class="btn small gold btn-join-league" data-lid="${leg.id}">⚔️ Register (${(leg.entryFee || 0).toLocaleString()} 🪙)</button>`
                    }
                  </div>
                </div>

                <!-- Rules note -->
                <div class="faint" style="margin:12px 0;font-size:12px;padding:6px 10px;background:rgba(0,0,0,0.2);border-radius:4px">
                  📜 <b>Rules:</b> ${escapeHtml(leg.rules || "Standard format match play. 3 points per win.")}
                </div>

                <!-- Standings Leaderboard Table -->
                <div class="league-standings-wrap" style="overflow-x:auto;margin-top:12px">
                  <table style="width:100%;border-collapse:collapse;font-size:13px">
                    <thead>
                      <tr style="border-bottom:1px solid rgba(255,255,255,0.1);text-align:left">
                        <th style="padding:8px">Rank</th>
                        <th style="padding:8px">Player</th>
                        <th style="padding:8px">Archetype Deck</th>
                        <th style="padding:8px;text-align:center">Record (W-L)</th>
                        <th style="padding:8px;text-align:right">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${
                        standings.length
                          ? standings
                              .map((s, idx) => {
                                const isMe = s.userId === myId;
                                const rankIcon = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`;
                                return `
                            <tr style="border-bottom:1px solid rgba(255,255,255,0.04);${isMe ? "background:rgba(245,158,11,0.08)" : ""}">
                              <td style="padding:8px;font-weight:700">${rankIcon}</td>
                              <td style="padding:8px"><b>${escapeHtml(s.name)}</b> ${isMe ? `<span class="chip gold" style="font-size:10px">You</span>` : ""}</td>
                              <td style="padding:8px;color:var(--text-muted, #94a3b8)">${escapeHtml(s.deck || "Custom Deck")}</td>
                              <td style="padding:8px;text-align:center">${s.wins || 0}W - ${s.losses || 0}L</td>
                              <td style="padding:8px;text-align:right;font-weight:700;color:var(--gold, #fbbf24)">${s.points || 0} pts</td>
                            </tr>
                          `;
                              })
                              .join("")
                          : `<tr><td colspan="5" class="faint" style="padding:12px;text-align:center">No challengers registered yet. Be the first to join!</td></tr>`
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            `;
            })
            .join("")}
        </div>
      `;
    }

    function bindEvents(myGuild, myId) {
      // Tab switcher
      $("#tab-guilds-btn").onclick = () => {
        activeTab = "guilds";
        renderView();
      };
      $("#tab-leagues-btn").onclick = () => {
        activeTab = "leagues";
        renderView();
      };

      // Create Guild
      const createGuildBtns = [$("#btn-create-guild"), $("#banner-create-guild")].filter(Boolean);
      createGuildBtns.forEach((btn) => {
        btn.onclick = () => openCreateGuildModal();
      });

      // Create League
      const createLeagueBtn = $("#btn-create-league");
      if (createLeagueBtn) {
        createLeagueBtn.onclick = () => openCreateLeagueModal();
      }

      // Join Guild Buttons
      $$(".btn-join-guild").forEach((btn) => {
        btn.onclick = async () => {
          const gid = btn.dataset.gid;
          try {
            const res = await api(`/api/guilds/${gid}/join`, {
              method: "POST",
              body: { playerId: me.id, playerName: user ? (user.displayName || user.username) : me.name },
            });
            window.MTG_SFX && window.MTG_SFX.play("victory");
            toast(res.message || "Joined guild! 🛡️");
            await loadData();
            renderView();
          } catch (err) {
            toast(err.message || "Could not join guild");
          }
        };
      });

      // Donate to Guild Buttons
      $$(".btn-donate-guild").forEach((btn) => {
        btn.onclick = () => {
          const gid = btn.dataset.gid;
          const g = guildsData.find((x) => x.id === gid);
          if (!g) return;
          openDonateModal(g);
        };
      });

      // View Guild Hall & Chat Modal
      $$(".btn-view-guild").forEach((btn) => {
        btn.onclick = () => {
          const gid = btn.dataset.gid;
          const g = guildsData.find((x) => x.id === gid);
          if (!g) return;
          openGuildHallModal(g);
        };
      });

      // Join League Buttons
      $$(".btn-join-league").forEach((btn) => {
        btn.onclick = async () => {
          const lid = btn.dataset.lid;
          const leg = leaguesData.find((x) => x.id === lid);
          if (!leg) return;
          if (!user && leg.entryFee > 0) {
            toast("Please log in to enter gold staked leagues!");
            openAuthModal("login");
            return;
          }
          if (user && user.balance < leg.entryFee) {
            toast(`Insufficient balance for ${leg.entryFee} $TCG entry fee!`);
            return;
          }
          const deckName = prompt("Enter the deck archetype you will pilot in this league:", "Sylvan Ramp") || "Custom Deck";
          try {
            const res = await api(`/api/leagues/${lid}/join`, {
              method: "POST",
              body: { playerId: me.id, playerName: user ? (user.displayName || user.username) : me.name, deck: deckName },
            });
            window.MTG_SFX && window.MTG_SFX.play("victory");
            toast(res.message || "Registered for league! 🏆");
            await loadData();
            renderView();
          } catch (err) {
            toast(err.message || "Registration failed");
          }
        };
      });

      // Report Win Button
      $$(".btn-report-match").forEach((btn) => {
        btn.onclick = async () => {
          const lid = btn.dataset.lid;
          try {
            await api(`/api/leagues/${lid}/match`, {
              method: "POST",
              body: { winnerId: myId },
            });
            window.MTG_SFX && window.MTG_SFX.play("victory");
            toast("Match victory recorded! +3 League Points ✨");
            await loadData();
            renderView();
          } catch (err) {
            toast(err.message || "Could not report match");
          }
        };
      });
    }

    /* Modal: Create Guild */
    function openCreateGuildModal() {
      const modal = $("#modal");
      if (!modal) return;
      modal.hidden = false;
      modal.innerHTML = `
        <div class="sheet">
          <h2>✨ Form a New Guild</h2>
          <p class="muted">Gather allies and build a sanctuary for your archetype or playgroup.</p>
          <form id="create-guild-form" style="margin-top:16px">
            <div class="field">
              <label>Guild Name</label>
              <input type="text" id="cg-name" placeholder="e.g. Astral Archmage Order" maxlength="40" required />
            </div>
            <div class="field" style="margin-top:12px">
              <label>Guild Crest (Emoji / Icon)</label>
              <div style="display:flex;gap:8px;margin-top:4px">
                <input type="text" id="cg-crest" value="🛡️" style="width:60px;text-align:center;font-size:20px" maxlength="4" required />
                <button type="button" class="btn small ghost btn-pick-crest" data-c="🌲">🌲</button>
                <button type="button" class="btn small ghost btn-pick-crest" data-c="⚡">⚡</button>
                <button type="button" class="btn small ghost btn-pick-crest" data-c="💀">💀</button>
                <button type="button" class="btn small ghost btn-pick-crest" data-c="🐉">🐉</button>
                <button type="button" class="btn small ghost btn-pick-crest" data-c="👑">👑</button>
                <button type="button" class="btn small ghost btn-pick-crest" data-c="🔮">🔮</button>
                <button type="button" class="btn small ghost btn-pick-crest" data-c="⚔️">⚔️</button>
              </div>
            </div>
            <div class="field" style="margin-top:12px">
              <label>Guild Motto & Creed</label>
              <input type="text" id="cg-motto" placeholder="e.g. Master the storm, claim the crown." maxlength="120" />
            </div>
            <div class="toolbar" style="margin-top:20px">
              <button type="submit" class="btn gold">🌟 Form Guild</button>
              <button type="button" class="btn ghost" id="cg-cancel">Cancel</button>
            </div>
          </form>
        </div>
      `;

      $$(".btn-pick-crest").forEach((b) => {
        b.onclick = () => {
          $("#cg-crest").value = b.dataset.c;
        };
      });

      $("#cg-cancel").onclick = () => {
        modal.hidden = true;
      };

      $("#create-guild-form").onsubmit = async (e) => {
        e.preventDefault();
        const name = $("#cg-name").value.trim();
        const crest = $("#cg-crest").value.trim() || "🛡️";
        const motto = $("#cg-motto").value.trim() || "Honor and victory";
        try {
          const res = await api("/api/guilds", {
            method: "POST",
            body: { name, crest, motto },
          });
          modal.hidden = true;
          window.MTG_SFX && window.MTG_SFX.play("victory");
          toast(`Guild "${res.guild.name}" created! ✨`);
          await loadData();
          renderView();
        } catch (err) {
          toast(err.message || "Failed to create guild");
        }
      };
    }

    /* Modal: Donate to Guild Vault */
    function openDonateModal(guild) {
      const modal = $("#modal");
      if (!modal) return;
      modal.hidden = false;
      modal.innerHTML = `
        <div class="sheet">
          <h2>🪙 Donate to ${escapeHtml(guild.name)}</h2>
          <p class="muted">Pool $TCG into the vault to increase guild level and unlock exclusive cosmetic auras.</p>
          <div style="padding:12px;background:rgba(255,255,255,0.03);border-radius:6px;margin:16px 0;font-size:13px">
            Current Vault: <b>${(guild.vault || 0).toLocaleString()} 🪙 $TCG</b> (Level ${guild.level || 1})
          </div>
          <form id="donate-form">
            <div class="field">
              <label>Donation Amount ($TCG)</label>
              <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
                <button type="button" class="btn small ghost btn-amt" data-a="100">100 🪙</button>
                <button type="button" class="btn small ghost btn-amt" data-a="500">500 🪙</button>
                <button type="button" class="btn small ghost btn-amt" data-a="1000">1,000 🪙</button>
                <input type="number" id="donate-amt" min="10" value="250" style="width:90px;text-align:center" required />
              </div>
            </div>
            <div class="toolbar" style="margin-top:20px">
              <button type="submit" class="btn gold">🪙 Confirm Donation</button>
              <button type="button" class="btn ghost" id="donate-cancel">Cancel</button>
            </div>
          </form>
        </div>
      `;

      $$(".btn-amt").forEach((b) => {
        b.onclick = () => {
          $("#donate-amt").value = b.dataset.a;
        };
      });

      $("#donate-cancel").onclick = () => {
        modal.hidden = true;
      };

      $("#donate-form").onsubmit = async (e) => {
        e.preventDefault();
        const amt = parseInt($("#donate-amt").value, 10) || 100;
        try {
          const res = await api(`/api/guilds/${guild.id}/donate`, {
            method: "POST",
            body: { amount: amt },
          });
          modal.hidden = true;
          window.MTG_SFX && window.MTG_SFX.play("coin");
          toast(res.message || "Donation sent! 🪙");
          if (res.userBalance != null && user) user.balance = res.userBalance;
          await loadData();
          renderView();
        } catch (err) {
          toast(err.message || "Donation failed");
        }
      };
    }

    /* Modal: Guild Hall & Message Board */
    function openGuildHallModal(guild) {
      const modal = $("#modal");
      if (!modal) return;
      modal.hidden = false;

      function renderHall() {
        const members = guild.members || [];
        const messages = guild.messages || [];

        modal.innerHTML = `
          <div class="sheet" style="max-width:640px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div style="display:flex;align-items:center;gap:12px">
                <span style="font-size:36px">${escapeHtml(guild.crest)}</span>
                <div>
                  <h2 style="margin:0">${escapeHtml(guild.name)}</h2>
                  <span class="chip gold">Level ${guild.level || 1} Guild</span>
                  <span class="chip blue">Vault: ${(guild.vault || 0).toLocaleString()} 🪙</span>
                </div>
              </div>
              <button type="button" class="btn small ghost" id="hall-close">✕</button>
            </div>

            <!-- Members List -->
            <div style="margin-top:16px">
              <h4 style="margin:0 0 8px 0">👥 Guild Roster (${members.length})</h4>
              <div style="display:flex;gap:8px;flex-wrap:wrap;max-height:100px;overflow-y:auto;padding:8px;background:rgba(0,0,0,0.25);border-radius:6px">
                ${
                  members.length
                    ? members
                        .map(
                          (m) => `
                    <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 8px;background:rgba(255,255,255,0.05);border-radius:4px;font-size:12px">
                      <span>🧙</span>
                      <b>${escapeHtml(m.displayName || m.username)}</b>
                      <span class="chip gold" style="font-size:10px">${escapeHtml(m.role || "Member")}</span>
                      ${m.donated ? `<span class="faint" style="font-size:10px">(${m.donated}🪙)</span>` : ""}
                    </div>
                  `
                        )
                        .join("")
                    : `<span class="faint">No members yet.</span>`
                }
              </div>
            </div>

            <!-- Guild Chat & Announcements -->
            <div style="margin-top:16px">
              <h4 style="margin:0 0 8px 0">💬 Guild Board Announcements</h4>
              <div id="hall-msgs" style="max-height:180px;overflow-y:auto;background:rgba(0,0,0,0.3);padding:10px;border-radius:6px;display:flex;flex-direction:column;gap:8px">
                ${
                  messages.length
                    ? messages
                        .map(
                          (m) => `
                    <div style="font-size:12px;padding:6px 8px;background:rgba(255,255,255,0.04);border-radius:4px">
                      <div style="display:flex;justify-content:space-between;color:var(--gold, #fbbf24)">
                        <b>${escapeHtml(m.author)}</b>
                        <span class="faint" style="font-size:10px">${new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      </div>
                      <div style="margin-top:3px">${escapeHtml(m.text)}</div>
                    </div>
                  `
                        )
                        .join("")
                    : `<div class="faint" style="text-align:center;padding:12px">No messages on the board yet. Post a dispatch!</div>`
                }
              </div>
              <form id="hall-msg-form" style="display:flex;gap:8px;margin-top:8px">
                <input type="text" id="hall-msg-input" placeholder="Post a strategy note or shout-out…" maxlength="240" style="flex:1" required />
                <button type="submit" class="btn small gold">Send ✉️</button>
              </form>
            </div>
          </div>
        `;

        $("#hall-close").onclick = () => {
          modal.hidden = true;
        };

        const msgBox = $("#hall-msgs");
        if (msgBox) msgBox.scrollTop = msgBox.scrollHeight;

        $("#hall-msg-form").onsubmit = async (e) => {
          e.preventDefault();
          const text = $("#hall-msg-input").value.trim();
          if (!text) return;
          try {
            const author = user ? (user.displayName || user.username) : me.name;
            await api(`/api/guilds/${guild.id}/message`, {
              method: "POST",
              body: { text, author },
            });
            if (!guild.messages) guild.messages = [];
            guild.messages.push({ author, text, timestamp: Date.now() });
            renderHall();
            toast("Message posted to Guild Board! ✨");
          } catch (err) {
            toast(err.message || "Failed to post message");
          }
        };
      }

      renderHall();
    }

    /* Modal: Create League */
    function openCreateLeagueModal() {
      const modal = $("#modal");
      if (!modal) return;
      modal.hidden = false;
      modal.innerHTML = `
        <div class="sheet">
          <h2>🏆 Host a Tournament League</h2>
          <p class="muted">Create an ongoing competitive circuit for your playgroup with custom entry fees and rules.</p>
          <form id="create-league-form" style="margin-top:16px">
            <div class="field">
              <label>League Title</label>
              <input type="text" id="cl-name" placeholder="e.g. Sylvan Masters Circuit #1" maxlength="60" required />
            </div>
            <div class="field" style="margin-top:12px">
              <label>Description & Flavor</label>
              <textarea id="cl-desc" rows="2" placeholder="Describe the season format, banlists, and match structure…"></textarea>
            </div>
            <div style="display:flex;gap:12px;margin-top:12px">
              <div class="field" style="flex:1">
                <label>Format</label>
                <select id="cl-format">
                  <option value="duel">Duel (60-card, 20 Life)</option>
                  <option value="commander">Commander (100-card, 40 Life)</option>
                  <option value="pauper">Pauper (Commons Only)</option>
                </select>
              </div>
              <div class="field" style="flex:1">
                <label>Entry Fee ($TCG)</label>
                <input type="number" id="cl-entry" min="0" value="100" />
              </div>
            </div>
            <div class="toolbar" style="margin-top:20px">
              <button type="submit" class="btn gold">🏆 Launch League</button>
              <button type="button" class="btn ghost" id="cl-cancel">Cancel</button>
            </div>
          </form>
        </div>
      `;

      $("#cl-cancel").onclick = () => {
        modal.hidden = true;
      };

      $("#create-league-form").onsubmit = async (e) => {
        e.preventDefault();
        const name = $("#cl-name").value.trim();
        const description = $("#cl-desc").value.trim();
        const format = $("#cl-format").value;
        const entryFee = parseInt($("#cl-entry").value, 10) || 0;
        try {
          const res = await api("/api/leagues", {
            method: "POST",
            body: { name, description, format, entryFee },
          });
          modal.hidden = true;
          window.MTG_SFX && window.MTG_SFX.play("victory");
          toast(`League "${res.league.name}" launched! 🏆`);
          await loadData();
          renderView();
        } catch (err) {
          toast(err.message || "Failed to create league");
        }
      };
    }

    renderView();
  };

  // Route alias for leagues tab
  window.MTG_VIEWS.leagues = function leaguesView() {
    return window.MTG_VIEWS.guilds({ tab: "leagues" });
  };
})();
