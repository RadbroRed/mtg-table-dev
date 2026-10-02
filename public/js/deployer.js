/* ==========================================================================
   Web3 Smart Contract Deployer & Testnet Manager
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

  const AMBER_WALLET = "0x8233B657D4a5713b606Ba12321C4eC901Dc85cE9";
  const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7"; // 11155111

  window.MTG_VIEWS = window.MTG_VIEWS || {};

  window.MTG_VIEWS.deploy = async function deployerView() {
    const second = window.MTG_SECOND;
    const user = getCachedUser(second);
    const app = document.getElementById("app");

    app.innerHTML = `${nav("admin")}<div class="page"><div class="wrap" id="deployer-root" style="max-width:960px;margin:0 auto;padding:20px;">Loading Web3 Deployer… ⚡</div></div>`;
    bindNav();

    await renderDeployer();
  };

  window.MTG.openDeployModal = async function openDeployModal() {
    if (window.MTG.openModal) {
      window.MTG.openModal(`<div class="wrap" id="deployer-root" style="padding:16px; width:100%; box-sizing:border-box; max-height:85vh; overflow-y:auto;">Loading Web3 Deployer… ⚡</div>`);
      await renderDeployer();
    } else {
      window.MTG.go("/deploy");
    }
  };

  async function renderDeployer() {
    const root = document.getElementById("deployer-root");
    if (!root) return;

    let contractsMeta = null;
    try {
      contractsMeta = await api("/api/contracts");
    } catch (e) {
      root.innerHTML = `<div class="card-panel"><h3>Could not load contract metadata</h3><p class="muted">${escapeHtml(e.message)}</p></div>`;
      return;
    }

    const savedAddrs = contractsMeta.addresses || {};
    const artifacts = contractsMeta.artifacts || {};

    let currentAccount = null;
    let currentChainId = null;
    let ethBalance = "0.0";
    let isAmber = false;

    // Check EVM Provider
    const hasEVM = !!window.ethereum;
    if (hasEVM) {
      try {
        const accs = await window.ethereum.request({ method: "eth_accounts" });
        if (accs && accs.length) {
          currentAccount = accs[0];
          isAmber = currentAccount.toLowerCase() === AMBER_WALLET.toLowerCase();
        }
        currentChainId = await window.ethereum.request({ method: "eth_chainId" });
        if (currentAccount && window.ethers) {
          const provider = new window.ethers.BrowserProvider(window.ethereum);
          const bal = await provider.getBalance(currentAccount);
          ethBalance = window.ethers.formatEther(bal);
        }
      } catch (err) {
        console.warn("[deployer] Web3 check warning:", err);
      }
    }

    const isSepolia = currentChainId === SEPOLIA_CHAIN_ID_HEX || currentChainId === "11155111" || currentChainId === 11155111;

    root.innerHTML = `
      <div class="hero" style="margin-bottom:20px;">
        <div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <h1 style="margin:0;">🚀 On-Chain Contract Deployer & Testnet Manager</h1>
            <span class="chip gold">Ethereum Sepolia</span>
          </div>
          <p style="margin-top:8px;">Deploy official ERC-20 tokens, the deposit vault, and the wager escrow contract directly from the <b>main (Amber) wallet</b>.</p>
        </div>
      </div>

      <!-- Wallet Connection Status Card -->
      <div class="card-panel" style="margin-bottom:20px;padding:20px;border-left:4px solid ${isAmber ? "#22c55e" : (currentAccount ? "#f59e0b" : "#ef4444")};">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;">
          <div>
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;" class="faint">Deployer Wallet Status</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
              <span style="font-size:22px;">${isAmber ? "👑" : (currentAccount ? "🦊" : "🔌")}</span>
              <span style="font-size:16px;font-weight:700;word-break:break-all;">
                ${currentAccount ? escapeHtml(currentAccount) : "No EVM Wallet Connected"}
              </span>
            </div>
            <div style="margin-top:6px;font-size:13px;">
              ${
                isAmber
                  ? `<span style="color:#22c55e;font-weight:600;">✓ Verified Main Amber Wallet</span>`
                  : (currentAccount
                      ? `<span style="color:#f59e0b;">Connected: ${escapeHtml(currentAccount.slice(0,8))}… (Target Amber wallet: ${AMBER_WALLET.slice(0,8)}…)</span>`
                      : `<span class="muted">Connect MetaMask or browser wallet with the Amber key to deploy</span>`)
              }
              ${currentAccount ? ` · <b>${parseFloat(ethBalance).toFixed(4)} Sepolia ETH</b>` : ""}
              ${!isSepolia && currentAccount ? ` · <span style="color:#ef4444;font-weight:bold;">⚠️ Please switch network to Sepolia</span>` : ""}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${
              !currentAccount
                ? `<button type="button" class="btn gold" id="deployer-connect-btn">🦊 Connect Wallet</button>`
                : (!isSepolia
                    ? `<button type="button" class="btn gold" id="deployer-switch-btn">🔄 Switch to Sepolia</button>`
                    : `<button type="button" class="btn ghost small" id="deployer-connect-btn">Switch Account</button>`)
            }
            <button type="button" class="btn ghost small" id="deployer-refresh-btn">🔄 Refresh</button>
          </div>
        </div>
      </div>

      <!-- Action Banner: One-Click Deploy -->
      <div class="card-panel" style="background:linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(139, 92, 246, 0.1));border:1px solid var(--gold);padding:20px;margin-bottom:24px;border-radius:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;">
          <div>
            <h3 style="margin:0 0 6px 0;display:flex;align-items:center;gap:8px;">
              <span>⚡ Full Deployment Pipeline</span>
              <span class="chip gold" style="font-size:11px;">Recommended</span>
            </h3>
            <p class="muted" style="margin:0;font-size:13px;max-width:620px;">
              Deploys <b>$TCG (1bn supply, .0001 ETH buy)</b>, <b>CryptoGameDepositVault</b>, <b>$GG (1tn supply into Vault for Amber)</b>, and <b>CryptoGameWagerEscrow</b> sequentially in 4 MetaMask signatures, and saves addresses automatically.
            </p>
          </div>
          <button type="button" class="btn gold" id="btn-deploy-all" style="padding:10px 24px;font-size:15px;font-weight:700;">
            🚀 Deploy All Contracts Sequentially
          </button>
        </div>
        <div id="deploy-all-status" style="margin-top:14px;display:none;padding:12px;background:rgba(0,0,0,0.3);border-radius:8px;font-size:13px;"></div>
      </div>

      <!-- Contracts Grid -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(420px, 1fr));gap:20px;">

        <!-- 1. $TCG Token -->
        <div class="card-panel" style="padding:20px;position:relative;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
            <div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:24px;">🪙</span>
                <h3 style="margin:0;">$TCG Token</h3>
              </div>
              <div class="faint" style="font-size:12px;margin-top:2px;">The Crypto Game Official Token</div>
            </div>
            <span class="chip ${savedAddrs.TCGToken && savedAddrs.TCGToken !== '0x0000000000000000000000000000000000000000' ? 'gold' : 'muted'}">
              ${savedAddrs.TCGToken && savedAddrs.TCGToken !== '0x0000000000000000000000000000000000000000' ? '✓ Deployed' : 'Not Deployed'}
            </span>
          </div>
          <ul style="font-size:13px;color:var(--text-dim);margin:0 0 16px 0;padding-left:18px;line-height:1.6;">
            <li><b>Supply:</b> 1,000,000,000 TCG (1 Billion)</li>
            <li><b>Instant Buy Rate:</b> 0.0001 ETH per 1 TCG (1 ETH = 10,000 TCG)</li>
            <li><b>Public Sale Pool:</b> 200,000,000 TCG held in contract</li>
            <li><b>Amber Initial Mint:</b> 800,000,000 TCG to Amber wallet</li>
          </ul>
          <div style="font-size:12px;margin-bottom:14px;word-break:break-all;">
            <b>Address:</b> <span id="tcg-addr-disp" class="faint">${escapeHtml(savedAddrs.TCGToken || "None")}</span>
            ${savedAddrs.TCGToken && savedAddrs.TCGToken !== '0x0000000000000000000000000000000000000000' ? `<a href="https://sepolia.etherscan.io/address/${savedAddrs.TCGToken}" target="_blank" style="color:var(--gold);margin-left:6px;">↗ Etherscan</a>` : ""}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn small gold" id="btn-deploy-tcg">Deploy $TCG Token</button>
            ${savedAddrs.TCGToken && savedAddrs.TCGToken !== '0x0000000000000000000000000000000000000000' ? `<button type="button" class="btn small ghost" id="btn-test-buy-tcg">⚡ Buy 10 TCG (0.001 ETH)</button>` : ""}
          </div>
          <div id="tcg-status" style="margin-top:10px;font-size:12px;"></div>
        </div>

        <!-- 2. Deposit Vault -->
        <div class="card-panel" style="padding:20px;position:relative;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
            <div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:24px;">🏦</span>
                <h3 style="margin:0;">CryptoGameDepositVault</h3>
              </div>
              <div class="faint" style="font-size:12px;margin-top:2px;">Simple Deposit Vault for $TCG & $GG</div>
            </div>
            <span class="chip ${savedAddrs.CryptoGameDepositVault && savedAddrs.CryptoGameDepositVault !== '0x0000000000000000000000000000000000000000' ? 'gold' : 'muted'}">
              ${savedAddrs.CryptoGameDepositVault && savedAddrs.CryptoGameDepositVault !== '0x0000000000000000000000000000000000000000' ? '✓ Deployed' : 'Not Deployed'}
            </span>
          </div>
          <ul style="font-size:13px;color:var(--text-dim);margin:0 0 16px 0;padding-left:18px;line-height:1.6;">
            <li><b>Tokens:</b> Supports both $TCG and $GG deposits & withdrawals</li>
            <li><b>Access:</b> Only Amber can access/administer vault reserves</li>
            <li><b>Vault Reserve:</b> Holds the 1 Trillion $GG token reserve</li>
            <li><b>Security:</b> Ownable by Amber (${AMBER_WALLET.slice(0, 8)}…)</li>
          </ul>
          <div style="font-size:12px;margin-bottom:14px;word-break:break-all;">
            <b>Address:</b> <span id="vault-addr-disp" class="faint">${escapeHtml(savedAddrs.CryptoGameDepositVault || "None")}</span>
            ${savedAddrs.CryptoGameDepositVault && savedAddrs.CryptoGameDepositVault !== '0x0000000000000000000000000000000000000000' ? `<a href="https://sepolia.etherscan.io/address/${savedAddrs.CryptoGameDepositVault}" target="_blank" style="color:var(--gold);margin-left:6px;">↗ Etherscan</a>` : ""}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn small gold" id="btn-deploy-vault">Deploy Deposit Vault</button>
            ${savedAddrs.CryptoGameDepositVault && savedAddrs.CryptoGameDepositVault !== '0x0000000000000000000000000000000000000000' ? `<button type="button" class="btn small ghost" id="btn-check-vault">🔍 Check Vault Balances</button>` : ""}
          </div>
          <div id="vault-status" style="margin-top:10px;font-size:12px;"></div>
        </div>

        <!-- 3. $GG Token -->
        <div class="card-panel" style="padding:20px;position:relative;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
            <div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:24px;">💎</span>
                <h3 style="margin:0;">$GG Token</h3>
              </div>
              <div class="faint" style="font-size:12px;margin-top:2px;">Good Game Ecosystem Token</div>
            </div>
            <span class="chip ${savedAddrs.GGToken && savedAddrs.GGToken !== '0x0000000000000000000000000000000000000000' ? 'gold' : 'muted'}">
              ${savedAddrs.GGToken && savedAddrs.GGToken !== '0x0000000000000000000000000000000000000000' ? '✓ Deployed' : 'Not Deployed'}
            </span>
          </div>
          <ul style="font-size:13px;color:var(--text-dim);margin:0 0 16px 0;padding-left:18px;line-height:1.6;">
            <li><b>Supply:</b> 1,000,000,000,000 GG (1 Trillion)</li>
            <li><b>Initial Recipient:</b> Deposit Vault contract</li>
            <li><b>Restricted Access:</b> Locked in Deposit Vault; only Amber can access</li>
            <li><b>Owner:</b> Amber (${AMBER_WALLET.slice(0, 8)}…)</li>
          </ul>
          <div style="font-size:12px;margin-bottom:14px;word-break:break-all;">
            <b>Address:</b> <span id="gg-addr-disp" class="faint">${escapeHtml(savedAddrs.GGToken || "None")}</span>
            ${savedAddrs.GGToken && savedAddrs.GGToken !== '0x0000000000000000000000000000000000000000' ? `<a href="https://sepolia.etherscan.io/address/${savedAddrs.GGToken}" target="_blank" style="color:var(--gold);margin-left:6px;">↗ Etherscan</a>` : ""}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn small gold" id="btn-deploy-gg">Deploy $GG Token</button>
          </div>
          <div id="gg-status" style="margin-top:10px;font-size:12px;"></div>
        </div>

        <!-- 4. Wager Escrow -->
        <div class="card-panel" style="padding:20px;position:relative;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
            <div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:24px;">⚔️</span>
                <h3 style="margin:0;">CryptoGameWagerEscrow</h3>
              </div>
              <div class="faint" style="font-size:12px;margin-top:2px;">On-Chain Match Stakes & Payouts</div>
            </div>
            <span class="chip ${savedAddrs.CryptoGameWagerEscrow && savedAddrs.CryptoGameWagerEscrow !== '0x0000000000000000000000000000000000000000' ? 'gold' : 'muted'}">
              ${savedAddrs.CryptoGameWagerEscrow && savedAddrs.CryptoGameWagerEscrow !== '0x0000000000000000000000000000000000000000' ? '✓ Deployed' : 'Not Deployed'}
            </span>
          </div>
          <ul style="font-size:13px;color:var(--text-dim);margin:0 0 16px 0;padding-left:18px;line-height:1.6;">
            <li><b>Supported Token:</b> $TCG ERC-20 stakes (and native ETH)</li>
            <li><b>Mechanics:</b> Players deposit matching stakes, pot escrowed trustlessly</li>
            <li><b>Settlement:</b> Platform referee cryptographically certifies winner</li>
            <li><b>DAO Rake:</b> 3% match rake routed to DAO treasury</li>
          </ul>
          <div style="font-size:12px;margin-bottom:14px;word-break:break-all;">
            <b>Address:</b> <span id="escrow-addr-disp" class="faint">${escapeHtml(savedAddrs.CryptoGameWagerEscrow || "None")}</span>
            ${savedAddrs.CryptoGameWagerEscrow && savedAddrs.CryptoGameWagerEscrow !== '0x0000000000000000000000000000000000000000' ? `<a href="https://sepolia.etherscan.io/address/${savedAddrs.CryptoGameWagerEscrow}" target="_blank" style="color:var(--gold);margin-left:6px;">↗ Etherscan</a>` : ""}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn small gold" id="btn-deploy-escrow">Deploy Wager Escrow</button>
          </div>
          <div id="escrow-status" style="margin-top:10px;font-size:12px;"></div>
        </div>

      </div>

      <!-- CLI Deployment Instructions Card -->
      <div class="card-panel" style="margin-top:24px;padding:20px;">
        <h4 style="margin:0 0 8px 0;">💻 Alternative: Deploy via Server CLI Script</h4>
        <p class="muted" style="margin:0 0 12px 0;font-size:13px;">If you prefer running deployment from terminal on the server using your Amber private key:</p>
        <pre style="background:rgba(0,0,0,0.4);padding:12px;border-radius:6px;font-size:12px;overflow-x:auto;">AMBER_PRIVATE_KEY=0x... node scripts/deploy-contracts.js</pre>
      </div>
    `;

    // -------------------------------------------------------------
    // Event Handlers & Web3 Logic
    // -------------------------------------------------------------

    // Refresh Button
    $("#deployer-refresh-btn").onclick = () => renderDeployer();

    // Connect Wallet Button
    const connBtn = $("#deployer-connect-btn");
    if (connBtn) {
      connBtn.onclick = async () => {
        if (!window.ethereum) return toast("No EVM provider found. Please install MetaMask!");
        try {
          await window.ethereum.request({ method: "eth_requestAccounts" });
          renderDeployer();
        } catch (e) {
          toast(e.message || "Failed to connect wallet");
        }
      };
    }

    // Switch to Sepolia Button
    const switchBtn = $("#deployer-switch-btn");
    if (switchBtn) {
      switchBtn.onclick = async () => {
        try {
          await window.ethereum.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
          });
          renderDeployer();
        } catch (switchError) {
          if (switchError.code === 4902) {
            try {
              await window.ethereum.request({
                method: "wallet_addEthereumChain",
                params: [{
                  chainId: SEPOLIA_CHAIN_ID_HEX,
                  chainName: "Ethereum Sepolia",
                  nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
                  rpcUrls: ["https://rpc.sepolia.org", "https://gateway.tenderly.co/public/sepolia"],
                  blockExplorerUrls: ["https://sepolia.etherscan.io"],
                }],
              });
              renderDeployer();
            } catch (addError) {
              toast("Could not add Sepolia network: " + addError.message);
            }
          } else {
            toast("Could not switch network: " + switchError.message);
          }
        }
      };
    }

    // Helper: Save deployed address
    async function persistAddresses(updated) {
      await api("/api/contracts/update-addresses", {
        method: "POST",
        body: { network: "sepolia", addresses: updated }
      });
    }

    // Deploy Helper
    async function executeDeploy(contractKey, constructorArgs, statusEl) {
      if (!window.ethereum) throw new Error("No EVM wallet found");
      const provider = new window.ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const art = artifacts[contractKey];
      if (!art || !art.bytecode) throw new Error(`Missing compiled artifact for ${contractKey}`);

      statusEl.innerHTML = `<span style="color:var(--gold);">⏳ Submitting deployment transaction to MetaMask…</span>`;
      const factory = new window.ethers.ContractFactory(art.abi, art.bytecode, signer);
      const contract = await factory.deploy(...constructorArgs);

      statusEl.innerHTML = `<span style="color:var(--gold);">⏳ Tx submitted: <code>${contract.deploymentTransaction().hash.slice(0, 14)}…</code> Waiting for block confirmation…</span>`;
      await contract.waitForDeployment();

      const deployedAddr = await contract.getAddress();
      statusEl.innerHTML = `<span style="color:#22c55e;">✅ Deployed: <code>${deployedAddr}</code></span>`;
      return deployedAddr;
    }

    // Deploy TCG Token
    $("#btn-deploy-tcg").onclick = async () => {
      const statusEl = $("#tcg-status");
      try {
        const saleReserve = window.ethers.parseEther("200000000"); // 200M for sale pool
        const addr = await executeDeploy("TCGToken", [saleReserve], statusEl);
        await persistAddresses({ TCGToken: addr });
        toast("TCGToken deployed! 🪙");
        renderDeployer();
      } catch (e) {
        statusEl.innerHTML = `<span style="color:#ef4444;">❌ Error: ${escapeHtml(e.message)}</span>`;
      }
    };

    // Deploy Deposit Vault
    $("#btn-deploy-vault").onclick = async () => {
      const statusEl = $("#vault-status");
      try {
        const tcgAddr = savedAddrs.TCGToken || window.ethers.ZeroAddress;
        const addr = await executeDeploy("CryptoGameDepositVault", [tcgAddr, window.ethers.ZeroAddress], statusEl);
        await persistAddresses({ CryptoGameDepositVault: addr });
        toast("CryptoGameDepositVault deployed! 🏦");
        renderDeployer();
      } catch (e) {
        statusEl.innerHTML = `<span style="color:#ef4444;">❌ Error: ${escapeHtml(e.message)}</span>`;
      }
    };

    // Deploy GG Token
    $("#btn-deploy-gg").onclick = async () => {
      const statusEl = $("#gg-status");
      try {
        const vaultAddr = savedAddrs.CryptoGameDepositVault || window.ethers.ZeroAddress;
        if (!vaultAddr || vaultAddr === window.ethers.ZeroAddress) {
          return toast("Please deploy the Deposit Vault first so $GG can be minted into it!");
        }
        const addr = await executeDeploy("GGToken", [vaultAddr], statusEl);
        await persistAddresses({ GGToken: addr });

        // Update vault tokens
        statusEl.innerHTML = `<span style="color:var(--gold);">⏳ Configuring tokens in Deposit Vault…</span>`;
        const provider = new window.ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const vault = new window.ethers.Contract(vaultAddr, artifacts.CryptoGameDepositVault.abi, signer);
        const tx = await vault.setTokens(savedAddrs.TCGToken || window.ethers.ZeroAddress, addr);
        await tx.wait();

        toast("GGToken deployed directly into Deposit Vault! 💎");
        renderDeployer();
      } catch (e) {
        statusEl.innerHTML = `<span style="color:#ef4444;">❌ Error: ${escapeHtml(e.message)}</span>`;
      }
    };

    // Deploy Escrow
    $("#btn-deploy-escrow").onclick = async () => {
      const statusEl = $("#escrow-status");
      try {
        const provider = new window.ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const signerAddr = await signer.getAddress();
        const addr = await executeDeploy("CryptoGameWagerEscrow", [signerAddr, signerAddr], statusEl);
        await persistAddresses({ CryptoGameWagerEscrow: addr, daoTreasury: signerAddr });
        toast("CryptoGameWagerEscrow deployed! ⚔️");
        renderDeployer();
      } catch (e) {
        statusEl.innerHTML = `<span style="color:#ef4444;">❌ Error: ${escapeHtml(e.message)}</span>`;
      }
    };

    // Sequential 1-Click Deploy All
    $("#btn-deploy-all").onclick = async () => {
      const statusBox = $("#deploy-all-status");
      statusBox.style.display = "block";
      statusBox.innerHTML = `<b>🚀 Starting Sequential Deployment Pipeline…</b><br>`;

      try {
        const provider = new window.ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const signerAddr = await signer.getAddress();

        // 1. Deploy TCG
        statusBox.innerHTML += `<div style="margin-top:6px;">1/4 Deploying <b>$TCG Token</b> (1 Billion supply, 0.0001 ETH buy)…</div>`;
        const tcgReserve = window.ethers.parseEther("200000000");
        const tcgFac = new window.ethers.ContractFactory(artifacts.TCGToken.abi, artifacts.TCGToken.bytecode, signer);
        const tcgCont = await tcgFac.deploy(tcgReserve);
        await tcgCont.waitForDeployment();
        const tcgAddr = await tcgCont.getAddress();
        statusBox.innerHTML += `<div style="color:#22c55e;">✓ $TCG Deployed: <code>${tcgAddr}</code></div>`;

        // 2. Deploy Vault
        statusBox.innerHTML += `<div style="margin-top:6px;">2/4 Deploying <b>CryptoGameDepositVault</b>…</div>`;
        const vaultFac = new window.ethers.ContractFactory(artifacts.CryptoGameDepositVault.abi, artifacts.CryptoGameDepositVault.bytecode, signer);
        const vaultCont = await vaultFac.deploy(tcgAddr, window.ethers.ZeroAddress);
        await vaultCont.waitForDeployment();
        const vaultAddr = await vaultCont.getAddress();
        statusBox.innerHTML += `<div style="color:#22c55e;">✓ DepositVault Deployed: <code>${vaultAddr}</code></div>`;

        // 3. Deploy GG Token into Vault
        statusBox.innerHTML += `<div style="margin-top:6px;">3/4 Deploying <b>$GG Token</b> (1 Trillion supply minted into Vault)…</div>`;
        const ggFac = new window.ethers.ContractFactory(artifacts.GGToken.abi, artifacts.GGToken.bytecode, signer);
        const ggCont = await ggFac.deploy(vaultAddr);
        await ggCont.waitForDeployment();
        const ggAddr = await ggCont.getAddress();
        statusBox.innerHTML += `<div style="color:#22c55e;">✓ $GG Deployed: <code>${ggAddr}</code></div>`;

        // Link tokens in vault
        statusBox.innerHTML += `<div>Configuring tokens in Deposit Vault…</div>`;
        const linkTx = await vaultCont.setTokens(tcgAddr, ggAddr);
        await linkTx.wait();

        // 4. Deploy Escrow
        statusBox.innerHTML += `<div style="margin-top:6px;">4/4 Deploying <b>CryptoGameWagerEscrow</b> ($TCG Wagers)…</div>`;
        const escFac = new window.ethers.ContractFactory(artifacts.CryptoGameWagerEscrow.abi, artifacts.CryptoGameWagerEscrow.bytecode, signer);
        const escCont = await escFac.deploy(signerAddr, signerAddr);
        await escCont.waitForDeployment();
        const escAddr = await escCont.getAddress();
        statusBox.innerHTML += `<div style="color:#22c55e;">✓ WagerEscrow Deployed: <code>${escAddr}</code></div>`;

        // Save All
        const newAddrs = {
          amberWallet: signerAddr,
          TCGToken: tcgAddr,
          GGToken: ggAddr,
          CryptoGameDepositVault: vaultAddr,
          CryptoGameWagerEscrow: escAddr,
          daoTreasury: signerAddr
        };
        await persistAddresses(newAddrs);

        statusBox.innerHTML += `
          <div style="margin-top:12px;padding:8px;background:rgba(34, 197, 94, 0.15);border:1px solid #22c55e;border-radius:6px;color:#22c55e;font-weight:700;">
            🎉 All 4 smart contracts successfully deployed on Ethereum Sepolia and saved!
          </div>
        `;
        toast("All smart contracts successfully deployed! 👑");
        setTimeout(() => renderDeployer(), 2000);
      } catch (err) {
        statusBox.innerHTML += `<div style="color:#ef4444;margin-top:8px;">❌ Deployment stopped: ${escapeHtml(err.message)}</div>`;
      }
    };

    // Test Buy TCG
    const testBuyBtn = $("#btn-test-buy-tcg");
    if (testBuyBtn) {
      testBuyBtn.onclick = async () => {
        try {
          const provider = new window.ethers.BrowserProvider(window.ethereum);
          const signer = await provider.getSigner();
          const tcg = new window.ethers.Contract(savedAddrs.TCGToken, artifacts.TCGToken.abi, signer);
          toast("Sending 0.001 ETH for 10 TCG…");
          const tx = await tcg.buyTokens({ value: window.ethers.parseEther("0.001") });
          await tx.wait();
          toast("Successfully bought 10 TCG for 0.001 ETH! 🪙");
        } catch (e) {
          toast("Buy failed: " + e.message);
        }
      };
    }

    // Check Vault Balances
    const checkVaultBtn = $("#btn-check-vault");
    if (checkVaultBtn) {
      checkVaultBtn.onclick = async () => {
        try {
          const provider = new window.ethers.BrowserProvider(window.ethereum);
          const vault = new window.ethers.Contract(savedAddrs.CryptoGameDepositVault, artifacts.CryptoGameDepositVault.abi, provider);
          const ggBal = savedAddrs.GGToken ? await vault.vaultBalance(savedAddrs.GGToken) : 0n;
          const tcgBal = savedAddrs.TCGToken ? await vault.vaultBalance(savedAddrs.TCGToken) : 0n;
          alert(`🏦 Deposit Vault On-Chain Balances:\n\n• $GG Balance: ${window.ethers.formatEther(ggBal)} GG\n• $TCG Balance: ${window.ethers.formatEther(tcgBal)} TCG\n• Exclusive Access: Amber (${AMBER_WALLET})`);
        } catch (e) {
          toast("Check failed: " + e.message);
        }
      };
    }
  }
})();
