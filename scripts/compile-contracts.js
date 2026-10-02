#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const solc = require("solc");

const CONTRACTS_DIR = path.join(__dirname, "..", "contracts");
const ARTIFACTS_FILE = path.join(CONTRACTS_DIR, "artifacts.json");

const files = [
  "TCGToken.sol",
  "GGToken.sol",
  "CryptoGameDepositVault.sol",
  "CryptoGameWagerEscrow.sol",
  "CryptoGameGold.sol",
  "CryptoGameCards.sol",
  "CryptoGameDAO.sol"
];

const sources = {};
for (const f of files) {
  const p = path.join(CONTRACTS_DIR, f);
  if (fs.existsSync(p)) {
    sources[f] = { content: fs.readFileSync(p, "utf8") };
  }
}

console.log(`Compiling ${Object.keys(sources).length} Solidity contracts with solc ${solc.version()}...`);

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } }
  }
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  let hasFatal = false;
  for (const err of output.errors) {
    if (err.severity === "error") {
      console.error("❌ " + err.formattedMessage);
      hasFatal = true;
    } else {
      console.warn("⚠️ " + err.formattedMessage);
    }
  }
  if (hasFatal) process.exit(1);
}

const artifacts = {};
for (const [file, contracts] of Object.entries(output.contracts)) {
  for (const [name, data] of Object.entries(contracts)) {
    if (name.startsWith("IERC")) continue; // Skip interfaces
    artifacts[name] = {
      contractName: name,
      sourceFile: file,
      abi: data.abi,
      bytecode: "0x" + data.evm.bytecode.object
    };
    console.log(`✓ ${name} [${file}] -> Bytecode: ${artifacts[name].bytecode.length} chars, ABI: ${data.abi.length} entries`);
  }
}

fs.writeFileSync(ARTIFACTS_FILE, JSON.stringify(artifacts, null, 2), "utf8");
console.log(`\n🎉 All artifacts written to ${ARTIFACTS_FILE}`);
