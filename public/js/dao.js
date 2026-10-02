/* ==========================================================================
   Multiverse DAO Treasury & Governance View
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
  } = window.MTG;

  window.MTG.openDaoModal = async function openDaoModal() {
    const second = window.MTG_SECOND;
    const user = getCachedUser(second);
    if(window.MTG.openModal) window.MTG.openModal(`<div class="wrap" id="dao-root" style="padding:16px; width: 100%; box-sizing: border-box; max-height: 80vh; overflow-y: auto;">Loading DAO Treasury… ✨</div>`);

    let daoData = null;
    try {
      daoData = await api("/api/dao");
    } catch (err) {
      $("#dao-root").innerHTML = `<div class="card-panel"><h2>Could not load DAO data</h2><p class="muted">${escapeHtml(err.message)}</p></div>`;
      return;
    }

    function renderDAO() {
      const balance = (daoData.balance || 0).toLocaleString();
      const fee = daoData.feePercent || 3;
      const totalCol = (daoData.totalCollected || 0).toLocaleString();
      const proposals = daoData.proposals || [];
      const txs = daoData.transactions || [];

      $("#dao-root").innerHTML = `
        <div class="hero">
          <div>
            <h1>🏛️ Multiverse DAO Sanctuary</h1>
            <p>Every staked wager contributes a <b>${fee}% fee</b> to the community treasury. Wizards govern treasury allocations to fund tournaments, AI deck archetypes, and card art caches!</p>
            <div class="toolbar" style="margin-top:16px">
              <button type="button" class="btn gold" id="dao-new-prop-btn">✨ Propose Initiative</button>
              <a class="btn ghost" onclick="window.MTG.openDeployModal ? window.MTG.openDeployModal() : window.MTG.go('/deploy'); return false;" href="#/deploy">🚀 Web3 Deployer</a>
              <a class="btn ghost" onclick="window.MTG.openTablesModal && window.MTG.openTablesModal(); return false;" href="#">🏰 Return to Tables</a>
            </div>
          </div>
        </div>

        <!-- DAO Treasury Vault Stats Card -->
        <div class="dao-vault-card card-panel">
          <div class="dao-stat-box">
            <div class="dao-stat-icon">🪙</div>
            <div class="dao-stat-info">
              <div class="dao-stat-label">Multiverse Treasury Vault</div>
              <div class="dao-stat-val"><b>${balance}</b> 🪙 Gold</div>
            </div>
          </div>
          <div class="dao-stat-box">
            <div class="dao-stat-icon">⚖️</div>
            <div class="dao-stat-info">
              <div class="dao-stat-label">Automated Wager Fee</div>
              <div class="dao-stat-val"><b id="dao-cur-fee-disp">${fee}%</b> of Pot</div>
            </div>
          </div>
          <div class="dao-stat-box">
            <div class="dao-stat-icon">🏆</div>
            <div class="dao-stat-info">
              <div class="dao-stat-label">Total Match Fees Collected</div>
              <div class="dao-stat-val"><b>${totalCol}</b> 🪙 Gold</div>
            </div>
          </div>
        </div>

        <!-- DAO Wager Fee Governance Panel -->
        <div class="card-panel dao-fee-panel" style="margin-top:20px;padding:20px;border-left:4px solid var(--accent, #f59e0b)">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px">
            <div>
              <h3 style="margin:0 0 4px 0">⚖️ Configure DAO Match Wager Fee</h3>
              <p class="muted" style="margin:0;font-size:13px">Wizards govern the treasury tax deducted from match pots to fund multiverse initiatives and bounties.</p>
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span class="muted" style="font-size:12px">Presets:</span>
              <button type="button" class="btn small ghost btn-fee-preset ${fee === 1 ? "gold" : ""}" data-fee="1">1%</button>
              <button type="button" class="btn small ghost btn-fee-preset ${fee === 2 ? "gold" : ""}" data-fee="2">2%</button>
              <button type="button" class="btn small ghost btn-fee-preset ${fee === 3 ? "gold" : ""}" data-fee="3">3% (Default)</button>
              <button type="button" class="btn small ghost btn-fee-preset ${fee === 5 ? "gold" : ""}" data-fee="5">5%</button>
              <button type="button" class="btn small ghost btn-fee-preset ${fee === 10 ? "gold" : ""}" data-fee="10">10%</button>
              <div style="display:inline-flex;align-items:center;gap:4px;margin-left:6px">
                <input type="number" id="dao-fee-input" min="0" max="25" value="${fee}" style="width:64px;text-align:center;padding:5px;border-radius:4px" />
                <span style="font-weight:700">%</span>
              </div>
              <button type="button" class="btn small gold" id="dao-fee-save-btn">💾 Update Fee</button>
            </div>
          </div>
          <div id="dao-fee-preview" class="faint" style="margin-top:12px;font-size:13px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:6px">
            Simulation: In a 1,000 🪙 pot match, Winner takes <b>${(1000 - Math.floor(1000 * fee / 100)).toLocaleString()} 🪙</b> and DAO Treasury receives <b>${Math.floor(1000 * fee / 100).toLocaleString()} 🪙</b>.
          </div>
        </div>

        <!-- Community Governance Proposals -->
        <div class="section-title" style="display:flex;justify-content:space-between;align-items:center;margin-top:32px">
          <span>📜 Community Proposals & Bounties (${proposals.length})</span>
          <button type="button" class="btn small ghost" id="dao-refresh-btn">🔄 Refresh</button>
        </div>

        <div class="dao-proposals-grid">
          ${
            proposals.length
              ? proposals
                  .map((p) => {
                    const totalVotes = (p.votesFor || 0) + (p.votesAgainst || 0);
                    const forPct = totalVotes > 0 ? Math.round(((p.votesFor || 0) / totalVotes) * 100) : 50;
                    const hasVoted = user && p.voters && p.voters[user.id];
                    return `
              <div class="dao-prop-card card-panel" data-prop-id="${p.id}">
                <div class="dao-prop-head">
                  <span class="chip gold" style="font-size:11px">Requested: <b>${(p.cost || 0).toLocaleString()} 🪙</b></span>
                  <span class="chip ${p.status === "active" ? "green" : "muted"}">${p.status === "active" ? "✨ Active Voting" : "Passed"}</span>
                </div>
                <h3 class="dao-prop-title">${escapeHtml(p.title)}</h3>
                <p class="dao-prop-desc">${escapeHtml(p.description)}</p>
                <div class="dao-prop-author faint">Proposed by <b>${escapeHtml(p.creatorName || p.creator)}</b></div>
                
                <div class="dao-vote-bar-wrap">
                  <div class="dao-vote-bar-labels">
                    <span style="color:var(--life)">FOR: ${(p.votesFor || 0).toLocaleString()} (${forPct}%)</span>
                    <span style="color:var(--danger)">AGAINST: ${(p.votesAgainst || 0).toLocaleString()} (${100 - forPct}%)</span>
                  </div>
                  <div class="dao-vote-track">
                    <div class="dao-vote-fill" style="width: ${forPct}%"></div>
                  </div>
                </div>

                <div class="dao-prop-actions">
                  ${
                    hasVoted
                      ? `<span class="faint" style="font-size:12px">✅ You voted <b>${hasVoted.vote.toUpperCase()}</b> (${hasVoted.weight.toLocaleString()} power)</span>`
                      : `
                    <button type="button" class="btn small gold btn-vote" data-vote="for" data-pid="${p.id}">👍 Vote FOR</button>
                    <button type="button" class="btn small ghost btn-vote" data-vote="against" data-pid="${p.id}">👎 Vote AGAINST</button>
                  `
                  }
                </div>
              </div>
            `;
                  })
                  .join("")
              : `<div class="empty">No proposals active yet. Be the first wizard to submit one!</div>`
          }
        </div>

        <!-- Treasury Ledger / Transaction Log -->
        <div class="section-title" style="margin-top:36px">📖 Treasury Ledger & Fee Audit Trail</div>
        <div class="card-panel" style="padding:0;overflow:hidden">
          <table class="dao-ledger-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Amount</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              ${
                txs.length
                  ? txs
                      .slice(0, 50)
                      .map((t) => {
                        const date = new Date(t.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                        const isFee = t.type === "wager_fee";
                        return `
                  <tr>
                    <td class="faint">${date}</td>
                    <td><span class="chip ${isFee ? "gold" : "ghost"}" style="font-size:11px">${isFee ? "🪙 3% Match Fee" : t.type}</span></td>
                    <td style="color:${isFee ? "var(--life)" : "var(--gold)"};font-weight:700">+${(t.amount || 0).toLocaleString()} 🪙</td>
                    <td>${escapeHtml(t.description)}</td>
                  </tr>
                `;
                      })
                      .join("")
                  : `<tr><td colspan="4" class="empty">No transactions recorded yet.</td></tr>`
              }
            </tbody>
          </table>
        </div>
      `;

      // Wire Vote Buttons
      $$(".btn-vote").forEach((btn) => {
        btn.onclick = async (e) => {
          e.preventDefault();
          const pid = btn.dataset.pid;
          const vote = btn.dataset.vote;
          if (!user) {
            toast("Please log in to vote in the DAO!");
            openAuthModal("login");
            return;
          }
          try {
            const res = await api("/api/dao/vote", {
              method: "POST",
              body: { proposalId: pid, vote },
            });
            window.MTG_SFX && window.MTG_SFX.play("coin");
            const rect = btn.getBoundingClientRect();
            sparkle(rect.left + rect.width / 2, rect.top + rect.height / 2, "sparkle");
            toast(res.message || "Vote recorded! ✨");
            daoData = await api("/api/dao");
            renderDAO();
          } catch (err) {
            toast(err.message || "Could not cast vote");
          }
        };
      });

      // Fee Editor Preset Buttons & Input
      const feeInput = $("#dao-fee-input");
      const feePreview = $("#dao-fee-preview");
      function updateSimulation(val) {
        const f = Math.max(0, Math.min(25, Number(val) || 0));
        const feeGold = Math.floor(1000 * f / 100);
        const winGold = 1000 - feeGold;
        if (feePreview) {
          feePreview.innerHTML = `Simulation: In a 1,000 🪙 pot match, Winner takes <b>${winGold.toLocaleString()} 🪙</b> and DAO Treasury receives <b>${feeGold.toLocaleString()} 🪙</b>.`;
        }
      }
      $$(".btn-fee-preset").forEach((btn) => {
        btn.onclick = () => {
          const val = btn.dataset.fee;
          if (feeInput) feeInput.value = val;
          $$(".btn-fee-preset").forEach((b) => b.classList.toggle("gold", b === btn));
          updateSimulation(val);
        };
      });
      if (feeInput) {
        feeInput.oninput = () => {
          $$(".btn-fee-preset").forEach((b) => b.classList.toggle("gold", b.dataset.fee === feeInput.value));
          updateSimulation(feeInput.value);
        };
      }
      const saveFeeBtn = $("#dao-fee-save-btn");
      if (saveFeeBtn) {
        saveFeeBtn.onclick = async () => {
          const newFee = feeInput ? parseInt(feeInput.value, 10) : 3;
          if (isNaN(newFee) || newFee < 0 || newFee > 25) {
            toast("Fee must be between 0% and 25%");
            return;
          }
          try {
            const res = await api("/api/dao/fee", {
              method: "POST",
              body: { feePercent: newFee },
            });
            window.MTG_SFX && window.MTG_SFX.play("coin");
            const rect = saveFeeBtn.getBoundingClientRect();
            sparkle(rect.left + rect.width / 2, rect.top + rect.height / 2, "sparkle");
            toast(res.message || `Match wager fee set to ${newFee}%! ✨`);
            daoData = await api("/api/dao");
            renderDAO();
          } catch (err) {
            toast(err.message || "Could not update fee");
          }
        };
      }

      // Refresh Button
      $("#dao-refresh-btn").onclick = async () => {
        daoData = await api("/api/dao");
        renderDAO();
        toast("DAO Treasury refreshed ✨");
      };

      // New Proposal Button
      $("#dao-new-prop-btn").onclick = () => {
        if (!user) {
          toast("Please log in to propose a community initiative!");
          openAuthModal("login");
          return;
        }
        openProposalModal();
      };
      const m = document.getElementById("modal");
      if (m && window.MTG?.bringToFront) window.MTG.bringToFront(m);
    }

    function openProposalModal() {
      const modal = $("#modal");
      if (!modal) return;
      if (window.MTG?.bringToFront) window.MTG.bringToFront(modal);
      modal.hidden = false;
      modal.innerHTML = `
        <div class="sheet">
          <h2>✨ Propose Multiverse Initiative</h2>
          <p class="muted">Submit an initiative for community funding from the Multiverse DAO Treasury.</p>
          <form id="prop-form" style="margin-top:16px">
            <div class="field">
              <label>Initiative Title</label>
              <input type="text" id="prop-title" required minlength="5" maxlength="100" placeholder="e.g. Host Friday Commander Tournament with 5,000 Gold Bounty" />
            </div>
            <div class="field">
              <label>Description & Multiverse Impact</label>
              <textarea id="prop-desc" required minlength="10" rows="4" placeholder="Explain the initiative, rules, and how it benefits players on the LAN..."></textarea>
            </div>
            <div class="field">
              <label>Requested Treasury Gold (🪙)</label>
              <input type="number" id="prop-cost" min="100" max="10000" value="1000" required />
            </div>
            <div class="row" style="margin-top:18px;gap:10px">
              <button type="submit" class="btn gold">🚀 Submit Proposal</button>
              <button type="button" class="btn ghost" id="prop-cancel">Cancel</button>
            </div>
          </form>
        </div>
      `;

      $("#prop-cancel").onclick = () => {
        modal.hidden = true;
      };

      $("#prop-form").onsubmit = async (e) => {
        e.preventDefault();
        const title = $("#prop-title").value.trim();
        const description = $("#prop-desc").value.trim();
        const cost = parseInt($("#prop-cost").value, 10) || 0;
        try {
          await api("/api/dao/propose", {
            method: "POST",
            body: { title, description, cost },
          });
          modal.hidden = true;
          window.MTG_SFX && window.MTG_SFX.play("victory");
          toast("Proposal submitted to the DAO! ✨");
          daoData = await api("/api/dao");
          renderDAO();
        } catch (err) {
          toast(err.message || "Failed to submit proposal");
        }
      };
    }

    renderDAO();
  };
})();
