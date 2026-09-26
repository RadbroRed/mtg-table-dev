(() => {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function isSecondPlayer() {
    if (typeof location !== "undefined" && (/[?&]second=1/.test(location.hash) || /[?&]second=1/.test(location.search))) {
      try { sessionStorage.setItem("mtg-second", "1"); } catch {}
      return true;
    }
    if (typeof location !== "undefined" && (/[?&]second=0/.test(location.hash) || /[?&]second=0/.test(location.search))) {
      try { sessionStorage.removeItem("mtg-second"); } catch {}
      return false;
    }
    try {
      return typeof sessionStorage !== "undefined" && sessionStorage.getItem("mtg-second") === "1";
    } catch {
      return false;
    }
  }
  window.MTG_SECOND = isSecondPlayer();

  function playerKey(second) {
    return second ? "mtg-table-player-2" : "mtg-table-player";
  }

  function uid() {
    const a = new Uint8Array(16);
    crypto.getRandomValues(a);
    return [...a].map((x) => x.toString(16).padStart(2, "0")).join("");
  }

  function identity(second = false) {
    const key = playerKey(second);
    let id = null;
    let name = second ? "Player 2" : "Player 1";
    try {
      id = localStorage.getItem(key);
      name = localStorage.getItem(key + "-name") || name;
      if (!id) {
        id = uid();
        localStorage.setItem(key, id);
      }
    } catch {
      id = id || uid();
    }
    return { id, name, second };
  }

  function setName(name, second = false) {
    name = String(name || "Player").slice(0, 32);
    try {
      localStorage.setItem(playerKey(second) + "-name", name);
    } catch {
      /* ignore */
    }
    return name;
  }

  function authKey(second) {
    return second ? "mtg-token-2" : "mtg-token";
  }
  function userKey(second) {
    return second ? "mtg-user-2" : "mtg-user";
  }

  function getToken(second = false) {
    try {
      return localStorage.getItem(authKey(second)) || null;
    } catch {
      return null;
    }
  }

  function setToken(token, second = false) {
    try {
      if (token) localStorage.setItem(authKey(second), token);
      else localStorage.removeItem(authKey(second));
    } catch {}
  }

  function getCachedUser(second = false) {
    try {
      const raw = localStorage.getItem(userKey(second));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function setCachedUser(user, second = false) {
    try {
      if (user) {
        localStorage.setItem(userKey(second), JSON.stringify(user));
        if (user.displayName) setName(user.displayName, second);
      } else {
        localStorage.removeItem(userKey(second));
      }
    } catch {}
  }

  async function api(path, opts = {}) {
    const second = opts.second !== undefined ? opts.second : window.MTG_SECOND;
    const token = opts.token !== undefined ? opts.token : getToken(second);
    const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
    if (token && !headers.Authorization) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(path, {
      ...opts,
      headers,
      body: opts.body && typeof opts.body !== "string" ? JSON.stringify(opts.body) : opts.body,
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const j = await res.json();
        msg = j.error || msg;
      } catch {}
      throw new Error(msg);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // Password auth has been removed — wallet sign-in is the only way in.

  const eip6963Providers = [];
  if (typeof window !== "undefined") {
    window.addEventListener("eip6963:announceProvider", (event) => {
      if (event.detail && !eip6963Providers.some((p) => p.info?.uuid === event.detail.info?.uuid)) {
        eip6963Providers.push(event.detail);
      }
    });
    window.dispatchEvent(new Event("eip6963:requestProvider"));
  }

  function getBurnerWallet() {
    if (typeof window === "undefined" || !window.ethers) return null;
    try {
      const stored = localStorage.getItem("mtg_burner_wallet");
      if (stored) return new window.ethers.Wallet(stored);
    } catch {}
    return window.__burnedWallet || null;
  }

  function createBurnerProvider(wallet) {
    let chainId = "0xaa36a7"; // Sepolia
    const listeners = {};

    const provider = {
      isMetaMask: false,
      isPhantom: false,
      isBurner: true,
      isMiniWallet: true,
      selectedAddress: wallet.address,
      request: async ({ method, params }) => {
        switch (method) {
          case "eth_requestAccounts":
          case "eth_accounts":
            return [wallet.address];
          case "eth_chainId":
            return chainId;
          case "eth_getBalance":
            return "0xde0b6b3a7640000"; // 1 ETH
          case "eth_getTransactionCount":
            return "0x0";
          case "eth_blockNumber":
            return "0x0";
          case "eth_getBlockByNumber":
            return { number: "0x0", gasLimit: "0x0", gasUsed: "0x0", baseFeePerGas: "0x0", timestamp: "0x0" };
          case "eth_getBlockByHash":
            return { number: "0x0", gasLimit: "0x0", gasUsed: "0x0" };
          case "eth_call":
            return "0x";
          case "eth_estimateGas":
            return "0x5208"; // 21000
          case "eth_maxPriorityFeePerGas":
            return "0x3b9aca00"; // 1 Gwei
          case "eth_gasPrice":
            return "0x3b9aca00";
          case "eth_feeHistory":
            return { baseFeePerGas: ["0x0"], gasUsedRatios: ["0x0"], oldestBlock: "0x0" };
          case "wallet_switchEthereumChain":
            chainId = params[0].chainId;
            return null;
          case "wallet_addEthereumChain":
            chainId = params[0].chainId;
            return null;
          case "personal_sign": {
            let msg = params[0];
            if (typeof msg === "string" && msg.startsWith("0x")) {
              msg = window.ethers.toUtf8String(msg);
            }
            return wallet.signMessage(msg);
          }
          case "eth_signTypedData_v4": {
            let data = params[1];
            if (typeof data === "string" && data.startsWith("0x")) {
              data = window.ethers.toUtf8String(data);
            }
            const parsed = JSON.parse(data);
            const types = {};
            for (const [name, def] of Object.entries(parsed.types || {})) {
              if (name !== "EIP712Domain") types[name] = def;
            }
            return wallet.signTypedData(parsed.domain || {}, types, parsed.message || {});
          }
          case "eth_sendRawTransaction":
          case "eth_sendTransaction":
            return "0x" + "0".repeat(64);
          default:
            return "0x";
        }
      },
      on: (event, cb) => {
        (listeners[event] = listeners[event] || []).push(cb);
      },
      removeListener: (event, cb) => {
        if (listeners[event]) listeners[event] = listeners[event].filter(l => l !== cb);
      },
      removeAllListeners: () => { Object.keys(listeners).forEach(k => delete listeners[k]); },
    };
    return provider;
  }

  function getEVMProvider(walletPref = null) {
    if (typeof window === "undefined") return null;

    // 1. Explicit request for metamask
    if (walletPref === "metamask") {
      const eipMm = eip6963Providers.find(p =>
        p.info?.name?.toLowerCase().includes("metamask") ||
        p.info?.rdns?.toLowerCase().includes("metamask")
      );
      if (eipMm?.provider) return eipMm.provider;

      if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
        const mm = window.ethereum.providers.find(p => p.isMetaMask && !p.isPhantom);
        if (mm) return mm;
      }
      if (window.ethereum?.isMetaMask && !window.ethereum?.isPhantom) {
        return window.ethereum;
      }
      if (window.ethereum && !window.ethereum.isPhantom) return window.ethereum;
      return null;
    }

    // 2. Explicit request for phantom (Ethereum mode)
    if (walletPref === "phantom") {
      if (window.phantom?.ethereum) return window.phantom.ethereum;
      const eipPh = eip6963Providers.find(p =>
        p.info?.name?.toLowerCase().includes("phantom") ||
        p.info?.rdns?.toLowerCase().includes("phantom")
      );
      if (eipPh?.provider) return eipPh.provider;

      if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
        const ph = window.ethereum.providers.find(p => p.isPhantom);
        if (ph) return ph;
      }
      if (window.ethereum?.isPhantom) return window.ethereum;
      return null;
    }

    // 3. Generic EVM provider (prefer MetaMask, then Phantom Ethereum, then generic ethereum)
    const eipMm = eip6963Providers.find(p => p.info?.name?.toLowerCase().includes("metamask"));
    if (eipMm?.provider) return eipMm.provider;

    if (window.ethereum?.providers && Array.isArray(window.ethereum.providers)) {
      const mm = window.ethereum.providers.find(p => p.isMetaMask && !p.isPhantom);
      if (mm) return mm;
      return window.ethereum.providers[0];
    }
    if (window.ethereum) return window.ethereum;
    if (window.phantom?.ethereum) return window.phantom.ethereum;
    if (eip6963Providers.length && eip6963Providers[0]?.provider) {
      return eip6963Providers[0].provider;
    }
    if (window.braveEthereum) return window.braveEthereum;
    if (window.coinbaseWalletExtension) return window.coinbaseWalletExtension;
    return null;
  }

  function walletRejected(err) {
    const msg = String(err && err.message || "");
    return !!(err && (err.code === 4001 || err.code === "ACTION_REJECTED" || /user rejected/i.test(msg) || /rejected/i.test(msg)));
  }

  function withTimeout(promise, ms, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label || "Timed out waiting for the wallet")), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function setWeb3Status(text) {
    const b = document.getElementById("btn-dfk-top-web3");
    if (b) b.textContent = text;
  }

  function phantomEthereumProvider() {
    if (window.phantom && window.phantom.ethereum) return window.phantom.ethereum;
    if (window.ethereum && window.ethereum.isPhantom) return window.ethereum;
    if (window.ethereum && Array.isArray(window.ethereum.providers)) {
      const ph = window.ethereum.providers.find((p) => p && p.isPhantom);
      if (ph) return ph;
    }
    const eip = eip6963Providers.find((p) => /phantom/i.test(p.info?.name || "") || /phantom/i.test(p.info?.rdns || ""));
    return eip?.provider || null;
  }

  // Sign the login message with personal_sign. ethers BrowserProvider waits forever
  // if the wallet never answers eth_chainId, which left the Web3 button on "Connecting…".
  async function signEvmLogin(provider, addr, msg) {
    const burner = getBurnerWallet();
    if (provider && provider.isBurner && burner && burner.address && burner.address.toLowerCase() === String(addr).toLowerCase()) {
      return burner.signMessage(msg);
    }
    const msgHex = "0x" + Array.from(new TextEncoder().encode(msg)).map((b) => b.toString(16).padStart(2, "0")).join("");
    const attempts = [
      [msgHex, addr],
      [addr, msgHex],
      [msg, addr],
    ];
    let lastErr = null;
    for (const params of attempts) {
      try {
        const sig = await withTimeout(
          provider.request({ method: "personal_sign", params }),
          90000,
          "The wallet did not return a signature. Open the extension and approve the sign-in."
        );
        if (sig) return sig;
      } catch (err) {
        if (walletRejected(err)) throw err;
        lastErr = err;
      }
    }
    throw lastErr || new Error("Wallet did not return a signature");
  }

  async function afterWalletLogin(user) {
    if (window.MTG_RPG?.updateUser) window.MTG_RPG.updateUser(user);
    if (window.MTG_HOMEROOM_INST?.updateUser) window.MTG_HOMEROOM_INST.updateUser(user);
    const modalEl = document.getElementById("modal");
    if (modalEl && !modalEl.hidden && modalEl.querySelector(".inventory-screen-wrap")) {
      if (window.MTG.openInventoryModal) await window.MTG.openInventoryModal();
    } else if (modalEl && !modalEl.hidden) {
      closeModal();
    }
    if (typeof window.MTG_PROFILE_REDRAW === "function") {
      try { await window.MTG_PROFILE_REDRAW(); } catch (err) { console.warn(err); }
    } else if (!window.MTG_HOMEROOM_INST) {
      render();
    }
  }

  // A small log-in glyph: a doorway with an arrow stepping into it. Drawn
  // with currentColor so it picks up the gold of whatever button it sits in,
  // and sized in em so it tracks the button's font. Exported because the
  // wallet buttons live in inventory.js and profile.js.
  const LOGIN_ICON =
    '<svg class="login-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
    '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M15.5 8.5 19 12l-3.5 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M19 12H9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    "</svg>";

  function getPhantomProvider() {
    if (typeof window !== "undefined") {
      const ethereum = window.phantom?.ethereum ||
        (window.ethereum?.providers && window.ethereum.providers.find(p => p.isPhantom)) ||
        (window.ethereum?.isPhantom ? window.ethereum : null) ||
        eip6963Providers.find(p => p.info?.name?.toLowerCase().includes("phantom"))?.provider ||
        null;
      const solana = window.phantom?.solana || (window.solana?.isPhantom ? window.solana : null);
      return {
        isInstalled: !!(ethereum || solana),
        ethereum,
        solana,
      };
    }
    return { isInstalled: false, ethereum: null, solana: null };
  }

  async function ensureSepoliaNetwork(provider) {
    if (!provider || !provider.request) return false;
    const SEPOLIA_HEX = "0xaa36a7"; // 11155111 in hex
    try {
      const currentChainId = await provider.request({ method: "eth_chainId" });
      if (currentChainId && (currentChainId.toLowerCase() === SEPOLIA_HEX || parseInt(currentChainId, 16) === 11155111)) {
        return true;
      }
    } catch (err) {
      console.warn("eth_chainId check error:", err);
    }

    try {
      toast("Switching wallet to Sepolia Testnet… 🌐");
      await withTimeout(provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: SEPOLIA_HEX }],
      }), 12000, "Network switch timed out");
      return true;
    } catch (switchErr) {
      if (switchErr && (switchErr.code === 4902 || switchErr.message?.includes("Unrecognized chain") || switchErr.data?.originalError?.code === 4902)) {
        try {
          toast("Adding Sepolia Testnet to wallet… 🌐");
          await withTimeout(provider.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: SEPOLIA_HEX,
              chainName: "Sepolia Testnet",
              nativeCurrency: { name: "Sepolia Ether", symbol: "SEP", decimals: 18 },
              rpcUrls: [
                "https://ethereum-sepolia-rpc.publicnode.com",
                "https://rpc.sepolia.org",
                "https://rpc2.sepolia.org"
              ],
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            }],
          }), 12000, "Adding Sepolia timed out");
          return true;
        } catch (addErr) {
          if (addErr && (addErr.code === 4001 || addErr.code === "ACTION_REJECTED")) {
            toast("Sepolia network addition was cancelled.");
            return false;
          }
          console.warn("wallet_addEthereumChain error:", addErr);
          return false;
        }
      } else if (switchErr && (switchErr.code === 4001 || switchErr.code === "ACTION_REJECTED")) {
        toast("Network switch cancelled.");
        return false;
      }
      console.warn("wallet_switchEthereumChain warning:", switchErr);
      return false;
    }
  }

  async function connectEVM(provider, second = false, walletLabel = "MetaMask") {
    if (!provider) {
      toast(`🦊 ${walletLabel} extension not detected. Please ensure your wallet extension is installed and unlocked.`);
      return null;
    }

    try {
      toast(`Connecting to ${walletLabel}… 🦊`);

      // 1. Explicitly request accounts first. Bound the wait so a silent provider
      // cannot leave the nav button stuck on "Connecting…".
      let accounts = [];
      try {
        accounts = await withTimeout(
          provider.request({ method: "eth_requestAccounts" }),
          90000,
          `${walletLabel} did not return an account. Unlock the wallet and try again.`
        );
      } catch (reqErr) {
        if (walletRejected(reqErr)) {
          toast(`${walletLabel} connection request was rejected.`);
          return null;
        }
        console.warn("eth_requestAccounts error:", reqErr);
        try {
          accounts = await withTimeout(provider.request({ method: "eth_accounts" }), 4000, "eth_accounts timed out");
        } catch {}
        if (!accounts || !accounts.length) {
          toast(reqErr.message || `Could not connect to ${walletLabel}.`);
          return null;
        }
      }

      let addr = (accounts && accounts[0]) || provider.selectedAddress || null;
      if (!addr) {
        toast(`No account authorized in ${walletLabel}.`);
        return null;
      }

      // 2. Ask for Sepolia, but do not block sign-in if the wallet never answers.
      try {
        await withTimeout(ensureSepoliaNetwork(provider), 15000, "Sepolia switch timed out");
      } catch (netErr) {
        console.warn("Sepolia switch:", netErr);
        toast("Could not switch to Sepolia. Signing in with this account anyway.");
      }

      // 3. Ask the server for a single-use sign-in challenge. The message is
      // built server-side so a captured signature can never be replayed.
      // Balance lookups are intentionally not on this path — a stuck RPC
      // call was preventing the signature prompt from ever appearing.
      const challenge = await api("/api/auth/challenge", {
        method: "POST",
        second,
        body: { address: addr, chain: "ethereum" },
      });
      const msg = challenge && challenge.message;
      const nonce = challenge && challenge.nonce;
      if (!msg || !nonce) throw new Error("Could not obtain a sign-in challenge from the server.");

      toast(`Please sign the authentication message in ${walletLabel}… ✍️`);

      let sig = "";
      try {
        sig = await signEvmLogin(provider, addr, msg);
      } catch (sErr) {
        if (walletRejected(sErr)) {
          toast("Signature was rejected in wallet.");
          return null;
        }
        toast(`Wallet signature failed: ${sErr?.message || "Could not sign"}`);
        return null;
      }

      if (!sig) {
        toast("Failed to obtain valid signature from wallet.");
        return null;
      }

      // 5. Authenticate with backend using authentic cryptographic signature
      toast("Verifying authentic signature on Sepolia… 🔮");
      const res = await api("/api/auth/wallet", {
        method: "POST",
        second,
        body: {
          address: addr,
          chain: "ethereum",
          signature: sig,
          message: msg,
          nonce,
          network: "sepolia",
          displayName: `Eth_${addr.slice(0, 6)}…${addr.slice(-4)}`,
        },
      });

      if (res && (res.token || res.user)) {
        if (res.token) setToken(res.token, second);
        setCachedUser(res.user, second);
        toast(`✨ ${walletLabel} connected: ${res.user.displayName || res.user.username}!`);
        spawnSparkles(window.innerWidth / 2, window.innerHeight / 2, "sparkle");
        await afterWalletLogin(res.user);
        return res.user;
      } else {
        throw new Error(res?.error || "Web3 authentication failed");
      }
    } catch (err) {
      if (walletRejected(err)) {
        toast("Wallet connection cancelled by user.");
      } else {
        toast(`EVM Wallet: ${err.message || err}`);
      }
      return null;
    }
  }

  async function connectSolana(provider, second = false) {
    try {
      toast("Connecting to Phantom wallet… 👻");
      const resp = await provider.connect();
      const addr = resp.publicKey ? resp.publicKey.toString() : (resp.address || String(resp));
      
      const challenge = await api("/api/auth/challenge", {
        method: "POST",
        second,
        body: { address: addr, chain: "solana" },
      });
      const msg = challenge && challenge.message;
      const nonce = challenge && challenge.nonce;
      if (!msg || !nonce) throw new Error("Could not obtain a sign-in challenge from the server.");

      toast("Please sign the authentication message in Phantom… ✍️");
      let sigHex = "";
      try {
        const encoded = new TextEncoder().encode(msg);
        const sigResp = await provider.signMessage(encoded, "utf8");
        const sigBytes = sigResp.signature || sigResp;
        sigHex = Array.from(sigBytes).map(b => b.toString(16).padStart(2, "0")).join("");
      } catch (signErr) {
        if (signErr?.code === 4001 || signErr?.message?.includes("rejected") || signErr?.message?.includes("User rejected")) {
          toast("Signature rejected in Phantom.");
          return null;
        }
        toast("Phantom signature failed: " + (signErr.message || signErr));
        return null;
      }

      toast("Authenticating Phantom credentials… 🔮");
      const res = await api("/api/auth/wallet", {
        method: "POST",
        second,
        body: {
          address: addr,
          chain: "solana",
          signature: sigHex,
          message: msg,
          nonce,
          displayName: `Phantom_${addr.slice(0, 4)}…${addr.slice(-4)}`,
        },
      });

      if (res && (res.token || res.user)) {
        if (res.token) setToken(res.token, second);
        setCachedUser(res.user, second);
        toast(`✨ Phantom Wallet connected: ${res.user.displayName || res.user.username}!`);
        spawnSparkles(window.innerWidth / 2, window.innerHeight / 2, "sparkle");
        await afterWalletLogin(res.user);
        return res.user;
      } else {
        throw new Error(res?.error || "Solana authentication failed");
      }
    } catch (err) {
      if (err?.code === 4001 || err?.message?.includes("rejected") || err?.message?.includes("User rejected")) {
        toast("Phantom connection cancelled.");
      } else {
        toast("Phantom Wallet Error: " + (err.message || err));
      }
      return null;
    }
  }

  async function connectBurner(second = false) {
    if (!window.ethers) {
      toast("✨ ethers.js not loaded for in-browser wallet creation.");
      return null;
    }

    let wallet = null;
    try {
      const stored = localStorage.getItem("mtg_burner_wallet");
      if (stored) wallet = new window.ethers.Wallet(stored);
    } catch {}

    if (!wallet) {
      try {
        wallet = window.ethers.Wallet.createRandom();
        localStorage.setItem("mtg_burner_wallet", wallet.privateKey);
      } catch (e) {
        toast("Could not create burner wallet: " + (e.message || e));
        return null;
      }
    }

    window.__burnedWallet = wallet;
    const provider = createBurnerProvider(wallet);
    toast("🦊 Creating in-browser burner wallet on Sepolia… 🧪");
    return connectEVM(provider, second, "Burner");
  }

  async function signTestTransaction(second = false) {
    const curU = getCachedUser(second);
    const addr = curU?.walletAddress;
    const chain = curU?.walletChain || (addr?.startsWith("0x") ? "ethereum" : "solana");
    if (!addr) {
      toast("Please connect a wallet first.");
      return null;
    }

    // 1. Solana Phantom signing
    if (chain === "solana") {
      const phantom = getPhantomProvider();
      const sol = phantom.solana;
      if (!sol) {
        toast("Phantom Solana provider not available in this window.");
        return null;
      }
      try {
        toast("Prompting verification signature in Phantom… 👻");
        const testMsg = `MTG Multiverse Hearth Solana Ping:\nAccount: ${addr}\nTimestamp: ${Date.now()}`;
        const encoded = new TextEncoder().encode(testMsg);
        const sigResp = await sol.signMessage(encoded, "utf8");
        const sigBytes = sigResp.signature || sigResp;
        const sigHex = Array.from(sigBytes).map(b => b.toString(16).padStart(2, "0")).join("");
        toast(`✨ Phantom signature verified: ${sigHex.slice(0, 12)}…!`);
        return { hash: sigHex, chain: "solana" };
      } catch (err) {
        if (err?.code === 4001 || err?.message?.includes("rejected")) {
          toast("Signature rejected in Phantom.");
        } else {
          toast("Phantom signature error: " + (err.message || err));
        }
        return null;
      }
    }

    // 1.5. Burner wallet in-browser signing
    const burner = getBurnerWallet();
    if (burner && addr.toLowerCase() === burner.address.toLowerCase()) {
      try {
        toast("Signing verification message with burner wallet… 🦊");
        const testMsg = `MTG Multiverse Hearth Sepolia Ping:\nAccount: ${addr}\nNonce: ${Date.now()}`;
        const sig = await burner.signMessage(testMsg);
        toast(`✨ Burner signature verified: ${sig.slice(0, 12)}…!`);
        return { hash: sig, chain: "ethereum" };
      } catch (err) {
        toast("Burner signature error: " + (err.message || err));
        return null;
      }
    }

    // 2. Ethereum / EVM signing — personal_sign, not BrowserProvider (that hangs).
    const provider = getEVMProvider();
    if (!provider) {
      toast("No active wallet provider available to sign transaction.");
      return null;
    }
    try {
      toast("Prompting Sepolia transaction in wallet… 🦊");
      try {
        const txHash = await withTimeout(provider.request({
          method: "eth_sendTransaction",
          params: [{ from: addr, to: addr, value: "0x0" }],
        }), 20000, "Transaction prompt timed out");
        const hash = typeof txHash === "string" ? txHash : (txHash && txHash.hash) || "";
        toast(`✨ Transaction submitted on Sepolia! Hash: ${String(hash).slice(0, 10)}…`);
        return { hash, chain: "ethereum" };
      } catch (sendErr) {
        if (walletRejected(sendErr)) {
          toast("Transaction was rejected in wallet.");
          return null;
        }
        toast("Signing Sepolia verification in wallet… ✍️");
        const testMsg = `MTG Multiverse Hearth Sepolia Ping:\nAccount: ${addr}\nNonce: ${Date.now()}`;
        const sig = await signEvmLogin(provider, addr, testMsg);
        toast(`✨ Verification signed in wallet!`);
        return { hash: sig, chain: "ethereum" };
      }
    } catch (err) {
      if (walletRejected(err)) {
        toast("Transaction was rejected in wallet.");
      } else {
        toast("Transaction signing error: " + (err.message || err));
      }
      return null;
    }
  }

  async function connectPhantom(second = false, preferChain = "ethereum") {
    // Phantom does not inject on plain http except localhost and 127.0.0.1.
    const host = String(location.hostname || "").toLowerCase();
    const phantomOriginOk = location.protocol === "https:" || host === "localhost" || host === "127.0.0.1" || host === "::1";
    const provider = phantomEthereumProvider();
    if (!provider) {
      if (!phantomOriginOk) {
        const httpsUrl = `https://${host}:8888/`;
        toast(`Phantom needs the HTTPS dev server. Open ${httpsUrl} — accept the certificate warning once — then click Phantom again.`);
      } else if (preferChain !== "solana" && (window.phantom?.solana || window.solana?.isPhantom)) {
        toast("Phantom is here, but Ethereum is off. In Phantom enable the Ethereum network, then click again.");
      } else {
        toast("Phantom isn't in this browser. Install it from https://phantom.com, unlock it, then click again.");
      }
      return null;
    }

    // Ask Phantom in this same click, before any other await, or the popup is suppressed
    // and the button sits on "Connecting…" forever.
    const accountsPromise = provider.request({ method: "eth_requestAccounts" });
    toast("Approve the connection in the Phantom popup 👻");
    setWeb3Status("👻 Approve");

    let accounts;
    try {
      accounts = await withTimeout(
        accountsPromise,
        60000,
        "Phantom didn't open. Click the Phantom extension icon and approve this site."
      );
    } catch (err) {
      if (walletRejected(err)) {
        toast("Phantom connection was rejected.");
        return null;
      }
      toast(err.message || "Could not connect to Phantom.");
      return null;
    }

    const addr = (accounts && accounts[0]) || provider.selectedAddress || null;
    if (!addr) {
      toast("Phantom did not return an Ethereum account.");
      return null;
    }

    const SEPOLIA = "0xaa36a7";
    let chainId = "";
    try {
      chainId = await withTimeout(provider.request({ method: "eth_chainId" }), 2500, "chain id timed out");
    } catch {}
    const onSepolia = chainId && (String(chainId).toLowerCase() === SEPOLIA || parseInt(chainId, 16) === 11155111);
    if (!onSepolia) {
      toast("Switch Phantom to the Sepolia testnet…");
      setWeb3Status("👻 Sepolia");
      try {
        await withTimeout(provider.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: SEPOLIA }],
        }), 8000, "Sepolia switch timed out");
      } catch (switchErr) {
        const code = Number(switchErr?.code || switchErr?.data?.originalError?.code);
        if (code === 4902 || /unrecognized chain/i.test(switchErr?.message || "")) {
          try {
            toast("Add Sepolia to Phantom, then approve it…");
            await withTimeout(provider.request({
              method: "wallet_addEthereumChain",
              params: [{
                chainId: SEPOLIA,
                chainName: "Sepolia",
                nativeCurrency: { name: "Sepolia Ether", symbol: "SEP", decimals: 18 },
                rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              }],
            }), 8000, "Adding Sepolia timed out");
          } catch (addErr) {
            if (walletRejected(addErr)) {
              toast("Sepolia was not added in Phantom.");
              return null;
            }
            console.warn("wallet_addEthereumChain", addErr);
          }
        } else if (walletRejected(switchErr)) {
          toast("Sepolia switch was cancelled in Phantom.");
          return null;
        } else {
          console.warn("Sepolia switch", switchErr);
          toast("Sepolia switch didn't finish. Phantom will still ask you to sign.");
        }
      }
    }

    // 3. Ask the server for a single-use sign-in challenge, the same way
    // connectEVM does. The message used to be built here with a client-side
    // Date.now() nonce, which the server has no record of, so every attempt
    // died on "Missing sign-in challenge" before signature verification. The
    // message has to come from the server or a captured signature can be
    // replayed.
    let msg = "";
    let nonce = "";
    try {
      const challenge = await api("/api/auth/challenge", {
        method: "POST",
        second,
        body: { address: addr, chain: "ethereum" },
      });
      msg = challenge && challenge.message;
      nonce = challenge && challenge.nonce;
    } catch (challengeErr) {
      toast(challengeErr?.message || "Could not reach the server for a sign-in challenge.");
      return null;
    }
    if (!msg || !nonce) {
      toast("Could not obtain a sign-in challenge from the server.");
      return null;
    }

    toast("Sign the test message in Phantom to prove ownership ✍️");
    setWeb3Status("👻 Sign");
    let sig = "";
    try {
      sig = await signEvmLogin(provider, addr, msg);
    } catch (err) {
      if (walletRejected(err)) {
        toast("Signature was rejected in Phantom.");
        return null;
      }
      toast(err?.message || "Phantom signature failed.");
      return null;
    }
    if (!sig) {
      toast("Phantom did not return a signature.");
      return null;
    }

    toast("Checking the Phantom signature…");
    try {
      const res = await api("/api/auth/wallet", {
        method: "POST",
        second,
        body: {
          address: addr,
          chain: "ethereum",
          signature: sig,
          message: msg,
          nonce,
          network: "sepolia",
          displayName: `Phantom ${addr.slice(0, 6)}…${addr.slice(-4)}`,
        },
      });
      if (!res || (!res.token && !res.user)) throw new Error(res?.error || "Web3 authentication failed");
      if (res.token) setToken(res.token, second);
      setCachedUser(res.user, second);
      toast(`Phantom connected on Sepolia: ${res.user.displayName || res.user.username}`);
      spawnSparkles(window.innerWidth / 2, window.innerHeight / 2, "sparkle");
      await afterWalletLogin(res.user);
      return res.user;
    } catch (err) {
      toast(err.message || "Signature check failed.");
      return null;
    }
  }

  async function connectWeb3(preferredChain = "phantom") {
    const second = window.MTG_SECOND;
    if (preferredChain === "metamask") {
      const p = getEVMProvider("metamask");
      if (!p) {
        toast("MetaMask extension not detected.");
        return null;
      }
      return connectEVM(p, second, "MetaMask");
    }
    return connectPhantom(second, "ethereum");
  }

  // Unused: nothing calls this, and connectPhantom is the Ethereum path. Kept
  // because it is exported, but it now takes the nonce it needs. Without one
  // the server answers "Missing sign-in challenge".
  async function loginWithWallet(address, chain = "ethereum", signature = "", displayName = "", second = false, message = "", network = "sepolia", nonce = "") {
    const res = await api("/api/auth/wallet", {
      method: "POST",
      second,
      body: { address, chain, signature, message, nonce, network, displayName },
    });
    if (res && res.token) {
      setToken(res.token, second);
      setCachedUser(res.user, second);
      if (window.MTG_RPG?.updateUser) window.MTG_RPG.updateUser(res.user);
      if (window.MTG_HOMEROOM_INST?.updateUser) window.MTG_HOMEROOM_INST.updateUser(res.user);
      toast(`Web3 Wallet connected: ${res.user.displayName || res.user.username}! ✨`);
    }
    return res ? res.user : null;
  }

  async function logout(second = false) {
    try {
      await api("/api/auth/logout", { method: "POST", second });
    } catch {}
    setToken(null, second);
    setCachedUser(null, second);
    if (window.MTG_RPG?.updateUser) window.MTG_RPG.updateUser(null);
    if (window.MTG_HOMEROOM_INST?.updateUser) window.MTG_HOMEROOM_INST.updateUser(null);
    toast("Logged out.");
    render();
  }

  async function claimFaucet(second = false) {
    const me = identity(second);
    const res = await api("/api/auth/faucet", {
      method: "POST",
      second,
      body: { playerId: me.id },
    });
    const cur = getCachedUser(second) || { ...me, balance: 1000 };
    cur.balance = res.balance;
    setCachedUser(cur, second);
    window.MTG_SFX && window.MTG_SFX.play("coin");
    toast(`🪙 +500 Gold claimed! Total: ${res.balance} Gold! ✨`);
    return res.balance;
  }

  async function fetchMe(second = false) {
    const token = getToken(second);
    if (!token) return getCachedUser(second);
    try {
      const res = await api("/api/auth/me", { second });
      if (res && res.ok && res.user) {
        setCachedUser(res.user, second);
        return res.user;
      }
    } catch {
      setToken(null, second);
      setCachedUser(null, second);
      return null;
    }
    return getCachedUser(second);
  }

  function toast(text) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => {
      el.hidden = true;
    }, 2800);
  }

  function manaPips(cost) {
    if (!cost) return "";
    return `<span class="pips">${[...cost.matchAll(/\{([^}]+)\}/g)]
      .map((m) => {
        const v = m[1];
        const cls = "WUBRGC".includes(v) ? v : v === "T" ? "T" : "generic";
        return `<span class="pip ${cls}">${v.length > 2 ? v[0] : v}</span>`;
      })
      .join("")}</span>`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function route() {
    const raw = (location.hash.replace(/^#/, "") || "/").split("?")[0];
    const query = location.hash.split("?")[1] || "";
    const params = new URLSearchParams(query);
    if (params.get("second") === "1") {
      try { sessionStorage.setItem("mtg-second", "1"); } catch {}
      window.MTG_SECOND = true;
    } else if (params.get("second") === "0") {
      try { sessionStorage.removeItem("mtg-second"); } catch {}
      window.MTG_SECOND = false;
    } else {
      window.MTG_SECOND = isSecondPlayer();
    }
    const parts = raw.split("/").filter(Boolean);
    if (parts[0] === "inventory") return { name: "inventory" };
    if (parts[0] === "bazaar" || parts[0] === "marketplace" || parts[0] === "market") return { name: "bazaar" };
    if (parts[0] === "builder") return { name: "builder", id: parts[1] || null };
    if (parts[0] === "table") return { name: "table", code: (parts[1] || "").toUpperCase() };
    if (parts[0] === "cards") return { name: "cards" };
    if (parts[0] === "guilds") return { name: "guilds", tab: parts[1] || "guilds" };
    if (parts[0] === "leagues") return { name: "guilds", tab: "leagues" };
    if (parts[0] === "dao") return { name: "dao" };
    if (parts[0] === "dnd") return { name: "dnd" };
    if (parts[0] === "admin") return { name: "admin" };
    if (parts[0] === "tables" || parts[0] === "lobby") return { name: "lobby" };
    if (parts[0] === "profile" || parts[0] === "character" || parts[0] === "login" || parts[0] === "auth") {
      return { name: "profile", tab: parts[1] || null };
    }
    return { name: "profile" };
  }

  function go(path) {
    const next = path.charAt(0) === "#" ? path : "#" + (path.charAt(0) === "/" ? path : "/" + path);
    if (location.hash === next) render();
    else location.hash = next;
  }

  let info = null;
  async function getInfo() {
    if (info) return info;
    info = await api("/api/info");
    return info;
  }

  /* ------------------------------------------------------------------ */
  /* Multiverse Visual Skins & Themes System                            */
  /* ------------------------------------------------------------------ */
  const SKINS = [
    {
      id: "classic",
      name: "Classic Arcane",
      icon: "✨",
      subtitle: "Cozy Multiverse Sanctuary",
      desc: "Rich tavern felt & warm antiqued fantasy gold",
      swatch: "linear-gradient(135deg, #d7b45c, #184332)",
      particles: ["✨", "⭐", "🌟", "🌸", "💫"],
    },
    {
      id: "fairy",
      name: "Forest Fairy Green",
      icon: "🧚",
      subtitle: "Sylvan Canopy & Glowing Moss",
      desc: "Lush emerald woods, clover accents & enchanted glades",
      swatch: "linear-gradient(135deg, #4ade80, #0c3820)",
      particles: ["🌸", "🍃", "✨", "🍀", "🧚", "🍄"],
    },
    {
      id: "kitty",
      name: "Hello Kitty",
      icon: "🎀",
      subtitle: "Kawaii Dreamland Sanctuary",
      desc: "Bubblegum pinks, pastel berry felt & soft ribbons",
      swatch: "linear-gradient(135deg, #ff75a0, #481434)",
      particles: ["🎀", "💖", "🌸", "💕", "🍰", "✨"],
    },
    {
      id: "princess",
      name: "Pure White Princess",
      icon: "👑",
      subtitle: "Crystalline Royal Palace",
      desc: "Pearlescent whites, moonlit lavender & royal ice gems",
      swatch: "linear-gradient(135deg, #ffffff, #2c3258)",
      particles: ["👑", "💎", "✨", "❄️", "🌟", "🪞"],
    },
    {
      id: "metal",
      name: "Metalhead Red",
      icon: "🤘",
      subtitle: "Molten Riffs & Heavy Thrash",
      desc: "Crimson hellfire, charred obsidian & aggressive distortion",
      swatch: "linear-gradient(135deg, #ef4444, #45090e)",
      particles: ["🔥", "⚡", "🎸", "💥", "🩸", "🤘"],
    },
    {
      id: "cyber",
      name: "Cypherpunk Blue",
      icon: "🤖",
      subtitle: "Neon Terminal · Night City",
      desc: "Electric cyan, holographic gridlines & deep oceanic mesh",
      swatch: "linear-gradient(135deg, #00f0ff, #0b254a)",
      particles: ["⚡", "🌐", "💠", "💫", "💾", "🤖"],
    },
    {
      id: "edgelord",
      name: "Edgelord Skull Punk Black",
      icon: "💀",
      subtitle: "Grim Crypt · Toxic Necromancy",
      desc: "Jet-black void, skeletal bone, barbed iron & neon lime",
      swatch: "linear-gradient(135deg, #a3e635, #141418)",
      particles: ["💀", "🦴", "⛓️", "☠️", "🖤", "🗡️"],
    },
  ];

  function skinKey(second) {
    return second ? "mtg-skin-2" : "mtg-skin";
  }

  function getSkin(second = false) {
    try {
      const stored = localStorage.getItem(skinKey(second));
      if (stored && SKINS.some((s) => s.id === stored)) return stored;
    } catch {}
    return "classic";
  }

  function applySkin(skinId) {
    const skin = SKINS.find((s) => s.id === skinId) || SKINS[0];
    if (skin.id === "classic") {
      document.documentElement.removeAttribute("data-skin");
      if (document.body) document.body.removeAttribute("data-skin");
    } else {
      document.documentElement.setAttribute("data-skin", skin.id);
      if (document.body) document.body.setAttribute("data-skin", skin.id);
    }
    return skin;
  }

  function setSkin(skinId, second = false) {
    const skin = SKINS.find((s) => s.id === skinId) || SKINS[0];
    try {
      localStorage.setItem(skinKey(second), skin.id);
    } catch {}
    applySkin(skin.id);
    return skin;
  }

  // Eagerly apply skin immediately on script execution
  try {
    const isSec = /[?&]second=1/.test(location.hash) || (typeof sessionStorage !== "undefined" && sessionStorage.getItem("mtg-second") === "1");
    applySkin(getSkin(isSec));
  } catch {}

  /* ------------------------------------------------------------------ */
  /* Cute Sparkle & Floating Particles System                           */
  /* ------------------------------------------------------------------ */
  function spawnSparkles(x, y, kind = "sparkle") {
    const container = document.createElement("div");
    container.className = "sparkle-burst";
    container.style.left = `${x}px`;
    container.style.top = `${y}px`;
    document.body.appendChild(container);

    const curSkinId = getSkin(window.MTG_SECOND);
    const curSkinObj = SKINS.find((s) => s.id === curSkinId) || SKINS[0];

    const icons =
      kind === "heart"
        ? ["💖", "💕", "🌸", "✨"]
        : kind === "skull"
          ? ["💥", "⚡", "✨", "💀"]
          : curSkinObj.particles || ["✨", "⭐", "🌟", "🌸", "💫"];

    const count = kind === "heart" ? 6 : 7;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      p.className = `sparkle-particle ${kind}`;
      p.textContent = icons[Math.floor(Math.random() * icons.length)];
      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.4 - 0.2);
      const dist = 26 + Math.random() * 42;
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist - (kind === "heart" ? 30 : 0);
      p.style.setProperty("--dx", `${dx}px`);
      p.style.setProperty("--dy", `${dy}px`);
      container.appendChild(p);
    }

    setTimeout(() => {
      container.remove();
    }, 950);
  }

  // Global click sparkle triggers
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!t) return;
    if (t.closest("[data-life='1']")) {
      spawnSparkles(e.clientX, e.clientY, "heart");
    } else if (t.closest("[data-life='-1']")) {
      spawnSparkles(e.clientX, e.clientY, "skull");
    } else if (t.closest("[data-act='roll']") || t.closest("[data-act='token']") || t.closest(".phase") || t.closest(".ctr-chip")) {
      spawnSparkles(e.clientX, e.clientY, "sparkle");
    }
  });

  /* ------------------------------------------------------------------ */
  /* Whimsical Header Navigation & BGM Options                          */
  /* ------------------------------------------------------------------ */
  function nav(active) {
    const second = window.MTG_SECOND;
    const me = identity(second);
    const user = getCachedUser(second);
    const currentSkin = SKINS.find((s) => s.id === getSkin(second)) || SKINS[0];
    const bgm = window.MTG_BGM;
    const trackNames = {
      fairy: "🌸 Fairy Glade",
      meadow: "🍄 Sylvan Meadow",
      cyberpop: "✨ Starlight Cyberpop",
      chiptune: "⚔️ 8-Bit Dungeon",
      dreamcore: "🎀 Kawaii Dreamcore",
      castle: "🏰 Castle Promenade",
    };
    const bgmName = bgm && bgm.enabled
      ? (trackNames[bgm.track] || "🎵 Music")
      : "🔇 Music Off";

    const balanceDisplay = (user && typeof user.balance === "number") ? user.balance : 1000;
    const isAdmin = user && (user.isAdmin || user.username === "amber");

    let avatarMarkup = "🧙";
    if (user && user.avatar) {
      if (user.avatar.startsWith("preset:")) {
        const presets = {
          "preset:fairy": "🧚",
          "preset:unicorn": "🦄",
          "preset:wizard": "🧙",
          "preset:dragon": "🐉",
          "preset:kitty": "🐱",
          "preset:princess": "👑",
          "preset:metal": "🤘",
          "preset:cyber": "🤖",
          "preset:skull": "💀",
        };
        avatarMarkup = presets[user.avatar] || "🧙";
      } else {
        avatarMarkup = `<img src="${escapeHtml(user.avatar)}" class="nav-avatar-img" alt="avatar" />`;
      }
    }

    const authLabel = user && user.username
      ? `<span class="nav-avatar-wrap">${avatarMarkup}</span> <span class="nav-user-name">${escapeHtml(user.displayName || user.username)}</span>`
      : `🔑 Log In`;

    return `
      <header class="topnav hud rpg-fantasy-hud">
        <!-- Brand / Multiverse Link -->
        <a class="nav-brand" href="#/" title="Return to Multiverse Sanctuary">
          <span class="nav-brand-icon">🧙</span>
          <span class="nav-brand-title">Multiverse Hearth</span>
        </a>
        <button type="button" class="btn small ghost auth-btn" id="auth-btn" title="Character Profile & Login">${authLabel}</button>

        <!-- Fantasy Action Bar Navigation Links -->
        <nav class="nav-links rpg-action-bar">
          <a class="${active === "profile" ? "active" : ""}" href="#/" title="Character Sanctuary">🧙 Character</a>
          <a class="${active === "lobby" ? "active" : ""}" href="#/tables" title="Grand Arena Tables">🏰 Tables</a>
          <a class="${active === "builder" ? "active" : ""}" href="#/builder" title="Tolarian Deck Builder">📖 Decks</a>
          <a class="${active === "cards" ? "active" : ""}" href="#/cards" title="Oracle Bazaar">🎴 Bazaar</a>
          <a class="${active === "guilds" ? "active" : ""}" href="#/guilds" title="Citadel of Guilds">⚔️ Guilds</a>
          <a class="${active === "dao" ? "active" : ""}" href="#/dao" title="Royal Treasury & DAO">🏛️ Treasury</a>
          <a class="${active === "dnd" ? "active" : ""}" href="#/dnd" title="Astral Rift RPG">🐉 Astral Rift</a>
          ${isAdmin ? `<a class="${active === "admin" ? "active" : ""}" href="#/admin" title="Grand Arbiter Admin">👑 Admin</a>` : ""}
        </nav>
        <div class="spacer"></div>

        <!-- Gold Vault & Wager Hub Button -->
        <button type="button" class="btn gold small vault-btn rpg-gold-badge" id="vault-btn" title="Gold Vault, Refill & Leaderboard">
          🪙 <span id="user-gold">${balanceDisplay.toLocaleString()}</span> Gold
        </button>

        <!-- Web3 Crypto Wallet Navigation Pill -->
        <button type="button" class="btn small ghost web3-nav-pill" id="web3-nav-btn" title="${user && user.walletAddress ? `Web3 Wallet (Sepolia): ${escapeHtml(user.walletAddress)}` : "Connect Web3 Wallet (Sepolia Testnet)"}">
          ${
            user && user.walletAddress
              ? `<span class="web3-indicator">●</span> ${user.walletChain === "solana" ? "👻" : "🦊"} ${escapeHtml(user.walletAddress.slice(0, 6))}…${escapeHtml(user.walletAddress.slice(-4))}`
              : `👛 Web3`
          }
        </button>

        <!-- Visual Theme Skin Selector Widget -->
        <div class="skin-widget" id="skin-widget">
          <button type="button" class="btn small skin-btn" id="skin-btn" title="Switch Multiverse Visual Theme">
            <span id="skin-btn-icon">${currentSkin.icon}</span>
            <span id="skin-btn-label">${escapeHtml(currentSkin.name)}</span>
            <span class="skin-caret">▾</span>
          </button>
          <div class="skin-popover" id="skin-popover" hidden>
            <div class="skin-popover-head">
              <span>🎨 Multiverse Themes</span>
              <button type="button" class="skin-popover-close" id="skin-close" aria-label="Close">✕</button>
            </div>
            <div class="skin-opt-list">
              ${SKINS.map((s) => `
                <button type="button" class="skin-opt-btn ${s.id === currentSkin.id ? "active" : ""}" data-skin-id="${s.id}">
                  <span class="skin-opt-icon">${s.icon}</span>
                  <div class="skin-opt-info">
                    <div class="skin-opt-name">${escapeHtml(s.name)}</div>
                    <div class="skin-opt-desc">${escapeHtml(s.desc)}</div>
                  </div>
                  <span class="skin-swatch" style="background: ${s.swatch};"></span>
                </button>
              `).join("")}
            </div>
          </div>
        </div>

        <!-- Audio Control Group -->
        <div class="sound-controls">
          <button class="btn gold small sfx-btn" id="sfx-toggle" title="Click to test/toggle sound effects">
            ${window.MTG_SFX && window.MTG_SFX.enabled ? "🔔 Sounds" : "🔕 Muted"}
          </button>
          <div class="bgm-widget" id="bgm-widget">
            <button class="btn gold small bgm-btn" id="bgm-btn" title="Whimsical Background Music (click for playlist)">
              <span class="bgm-icon ${bgm && bgm.isPlaying ? "spin-note" : ""}">🎵</span>
              <span id="bgm-label">${bgmName}</span>
              <span class="bgm-caret">▾</span>
            </button>
            <div class="bgm-popover" id="bgm-popover" hidden>
              <div class="bgm-popover-head">
                <span>✨ Whimsical Music</span>
                <button type="button" class="bgm-popover-close" id="bgm-close" aria-label="Close">✕</button>
              </div>
              <div class="bgm-track-list">
                <button type="button" class="bgm-track-opt ${bgm && bgm.track === "fairy" && bgm.enabled ? "active" : ""}" data-bgm="fairy">🌸 Fairy Glade</button>
                <button type="button" class="bgm-track-opt ${bgm && bgm.track === "meadow" && bgm.enabled ? "active" : ""}" data-bgm="meadow">🍄 Sylvan Meadow</button>
                <button type="button" class="bgm-track-opt ${bgm && bgm.track === "cyberpop" && bgm.enabled ? "active" : ""}" data-bgm="cyberpop">✨ Starlight Cyberpop</button>
                <button type="button" class="bgm-track-opt ${bgm && bgm.track === "chiptune" && bgm.enabled ? "active" : ""}" data-bgm="chiptune">⚔️ 8-Bit Dungeon</button>
                <button type="button" class="bgm-track-opt ${bgm && bgm.track === "dreamcore" && bgm.enabled ? "active" : ""}" data-bgm="dreamcore">🎀 Kawaii Dreamcore</button>
                <button type="button" class="bgm-track-opt ${bgm && bgm.track === "castle" && bgm.enabled ? "active" : ""}" data-bgm="castle">🏰 Castle Promenade</button>
                <button type="button" class="bgm-track-opt ${bgm && !bgm.enabled ? "active" : ""}" data-bgm="off">🔇 Music Off</button>
              </div>
              <div class="bgm-vol-wrap">
                <div class="bgm-vol-title">
                  <span>Volume</span>
                  <span id="bgm-vol-num">${Math.round((bgm ? bgm.volume : 0.35) * 100)}%</span>
                </div>
                <input type="range" id="bgm-vol-slider" min="0" max="100" value="${Math.round((bgm ? bgm.volume : 0.35) * 100)}" class="bgm-slider" />
              </div>
            </div>
          </div>
        </div>
      </header>
      <div class="online-bar" id="online-bar">
        <div class="online-bar-left">
          <span class="online-pulse-dot"></span>
          <span class="online-bar-title" id="online-count">Online (${(window.MTG_ONLINE_PLAYERS && window.MTG_ONLINE_PLAYERS.length) || 1})</span>
        </div>
        <div class="online-players-scroll" id="online-players-list"></div>
        <div class="online-bar-right">
          <button type="button" class="btn small gold friends-nav-btn" id="friends-nav-btn" title="Open Friends Hub">
            🤝 Friends <span class="badge" id="friends-badge" style="display:none">0</span>
          </button>
        </div>
      </div>`;
  }

  function bindNav() {
    const input = $("#player-name");
    if (input) {
      input.addEventListener("change", () => {
        setName(input.value, window.MTG_SECOND);
        sendPresenceRouteUpdate();
      });
    }
    getInfo().then((inf) => {
      const chip = $("#lan-chip");
      if (chip) chip.innerHTML = `Share <strong>${escapeHtml(inf.url)}</strong>`;
    });

    const vaultBtn = $("#vault-btn");
    if (vaultBtn) {
      vaultBtn.onclick = () => {
        const r = route();
        if (r.name === "table") {
          openAuthModal("vault");
        } else {
          go("/profile/vault");
        }
      };
    }
    const authBtn = $("#auth-btn");
    if (authBtn) {
      authBtn.onclick = () => {
        const r = route();
        if (r.name === "table") {
          const u = getCachedUser(window.MTG_SECOND);
          openAuthModal(u ? "profile" : "login");
        } else {
          const drawer = document.getElementById("dfk-sheet-drawer");
          if (drawer) {
            drawer.hidden = !drawer.hidden;
          } else {
            const u = getCachedUser(window.MTG_SECOND);
            openAuthModal(u ? "profile" : "login");
          }
        }
      };
    }
    const web3NavBtn = $("#web3-nav-btn");
    if (web3NavBtn) {
      web3NavBtn.onclick = () => {
        if (window.MTG?.openInventoryModal) return window.MTG.openInventoryModal({ tab: "wallet" });
        if (window.MTG?.connectWeb3) window.MTG.connectWeb3("ethereum");
      };
    }

    const fnBtn = $("#friends-nav-btn");
    if (fnBtn) {
      fnBtn.onclick = () => openFriendsModal();
    }
    renderOnlineBar();
    fetchFriendsBadge();

    // SFX toggle button
    const sfx = $("#sfx-toggle");
    if (sfx && window.MTG_SFX) {
      const updateSfxLabel = () => {
        sfx.textContent = window.MTG_SFX.enabled ? "🔔 Sounds" : "🔕 Muted";
        sfx.classList.toggle("muted-btn", !window.MTG_SFX.enabled);
      };
      updateSfxLabel();
      sfx.onclick = (e) => {
        e.preventDefault();
        window.MTG_SFX.unlock();
        if (!window.MTG_SFX.enabled) {
          window.MTG_SFX.setEnabled(true);
        } else {
          window.MTG_SFX.play("start");
        }
        updateSfxLabel();
      };
      sfx.oncontextmenu = (e) => {
        e.preventDefault();
        window.MTG_SFX.setEnabled(!window.MTG_SFX.enabled);
        updateSfxLabel();
      };
    }

    // BGM Controls
    const bgmBtn = $("#bgm-btn");
    const bgmPopover = $("#bgm-popover");
    const bgmClose = $("#bgm-close");
    const bgmSlider = $("#bgm-vol-slider");
    const bgmVolNum = $("#bgm-vol-num");

    function updateBgmUI(st) {
      const label = $("#bgm-label");
      const icon = $(".bgm-icon");
      if (!st) {
        st = {
          track: window.MTG_BGM ? window.MTG_BGM.track : "fairy",
          volume: window.MTG_BGM ? window.MTG_BGM.volume : 0.35,
          enabled: window.MTG_BGM ? window.MTG_BGM.enabled : true,
          playing: window.MTG_BGM ? window.MTG_BGM.isPlaying : false,
        };
      }
      const trackNames = {
        fairy: "🌸 Fairy Glade",
        meadow: "🍄 Sylvan Meadow",
        cyberpop: "✨ Starlight Cyberpop",
        chiptune: "⚔️ 8-Bit Dungeon",
        dreamcore: "🎀 Kawaii Dreamcore",
        castle: "🏰 Castle Promenade",
        off: "🔇 Music Off",
      };
      if (label) {
        label.textContent = st.enabled ? trackNames[st.track] || "🎵 Music" : "🔇 Music Off";
      }
      if (icon) {
        icon.classList.toggle("spin-note", !!st.playing);
      }
      if (bgmBtn) {
        bgmBtn.classList.toggle("bgm-active", !!st.playing);
      }
      $$(".bgm-track-opt").forEach((btn) => {
        const t = btn.getAttribute("data-bgm");
        const isActive = st.enabled ? st.track === t : t === "off";
        btn.classList.toggle("active", isActive);
      });
      if (bgmSlider && st.volume != null) {
        bgmSlider.value = Math.round(st.volume * 100);
      }
      if (bgmVolNum && st.volume != null) {
        bgmVolNum.textContent = `${Math.round(st.volume * 100)}%`;
      }
    }

    if (window.MTG_BGM) {
      window.MTG_BGM.subscribe(updateBgmUI);
    }

    if (bgmBtn && bgmPopover) {
      bgmBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.MTG_SFX && window.MTG_SFX.unlock();
        window.MTG_BGM && window.MTG_BGM.unlock();
        bgmPopover.hidden = !bgmPopover.hidden;
      };
      if (bgmClose) {
        bgmClose.onclick = (e) => {
          e.preventDefault();
          bgmPopover.hidden = true;
        };
      }
      document.addEventListener("click", (e) => {
        if (bgmPopover && !bgmPopover.hidden && !e.target.closest("#bgm-widget")) {
          bgmPopover.hidden = true;
        }
      });
    }

    $$(".bgm-track-opt").forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        const track = btn.getAttribute("data-bgm");
        if (window.MTG_BGM) {
          window.MTG_BGM.unlock();
          window.MTG_BGM.setTrack(track);
        }
      };
    });

    if (bgmSlider) {
      bgmSlider.oninput = (e) => {
        const val = Number(e.target.value) / 100;
        if (window.MTG_BGM) {
          window.MTG_BGM.setVolume(val);
        }
      };
    }

    // Skin Theme Controls
    const skinBtn = $("#skin-btn");
    const skinPopover = $("#skin-popover");
    const skinClose = $("#skin-close");

    if (skinBtn && skinPopover) {
      skinBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        skinPopover.hidden = !skinPopover.hidden;
      };
      if (skinClose) {
        skinClose.onclick = (e) => {
          e.preventDefault();
          skinPopover.hidden = true;
        };
      }
      document.addEventListener("click", (e) => {
        if (skinPopover && !skinPopover.hidden && !e.target.closest("#skin-widget") && !e.target.closest("#lobby-skin-btn")) {
          skinPopover.hidden = true;
        }
      });
    }

    $$(".skin-opt-btn").forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        const skinId = btn.getAttribute("data-skin-id");
        const skin = setSkin(skinId, window.MTG_SECOND);

        if (window.MTG_SFX) {
          window.MTG_SFX.unlock();
          window.MTG_SFX.play("mana");
        }

        const rect = btn.getBoundingClientRect();
        spawnSparkles(rect.left + rect.width / 2, rect.top + rect.height / 2, "sparkle");

        const iconEl = $("#skin-btn-icon");
        if (iconEl) iconEl.textContent = skin.icon;
        const labelEl = $("#skin-btn-label");
        if (labelEl) labelEl.textContent = skin.name;
        const brandSparkle = $(".brand-sparkle");
        if (brandSparkle) brandSparkle.textContent = skin.icon;
        const brandSmall = $(".brand small");
        if (brandSmall) brandSmall.textContent = skin.subtitle;

        $$(".skin-opt-btn").forEach((b) => {
          b.classList.toggle("active", b.getAttribute("data-skin-id") === skin.id);
        });

        const lobbySkinLabel = $("#lobby-skin-label");
        if (lobbySkinLabel) lobbySkinLabel.textContent = skin.name;

        toast(`Theme set to ${skin.icon} ${skin.name}! ✨`);
      };
    });
  }

  /* ------------------------------------------------------------------ */
  /* Online Presence & Friends System                                    */
  /* ------------------------------------------------------------------ */
  let presenceWs = null;
  window.MTG_ONLINE_PLAYERS = [];

  function getAvatarMarkup(p, size = "small") {
    if (!p) return "🧙";
    if (p.avatar) {
      if (p.avatar.startsWith("preset:")) {
        const presets = {
          "preset:fairy": "🧚",
          "preset:kitty": "🐱",
          "preset:princess": "👑",
          "preset:metal": "🤘",
          "preset:cyber": "🤖",
          "preset:skull": "💀",
        };
        return presets[p.avatar] || "🧙";
      }
      return `<img src="${escapeHtml(p.avatar)}" class="${size === "large" ? "popover-avatar-img" : "chip-avatar-img"}" alt="" />`;
    }
    return "🧙";
  }

  function getRouteStatus(r) {
    if (!r) return "In Lobby";
    if (r.name === "table") return r.id ? `At Table ${r.id}` : "At Table";
    if (r.name === "builder") return "Deck Builder";
    if (r.name === "guilds") return r.tab === "leagues" ? "In Leagues" : "In Guilds";
    if (r.name === "dao") return "In DAO";
    if (r.name === "dnd") return "D&D Tabletop";
    if (r.name === "admin") return "Admin Sanctum";
    return "In Lobby";
  }

  function sendPresenceRouteUpdate() {
    const r = route();
    if (presenceWs && presenceWs.readyState === 1) {
      presenceWs.send(JSON.stringify({
        t: "presence:update",
        location: r.name,
        statusText: getRouteStatus(r),
      }));
    }
  }

  function renderOnlineBar() {
    const listEl = $("#online-players-list");
    const countEl = $("#online-count");
    const players = window.MTG_ONLINE_PLAYERS || [];
    if (countEl) {
      countEl.textContent = `Online (${Math.max(1, players.length)})`;
    }
    if (!listEl) return;
    const second = window.MTG_SECOND;
    const me = identity(second);
    const myUser = getCachedUser(second);
    const myId = myUser ? myUser.id : me.id;

    const displayList = players.length > 0 ? players : [{
      id: myId,
      playerId: me.id,
      userId: myUser ? myUser.id : null,
      displayName: myUser ? (myUser.displayName || myUser.username) : me.name,
      avatar: myUser ? myUser.avatar : null,
      balance: myUser ? myUser.balance : 1000,
      status: "In Lobby",
    }];

    listEl.innerHTML = displayList.map((p) => {
      const isMe = (p.userId && myUser && p.userId === myUser.id) || (p.playerId === me.id);
      const av = getAvatarMarkup(p);
      const statusClass = p.tableCode ? "chip-table" : "chip-idle";
      return `
        <button type="button" class="online-chip ${isMe ? "is-me" : ""}" data-player-key="${escapeHtml(p.userId || p.playerId || p.id)}">
          <span class="online-avatar">${av}</span>
          <span class="online-name">${escapeHtml(p.displayName || p.name || "Planeswalker")}${isMe ? " (You)" : ""}</span>
          <span class="online-status-tag ${statusClass}">${escapeHtml(p.status || "Lobby")}</span>
        </button>
      `;
    }).join("");

    $$(".online-chip").forEach((chip) => {
      chip.onclick = () => {
        openPlayerPopover(chip.dataset.playerKey);
      };
    });
  }

  function openPlayerPopover(targetKey) {
    const second = window.MTG_SECOND;
    const me = identity(second);
    const myUser = getCachedUser(second);

    const players = window.MTG_ONLINE_PLAYERS || [];
    const p = players.find((x) => x.userId === targetKey || x.playerId === targetKey || x.id === targetKey) || {
      id: targetKey,
      displayName: "Planeswalker",
      status: "Online",
      balance: 1000,
      wins: 0,
      losses: 0,
    };

    const isMe = (p.userId && myUser && p.userId === myUser.id) || (p.playerId === me.id);
    const av = getAvatarMarkup(p, "large");

    openModal(`
      <div class="player-popover" style="max-width:380px;text-align:center">
        <div style="font-size:44px;margin-bottom:6px">${av}</div>
        <h2 style="margin:2px 0 4px 0">${escapeHtml(p.displayName || p.name || "Planeswalker")}</h2>
        <div class="faint" style="font-size:12px">${p.username ? `@${escapeHtml(p.username)} · ` : ""}${p.isGuest ? "Guest Planeswalker" : "Verified Wizard"}</div>
        <div style="display:flex;justify-content:center;gap:10px;margin:14px 0">
          <span class="chip gold">🪙 ${(p.balance || 1000).toLocaleString()} Gold</span>
          <span class="chip">🏆 ${p.wins || 0}W - ${p.losses || 0}L</span>
        </div>
        <div class="chip" style="margin-bottom:18px;display:inline-block">
          Activity: <b>${escapeHtml(p.status || "In Lobby")}</b>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${p.tableCode ? `<button type="button" class="btn gold" id="pop-join-table">🏰 Join Table ${escapeHtml(p.tableCode)}</button>` : ""}
          ${!isMe ? `<button type="button" class="btn gold" id="pop-challenge">⚔️ Challenge to Match</button>` : ""}
          ${!isMe ? `<button type="button" class="btn ghost" id="pop-add-friend">🤝 Add Friend</button>` : ""}
          <button type="button" class="btn ghost small" id="pop-close">Close</button>
        </div>
      </div>
    `);

    $("#pop-close").onclick = closeModal;
    const joinBtn = $("#pop-join-table");
    if (joinBtn) {
      joinBtn.onclick = () => {
        closeModal();
        go(`/table/${p.tableCode}`);
      };
    }
    const chBtn = $("#pop-challenge");
    if (chBtn) {
      chBtn.onclick = async () => {
        const wagerStr = prompt(`Challenge ${p.displayName || p.name} to a duel! Enter wager in gold (0 for casual):`, "100");
        if (wagerStr === null) return;
        const wager = Math.max(0, parseInt(wagerStr, 10) || 0);
        try {
          const res = await api("/api/friends/challenge", {
            method: "POST",
            token: null,
            body: {
              toId: p.userId || p.playerId,
              wager,
              fromPlayerId: me.id,
              fromName: myUser ? (myUser.displayName || myUser.username) : me.name,
            },
          });
          closeModal();
          toast(`⚔️ Challenge sent! Entering duel table ${res.tableCode}…`);
          go(`/table/${res.tableCode}`);
        } catch (err) {
          toast("Challenge error: " + (err.message || err));
        }
      };
    }
    const afBtn = $("#pop-add-friend");
    if (afBtn) {
      afBtn.onclick = async () => {
        try {
          await api("/api/friends/request", {
            method: "POST",
            body: {
              toUserId: p.userId || null,
              toPlayerId: p.playerId || null,
              toUsername: p.username || p.displayName,
              fromPlayerId: me.id,
              fromName: myUser ? (myUser.displayName || myUser.username) : me.name,
            },
          });
          toast(`✨ Friend request sent to ${p.displayName || p.name}!`);
          afBtn.disabled = true;
          afBtn.textContent = "Request Sent ✓";
        } catch (err) {
          toast(err.message || err);
        }
      };
    }
  }

  async function fetchFriendsBadge() {
    try {
      const second = window.MTG_SECOND;
      const me = identity(second);
      const user = getCachedUser(second);
      const res = await api("/api/friends" + (user ? "" : `?playerId=${encodeURIComponent(me.id)}`));
      const badge = $("#friends-badge");
      if (badge) {
        const count = (res.incoming || []).length;
        if (count > 0) {
          badge.textContent = count;
          badge.style.display = "inline-block";
        } else {
          badge.style.display = "none";
        }
      }
    } catch {}
  }

  function openChallengePrompt(msg) {
    openModal(`
      <div style="max-width:380px;text-align:center">
        <div style="font-size:44px">⚔️</div>
        <h2>Duel Challenge!</h2>
        <p style="margin:8px 0 16px 0;font-size:15px">
          <b>${escapeHtml(msg.from || "A friend")}</b> has challenged you to a <b>${escapeHtml(msg.format || "duel")}</b> match!
        </p>
        <div class="chip gold" style="font-size:14px;padding:6px 14px;margin-bottom:18px">
          🪙 Wager: <b>${(msg.wager || 0).toLocaleString()} Gold</b>
        </div>
        <div style="display:flex;gap:10px;justify-content:center">
          <button type="button" class="btn gold" id="accept-challenge-btn">Accept & Sit at Table</button>
          <button type="button" class="btn ghost" id="decline-challenge-btn">Decline</button>
        </div>
      </div>
    `);
    $("#accept-challenge-btn").onclick = () => {
      closeModal();
      go(`/table/${msg.tableCode}`);
    };
    $("#decline-challenge-btn").onclick = closeModal;
  }

  async function openFriendsModal(initialTab = "friends") {
    const second = window.MTG_SECOND;
    const me = identity(second);
    const user = getCachedUser(second);

    let tab = initialTab;
    let data = { friends: [], incoming: [], outgoing: [] };
    try {
      data = await api("/api/friends" + (user ? "" : `?playerId=${encodeURIComponent(me.id)}`));
    } catch {}

    async function renderModal() {
      const incCount = (data.incoming || []).length;
      let tabContent = "";
      if (tab === "friends") {
        if (!data.friends || !data.friends.length) {
          tabContent = `
            <div class="empty" style="padding:24px 0">
              You don't have any friends added yet.
              <div style="margin-top:10px">
                <button type="button" class="btn gold small" id="go-add-friend-tab">+ Add a Friend</button>
              </div>
            </div>`;
        } else {
          tabContent = `
            <div class="friends-list" style="display:flex;flex-direction:column;gap:8px;max-height:360px;overflow-y:auto">
              ${data.friends.map((f) => `
                <div class="friend-row" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(255,255,255,0.03);border:1px solid var(--line);border-radius:8px">
                  <div style="display:flex;align-items:center;gap:10px">
                    <span class="friend-status-dot ${f.isOnline ? "online" : "offline"}"></span>
                    <div>
                      <b>${escapeHtml(f.displayName || f.username)}</b>
                      <div class="faint" style="font-size:11px">
                        ${f.isOnline ? `<span style="color:var(--life)">🟢 ${escapeHtml(f.status)}</span>` : "⚪ Offline"}
                        · 🪙 ${(f.balance || 1000).toLocaleString()} Gold
                      </div>
                    </div>
                  </div>
                  <div style="display:flex;gap:6px">
                    ${f.isOnline && f.tableCode ? `<button type="button" class="btn small gold btn-friend-join" data-table="${escapeHtml(f.tableCode)}">🏰 Join</button>` : ""}
                    ${f.isOnline ? `<button type="button" class="btn small gold btn-friend-challenge" data-id="${escapeHtml(f.userId || f.playerId || f.id)}" data-name="${escapeHtml(f.displayName || f.username)}">⚔️ Duel</button>` : ""}
                    <button type="button" class="btn small ghost btn-friend-rm" data-fid="${escapeHtml(f.friendshipId)}" title="Remove Friend">✕</button>
                  </div>
                </div>
              `).join("")}
            </div>`;
        }
      } else if (tab === "requests") {
        tabContent = `
          <div class="requests-section">
            <h3 style="margin-top:0">📬 Incoming Friend Requests</h3>
            ${!data.incoming || !data.incoming.length ? `<p class="muted" style="font-size:13px">No incoming friend requests.</p>` : `
              <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px">
                ${data.incoming.map((r) => `
                  <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.02);border:1px solid var(--line);border-radius:8px">
                    <div>
                      <b>${escapeHtml(r.fromName || "Wizard")}</b>
                      <div class="faint" style="font-size:11px">Sent you a friend request</div>
                    </div>
                    <div style="display:flex;gap:6px">
                      <button type="button" class="btn small gold btn-req-accept" data-rid="${escapeHtml(r.id)}">Accept</button>
                      <button type="button" class="btn small ghost btn-req-decline" data-rid="${escapeHtml(r.id)}">Decline</button>
                    </div>
                  </div>
                `).join("")}
              </div>
            `}
            <h3 style="margin-top:14px">Outgoing Sent Requests</h3>
            ${!data.outgoing || !data.outgoing.length ? `<p class="muted" style="font-size:13px">No pending outgoing requests.</p>` : `
              <div style="display:flex;flex-direction:column;gap:6px">
                ${data.outgoing.map((r) => `
                  <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.01);border:1px solid var(--line);border-radius:8px">
                    <div><b>${escapeHtml(r.toUsername || "Player")}</b> <span class="faint" style="font-size:11px">(Pending)</span></div>
                    <button type="button" class="btn small ghost btn-req-decline" data-rid="${escapeHtml(r.id)}">Cancel</button>
                  </div>
                `).join("")}
              </div>
            `}
          </div>`;
      } else if (tab === "add") {
        const onlineCandidates = (window.MTG_ONLINE_PLAYERS || []).filter((p) => {
          const pKey = p.userId || p.playerId;
          const myKey = user ? user.id : me.id;
          if (pKey === myKey || p.playerId === me.id) return false;
          if (data.friends && data.friends.some((f) => f.id === pKey || f.userId === pKey || f.playerId === pKey)) return false;
          return true;
        });

        tabContent = `
          <div>
            <h3 style="margin-top:0">➕ Add a Friend by Username</h3>
            <p class="muted" style="font-size:12px">Enter the exact username to send a friend request.</p>
            <div style="display:flex;gap:8px;margin-top:8px">
              <input id="add-friend-input" class="grow" placeholder="Enter username (e.g. amber)…" />
              <button type="button" class="btn gold" id="btn-send-friend-req">Send Request</button>
            </div>
            <div id="add-friend-feedback" class="faint" style="margin-top:6px;font-size:12px"></div>

            <h3 style="margin-top:20px">✨ Wizards Currently Online</h3>
            ${!onlineCandidates.length ? `<p class="muted" style="font-size:13px">No other wizards online right now.</p>` : `
              <div style="display:flex;flex-direction:column;gap:6px;max-height:200px;overflow-y:auto;margin-top:8px">
                ${onlineCandidates.map((p) => `
                  <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:rgba(255,255,255,0.02);border:1px solid var(--line);border-radius:8px">
                    <div>
                      <b>${escapeHtml(p.displayName || p.name)}</b>
                      <span class="faint" style="font-size:11px"> · ${escapeHtml(p.status)}</span>
                    </div>
                    <button type="button" class="btn small gold btn-quick-add-friend" data-id="${escapeHtml(p.userId || p.playerId)}" data-un="${escapeHtml(p.username || p.displayName || p.name)}">+ Add</button>
                  </div>
                `).join("")}
              </div>
            `}
          </div>`;
      }

      openModal(`
        <div class="friends-modal" style="min-width:340px;max-width:520px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h2 style="margin:0">🤝 Multiverse Friends</h2>
            <button type="button" class="btn ghost small" id="friends-close-m">✕</button>
          </div>
          <div class="tabs" style="display:flex;gap:8px;margin-bottom:16px;border-bottom:1px solid var(--line);padding-bottom:8px">
            <button type="button" class="tab-btn ${tab === "friends" ? "active" : ""}" data-ftab="friends">Friends (${data.friends.length})</button>
            <button type="button" class="tab-btn ${tab === "requests" ? "active" : ""}" data-ftab="requests">Requests ${incCount > 0 ? `<span class="badge red">${incCount}</span>` : ""}</button>
            <button type="button" class="tab-btn ${tab === "add" ? "active" : ""}" data-ftab="add">➕ Add Friend</button>
          </div>
          <div id="friends-tab-body">${tabContent}</div>
        </div>
      `);

      $("#friends-close-m").onclick = closeModal;
      $$("[data-ftab]").forEach((b) => {
        b.onclick = () => {
          tab = b.dataset.ftab;
          renderModal();
        };
      });

      const goAddBtn = $("#go-add-friend-tab");
      if (goAddBtn) goAddBtn.onclick = () => { tab = "add"; renderModal(); };

      $$(".btn-friend-challenge").forEach((btn) => {
        btn.onclick = async () => {
          const toId = btn.dataset.id;
          const toName = btn.dataset.name;
          const wagerStr = prompt(`Challenge ${toName} to a duel! Enter wager in gold:`, "100");
          if (wagerStr === null) return;
          const wager = Math.max(0, parseInt(wagerStr, 10) || 0);
          try {
            const res = await api("/api/friends/challenge", {
              method: "POST",
              token: null,
              body: { toId, wager, fromPlayerId: me.id, fromName: user ? (user.displayName || user.username) : me.name },
            });
            closeModal();
            toast(`⚔️ Challenge sent to ${toName}! Entering table ${res.tableCode}…`);
            go(`/table/${res.tableCode}`);
          } catch (err) {
            toast("Failed to challenge: " + (err.message || err));
          }
        };
      });

      $$(".btn-friend-join").forEach((btn) => {
        btn.onclick = () => {
          closeModal();
          go(`/table/${btn.dataset.table}`);
        };
      });

      $$(".btn-friend-rm").forEach((btn) => {
        btn.onclick = async () => {
          if (!confirm("Remove this player from your friends list?")) return;
          await api(`/api/friends/${btn.dataset.fid}`, { method: "DELETE" });
          data.friends = data.friends.filter((f) => f.friendshipId !== btn.dataset.fid);
          renderModal();
          toast("Friend removed");
        };
      });

      $$(".btn-req-accept").forEach((btn) => {
        btn.onclick = async () => {
          await api("/api/friends/respond", { method: "POST", body: { requestId: btn.dataset.rid, action: "accept" } });
          toast("Friend request accepted! ✨");
          data = await api("/api/friends" + (user ? "" : `?playerId=${encodeURIComponent(me.id)}`));
          renderModal();
          fetchFriendsBadge();
        };
      });

      $$(".btn-req-decline").forEach((btn) => {
        btn.onclick = async () => {
          await api("/api/friends/respond", { method: "POST", body: { requestId: btn.dataset.rid, action: "decline" } });
          toast("Request dismissed");
          data = await api("/api/friends" + (user ? "" : `?playerId=${encodeURIComponent(me.id)}`));
          renderModal();
          fetchFriendsBadge();
        };
      });

      const sendReqBtn = $("#btn-send-friend-req");
      if (sendReqBtn) {
        sendReqBtn.onclick = async () => {
          const val = ($("#add-friend-input")?.value || "").trim();
          if (!val) return;
          const fb = $("#add-friend-feedback");
          try {
            await api("/api/friends/request", {
              method: "POST",
              body: { toUsername: val, fromPlayerId: me.id, fromName: user ? (user.displayName || user.username) : me.name },
            });
            toast(`✨ Friend request sent to ${val}!`);
            if (fb) fb.innerHTML = `<span style="color:var(--life)">Request sent!</span>`;
            data = await api("/api/friends" + (user ? "" : `?playerId=${encodeURIComponent(me.id)}`));
            setTimeout(() => { tab = "requests"; renderModal(); }, 600);
          } catch (err) {
            if (fb) fb.innerHTML = `<span style="color:var(--danger)">${escapeHtml(err.message || err)}</span>`;
          }
        };
      }

      $$(".btn-quick-add-friend").forEach((btn) => {
        btn.onclick = async () => {
          try {
            await api("/api/friends/request", {
              method: "POST",
              body: { toUserId: btn.dataset.id.startsWith("u-") ? btn.dataset.id : null, toPlayerId: btn.dataset.id, toUsername: btn.dataset.un, fromPlayerId: me.id, fromName: user ? (user.displayName || user.username) : me.name },
            });
            toast(`✨ Friend request sent to ${btn.dataset.un}!`);
            data = await api("/api/friends" + (user ? "" : `?playerId=${encodeURIComponent(me.id)}`));
            renderModal();
          } catch (err) {
            toast(err.message || err);
          }
        };
      });
    }

    await renderModal();
  }

  function initPresence() {
    if (presenceWs && (presenceWs.readyState === 0 || presenceWs.readyState === 1)) return;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    presenceWs = ws;
    const second = window.MTG_SECOND;
    const me = identity(second);
    const token = getToken(second);
    const r = route();

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({
        t: "hello",
        playerId: me.id,
        name: me.name,
        token: token,
        location: r.name,
        statusText: getRouteStatus(r),
      }));
    });

    ws.addEventListener("message", (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.t === "presence") {
          window.MTG_ONLINE_PLAYERS = msg.online || [];
          renderOnlineBar();
        } else if (msg.t === "friend:request") {
          fetchFriendsBadge();
          window.MTG_SFX && window.MTG_SFX.play("tap");
          toast(`🤝 Friend request from ${escapeHtml(msg.request ? (msg.request.fromName || "a wizard") : "a player")}! ✨`);
        } else if (msg.t === "friend:accepted") {
          fetchFriendsBadge();
          window.MTG_SFX && window.MTG_SFX.play("coin");
          toast(`✨ ${escapeHtml(msg.byName || "Your friend")} accepted your friend request!`);
        } else if (msg.t === "friend:challenge") {
          window.MTG_SFX && window.MTG_SFX.play("combat");
          openChallengePrompt(msg);
        }
      } catch {}
    });

    ws.addEventListener("close", () => {
      presenceWs = null;
      setTimeout(initPresence, 3000);
    });
  }

  function closeModal() {
    const m = $("#modal");
    if (!m) return;
    m.hidden = true;
    m.innerHTML = "";
    const r = route();
    if (r.name !== "profile" && r.name !== "table" && r.name !== "admin") {
      try { history.replaceState(null, "", "#/"); } catch {}
    }
  }

  function openModal(html) {
    const m = $("#modal");
    if (!m) return;
    m.hidden = false;
    const hasOwnFrame = html.includes("game-inventory-window") || html.includes("d2-window-frame");
    const hasOwnClose = html.includes("game-window-close-btn") || html.includes("d2-close-btn") || html.includes("mkt-close-btn") || html.includes("inv-close-btn");
    
    if (hasOwnFrame) {
      m.innerHTML = html;
    } else {
      m.innerHTML = `<div class="sheet game-inventory-window" style="position:relative">${hasOwnClose ? '' : '<button type="button" class="game-window-close-btn" id="modal-close-x" style="position:absolute;top:12px;right:14px;z-index:50;" title="Close Window (Esc)">✕</button>'}${html}</div>`;
    }
    const xBtn = m.querySelector("#modal-close-x, .game-window-close-btn, .d2-close-btn, #mkt-close-btn, #inv-close-btn");
    if (xBtn) xBtn.onclick = () => closeModal();
    m.onclick = (e) => {
      if (e.target === m) closeModal();
    };
  }

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeModal();
  });

  async function openAuthModal(initialTab = "login") {
    const second = window.MTG_SECOND;
    let user = await fetchMe(second);
    let tab = user ? (initialTab === "login" ? "profile" : initialTab) : initialTab;

    const AVATAR_PRESETS = [
      { id: "preset:fairy", icon: "🧚", name: "Forest Fairy" },
      { id: "preset:unicorn", icon: "🦄", name: "Starlight Unicorn" },
      { id: "preset:wizard", icon: "🧙", name: "Grand Archmage" },
      { id: "preset:dragon", icon: "🐉", name: "Elder Dragon" },
      { id: "preset:kitty", icon: "🐱", name: "Kawaii Familiar" },
      { id: "preset:princess", icon: "👑", name: "Royal Princess" },
      { id: "preset:metal", icon: "🤘", name: "Metalhead" },
      { id: "preset:cyber", icon: "🤖", name: "Cypherpunk" },
      { id: "preset:skull", icon: "💀", name: "Dread Lich" },
    ];

    async function draw() {
      user = getCachedUser(second);
      let content = "";
      if (tab === "login") {
        content = `
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h2>🔑 Wizard Login</h2>
            <span class="chip gold">[ NET ART AUTH ]</span>
          </div>
          <p class="muted">Log in to track your persistent Gold balance, match record, custom decks, and leaderboard rank.</p>
          <div id="auth-err" class="auth-err-banner" style="display:none;margin-top:12px"></div>
          <form id="auth-form" class="auth-form" style="margin-top:16px">
            <div class="field">
              <label>Username</label>
              <input type="text" id="auth-un" required autocomplete="username" placeholder="wizard_name" autofocus />
            </div>
            <div class="field">
              <label>Password</label>
              <input type="password" id="auth-pw" required autocomplete="current-password" placeholder="••••••••" />
            </div>
            <div class="row" style="margin-top:16px;gap:10px;flex-wrap:wrap">
              <button type="submit" class="btn gold" id="btn-auth-submit">Log In</button>
              <button type="button" class="btn ghost" id="switch-reg">Need an account? Register</button>
              <button type="button" class="btn ghost" id="switch-wallet">👛 Connect Web3 Wallet</button>
            </div>
          </form>
        `;
      } else if (tab === "register") {
        content = `
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h2>✨ Create Wizard Account</h2>
            <span class="chip gold">[ STARTER +1000 🪙 ]</span>
          </div>
          <p class="muted">Join the table! Every new player receives <b>1,000 🪙 Starter Gold</b>.</p>
          <div id="auth-err" class="auth-err-banner" style="display:none;margin-top:12px"></div>
          <form id="auth-form" class="auth-form" style="margin-top:16px">
            <div class="field">
              <label>Username (3-24 characters, letters/numbers/_-)</label>
              <input type="text" id="auth-un" required autocomplete="username" pattern="[a-zA-Z0-9_-]+" placeholder="planeswalker" autofocus />
            </div>
            <div class="field">
              <label>Wizard Display Name</label>
              <input type="text" id="auth-dn" placeholder="e.g. Chandra the Flame" maxlength="32" />
            </div>
            <div class="field">
              <label>Password (min 4 characters)</label>
              <input type="password" id="auth-pw" required minlength="4" autocomplete="new-password" placeholder="••••••••" />
            </div>
            <div class="row" style="margin-top:16px;gap:10px;flex-wrap:wrap">
              <button type="submit" class="btn gold" id="btn-auth-submit">✨ Register (+1,000 🪙)</button>
              <button type="button" class="btn ghost" id="switch-login">Already have an account? Log In</button>
              <button type="button" class="btn ghost" id="switch-wallet">👛 Sign In With Wallet</button>
            </div>
          </form>
        `;
      } else if (tab === "wallet") {
        const cur = user || getCachedUser(second);
        const hasWallet = cur && cur.walletAddress;

        content = `
          <div class="web3-hub">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
              <div>
                <h2>👛 Decentralized Web3 Crypto Wallet</h2>
                <p class="muted">Connect your Ethereum wallet (MetaMask or Phantom in Ethereum mode) to authenticate on Sepolia Testnet.</p>
              </div>
              <span class="chip gold">[ SEPOLIA TESTNET ]</span>
            </div>

            ${
              hasWallet
                ? `
              <div class="card-panel web3-connected-box" style="margin-top:16px;border:2px solid var(--gold);background:rgba(0,0,0,0.3);position:relative">
                <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
                  <div style="display:flex;align-items:center;gap:12px">
                    <span style="font-size:36px">${cur.walletChain === "solana" ? "👻" : "🦊"}</span>
                    <div>
                      <div style="display:flex;align-items:center;gap:8px">
                        <span style="font-weight:900;font-size:16px">${cur.walletChain === "solana" ? "Solana Phantom Signer" : "Ethereum Sepolia Signer"}</span>
                        <span class="chip gold" style="font-size:10px">● Connected</span>
                      </div>
                      <div class="code-font" style="font-size:12px;color:var(--gold);margin-top:4px;word-break:break-all">${escapeHtml(cur.walletAddress)}</div>
                    </div>
                  </div>
                  <button type="button" class="btn small ghost" id="btn-copy-wallet" data-addr="${escapeHtml(cur.walletAddress)}">📋 Copy Address</button>
                </div>

                <div class="web3-vault-summary" style="display:grid;grid-template-columns:repeat(3, 1fr);gap:10px;margin-top:16px">
                  <div class="stat-box" style="padding:10px;background:rgba(255,255,255,0.02);border:1px solid var(--line);border-radius:6px;text-align:center">
                    <div class="faint" style="font-size:10px">NETWORK</div>
                    <div style="font-weight:700;font-size:13px;margin-top:2px;color:var(--life)">🟢 Sepolia (11155111)</div>
                  </div>
                  <div class="stat-box" style="padding:10px;background:rgba(255,255,255,0.02);border:1px solid var(--line);border-radius:6px;text-align:center">
                    <div class="faint" style="font-size:10px">SEPOLIA BALANCE</div>
                    <div style="font-weight:700;font-size:13px;margin-top:2px;color:var(--gold)">${cur.sepoliaBalance ? `💎 ${cur.sepoliaBalance} SEP` : '🟢 On-Chain'}</div>
                  </div>
                  <div class="stat-box" style="padding:10px;background:rgba(255,255,255,0.02);border:1px solid var(--line);border-radius:6px;text-align:center">
                    <div class="faint" style="font-size:10px">HEARTH GOLD</div>
                    <div style="font-weight:700;font-size:13px;margin-top:2px;color:var(--gold)">🪙 ${(cur.balance || 0).toLocaleString()}</div>
                  </div>
                </div>

                <div class="toolbar" style="margin-top:16px;gap:8px">
                  <button type="button" class="btn small gold" id="btn-test-sign">✍️ Sign Verification</button>
                  <button type="button" class="btn small ghost" id="btn-switch-wallet">🔀 Switch Wallet / Re-Authenticate</button>
                  <button type="button" class="btn small danger" id="btn-disconnect-wallet">🔌 Disconnect Wallet</button>
                </div>
              </div>
            `
                : `
              <div class="web3-provider-grid" style="display:grid;grid-template-columns:repeat(2, 1fr);gap:14px;margin-top:18px">
                <div class="card-panel web3-prov-card" style="text-align:center;padding:20px;cursor:pointer;border:1px solid var(--gold);background:rgba(0,0,0,0.3)" id="prov-metamask">
                  <span style="font-size:44px">🦊</span>
                  <h4 style="margin:10px 0 4px 0">MetaMask</h4>
                  <p class="faint" style="font-size:11px;margin:0">Connect with MetaMask extension on Sepolia Testnet</p>
                  <button type="button" class="btn small gold" style="margin-top:14px;width:100%">Connect MetaMask</button>
                </div>

                <div class="card-panel web3-prov-card" style="text-align:center;padding:20px;cursor:pointer;border:1px solid #c084fc;background:rgba(0,0,0,0.3)" id="prov-phantom">
                  <span style="display:inline-block;font-size:34px;color:#c084fc">${LOGIN_ICON}</span>
                  <h4 style="margin:10px 0 4px 0">Login</h4>
                  <p class="faint" style="font-size:11px;margin:0">Sign with an Ethereum wallet on Sepolia</p>
                  <button type="button" class="btn small" style="margin-top:14px;width:100%;background:linear-gradient(135deg, #7c3aed, #581c87);color:#fff;border:1px solid #c084fc;">${LOGIN_ICON}Login</button>
                </div>
              </div>
            `
            }
          </div>
        `;
      } else if (tab === "profile") {
        const cur = user || getCachedUser(second) || { balance: 1000, wins: 0, losses: 0, displayName: "Guest Wizard" };
        const totalGames = (cur.wins || 0) + (cur.losses || 0);
        const winrate = totalGames ? Math.round(((cur.wins || 0) / totalGames) * 100) : 0;
        const streak = (cur.stats && cur.stats.streak) || 0;
        const bestStreak = (cur.stats && cur.stats.bestStreak) || (cur.wins ? 1 : 0);
        const totalWon = (cur.stats && cur.stats.totalWon) || (cur.wins * 200);

        let rankTitle = "🌱 Novice Spellcaster";
        if (cur.wins >= 15) rankTitle = "👑 Multiverse Grandmaster";
        else if (cur.wins >= 7) rankTitle = "⚡ High Archmage";
        else if (cur.wins >= 3) rankTitle = "✨ Adept Planeswalker";

        let avatarEl = `<span style="font-size:52px">🧙</span>`;
        if (cur.avatar) {
          if (cur.avatar.startsWith("preset:")) {
            const pr = AVATAR_PRESETS.find((x) => x.id === cur.avatar);
            avatarEl = `<span style="font-size:52px">${pr ? pr.icon : "🧙"}</span>`;
          } else {
            avatarEl = `<img src="${escapeHtml(cur.avatar)}" style="width:72px;height:72px;border-radius:50%;object-fit:cover;border:2.5px solid var(--gold);box-shadow:0 0 16px var(--skin-glow, rgba(215,180,92,0.4))" alt="avatar" />`;
          }
        }

        content = `
          <div class="profile-header-card card-panel" style="display:flex;align-items:center;gap:18px;padding:16px">
            <div class="profile-avatar-display" style="flex-shrink:0;position:relative">
              ${avatarEl}
            </div>
            <div class="profile-info-display" style="flex:1;min-width:0">
              <div style="display:flex;align-items:center;gap:8px">
                <h2 style="margin:0;font-size:20px">${escapeHtml(cur.displayName || cur.username)}</h2>
                ${cur.isAdmin ? '<span class="chip gold" style="font-size:10px">👑 Admin</span>' : '<span class="chip ghost" style="font-size:10px">Wizard</span>'}
                ${cur.walletAddress ? '<span class="chip gold" style="font-size:10px">🦊 Web3</span>' : ''}
              </div>
              <div class="faint" style="font-size:12px;margin-top:2px">${rankTitle} · <b>${(cur.balance || 0).toLocaleString()} 🪙 Gold</b></div>
              <div class="faint" style="font-size:12px;margin-top:4px;font-style:italic">${escapeHtml(cur.bio || "Planeswalker traversing the Multiverse by the hearth.")}</div>
              ${
                cur.walletAddress
                  ? `<div style="display:flex;align-items:center;gap:6px;margin-top:6px;font-family:monospace;font-size:11px;color:var(--gold)">
                      <span>${cur.walletChain === "solana" ? "👻" : "🦊"}</span>
                      <span>${escapeHtml(cur.walletAddress.slice(0, 8))}…${escapeHtml(cur.walletAddress.slice(-6))}</span>
                      <span class="chip gold" style="font-size:9px">[ ON-CHAIN ]</span>
                    </div>`
                  : `<div style="margin-top:6px"><button type="button" class="btn small ghost" id="btn-prof-wallet">👛 Connect Web3 Wallet</button></div>`
              }
            </div>
          </div>

          <!-- Avatar Picker & Image Upload -->
          <div class="card-panel" style="margin-top:14px">
            <h3>🎨 Choose Avatar or Upload Custom Photo</h3>
            <p class="muted">Pick a cute fantasy familiar or upload your custom wizard portrait:</p>
            <div class="preset-avatar-list" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
              ${AVATAR_PRESETS.map(
                (p) => `
                <button type="button" class="btn small ${cur.avatar === p.id ? "gold" : "ghost"} btn-preset-avatar" data-preset="${p.id}" title="${p.name}" style="font-size:20px;padding:4px 8px">
                  ${p.icon}
                </button>
              `
              ).join("")}
            </div>
            <div style="display:flex;gap:10px;align-items:center;margin-top:12px">
              <label class="btn small gold" style="cursor:pointer;display:inline-flex;align-items:center;gap:6px">
                📁 Upload Custom Photo
                <input type="file" id="avatar-upload-file" accept="image/*" style="display:none" />
              </label>
              <button type="button" class="btn small ghost" id="btn-edit-bio">✏️ Edit Bio</button>
            </div>
          </div>

          <!-- Cute Stats Grid -->
          <div class="section-title" style="margin-top:18px">🏆 Wizard Achievements & Stats</div>
          <div class="profile-stats-grid" style="display:grid;grid-template-columns:repeat(4, 1fr);gap:8px;margin-top:8px">
            <div class="stat-box" style="padding:10px;text-align:center;background:rgba(255,255,255,0.03);border:1px solid var(--line);border-radius:8px">
              <div style="font-size:11px" class="faint">Win Streak</div>
              <div style="font-size:18px;font-weight:900;color:var(--gold);margin-top:2px">🔥 ${streak}</div>
              <div class="faint" style="font-size:10px">Best: ${bestStreak}</div>
            </div>
            <div class="stat-box" style="padding:10px;text-align:center;background:rgba(255,255,255,0.03);border:1px solid var(--line);border-radius:8px">
              <div style="font-size:11px" class="faint">Match Record</div>
              <div style="font-size:18px;font-weight:900;margin-top:2px">${cur.wins || 0}W · ${cur.losses || 0}L</div>
              <div class="faint" style="font-size:10px">${winrate}% Winrate</div>
            </div>
            <div class="stat-box" style="padding:10px;text-align:center;background:rgba(255,255,255,0.03);border:1px solid var(--line);border-radius:8px">
              <div style="font-size:11px" class="faint">Gold Won</div>
              <div style="font-size:18px;font-weight:900;color:var(--life);margin-top:2px">+${totalWon.toLocaleString()}</div>
              <div class="faint" style="font-size:10px">Wager Spoils</div>
            </div>
            <div class="stat-box" style="padding:10px;text-align:center;background:rgba(255,255,255,0.03);border:1px solid var(--line);border-radius:8px">
              <div style="font-size:11px" class="faint">Vault Balance</div>
              <div style="font-size:18px;font-weight:900;color:var(--gold);margin-top:2px">🪙 ${(cur.balance || 0).toLocaleString()}</div>
              <div class="faint" style="font-size:10px">Available</div>
            </div>
          </div>

          <!-- Cute Badges Shelf -->
          <div class="profile-badges-shelf" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
            <span class="chip ${cur.wins > 0 ? "gold" : "muted"}" title="Won at least 1 match">⚔️ First Blood</span>
            <span class="chip ${totalWon >= 500 ? "gold" : "muted"}" title="Won over 500 gold in wagers">🪙 High Roller</span>
            <span class="chip ${cur.wins >= 5 ? "gold" : "muted"}" title="Won 5 or more matches">🏆 Spell Titan</span>
            <span class="chip ${streak >= 3 ? "gold" : "muted"}" title="3 wins in a row without defeat">🔥 On Fire</span>
            <span class="chip gold" title="Verified Multiverse Planeswalker">✨ Hearth Citizen</span>
            ${cur.walletAddress ? '<span class="chip gold" title="Verified Web3 Crypto Signer">🦊 Web3 Sovereign</span>' : ''}
          </div>

          <div class="toolbar" style="margin-top:20px;display:flex;justify-content:space-between">
            <button type="button" class="btn danger small" id="btn-logout">Log Out (${escapeHtml(cur.username)})</button>
            <button type="button" class="btn ghost small" id="go-builder-btn">📖 Open Deck Builder</button>
          </div>
        `;
      } else if (tab === "decks") {
        content = `
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h2>📖 My Custom Decks</h2>
            <button type="button" class="btn small gold" id="prof-new-deck-btn">+ Create New Deck</button>
          </div>
          <p class="muted">Decks saved to your account. Select any deck to take it directly to a live match table!</p>
          <div id="prof-decks-list" style="margin-top:14px;display:flex;flex-direction:column;gap:8px">
            <div class="empty">Loading your custom decks…</div>
          </div>
        `;
      } else if (tab === "vault") {
        const cur = user || getCachedUser(second) || { balance: 1000, wins: 0, losses: 0, displayName: "Guest Wizard" };
        const totalGames = (cur.wins || 0) + (cur.losses || 0);
        const winrate = totalGames ? Math.round(((cur.wins || 0) / totalGames) * 100) : 0;
        content = `
          <h2>🪙 Gold Vault & Treasury</h2>
          <div class="vault-card" style="margin-top:14px">
            <div class="vault-balance">
              <span class="coin-big" style="font-size:2.8rem">🪙</span>
              <div>
                <div class="gold-num" style="font-size:1.8rem;font-weight:bold;color:var(--gold)">${(cur.balance || 0).toLocaleString()} 🪙</div>
                <div class="muted">Available Gold for Wagers</div>
              </div>
            </div>
            <div class="vault-stats" style="display:flex;gap:14px;margin-top:14px">
              <div class="stat-box"><b>${cur.wins || 0}</b> <span>Wins</span></div>
              <div class="stat-box"><b>${cur.losses || 0}</b> <span>Losses</span></div>
              <div class="stat-box"><b>${winrate}%</b> <span>Win Rate</span></div>
            </div>
          </div>
          <div class="card-panel" style="margin-top:16px">
            <h3>🔥 Hearth Gift Refill</h3>
            <p class="muted">Need more chips to place wagers? Claim a free +500 🪙 Gold gift from the tavern hearth!</p>
            <button type="button" class="btn gold" id="btn-faucet" style="margin-top:8px">🎁 Claim +500 Gold Refill</button>
          </div>
          ${
            user && user.username
              ? `<div class="toolbar" style="margin-top:18px"><button type="button" class="btn danger small" id="btn-logout">Log Out (${escapeHtml(user.username)})</button></div>`
              : `<div class="toolbar" style="margin-top:18px"><button type="button" class="btn gold small" id="switch-reg">✨ Register to Save Stats</button></div>`
          }
        `;
      } else if (tab === "leaderboard") {
        content = `
          <h2>🏆 Wizards Leaderboard</h2>
          <p class="muted">The top planeswalkers across the multiverse ranked by Gold balance and victories.</p>
          <div id="lb-content" style="margin-top:14px"><div class="empty">Loading leaderboard…</div></div>
        `;
      }

      const tabsHtml = `
        <div class="auth-tabs" style="display:flex;gap:8px;border-bottom:1px solid var(--line);padding-bottom:12px;margin-bottom:16px;flex-wrap:wrap">
          ${user ? `<button type="button" class="btn small ${tab === "profile" ? "gold" : "ghost"} auth-tab" data-tab="profile">🧙 Profile & Avatar</button>` : ""}
          <button type="button" class="btn small ${tab === "wallet" ? "gold" : "ghost"} auth-tab" data-tab="wallet">👛 Web3 Wallet</button>
          ${user ? `<button type="button" class="btn small ${tab === "decks" ? "gold" : "ghost"} auth-tab" data-tab="decks">📖 My Decks</button>` : ""}
          <button type="button" class="btn small ${tab === "vault" ? "gold" : "ghost"} auth-tab" data-tab="vault">🪙 Gold Vault</button>
          <button type="button" class="btn small ${tab === "leaderboard" ? "gold" : "ghost"} auth-tab" data-tab="leaderboard">🏆 Leaderboard</button>
          ${!user ? `<button type="button" class="btn small ${tab === "login" ? "gold" : "ghost"} auth-tab" data-tab="login">🔑 Log In</button>` : ""}
          ${!user ? `<button type="button" class="btn small ${tab === "register" ? "gold" : "ghost"} auth-tab" data-tab="register">✨ Register</button>` : ""}
          ${user ? `<button type="button" class="btn small ${tab === "login" ? "gold" : "ghost"} auth-tab" data-tab="login" title="Switch account / Log in as another user">🔄 Switch Account</button>` : ""}
        </div>
      `;

      openModal(`${tabsHtml}<div class="auth-body">${content}</div>`);

      $$(".auth-tab").forEach((b) => {
        b.onclick = () => {
          tab = b.dataset.tab;
          draw();
        };
      });
      const swReg = $("#switch-reg");
      if (swReg) swReg.onclick = () => { tab = "register"; draw(); };
      const swLog = $("#switch-login");
      if (swLog) swLog.onclick = () => { tab = "login"; draw(); };
      const swWal = $("#switch-wallet");
      if (swWal) swWal.onclick = () => { tab = "wallet"; draw(); };
      const profWal = $("#btn-prof-wallet");
      if (profWal) profWal.onclick = () => { tab = "wallet"; draw(); };

      // Web3 Wallet Handlers
      const copyBtn = $("#btn-copy-wallet");
      if (copyBtn) {
        copyBtn.onclick = () => {
          const addr = copyBtn.dataset.addr || "";
          navigator.clipboard.writeText(addr).catch(() => {});
          toast("📋 Wallet address copied to clipboard!");
        };
      }

      const discBtn = $("#btn-disconnect-wallet");
      if (discBtn) {
        discBtn.onclick = async () => {
          try {
            await api("/api/auth/profile", {
              method: "POST",
              second,
              body: { walletAddress: "" },
            });
            const cur = getCachedUser(second);
            if (cur) {
              cur.walletAddress = null;
              setCachedUser(cur, second);
            }
            toast("🔌 Web3 Wallet disconnected");
            draw();
            render();
          } catch (err) {
            toast(err.message || "Could not disconnect wallet");
          }
        };
      }

      const swWalBtn = $("#btn-switch-wallet");
      if (swWalBtn) {
        swWalBtn.onclick = () => {
          const cur = getCachedUser(second);
          if (cur) {
            cur.walletAddress = null;
            setCachedUser(cur, second);
          }
          draw();
        };
      }

      const discWalBtn = $("#btn-disconnect-wallet");
      if (discWalBtn) {
        discWalBtn.onclick = async () => {
          await logout(second);
          draw();
        };
      }

      const btnTestSign = $("#btn-test-sign");
      if (btnTestSign) {
        btnTestSign.onclick = () => signTestTransaction(second);
      }

      const pMm = $("#prov-metamask");
      if (pMm) {
        pMm.onclick = async () => {
          let provider = getEVMProvider("metamask");
          if (!provider) {
            for (let i = 0; i < 4; i++) {
              await new Promise((r) => setTimeout(r, 150));
              provider = getEVMProvider("metamask");
              if (provider) break;
            }
          }
          if (provider) {
            await connectEVM(provider, second, "MetaMask");
          } else {
            toast("🦊 MetaMask extension not detected. Please install or unlock MetaMask from metamask.io");
          }
        };
      }

      const pPh = $("#prov-phantom");
      if (pPh) {
        pPh.onclick = async () => {
          await connectPhantom(second, "ethereum");
        };
      }

      // Avatar Preset Buttons
      $$(".btn-preset-avatar").forEach((btn) => {
        btn.onclick = async () => {
          const preset = btn.dataset.preset;
          const me = identity(second);
          try {
            const res = await api("/api/auth/profile", {
              method: "POST",
              second,
              body: { avatar: preset, playerId: me.id },
            });
            if (res && res.user) setCachedUser(res.user, second);
            toast("Avatar updated! ✨");
            draw();
            render();
          } catch (err) {
            toast(err.message || "Failed to set avatar");
          }
        };
      });

      // Avatar File Upload
      const fileUpload = $("#avatar-upload-file");
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
            const me = identity(second);
            try {
              const res = await api("/api/auth/profile", {
                method: "POST",
                second,
                body: { avatar: base64, playerId: me.id },
              });
              if (res && res.user) setCachedUser(res.user, second);
              toast("Custom avatar uploaded successfully! ✨");
              draw();
              render();
            } catch (err) {
              toast(err.message || "Could not upload photo");
            }
          };
          reader.readAsDataURL(file);
        };
      }

      // Edit Bio
      const editBioBtn = $("#btn-edit-bio");
      if (editBioBtn) {
        editBioBtn.onclick = async () => {
          const curBio = (user && user.bio) || "";
          const newBio = prompt("Enter your wizard bio / flavor quote:", curBio);
          if (newBio == null) return;
          const me = identity(second);
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

      // Decks Tab Logic
      if (tab === "decks") {
        const dListEl = $("#prof-decks-list");
        const newDeckBtn = $("#prof-new-deck-btn");
        if (newDeckBtn) {
          newDeckBtn.onclick = () => {
            closeModal();
            go("/builder");
          };
        }
        try {
          const second = window.MTG_SECOND;
          const me = identity(second);
          const allDecks = await api("/api/decks");
          const myDecks = allDecks.filter((d) => {
            if (user && d.userId === user.id) return true;
            if (!user && (d.userId === me.id || (!d.userId && !d.starter))) return true;
            return false;
          });
          if (dListEl) {
            if (!myDecks.length) {
              dListEl.innerHTML = `<div class="empty">No custom decks saved yet to this account. Open the deck builder to craft one!</div>`;
            } else {
              dListEl.innerHTML = myDecks
                .map(
                  (d) => `
                <div class="profile-deck-row" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(255,255,255,0.02);border:1px solid var(--line);border-radius:8px">
                  <div style="display:flex;align-items:center;gap:12px">
                    <img src="${d.cover || "/img/cardback.jpg"}" style="width:36px;height:50px;object-fit:cover;border-radius:4px" />
                    <div>
                      <b style="font-size:14px">${escapeHtml(d.name)}</b>
                      <div class="faint" style="font-size:11px">${escapeHtml(d.format)} · ${d.counts.main + d.counts.command} cards${d.authorName ? ` · by ${escapeHtml(d.authorName)}` : ""}</div>
                    </div>
                  </div>
                  <div style="display:flex;gap:6px">
                    <button type="button" class="btn small gold btn-play-deck" data-did="${d.id}" title="Host match with this deck">⚔️ Play</button>
                    <button type="button" class="btn small ghost btn-edit-deck" data-did="${d.id}" title="Edit in deck builder">✏️ Edit</button>
                    <button type="button" class="btn small ghost btn-copy-deck" data-did="${d.id}" title="Duplicate this deck">📋 Copy</button>
                    <button type="button" class="btn small danger btn-del-deck" data-did="${d.id}" title="Delete deck">🗑️</button>
                  </div>
                </div>
              `
                )
                .join("");

              $$(".btn-play-deck").forEach((btn) => {
                btn.onclick = () => {
                  sessionStorage.setItem("mtg-selected-deck", btn.dataset.did);
                  closeModal();
                  go("/table/new");
                };
              });
              $$(".btn-edit-deck").forEach((btn) => {
                btn.onclick = () => {
                  closeModal();
                  go(`/builder/${btn.dataset.did}`);
                };
              });
              $$(".btn-copy-deck").forEach((btn) => {
                btn.onclick = async () => {
                  try {
                    const deckData = await api(`/api/decks/${btn.dataset.did}`);
                    await api("/api/decks", {
                      method: "POST",
                      body: { ...deckData, name: `${deckData.name} (Copy)` },
                    });
                    toast("📋 Deck duplicated!");
                    draw();
                  } catch (err) {
                    toast("Copy failed: " + (err.message || err));
                  }
                };
              });
              $$(".btn-del-deck").forEach((btn) => {
                btn.onclick = async () => {
                  if (!confirm("Are you sure you want to delete this custom deck?")) return;
                  await api(`/api/decks/${btn.dataset.did}`, { method: "DELETE" });
                  toast("Deck deleted");
                  draw();
                };
              });
            }
          }
        } catch {}
      }

      const form = $("#auth-form");
      if (form) {
        form.onsubmit = async (e) => {
          e.preventDefault();
          toast("Password sign-in has been removed. Connect a wallet to sign in. 🔮");
        };
      }

      const fBtn = $("#btn-faucet");
      if (fBtn) {
        fBtn.onclick = async () => {
          try {
            await claimFaucet(second);
            tab = "vault";
            draw();
            render();
          } catch (err) {
            toast(err.message || "Could not claim refill");
          }
        };
      }

      const lBtn = $("#btn-logout");
      if (lBtn) {
        lBtn.onclick = async () => {
          await logout(second);
          closeModal();
          render();
        };
      }

      const gbBtn = $("#go-builder-btn");
      if (gbBtn) {
        gbBtn.onclick = () => {
          closeModal();
          go("/builder");
        };
      }

      if (tab === "leaderboard") {
        try {
          const lbData = await api("/api/leaderboard");
          const lbEl = $("#lb-content");
          if (lbEl) {
            if (!lbData || !lbData.length) {
              lbEl.innerHTML = `<div class="empty">No registered wizards on the leaderboard yet. Play a match to lead the ranks!</div>`;
            } else {
              lbEl.innerHTML = `
                <table class="leaderboard-table" style="width:100%;border-collapse:collapse;margin-top:10px">
                  <thead>
                    <tr style="text-align:left;border-bottom:1px solid var(--line)">
                      <th style="padding:8px">#</th>
                      <th style="padding:8px">Wizard</th>
                      <th style="padding:8px">🪙 Gold</th>
                      <th style="padding:8px">Record</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${lbData.map((u, i) => `
                      <tr style="border-bottom:1px solid rgba(255,255,255,0.05);background:${user && user.id === u.id ? "rgba(215,180,92,0.12)" : "transparent"}">
                        <td style="padding:8px">${i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
                        <td style="padding:8px"><b>${escapeHtml(u.displayName || u.username)}</b>${user && user.id === u.id ? " <small style='color:var(--gold)'>(you)</small>" : ""}</td>
                        <td style="padding:8px;color:var(--gold);font-weight:bold">${(u.balance || 0).toLocaleString()} 🪙</td>
                        <td style="padding:8px">${u.wins || 0}W / ${u.losses || 0}L</td>
                      </tr>
                    `).join("")}
                  </tbody>
                </table>
              `;
            }
          }
        } catch {}
      }
    }
    await draw();
  }

  /* websocket helper */
  function connectWS({ playerId, name, onState, onError, onHello }) {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    const send = (obj) => {
      if (ws.readyState === 1) ws.send(JSON.stringify(obj));
    };
    const token = getToken(window.MTG_SECOND);
    let pingInterval = null;
    ws.addEventListener("open", () => {
      send({ t: "hello", playerId, name, token });
      pingInterval = setInterval(() => {
        if (ws.readyState === 1) {
          send({ t: "ping", time: Date.now() });
        }
      }, 15000);
    });
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.t === "pong" || msg.t === "presence:pong") {
        return;
      }
      if (msg.t === "hello") {
        if (msg.user) {
          setCachedUser(msg.user, window.MTG_SECOND);
          const goldEl = document.getElementById("user-gold");
          if (goldEl && msg.user.balance != null) {
            goldEl.textContent = msg.user.balance.toLocaleString();
          }
        }
        onHello && onHello(msg);
      } else if (msg.t === "state") {
        if (msg.state && msg.state.seats && msg.state.you != null && msg.state.seats[msg.state.you]) {
          const mySeat = msg.state.seats[msg.state.you];
          if (mySeat.balance != null) {
            const cur = getCachedUser(window.MTG_SECOND);
            if (cur) {
              cur.balance = mySeat.balance;
              setCachedUser(cur, window.MTG_SECOND);
            }
            const goldEl = document.getElementById("user-gold");
            if (goldEl) {
              goldEl.textContent = mySeat.balance.toLocaleString();
            }
          }
        }
        onState && onState(msg.state);
      } else if (msg.t === "joined") {
        /* state follows */
      } else if (msg.t === "error") {
        toast(msg.error);
        onError && onError(msg.error);
      }
    });
    ws.addEventListener("close", () => {
      if (pingInterval) clearInterval(pingInterval);
      toast("Disconnected — retrying…");
      setTimeout(() => {
        if (window.MTG_WS === ws) window.MTG_RECONNECT && window.MTG_RECONNECT();
      }, 800);
    });
    return { ws, send };
  }

  window.MTG = {
    $,
    $$,
    api,
    toast,
    manaPips,
    escapeHtml,
    route,
    go,
    getInfo,
    identity,
    setName,
    nav,
    bindNav,
    openModal,
    closeModal,
    connectWS,
    sparkle: spawnSparkles,
    loginIcon: LOGIN_ICON,
    getToken,
    setToken,
    getCachedUser,
    setCachedUser,
    fetchMe,
    loginWithWallet,
    getPhantomProvider,
    connectPhantom,
    connectWeb3,
    getEVMProvider,
    connectEVM,
    connectSolana,
    connectBurner,
    createBurnerProvider,
    getBurnerWallet,
    signTestTransaction,
    logout,
    claimFaucet,
    openAuthModal,
    openFriendsModal,
    renderOnlineBar,
    initPresence,
    SKINS,
    getSkin,
    setSkin,
    applySkin,
  };

  async function render() {
    try {
      const r = route();
      document.body.classList.toggle("view-table", r.name === "table");
      window.MTG_SECOND = isSecondPlayer();
      applySkin(getSkin(window.MTG_SECOND));

      const isOverlaySection = ["lobby", "tables", "inventory", "bazaar", "builder", "cards", "guilds", "dao", "dnd"].includes(r.name);

      if (r.name === "table") closeModal();

      if (window.MTG_HOMEROOM_INST && (r.name === "table" || r.name === "admin")) {
        try { window.MTG_HOMEROOM_INST.destroy(); } catch {}
        window.MTG_HOMEROOM_INST = null;
      }

      if (isOverlaySection && !window.MTG_HOMEROOM_INST) {
        if (window.MTG_VIEWS.profile) {
          await window.MTG_VIEWS.profile({ name: "profile" });
        }
      }

      if (isOverlaySection) {
        if (r.name === "inventory") {
          return window.MTG.openInventoryModal ? await window.MTG.openInventoryModal() : null;
        }
        if (r.name === "bazaar" || r.name === "cards") {
          return window.MTG.openMarketplaceModal ? await window.MTG.openMarketplaceModal() : null;
        }
        if (r.name === "tables" || r.name === "lobby") {
          return window.MTG.openTablesModal ? await window.MTG.openTablesModal() : null;
        }
        if (r.name === "builder") {
          return window.MTG.openBuilderModal ? await window.MTG.openBuilderModal(r) : null;
        }
        if (r.name === "guilds") {
          return window.MTG.openGuildsModal ? await window.MTG.openGuildsModal() : null;
        }
        if (r.name === "dao") {
          return window.MTG.openDaoModal ? await window.MTG.openDaoModal() : null;
        }
        if (r.name === "dnd") {
          return window.MTG.openDndModal ? await window.MTG.openDndModal({}) : null;
        }
      }

      const view = window.MTG_VIEWS[r.name === "cards" ? "builder" : r.name] || window.MTG_VIEWS.profile || window.MTG_VIEWS.lobby;
      if (!view) throw new Error("UI scripts did not load");
      return await view(r.name === "cards" ? { ...r, browse: true } : r);
    } catch (err) {
      const app = document.getElementById("app");
      app.innerHTML = `<div class="wrap"><h1>Could not load</h1><pre class="muted">${escapeHtml(err && err.stack ? err.stack : err)}</pre><p><a href="#/">Back to Character Profile</a></p></div>`;
    }
  }

  window.MTG_VIEWS = {};
  window.addEventListener("hashchange", () => {
    render();
    sendPresenceRouteUpdate();
  });
  function boot() {
    if (window.MTG_VIEWS && window.MTG_VIEWS.profile) {
      // Re-evaluate ?second=1 from the hash NOW (before any identity/fetch calls),
      // because window.open("...#/table/X?second=1") sets the hash at page-load time
      // but isSecondPlayer() at line 20 ran before sessionStorage was written.
      window.MTG_SECOND = isSecondPlayer();
      if (getToken(window.MTG_SECOND)) {
        fetchMe(window.MTG_SECOND).catch(() => {}).finally(() => {
          render();
          initPresence();
        });
      } else {
        render();
        initPresence();
      }
      return;
    }
    setTimeout(boot, 0);
  }
  boot();
})();
