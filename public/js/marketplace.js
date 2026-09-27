/* ==========================================================================
   MTG Multiverse Card Marketplace & Oracle Bazaar
   World of Warcraft / Diablo 2 Interface Style
   ========================================================================== */
(() => {
  "use strict";

  const {
    $,
    $$,
    api,
    toast,
    escapeHtml,
    openModal,
    closeModal,
    getCachedUser,
    setCachedUser,
    identity,
    sparkle,
    claimFaucet,
  } = window.MTG;

  let activeTab = "featured"; // "featured" | "oracle" | "boosters" | "sell"
  let searchCardsList = [];
  let isSearching = false;
  let sQuery = "";
  let sColor = "";
  let sType = "";
  let sRarity = "";

  // Curated Featured Daily Deals
  const FEATURED_DEALS = [
    {
      id: "black-lotus",
      name: "Black Lotus",
      mana_cost: "{0}",
      type_line: "Artifact",
      rarity: "mythic",
      price: 10000,
      image: "/api/img/bd8fa327-dd41-4737-8f19-2cf5eb1f7cdd?size=normal",
      oracle_text: "{T}, Sacrifice Black Lotus: Add three mana of any one color.",
      flavor: "Treasured relic of the ancient multiverse.",
    },
    {
      id: "mox-diamond",
      name: "Mox Diamond",
      mana_cost: "{0}",
      type_line: "Artifact",
      rarity: "mythic",
      price: 2500,
      image: "/api/img/bf9fecfd-d122-422f-bd0a-5bf69b434dfe?size=normal",
      oracle_text: "You may discard a land card rather than pay this spell's mana cost.\n{T}: Add one mana of any color.",
      flavor: "A diamond forged from astral fire.",
    },
    {
      id: "sol-ring",
      name: "Sol Ring",
      mana_cost: "{1}",
      type_line: "Artifact",
      rarity: "uncommon",
      price: 150,
      image: "/api/img/8ee443cc-e17a-493b-9c93-1f9e141a30e4?size=normal",
      oracle_text: "{T}: Add {C}{C}.",
      flavor: "Lost to time is the artificer's art.",
    },
    {
      id: "force-of-will",
      name: "Force of Will",
      mana_cost: "{3}{U}{U}",
      type_line: "Instant",
      rarity: "mythic",
      price: 1800,
      image: "/api/img/89f612d6-7c59-4a7b-a87d-45f789e88ba5?size=normal",
      oracle_text: "You may pay 1 life and exile a blue card from your hand rather than pay this spell's mana cost.\nCounter target spell.",
      flavor: "I will not let you pass.",
    },
    {
      id: "demonic-tutor",
      name: "Demonic Tutor",
      mana_cost: "{1}{B}",
      type_line: "Sorcery",
      rarity: "rare",
      price: 1200,
      image: "/api/img/a24b4cb6-cebb-428b-8654-74347a6a8d63?size=normal",
      oracle_text: "Search your library for a card, put that card into your hand, then shuffle.",
      flavor: "A dark pact sealed in forbidden ink.",
    },
    {
      id: "lightning-bolt",
      name: "Lightning Bolt",
      mana_cost: "{R}",
      type_line: "Instant",
      rarity: "common",
      price: 50,
      image: "/api/img/7673784e-db4b-43a1-8d55-1bb9fc1e284f?size=normal",
      oracle_text: "Lightning Bolt deals 3 damage to any target.",
      flavor: "The spark of doom from stormclouds above.",
    },
    {
      id: "counterspell",
      name: "Counterspell",
      mana_cost: "{U}{U}",
      type_line: "Instant",
      rarity: "uncommon",
      price: 75,
      image: "/api/img/4f616706-ec97-4923-bb1e-11a69fbaa1f8?size=normal",
      oracle_text: "Counter target spell.",
      flavor: "It was a mistake to challenge me.",
    },
    {
      id: "swords-to-plowshares",
      name: "Swords to Plowshares",
      mana_cost: "{W}",
      type_line: "Instant",
      rarity: "uncommon",
      price: 100,
      image: "/api/img/f7e12477-d59f-442b-a678-1be746d0b7be?size=normal",
      oracle_text: "Exile target creature. Its controller gains life equal to its power.",
      flavor: "Peace claimed him at last.",
    },
    {
      id: "birds-of-paradise",
      name: "Birds of Paradise",
      mana_cost: "{G}",
      type_line: "Creature — Bird",
      rarity: "rare",
      price: 200,
      image: "/api/img/492c2f9a-51e7-4e0f-9899-23bf43ea988b?size=normal",
      oracle_text: "Flying\n{T}: Add one mana of any color.",
      flavor: "Feathers that shimmer with all mana colors.",
    },
    {
      id: "dark-ritual",
      name: "Dark Ritual",
      mana_cost: "{B}",
      type_line: "Instant",
      rarity: "common",
      price: 80,
      image: "/api/img/11e12a84-e7be-4afc-a230-c2e644743fa8?size=normal",
      oracle_text: "Add {B}{B}{B}.",
      flavor: "Power comes at an inescapable price.",
    },
    {
      id: "necropotence",
      name: "Necropotence",
      mana_cost: "{B}{B}{B}",
      type_line: "Enchantment",
      rarity: "mythic",
      price: 1500,
      image: "/api/img/c89c6895-b0f8-444a-9c89-c6b4fd027b3e?size=normal",
      oracle_text: "Skip your draw step.\nWhenever you discard a card, exile that card from your graveyard.\nPay 1 life: Exile the top card of your library face down. Put that card into your hand at the beginning of your next end step.",
      flavor: "Darkness that devours life for endless knowledge.",
    },
    {
      id: "cyclonic-rift",
      name: "Cyclonic Rift",
      mana_cost: "{1}{U}",
      type_line: "Instant",
      rarity: "rare",
      price: 850,
      image: "/api/img/dfb7c4b9-f2f4-4d4e-baf2-86551c8150fe?size=normal",
      oracle_text: "Return target nonland permanent you don't control to its owner's hand.\nOverload {6}{U}",
      flavor: "The sea swept them all away.",
    }
  ];

  // Helper for pricing cards dynamically based on rarity
  function getCardPrice(rarity) {
    switch (String(rarity || "").toLowerCase()) {
      case "mythic": return 750;
      case "rare": return 250;
      case "uncommon": return 75;
      case "common":
      default: return 25;
    }
  }

  // Get local user card collection
  function getUserCollection() {
    try {
      const stored = localStorage.getItem("mtg-user-collection");
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  }

  function saveUserCollection(cards) {
    try {
      localStorage.setItem("mtg-user-collection", JSON.stringify(cards));
    } catch {}
  }

  window.MTG.openMarketplaceModal = async function openMarketplaceModal(opts = {}) {
    const second = window.MTG_SECOND;
    let user = getCachedUser(second);
    const me = identity(second);

    if (opts.tab) activeTab = opts.tab;

    async function fetchCards() {
      isSearching = true;
      render();
      try {
        const params = new URLSearchParams();
        if (sQuery) params.set("q", sQuery);
        if (sColor) params.set("colors", sColor);
        if (sType) params.set("type", sType);
        if (sRarity) params.set("rarity", sRarity);
        params.set("limit", "24");
        const res = await api(`/api/cards?${params.toString()}`);
        searchCardsList = Array.isArray(res) ? res : (res?.cards || []);
      } catch (err) {
        searchCardsList = [];
      } finally {
        isSearching = false;
        render();
      }
    }

    async function handleBuyCard(cardObj, count = 1) {
      user = getCachedUser(second);
      let curBalance = typeof user?.balance === "number" ? user.balance : 0;
      const unitPrice = cardObj.price || getCardPrice(cardObj.rarity);
      const totalPrice = unitPrice * count;

      if (curBalance < totalPrice) {
        toast(`⚠️ Not enough Gold! You need ${totalPrice} 🪙 Gold, but only have ${curBalance} 🪙.`);
        window.MTG_SFX && window.MTG_SFX.play && window.MTG_SFX.play("buzz");
        return;
      }

      curBalance -= totalPrice;
      if (user) {
        user.balance = curBalance;
        setCachedUser(user, second);
        // Persist to backend
        api("/api/auth/profile", {
          method: "POST",
          second,
          body: { balance: curBalance }
        }).catch(() => {});
      } else {
        const curMe = identity(second);
        curMe.balance = curBalance;
        setCachedUser(curMe, second);
      }

      // Add to user collection
      const collection = getUserCollection();
      for (let i = 0; i < count; i++) {
        collection.push({
          id: cardObj.id,
          name: cardObj.name,
          rarity: cardObj.rarity,
          price: unitPrice,
          image: cardObj.image || cardObj.image_small || cardObj.image_uris?.normal || "/img/cardback.jpg",
          acquiredAt: Date.now(),
        });
      }
      saveUserCollection(collection);

      // Effects & Notification
      window.MTG_SFX && window.MTG_SFX.play && window.MTG_SFX.play("coin");
      sparkle(window.innerWidth / 2, window.innerHeight / 2, "gold");
      toast(`🪙 Purchased ${count > 1 ? `${count}x ` : ""}"${cardObj.name}" for ${totalPrice} Gold!`);

      // Update RPG vitals and player card
      if (window.MTG_RPG?.updateUser) window.MTG_RPG.updateUser(user || { balance: curBalance });
      const goldTxt = document.getElementById("dfk-card-gold");
      if (goldTxt) goldTxt.textContent = curBalance.toLocaleString();

      render();
    }

    async function handleSellCard(collIndex) {
      const collection = getUserCollection();
      if (collIndex < 0 || collIndex >= collection.length) return;
      const card = collection[collIndex];
      const refund = Math.max(10, Math.floor((card.price || getCardPrice(card.rarity)) * 0.5));

      user = getCachedUser(second);
      let curBalance = (typeof user?.balance === "number" ? user.balance : 0) + refund;

      if (user) {
        user.balance = curBalance;
        setCachedUser(user, second);
        api("/api/auth/profile", { method: "POST", second, body: { balance: curBalance } }).catch(() => {});
      } else {
        const curMe = identity(second);
        curMe.balance = curBalance;
        setCachedUser(curMe, second);
      }

      collection.splice(collIndex, 1);
      saveUserCollection(collection);

      window.MTG_SFX && window.MTG_SFX.play && window.MTG_SFX.play("coin");
      toast(`🪙 Sold "${card.name}" to the Goblin Trader for +${refund} Gold!`);

      if (window.MTG_RPG?.updateUser) window.MTG_RPG.updateUser(user || { balance: curBalance });
      const goldTxt = document.getElementById("dfk-card-gold");
      if (goldTxt) goldTxt.textContent = curBalance.toLocaleString();

      render();
    }

    async function handleBuyBooster(packName, cost = 150) {
      user = getCachedUser(second);
      let curBalance = typeof user?.balance === "number" ? user.balance : 0;

      if (curBalance < cost) {
        toast(`⚠️ Need ${cost} 🪙 Gold to crack a booster pack!`);
        return;
      }

      curBalance -= cost;
      if (user) {
        user.balance = curBalance;
        setCachedUser(user, second);
        api("/api/auth/profile", { method: "POST", second, body: { balance: curBalance } }).catch(() => {});
      }

      // Fetch 15 random cards for the pack
      try {
        toast(`🎁 Cracking ${packName}… ✨`);
        window.MTG_SFX && window.MTG_SFX.play && window.MTG_SFX.play("start");
        const res = await api(`/api/cards?limit=15`);
        const cards = Array.isArray(res) ? res : (res?.cards || []);
        
        const collection = getUserCollection();
        cards.forEach(c => {
          collection.push({
            id: c.id,
            name: c.name,
            rarity: c.rarity,
            price: getCardPrice(c.rarity),
            image: c.image_small || c.image || c.image_uris?.normal || "/img/cardback.jpg",
            acquiredAt: Date.now(),
          });
        });
        saveUserCollection(collection);

        toast(`🎉 Opened 15 cards from ${packName}! Added to your Multiverse Deckbox!`);
        sparkle(window.innerWidth / 2, window.innerHeight / 2, "gold");

        if (window.MTG_RPG?.updateUser) window.MTG_RPG.updateUser(user || { balance: curBalance });
        const goldTxt = document.getElementById("dfk-card-gold");
        if (goldTxt) goldTxt.textContent = curBalance.toLocaleString();
        
        activeTab = "sell";
        render();
      } catch (err) {
        toast("Failed to open booster pack: " + (err.message || err));
      }
    }

    function render() {
      user = getCachedUser(second);
      const goldBal = typeof user?.balance === "number" ? user.balance : 0;
      const collection = getUserCollection();

      const html = `
        <div class="marketplace-screen-wrap d2-window-frame" style="display:flex; flex-direction:column; max-height:86vh; width:100%; max-width:1040px; box-sizing:border-box; color:#f0e6d2;">
          
          <!-- WoW / Diablo 2 Ornate Stone Title Header -->
          <div class="d2-window-header" style="display:flex; justify-content:space-between; align-items:flex-start; padding-bottom:12px; border-bottom:2px solid #5a4b2c;">
            <div>
              <div style="display:flex; align-items:center; gap:10px;">
                <span style="font-size:28px; filter:drop-shadow(0 2px 4px #000);">⚖️</span>
                <div>
                  <h2 style="margin:0; font-family:'Cinzel', 'Palatino', Georgia, serif; font-size:24px; color:#fce8a6; text-shadow:0 2px 4px #000, 0 0 14px rgba(215,180,92,0.4);">
                    The Oracle Bazaar · Card Marketplace
                  </h2>
                  <p class="muted" style="margin:2px 0 0 0; font-size:12px; color:#c4b595;">
                    Goblin Trade Depot & Diablo 2 Rogue Encampment Auction House. Buy singles, crack booster packs, and trade for Gold!
                  </p>
                </div>
              </div>
            </div>
            <button type="button" class="d2-close-btn" id="mkt-close-btn" title="Close Window [Esc]">✕</button>
          </div>

          <!-- Vault Wealth & Trade Bar -->
          <div class="d2-stone-inset" style="margin-top:12px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div style="display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:24px;">🪙</span>
                <div>
                  <div style="font-size:10px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.06em;">WIZARD TREASURY</div>
                  <div style="font-size:16px; font-weight:bold; color:var(--gold-2, #f5d061); text-shadow:0 1px 2px #000;">
                    ${goldBal.toLocaleString()} <small style="font-size:11px; color:#d1d5db;">Gold</small>
                  </div>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:24px;">💎</span>
                <div>
                  <div style="font-size:10px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.06em;">LOTUS GEMS</div>
                  <div style="font-size:15px; font-weight:bold; color:#67e8f9;">25 <small style="font-size:11px; color:#9ca3af;">Lotus</small></div>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:24px;">📦</span>
                <div>
                  <div style="font-size:10px; color:#9ca3af; text-transform:uppercase; letter-spacing:0.06em;">DECKBOX COLLECTION</div>
                  <div style="font-size:15px; font-weight:bold; color:#86efac;">${collection.length} <small style="font-size:11px; color:#9ca3af;">Cards</small></div>
                </div>
              </div>
            </div>
          </div>

          <!-- WoW Style Nav Tabs -->
          <div class="d2-tabs-bar" style="display:flex; gap:6px; margin-top:14px; border-bottom:2px solid #5a4b2c; padding-bottom:8px;">
            <button type="button" class="d2-tab-btn ${activeTab === 'featured' ? 'active' : ''}" id="mkt-tab-featured">
              <span>⭐</span> <b>Daily Deals & Featured Singles</b>
            </button>
            <button type="button" class="d2-tab-btn ${activeTab === 'oracle' ? 'active' : ''}" id="mkt-tab-oracle">
              <span>🔍</span> <b>35,000+ Oracle Singles Market</b>
            </button>
            <button type="button" class="d2-tab-btn ${activeTab === 'boosters' ? 'active' : ''}" id="mkt-tab-boosters">
              <span>🎁</span> <b>Booster Pack Emporium</b>
            </button>
            <button type="button" class="d2-tab-btn ${activeTab === 'sell' ? 'active' : ''}" id="mkt-tab-sell">
              <span>💰</span> <b>Sell Cards (${collection.length})</b>
            </button>
          </div>

          <!-- Tab Body Content -->
          <div class="marketplace-body" style="flex:1; overflow-y:auto; padding:14px 4px 6px 4px; min-height:340px;">
            ${renderTabContent(goldBal, collection)}
          </div>
        </div>
      `;

      if (window.MTG.openModal) window.MTG.openModal(html);
      bindMarketEvents(goldBal, collection);
    }

    function renderTabContent(goldBal, collection) {
      if (activeTab === "oracle") return renderOracleTab(goldBal);
      if (activeTab === "boosters") return renderBoostersTab(goldBal);
      if (activeTab === "sell") return renderSellTab(collection);
      return renderFeaturedTab(goldBal);
    }

    function renderFeaturedTab(goldBal) {
      return `
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <h3 style="margin:0; font-family:'Cinzel', serif; color:var(--gold-2); font-size:17px;">
                ⭐ Featured Power Singles & Reserved List Artifacts
              </h3>
              <p class="muted" style="margin:2px 0 0 0; font-size:12px;">
                Fresh stock supplied directly from Multiverse planeswalkers. Instant delivery to your inventory deckbox!
              </p>
            </div>
            <span class="chip gold" style="font-size:11px;">Restocks Daily</span>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(310px, 1fr)); gap:12px;">
            ${FEATURED_DEALS.map((d) => {
              const canAfford = goldBal >= d.price;
              const canAfford4 = goldBal >= (d.price * 4);
              const rarityColor = d.rarity === 'mythic' ? '#a335ee' : d.rarity === 'rare' ? '#0070dd' : d.rarity === 'uncommon' ? '#1eff00' : '#ffffff';
              return `
                <div class="d2-card-tile card-panel" style="background:rgba(18,22,32,0.92); border:1.5px solid #4a3c22; border-radius:8px; padding:12px; display:flex; gap:12px; align-items:flex-start;">
                  <img src="${d.image}" alt="${escapeHtml(d.name)}" style="width:78px; aspect-ratio:2.5/3.5; object-fit:cover; border-radius:4px; border:1px solid #5a4b2c; flex-shrink:0;" loading="lazy" />
                  <div style="flex:1; min-width:0; display:flex; flex-direction:column; justify-content:space-between; height:100%;">
                    <div>
                      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:4px;">
                        <b style="font-size:14px; color:${rarityColor}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(d.name)}">
                          ${escapeHtml(d.name)}
                        </b>
                        <span style="font-size:11px; font-weight:bold; color:var(--gold); white-space:nowrap;">
                          ${d.mana_cost}
                        </span>
                      </div>
                      <div style="font-size:10.5px; color:#9ca3af; margin-top:2px;">
                        <span style="color:${rarityColor}; text-transform:capitalize; font-weight:bold;">${d.rarity}</span> · ${d.type_line}
                      </div>
                      <div style="font-size:10px; color:#cbd5e1; margin-top:4px; line-height:1.3; max-height:36px; overflow:hidden; text-overflow:ellipsis;">
                        ${escapeHtml(d.oracle_text)}
                      </div>
                    </div>

                    <div style="margin-top:10px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; align-items:center;">
                      <div style="font-weight:bold; font-size:13px; color:var(--gold-2);">
                        🪙 ${d.price.toLocaleString()} <small style="font-size:10px; color:#9ca3af;">Gold</small>
                      </div>
                      <div style="display:flex; gap:6px;">
                        <button type="button" class="btn small ${canAfford ? 'gold' : 'ghost'} btn-buy-featured" data-fid="${d.id}" data-cnt="1" ${canAfford ? '' : 'disabled'} title="Buy 1 card">
                          Buy 1x
                        </button>
                        <button type="button" class="btn small ghost btn-buy-featured" data-fid="${d.id}" data-cnt="4" ${canAfford4 ? '' : 'disabled'} title="Buy 4x Playset">
                          4x
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;
    }

    function renderOracleTab(goldBal) {
      return `
        <div>
          <!-- Search & Filter Controls -->
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px; background:rgba(0,0,0,0.35); padding:10px; border-radius:8px; border:1px solid #4a3c22;">
            <input type="text" id="mkt-search-input" placeholder="Search 35,000+ cards (name, oracle text, artist)…" value="${escapeHtml(sQuery)}" style="flex:1; min-width:200px; padding:8px 12px; background:#0d111a; border:1px solid #5a4b2c; border-radius:6px; color:#fff;" />
            <select id="mkt-filter-color" style="padding:8px 12px; background:#0d111a; border:1px solid #5a4b2c; border-radius:6px; color:#fff;">
              <option value="">Any Color</option>
              <option value="W" ${sColor === 'W' ? 'selected' : ''}>☀️ White</option>
              <option value="U" ${sColor === 'U' ? 'selected' : ''}>💧 Blue</option>
              <option value="B" ${sColor === 'B' ? 'selected' : ''}>💀 Black</option>
              <option value="R" ${sColor === 'R' ? 'selected' : ''}>🔥 Red</option>
              <option value="G" ${sColor === 'G' ? 'selected' : ''}>🌳 Green</option>
              <option value="C" ${sColor === 'C' ? 'selected' : ''}>💎 Colorless</option>
            </select>
            <select id="mkt-filter-type" style="padding:8px 12px; background:#0d111a; border:1px solid #5a4b2c; border-radius:6px; color:#fff;">
              <option value="">Any Card Type</option>
              <option value="Creature" ${sType === 'Creature' ? 'selected' : ''}>Creature</option>
              <option value="Instant" ${sType === 'Instant' ? 'selected' : ''}>Instant</option>
              <option value="Sorcery" ${sType === 'Sorcery' ? 'selected' : ''}>Sorcery</option>
              <option value="Enchantment" ${sType === 'Enchantment' ? 'selected' : ''}>Enchantment</option>
              <option value="Artifact" ${sType === 'Artifact' ? 'selected' : ''}>Artifact</option>
              <option value="Planeswalker" ${sType === 'Planeswalker' ? 'selected' : ''}>Planeswalker</option>
              <option value="Land" ${sType === 'Land' ? 'selected' : ''}>Land</option>
            </select>
            <select id="mkt-filter-rarity" style="padding:8px 12px; background:#0d111a; border:1px solid #5a4b2c; border-radius:6px; color:#fff;">
              <option value="">Any Rarity</option>
              <option value="common" ${sRarity === 'common' ? 'selected' : ''}>Common (25 🪙)</option>
              <option value="uncommon" ${sRarity === 'uncommon' ? 'selected' : ''}>Uncommon (75 🪙)</option>
              <option value="rare" ${sRarity === 'rare' ? 'selected' : ''}>Rare (250 🪙)</option>
              <option value="mythic" ${sRarity === 'mythic' ? 'selected' : ''}>Mythic (750 🪙)</option>
            </select>
            <button type="button" class="btn gold small" id="mkt-search-submit">🔍 Search Market</button>
          </div>

          <!-- Cards Grid -->
          ${
            isSearching
              ? `<div style="text-align:center; padding:40px; color:var(--gold-2);">⏳ Consulting the Bazaar astral ledger…</div>`
              : searchCardsList.length
              ? `
              <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(150px, 1fr)); gap:12px;">
                ${searchCardsList.map((c) => {
                  const price = getCardPrice(c.rarity);
                  const canAfford = goldBal >= price;
                  const rarityColor = c.rarity === 'mythic' ? '#a335ee' : c.rarity === 'rare' ? '#0070dd' : c.rarity === 'uncommon' ? '#1eff00' : '#ffffff';
                  return `
                    <div class="card-panel" style="padding:8px; background:rgba(18,22,32,0.92); border:1.5px solid #4a3c22; border-radius:6px; text-align:center; display:flex; flex-direction:column; justify-content:space-between;">
                      <div>
                        <img src="${c.image_small || c.image || c.image_uris?.small || c.image_uris?.normal || '/img/cardback.jpg'}" alt="${escapeHtml(c.name)}" style="width:100%; border-radius:4px; aspect-ratio:2.5/3.5; object-fit:cover;" loading="lazy" />
                        <div style="font-size:12px; font-weight:bold; margin-top:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:${rarityColor};" title="${escapeHtml(c.name)}">
                          ${escapeHtml(c.name)}
                        </div>
                        <div style="font-size:10px; color:#9ca3af; margin-top:2px;">
                          <b style="color:${rarityColor}; text-transform:capitalize;">${c.rarity || 'common'}</b> · ${escapeHtml(c.type_line || '')}
                        </div>
                      </div>

                      <div style="margin-top:8px; padding-top:6px; border-top:1px solid rgba(255,255,255,0.06);">
                        <div style="font-size:12px; font-weight:bold; color:var(--gold-2); margin-bottom:6px;">
                          🪙 ${price} Gold
                        </div>
                        <button type="button" class="btn small ${canAfford ? 'gold' : 'ghost'} btn-buy-oracle" data-cid="${c.id}" ${canAfford ? '' : 'disabled'} style="width:100%; padding:4px 6px; font-size:11px;">
                          Buy 1x
                        </button>
                      </div>
                    </div>
                  `;
                }).join("")}
              </div>
            `
              : `
              <div class="empty" style="text-align:center; padding:40px; background:rgba(0,0,0,0.3); border-radius:8px; border:1px dashed #4a3c22;">
                <p style="font-size:14px; color:#fde047;">Enter a card name or filter above to search 35,000+ cards in Magic's 30-year history!</p>
              </div>
            `
          }
        </div>
      `;
    }

    function renderBoostersTab(goldBal) {
      const PACKS = [
        {
          id: "vma",
          name: "Vintage Masters Booster",
          icon: "💎",
          cost: 150,
          desc: "Packed with Power 9, vintage staples, and iconic dual lands. Contains 15 cards.",
          badge: "⭐ High Power",
        },
        {
          id: "mh2",
          name: "Modern Horizons II Pack",
          icon: "⚡",
          cost: 150,
          desc: "Modern-format competitive juggernauts, fetchlands, and powerful pitch spells.",
          badge: "⚔️ Modern",
        },
        {
          id: "cmr",
          name: "Commander Legends Pack",
          icon: "👑",
          cost: 200,
          desc: "Legendary creatures, partner commanders, and EDH multiplayer powerhouses.",
          badge: "👑 Commander",
        },
      ];

      return `
        <div>
          <div style="margin-bottom:14px;">
            <h3 style="margin:0; font-family:'Cinzel', serif; color:var(--gold-2); font-size:17px;">
              🎁 Multiverse Booster Pack Emporium
            </h3>
            <p class="muted" style="margin:2px 0 0 0; font-size:12px;">
              Crack booster packs for 15 randomized cards straight into your collection vault!
            </p>
          </div>

          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
            ${PACKS.map(p => {
              const canAfford = goldBal >= p.cost;
              return `
                <div class="card-panel" style="background:linear-gradient(180deg, #1b202e 0%, #0d1017 100%); border:2px solid #5a4b2c; border-radius:10px; padding:18px; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 10px 25px rgba(0,0,0,0.6);">
                  <div>
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                      <span style="font-size:36px;">${p.icon}</span>
                      <span class="chip gold" style="font-size:10px;">${p.badge}</span>
                    </div>
                    <h3 style="margin:10px 0 4px 0; font-size:17px; color:#fff; font-family:'Cinzel', serif;">
                      ${p.name}
                    </h3>
                    <p class="muted" style="font-size:12px; margin:0 0 12px 0; min-height:36px;">
                      ${p.desc}
                    </p>
                  </div>

                  <div style="pt:12px; border-top:1px solid rgba(255,255,255,0.08); display:flex; justify-content:space-between; align-items:center;">
                    <div style="font-weight:bold; font-size:15px; color:var(--gold-2);">
                      🪙 ${p.cost} Gold
                    </div>
                    <button type="button" class="btn small ${canAfford ? 'gold' : 'ghost'} btn-buy-pack" data-pname="${escapeHtml(p.name)}" data-pcost="${p.cost}" ${canAfford ? '' : 'disabled'}>
                      🎁 Open Pack (15 Cards)
                    </button>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `;
    }

    function renderSellTab(collection) {
      return `
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div>
              <h3 style="margin:0; font-family:'Cinzel', serif; color:var(--gold-2); font-size:17px;">
                💰 Goblin Pawn Trade — Sell Cards for Gold
              </h3>
              <p class="muted" style="margin:2px 0 0 0; font-size:12px;">
                Sell surplus singles from your personal deckbox collection for 50% Gold refund.
              </p>
            </div>
            <span class="chip ghost" style="font-size:11px;">${collection.length} Singles in Deckbox</span>
          </div>

          ${
            collection.length
              ? `
              <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(220px, 1fr)); gap:10px;">
                ${collection.map((c, idx) => {
                  const refund = Math.max(10, Math.floor((c.price || getCardPrice(c.rarity)) * 0.5));
                  const rarityColor = c.rarity === 'mythic' ? '#a335ee' : c.rarity === 'rare' ? '#0070dd' : c.rarity === 'uncommon' ? '#1eff00' : '#ffffff';
                  return `
                    <div class="card-panel" style="padding:10px; background:rgba(18,22,32,0.92); border:1px solid #4a3c22; border-radius:6px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
                      <img src="${c.image || '/img/cardback.jpg'}" alt="${escapeHtml(c.name)}" style="width:42px; aspect-ratio:2.5/3.5; object-fit:cover; border-radius:3px; flex-shrink:0;" />
                      <div style="flex:1; min-width:0;">
                        <div style="font-size:12px; font-weight:bold; color:${rarityColor}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                          ${escapeHtml(c.name)}
                        </div>
                        <div style="font-size:11px; color:var(--gold); margin-top:2px;">
                          +${refund} 🪙 Gold
                        </div>
                      </div>
                      <button type="button" class="btn small danger btn-sell-card" data-idx="${idx}" title="Sell card for gold" style="padding:4px 8px; font-size:11px;">
                        Sell
                      </button>
                    </div>
                  `;
                }).join("")}
              </div>
            `
              : `
              <div class="empty" style="text-align:center; padding:40px; background:rgba(0,0,0,0.3); border-radius:8px; border:1px dashed #4a3c22;">
                <p style="font-size:14px; color:#cbd5e1;">Your deckbox collection is currently empty.</p>
                <p class="muted" style="font-size:12px;">Buy singles from the Daily Deals or crack a Booster Pack to start building your collection!</p>
              </div>
            `
          }
        </div>
      `;
    }

    function bindMarketEvents(goldBal, collection) {
      // Close button
      const closeBtn = $("#mkt-close-btn");
      if (closeBtn) closeBtn.onclick = closeModal;

      // Tab switcher
      const tFeatured = $("#mkt-tab-featured");
      if (tFeatured) tFeatured.onclick = () => { activeTab = "featured"; render(); };
      const tOracle = $("#mkt-tab-oracle");
      if (tOracle) {
        tOracle.onclick = () => {
          activeTab = "oracle";
          if (!searchCardsList.length && !sQuery) fetchCards();
          else render();
        };
      }
      const tBoosters = $("#mkt-tab-boosters");
      if (tBoosters) tBoosters.onclick = () => { activeTab = "boosters"; render(); };
      const tSell = $("#mkt-tab-sell");
      if (tSell) tSell.onclick = () => { activeTab = "sell"; render(); };

      // Buy featured cards
      $$(".btn-buy-featured").forEach((btn) => {
        btn.onclick = () => {
          const fid = btn.dataset.fid;
          const count = parseInt(btn.dataset.cnt, 10) || 1;
          const card = FEATURED_DEALS.find((d) => d.id === fid);
          if (card) handleBuyCard(card, count);
        };
      });

      // Buy oracle singles
      $$(".btn-buy-oracle").forEach((btn) => {
        btn.onclick = () => {
          const cid = btn.dataset.cid;
          const card = searchCardsList.find((c) => c.id === cid);
          if (card) handleBuyCard(card, 1);
        };
      });

      // Buy booster pack
      $$(".btn-buy-pack").forEach((btn) => {
        btn.onclick = () => {
          const pname = btn.dataset.pname;
          const pcost = parseInt(btn.dataset.pcost, 10) || 150;
          handleBuyBooster(pname, pcost);
        };
      });

      // Sell card
      $$(".btn-sell-card").forEach((btn) => {
        btn.onclick = () => {
          const idx = parseInt(btn.dataset.idx, 10);
          handleSellCard(idx);
        };
      });

      // Search controls
      const sInput = $("#mkt-search-input");
      const cSelect = $("#mkt-filter-color");
      const tSelect = $("#mkt-filter-type");
      const sBtn = $("#mkt-search-submit");
      if (sInput) {
        sInput.onkeydown = (e) => {
          if (e.key === "Enter") {
            sQuery = sInput.value.trim();
            sColor = cSelect?.value || "";
            sType = tSelect?.value || "";
            sRarity = rSelect?.value || "";
            fetchCards();
          }
        };
      }
      if (sBtn) {
        sBtn.onclick = () => {
          sQuery = sInput?.value?.trim() || "";
          sColor = cSelect?.value || "";
          sType = tSelect?.value || "";
          sRarity = rSelect?.value || "";
          fetchCards();
        };
      }
      if (sInput) {
        sInput.onkeydown = (e) => {
          if (e.key === "Enter") {
            sQuery = sInput.value.trim();
            sColor = cSelect?.value || "";
            sType = tSelect?.value || "";
            sRarity = rSelect?.value || "";
            fetchCards();
          }
        };
      }
    }

    render();
  };

  window.MTG_VIEWS = window.MTG_VIEWS || {};
  window.MTG_VIEWS.bazaar = async function bazaarView() {
    return window.MTG.openMarketplaceModal();
  };
  window.MTG_VIEWS.cards = async function cardsView() {
    return window.MTG.openMarketplaceModal();
  };
})();
