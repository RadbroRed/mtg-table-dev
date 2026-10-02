/* ==========================================================================
   Multiverse Grand Arbiter & Admin Panel View
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
  } = window.MTG;

  window.MTG_VIEWS.admin = async function adminView() {
    const second = window.MTG_SECOND;
    const user = getCachedUser(second);
    const app = document.getElementById("app");

    app.innerHTML = `${nav("admin")}<div class="page"><div class="wrap" id="admin-root">Loading Grand Arbiter Panel… 👑</div></div>`;
    bindNav();

    let adminKey = sessionStorage.getItem("mtg-admin-key") || (user && user.isAdmin ? "arcane-dao-2026" : "");

    async function loadData() {
      const headers = adminKey ? { "x-admin-key": adminKey } : {};
      return await api("/api/admin/overview", { headers });
    }

    let overview = null;
    try {
      overview = await loadData();
    } catch (err) {
      // Prompt for admin key if not logged in as admin
      renderPasskeyPrompt();
      return;
    }

    function renderPasskeyPrompt() {
      $("#admin-root").innerHTML = `
        <div class="card-panel" style="max-width:480px;margin:40px auto;text-align:center">
          <h2>👑 Grand Arbiter Access</h2>
          <p class="muted">This sanctum is reserved for Multiverse Administrators. Please log in as an administrator (e.g. <b>amber</b>) or enter the Admin Passkey.</p>
          <form id="admin-pass-form" style="margin-top:20px">
            <div class="field">
              <label>Admin Passkey</label>
              <input type="password" id="admin-pass-input" placeholder="••••••••" required />
            </div>
            <button type="submit" class="btn gold" style="margin-top:12px;width:100%">🌟 Unlock Sanctum</button>
          </form>
        </div>
      `;

      $("#admin-pass-form").onsubmit = async (e) => {
        e.preventDefault();
        const val = $("#admin-pass-input").value.trim();
        adminKey = val;
        sessionStorage.setItem("mtg-admin-key", val);
        try {
          overview = await loadData();
          renderAdmin();
          toast("Sanctum unlocked! Welcome, Arbiter. 👑");
        } catch (err) {
          toast("Invalid admin passkey or insufficient privileges.");
        }
      };
    }

    function renderAdmin() {
      if (!overview) return;
      const s = overview.stats || {};
      const usersList = overview.users || [];
      const tablesList = overview.tables || [];
      const dao = overview.dao || {};

      $("#admin-root").innerHTML = `
        <div class="hero">
          <div>
            <h1>👑 Multiverse Admin & Grand Arbiter</h1>
            <p>Control the multiverse economy, manage user balances, configure the DAO automated wager tax, and oversee live matches.</p>
            <div class="toolbar" style="margin-top:16px">
              <button type="button" class="btn small gold" onclick="window.MTG.openDeployModal ? window.MTG.openDeployModal() : window.MTG.go('/deploy');">🚀 Web3 Contract Deployer</button>
              <button type="button" class="btn small ghost" id="admin-refresh-btn">🔄 Refresh Dashboard</button>
              <a class="btn small ghost" onclick="window.MTG.go('/dao'); return false;" href="#">🏛️ View Public DAO Page</a>
              <a class="btn small ghost" onclick="window.MTG.openTablesModal && window.MTG.openTablesModal(); return false;" href="#">🏰 Return to Tables</a>
            </div>
          </div>
        </div>

        <!-- Economy Stats Cards -->
        <div class="dao-vault-card card-panel" style="margin-top:20px">
          <div class="dao-stat-box">
            <div class="dao-stat-icon">👥</div>
            <div class="dao-stat-info">
              <div class="dao-stat-label">Registered Wizards</div>
              <div class="dao-stat-val"><b>${s.totalUsers || 0}</b> Accounts</div>
            </div>
          </div>
          <div class="dao-stat-box">
            <div class="dao-stat-icon">🪙</div>
            <div class="dao-stat-info">
              <div class="dao-stat-label">$TCG in Circulation</div>
              <div class="dao-stat-val"><b>${(s.totalGold || 0).toLocaleString()}</b> 🪙 $TCG</div>
            </div>
          </div>
          <div class="dao-stat-box">
            <div class="dao-stat-icon">🏛️</div>
            <div class="dao-stat-info">
              <div class="dao-stat-label">DAO Treasury Vault</div>
              <div class="dao-stat-val"><b>${(s.daoBalance || 0).toLocaleString()}</b> 🪙 (${s.daoFeePercent || 3}% Fee)</div>
            </div>
          </div>
          <div class="dao-stat-box">
            <div class="dao-stat-icon">⚔️</div>
            <div class="dao-stat-info">
              <div class="dao-stat-label">Active Tables</div>
              <div class="dao-stat-val"><b>${s.activeTables || 0}</b> Live</div>
            </div>
          </div>
        </div>

        <!-- DAO Treasury Admin Adjustments -->
        <div class="section-title" style="margin-top:28px">🏛️ DAO Treasury Configuration</div>
        <div class="grid-2">
          <div class="card-panel">
            <h3>⚖️ Automated Wager Fee Percentage</h3>
            <p class="muted">Adjust the automated cut taken from every wager pot (default 3%). Funds deposit directly into the DAO Treasury.</p>
            <div class="row" style="gap:10px;margin-top:12px">
              <input type="number" id="adm-fee-input" min="0" max="20" value="${dao.feePercent || 3}" style="width:90px" />
              <button type="button" class="btn gold" id="adm-set-fee-btn">Save Fee %</button>
            </div>
          </div>

          <div class="card-panel">
            <h3>💰 Treasury Grant / Withdrawal</h3>
            <p class="muted">Add genesis funds or spend from the Multiverse DAO Treasury balance.</p>
            <div class="row" style="gap:10px;margin-top:12px">
              <input type="number" id="adm-dao-amount" placeholder="Amount (+/-)" style="width:130px" />
              <input type="text" id="adm-dao-reason" placeholder="Reason (e.g. Tournament Grant)" class="grow" />
              <button type="button" class="btn gold" id="adm-adjust-dao-btn">Execute</button>
            </div>
          </div>
        </div>

        <!-- User Accounts Management -->
        <div class="section-title" style="margin-top:32px;display:flex;justify-content:space-between;align-items:center">
          <span>🧙 Player Accounts & Balances (${usersList.length})</span>
          <input type="text" id="user-search" placeholder="Search wizard name..." style="padding:4px 10px;border-radius:6px;background:var(--bg);border:1px solid var(--line);font-size:12px;width:200px" />
        </div>
        <div class="card-panel" style="padding:0;overflow:hidden">
          <table class="dao-ledger-table" id="users-admin-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Display Name</th>
                <th>$TCG Balance</th>
                <th>Record (W / L)</th>
                <th>Streak</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${usersList
                .map(
                  (u) => `
                <tr data-un="${escapeHtml(u.username)}">
                  <td><b>${escapeHtml(u.username)}</b></td>
                  <td>${escapeHtml(u.displayName || u.username)}</td>
                  <td style="color:var(--gold);font-weight:700">🪙 ${(u.balance || 0).toLocaleString()}</td>
                  <td class="faint">${u.wins || 0}W · ${u.losses || 0}L</td>
                  <td>${u.stats && u.stats.streak ? `🔥 ${u.stats.streak}` : "0"}</td>
                  <td>${u.isAdmin ? '<span class="chip gold" style="font-size:10px">Admin</span>' : '<span class="chip ghost" style="font-size:10px">Wizard</span>'}</td>
                  <td>
                    <button type="button" class="btn small gold btn-give-gold" data-uid="${u.id}" data-un="${u.username}">+ Grant</button>
                    <button type="button" class="btn small ghost btn-take-gold" data-uid="${u.id}" data-un="${u.username}">- Deduct</button>
                  </td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>

        <!-- Active Tables Manager -->
        <div class="section-title" style="margin-top:32px">🏰 Active Match Tables (${tablesList.length})</div>
        <div class="card-panel" style="padding:0;overflow:hidden">
          <table class="dao-ledger-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Table Name</th>
                <th>Format</th>
                <th>Wager (Pot)</th>
                <th>Players Seated</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${
                tablesList.length
                  ? tablesList
                      .map(
                        (t) => `
                <tr>
                  <td><b>${escapeHtml(t.code)}</b></td>
                  <td>${escapeHtml(t.name)}</td>
                  <td><span class="chip ghost" style="font-size:11px">${escapeHtml(t.format)}</span></td>
                  <td>${t.wager ? `<span class="chip gold" style="font-size:11px">🪙 ${t.wager} (Pot: ${t.pot} 🪙)</span>` : "Casual"}</td>
                  <td>${t.seats.filter((s) => s.name).length}/2 (${t.seats.map((s) => s.name || "open").join(", ")})</td>
                  <td>${t.started ? "In Progress" : "Waiting"}</td>
                  <td>
                    <button type="button" class="btn small ghost btn-close-table" data-code="${t.code}" style="color:var(--danger)">Force Close</button>
                  </td>
                </tr>
              `
                      )
                      .join("")
                  : `<tr><td colspan="7" class="empty">No live tables currently active.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      `;

      // Wire Admin Actions
      $("#admin-refresh-btn").onclick = async () => {
        overview = await loadData();
        renderAdmin();
        toast("Dashboard refreshed ✨");
      };

      // Set Fee %
      $("#adm-set-fee-btn").onclick = async () => {
        const fee = parseFloat($("#adm-fee-input").value) || 3;
        try {
          const res = await api("/api/admin/dao/fee", {
            method: "POST",
            headers: { "x-admin-key": adminKey },
            body: { feePercent: fee },
          });
          toast(`Automated wager fee set to ${res.feePercent}%! ✨`);
          overview = await loadData();
          renderAdmin();
        } catch (err) {
          toast(err.message || "Failed to update fee");
        }
      };

      // Adjust DAO Balance
      $("#adm-adjust-dao-btn").onclick = async () => {
        const amount = parseInt($("#adm-dao-amount").value, 10) || 0;
        const description = $("#adm-dao-reason").value.trim();
        if (!amount) return toast("Enter a valid amount");
        try {
          await api("/api/admin/dao/adjust", {
            method: "POST",
            headers: { "x-admin-key": adminKey },
            body: { amount, description },
          });
          toast(`DAO Treasury adjusted by ${amount > 0 ? "+" : ""}${amount} $TCG! ✨`);
          overview = await loadData();
          renderAdmin();
        } catch (err) {
          toast(err.message || "Failed to adjust treasury");
        }
      };

      // Give / Deduct Gold Buttons
      $$(".btn-give-gold").forEach((btn) => {
        btn.onclick = () => promptGoldAdjustment(btn.dataset.uid, btn.dataset.un, true);
      });
      $$(".btn-take-gold").forEach((btn) => {
        btn.onclick = () => promptGoldAdjustment(btn.dataset.uid, btn.dataset.un, false);
      });

      // Force Close Table
      $$(".btn-close-table").forEach((btn) => {
        btn.onclick = async () => {
          const code = btn.dataset.code;
          if (!confirm(`Force close table ${code}? (Wagers will be refunded automatically)`)) return;
          try {
            await api("/api/admin/tables/close", {
              method: "POST",
              headers: { "x-admin-key": adminKey },
              body: { code },
            });
            toast(`Table ${code} closed and refunded.`);
            overview = await loadData();
            renderAdmin();
          } catch (err) {
            toast(err.message || "Could not close table");
          }
        };
      });

      // Search Filter
      const searchInput = $("#user-search");
      if (searchInput) {
        searchInput.oninput = () => {
          const q = searchInput.value.toLowerCase().trim();
          $$("#users-admin-table tbody tr").forEach((tr) => {
            const un = tr.getAttribute("data-un") || "";
            tr.style.display = un.toLowerCase().includes(q) ? "" : "none";
          });
        };
      }
    }

    async function promptGoldAdjustment(uid, username, isGrant) {
      const defAmt = isGrant ? 500 : -250;
      const raw = prompt(`${isGrant ? "Grant" : "Deduct"} $TCG for ${username}:`, defAmt);
      if (!raw) return;
      const amount = parseInt(raw, 10);
      if (isNaN(amount) || amount === 0) return;
      try {
        const res = await api("/api/admin/user/gold", {
          method: "POST",
          headers: { "x-admin-key": adminKey },
          body: { targetUserId: uid, amount, reason: `Admin ${isGrant ? "grant" : "deduction"}` },
        });
        toast(`${amount > 0 ? "+" : ""}${amount} $TCG updated for ${username}! New balance: ${(res.user.tcgBalance ?? res.user.balance).toLocaleString()} 🪙`);
        overview = await loadData();
        renderAdmin();
      } catch (err) {
        toast(err.message || "Failed to adjust user balance");
      }
    }

    renderAdmin();
  };
})();
