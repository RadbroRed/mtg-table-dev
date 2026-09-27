# The Crypto Game · Smart Contracts 🪙⚔️

This directory contains the on-chain smart contracts, ABIs, and Web3 integration helpers for **The Crypto Game**.

---

## 📜 Contract Architecture

### 1. `CryptoGameGold.sol` (ERC-20 Token)
* **Token Name**: `Crypto Game Gold`
* **Symbol**: `GOLD`
* **Decimals**: `18`
* **Features**:
  * In-game currency for table wagers, marketplace trades, and tournament buy-ins.
  * Controlled minting for game achievements, level ups, and verified match winnings.
  * Burning mechanism for store purchases and DAO sinks.

### 2. `CryptoGameCards.sol` (ERC-721 NFT)
* **Token Name**: `Crypto Game Cards`
* **Symbol**: `TCGC`
* **Features**:
  * Playable Tolarian cards and collector editions minted on-chain.
  * Tracks card power, toughness, rarity, foil status, and Scryfall/IPFS oracle metadata URI.
  * Marketplace operator approval for decentralized peer-to-peer card trading.

### 3. `CryptoGameWagerEscrow.sol` (Match Escrow)
* **Features**:
  * Trustless 2-player match escrow supporting native ETH or `GOLD` ERC-20 tokens.
  * Players deposit matching stakes for casual and ranked duel tables.
  * Collects 3% match rake routed to the community DAO treasury.
  * Match settlement authorized via game server referee cryptographic signatures (EIP-191 / EIP-712).
  * Safe refund & cancellation if an opponent fails to sit or abandons before play.

### 4. `CryptoGameDAO.sol` (Community Governance & Treasury)
* **Features**:
  * Holds accumulated match rake fees and tournament prize reserves.
  * Community members vote on game balance updates, tournament prize distributions, and custom cards.
  * Quadratic / token-weighted voting based on `GOLD` balance.

---

## 🛠️ Usage with ethers.js

The contracts can be imported directly into `server.js` or frontend modules via [`contracts/index.js`](file:///home/openclaw/the-crypto-game/contracts/index.js):

```javascript
const { getContract, generateMatchId, signMatchOutcome, ABIS } = require("./contracts");
const { ethers } = require("ethers");

// Connect to Sepolia provider
const provider = new ethers.JsonRpcProvider("https://rpc.sepolia.org");
const goldContract = getContract("CryptoGameGold", "0x...", provider);

// Check balance
const balance = await goldContract.balanceOf("0xPlayerAddress...");
console.log("Gold Balance:", ethers.formatEther(balance));
```

---

## 🚀 Deployment

Supported EVM networks:
* **Ethereum Sepolia Testnet** (`chainId: 11155111`)
* **Base Sepolia** (`chainId: 84532`)
* **Arbitrum Sepolia** (`chainId: 421614`)
* **Local Hardhat / Anvil** (`chainId: 31337`)

To compile and deploy using Hardhat or Foundry:
```bash
# Using Foundry
forge build
forge create contracts/CryptoGameGold.sol:CryptoGameGold --rpc-url <RPC> --private-key <KEY>

# Using Hardhat
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
```
Addresses should be updated in [`contracts/addresses.json`](file:///home/openclaw/the-crypto-game/contracts/addresses.json).
