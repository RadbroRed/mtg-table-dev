/**
 * @file contracts/index.js
 * @description Crypto Contracts SDK & ABIs for The Crypto Game.
 * Connects node server, game referee, and frontend client to deployed EVM contracts.
 */

const fs = require("fs");
const path = require("path");

let addresses = {};
try {
  const addrPath = path.join(__dirname, "addresses.json");
  if (fs.existsSync(addrPath)) {
    addresses = JSON.parse(fs.readFileSync(addrPath, "utf8"));
  }
} catch (err) {
  console.warn("[contracts] Could not load addresses.json:", err.message);
}

// Minimal & Complete ABI specifications for client and server ethers v6 usage
const ABIS = {
  CryptoGameGold: [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function transfer(address to, uint256 value) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function transferFrom(address from, address to, uint256 value) returns (bool)",
    "function mint(address to, uint256 amount) returns (bool)",
    "function burn(uint256 amount) returns (bool)",
    "function burnFrom(address account, uint256 amount) returns (bool)",
    "event Transfer(address indexed from, address indexed to, uint256 value)",
    "event Approval(address indexed owner, address indexed spender, uint256 value)"
  ],

  CryptoGameCards: [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function balanceOf(address account) view returns (uint256)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function approve(address to, uint256 tokenId)",
    "function getApproved(uint256 tokenId) view returns (address)",
    "function setApprovalForAll(address operator, bool approved)",
    "function isApprovedForAll(address owner, address operator) view returns (bool)",
    "function transferFrom(address from, address to, uint256 tokenId)",
    "function mintCard(address to, string cardId, string edition, uint16 power, uint16 toughness, uint8 rarity, bool isFoil, string uri) returns (uint256)",
    "function cardDetails(uint256 tokenId) view returns (string cardId, string edition, uint16 power, uint16 toughness, uint8 rarity, bool isFoil)",
    "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
    "event CardMinted(uint256 indexed tokenId, address indexed recipient, string cardId, bool isFoil)"
  ],

  CryptoGameWagerEscrow: [
    "function owner() view returns (address)",
    "function daoTreasury() view returns (address)",
    "function referee() view returns (address)",
    "function DAO_FEE_BPS() view returns (uint256)",
    "function matches(bytes32 matchId) view returns (bytes32 tableCode, address token, uint256 wagerPerPlayer, address player1, address player2, uint8 state, address winner, uint256 createdAt)",
    "function createMatch(bytes32 matchId, bytes32 tableCode, address token, uint256 wager) payable",
    "function joinMatch(bytes32 matchId) payable",
    "function settleMatch(bytes32 matchId, address winner, bytes signature)",
    "function cancelMatch(bytes32 matchId, string reason)",
    "event MatchCreated(bytes32 indexed matchId, bytes32 indexed tableCode, address indexed player1, address token, uint256 wager)",
    "event PlayerJoined(bytes32 indexed matchId, address indexed player2)",
    "event MatchSettled(bytes32 indexed matchId, address indexed winner, uint256 payout, uint256 daoFee)",
    "event MatchCancelled(bytes32 indexed matchId, string reason)"
  ],

  CryptoGameDAO: [
    "function name() view returns (string)",
    "function goldToken() view returns (address)",
    "function proposalCount() view returns (uint256)",
    "function proposals(uint256 id) view returns (uint256 id, address proposer, string title, string description, uint256 votesFor, uint256 votesAgainst, uint256 startTime, uint256 endTime, bool executed, address targetAddress, uint256 requestedPayout)",
    "function createProposal(string title, string description, address targetAddress, uint256 requestedPayout) returns (uint256)",
    "function vote(uint256 proposalId, bool support)",
    "function executeProposal(uint256 proposalId)",
    "event ProposalCreated(uint256 indexed id, address indexed proposer, string title, uint256 requestedPayout)",
    "event Voted(uint256 indexed id, address indexed voter, bool support, uint256 weight)",
    "event ProposalExecuted(uint256 indexed id, address target, uint256 payout)"
  ]
};

/**
 * Returns an ethers Contract instance connected to the specified address/signer.
 * @param {string} name - Contract name (CryptoGameGold, CryptoGameCards, CryptoGameWagerEscrow, CryptoGameDAO)
 * @param {string} address - Deployed contract address
 * @param {object} signerOrProvider - ethers.js Signer or Provider instance
 */
function getContract(name, address, signerOrProvider) {
  const { Contract } = require("ethers");
  const abi = ABIS[name];
  if (!abi) throw new Error(`Unknown contract ABI: ${name}`);
  return new Contract(address, abi, signerOrProvider);
}

/**
 * Generates an on-chain matchId hash from a table code and timestamp.
 */
function generateMatchId(tableCode, salt = Date.now()) {
  const { keccak256, toUtf8Bytes } = require("ethers");
  return keccak256(toUtf8Bytes(`${tableCode}:${salt}`));
}

/**
 * Signs a match settlement outcome as referee.
 */
async function signMatchOutcome(matchId, winnerAddress, escrowAddress, refereeSigner) {
  const { keccak256, solidityPacked, getBytes } = require("ethers");
  const messageHash = keccak256(
    solidityPacked(
      ["bytes32", "address", "address"],
      [matchId, winnerAddress, escrowAddress]
    )
  );
  return await refereeSigner.signMessage(getBytes(messageHash));
}

module.exports = {
  ABIS,
  addresses,
  getContract,
  generateMatchId,
  signMatchOutcome
};
