#!/usr/bin/env node
"use strict";

/**
 * @file scripts/deploy-contracts.js
 * @description Deploys The Crypto Game smart contracts to Ethereum Sepolia:
 *  1. $TCG Token (1 Billion supply, 0.0001 ETH instant buy rate)
 *  2. CryptoGameDepositVault (simple deposit contract for both tokens, exclusive admin access for Amber)
 *  3. $GG Token (1 Trillion supply minted into the Deposit Vault)
 *  4. CryptoGameWagerEscrow (Match escrow for $TCG wagers)
 *
 * Usage:
 *   PRIVATE_KEY=0x... node scripts/deploy-contracts.js
 *   --or--
 *   node scripts/deploy-contracts.js --private-key 0x...
 */

const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

const AMBER_EXPECTED_ADDRESS = "0x8233B657D4a5713b606Ba12321C4eC901Dc85cE9";
const DEFAULT_RPC = process.env.RPC_URL || "https://gateway.tenderly.co/public/sepolia";
const ADDRESSES_PATH = path.join(__dirname, "..", "contracts", "addresses.json");
const ARTIFACTS_PATH = path.join(__dirname, "..", "contracts", "artifacts.json");

async function main() {
  console.log("============================================================");
  console.log("⚔️  The Crypto Game · On-Chain Smart Contract Deployment");
  console.log("============================================================\n");

  // 1. Get Private Key
  let privateKey = process.env.AMBER_PRIVATE_KEY || process.env.PRIVATE_KEY;
  const pkArgIndex = process.argv.indexOf("--private-key");
  if (pkArgIndex !== -1 && process.argv[pkArgIndex + 1]) {
    privateKey = process.argv[pkArgIndex + 1];
  }

  if (!privateKey) {
    console.error("❌ Error: No private key provided.");
    console.log("\nTo deploy via command line:");
    console.log("  AMBER_PRIVATE_KEY=0x... node scripts/deploy-contracts.js");
    console.log("\n-- OR --");
    console.log("Open the Web3 Deployer UI in your browser to sign with MetaMask without sharing keys:");
    console.log("  https://heavily-consultant-auto-logging.trycloudflare.com/#/deploy\n");
    process.exit(1);
  }

  if (!privateKey.startsWith("0x")) privateKey = "0x" + privateKey;

  // 2. Connect Provider & Wallet
  console.log(`Connecting to Sepolia RPC: ${DEFAULT_RPC}...`);
  const provider = new ethers.JsonRpcProvider(DEFAULT_RPC, 11155111);
  const wallet = new ethers.Wallet(privateKey, provider);
  const deployerAddress = await wallet.getAddress();

  console.log(`Deployer Wallet: ${deployerAddress}`);
  if (deployerAddress.toLowerCase() === AMBER_EXPECTED_ADDRESS.toLowerCase()) {
    console.log("👑 Main Amber Wallet verified!");
  } else {
    console.log(`ℹ️ Note: Deployer (${deployerAddress}) is not the canonical Amber address (${AMBER_EXPECTED_ADDRESS}). Proceeding with current wallet.`);
  }

  const balance = await provider.getBalance(deployerAddress);
  console.log(`Wallet Balance: ${ethers.formatEther(balance)} Sepolia ETH`);

  if (balance < ethers.parseEther("0.005")) {
    console.warn("⚠️ Warning: Sepolia ETH balance is very low. Deployment may run out of gas.");
  }

  // 3. Load compiled artifacts
  if (!fs.existsSync(ARTIFACTS_PATH)) {
    console.log("Compiling contracts first...");
    require("./compile-contracts.js");
  }
  const artifacts = JSON.parse(fs.readFileSync(ARTIFACTS_PATH, "utf8"));

  // Helper for deploying
  async function deploy(name, factoryArgs = []) {
    console.log(`\nDeploying ${name}...`);
    const art = artifacts[name];
    if (!art) throw new Error(`Missing artifact for ${name}`);
    const factory = new ethers.ContractFactory(art.abi, art.bytecode, wallet);
    const contract = await factory.deploy(...factoryArgs);
    console.log(`Tx submitted: ${contract.deploymentTransaction().hash}`);
    console.log("Waiting for block confirmation...");
    await contract.waitForDeployment();
    const addr = await contract.getAddress();
    console.log(`✅ ${name} deployed at: ${addr}`);
    console.log(`   Etherscan: https://sepolia.etherscan.io/address/${addr}`);
    return contract;
  }

  // ------------------------------------------------------------
  // STEP 1: Deploy $TCG Token (1 Billion Supply, 0.0001 ETH buy price)
  // ------------------------------------------------------------
  // 200,000,000 TCG in contract public sale pool for 0.0001 ETH instant buy
  // 800,000,000 TCG minted to Amber deployer
  const tcgSaleReserve = ethers.parseEther("200000000");
  const tcgContract = await deploy("TCGToken", [tcgSaleReserve]);
  const tcgAddress = await tcgContract.getAddress();

  // ------------------------------------------------------------
  // STEP 2: Deploy CryptoGameDepositVault
  // ------------------------------------------------------------
  // Initially pass tcgAddress and address(0) for GG
  const vaultContract = await deploy("CryptoGameDepositVault", [tcgAddress, ethers.ZeroAddress]);
  const vaultAddress = await vaultContract.getAddress();

  // ------------------------------------------------------------
  // STEP 3: Deploy $GG Token (1 Trillion Supply directly into Vault)
  // ------------------------------------------------------------
  // 1,000,000,000,000 GG minted directly to the Deposit Vault
  // Only Amber (owner of the vault) can access/withdraw them
  const ggContract = await deploy("GGToken", [vaultAddress]);
  const ggAddress = await ggContract.getAddress();

  // Link GG token in Vault
  console.log("\nConfiguring tokens in CryptoGameDepositVault...");
  const setTokensTx = await vaultContract.setTokens(tcgAddress, ggAddress);
  await setTokensTx.wait();
  console.log("✅ DepositVault tokens configured (TCG & GG)!");

  // ------------------------------------------------------------
  // STEP 4: Deploy CryptoGameWagerEscrow
  // ------------------------------------------------------------
  // Referee: deployer address (can also be updated to game server key)
  // DAO Treasury: deployer address (Amber)
  const escrowContract = await deploy("CryptoGameWagerEscrow", [deployerAddress, deployerAddress]);
  const escrowAddress = await escrowContract.getAddress();

  // ------------------------------------------------------------
  // STEP 5: Update contracts/addresses.json
  // ------------------------------------------------------------
  console.log("\nUpdating contracts/addresses.json...");
  let addresses = {};
  if (fs.existsSync(ADDRESSES_PATH)) {
    try {
      addresses = JSON.parse(fs.readFileSync(ADDRESSES_PATH, "utf8"));
    } catch (_) {}
  }
  if (!addresses.sepolia) addresses.sepolia = { chainId: 11155111 };

  addresses.sepolia.amberWallet = deployerAddress;
  addresses.sepolia.TCGToken = tcgAddress;
  addresses.sepolia.GGToken = ggAddress;
  addresses.sepolia.CryptoGameDepositVault = vaultAddress;
  addresses.sepolia.CryptoGameWagerEscrow = escrowAddress;
  addresses.sepolia.daoTreasury = deployerAddress;

  fs.writeFileSync(ADDRESSES_PATH, JSON.stringify(addresses, null, 2), "utf8");
  console.log(`✅ Saved deployed addresses to ${ADDRESSES_PATH}`);

  // Summary
  console.log("\n============================================================");
  console.log("🎉 ALL CONTRACTS DEPLOYED SUCCESSFULLY TO ETH SEPOLIA!");
  console.log("============================================================");
  console.log(`👑 Main (Amber) Wallet:     ${deployerAddress}`);
  console.log(`🪙 $TCG Token (1bn):         ${tcgAddress}`);
  console.log(`   * Instant Buy Rate:       0.0001 ETH per 1 TCG`);
  console.log(`   * Sale Pool Reserve:      200,000,000 TCG`);
  console.log(`   * Amber Initial Balance:  800,000,000 TCG`);
  console.log(`🏦 Deposit Vault:            ${vaultAddress}`);
  console.log(`   * Access:                 Exclusive access for Amber (${deployerAddress})`);
  console.log(`💎 $GG Token (1tn):          ${ggAddress}`);
  console.log(`   * Initial Holder:         Vault (${vaultAddress})`);
  console.log(`⚔️  Wager Escrow:             ${escrowAddress}`);
  console.log(`   * Supported Token:        $TCG`);
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});
