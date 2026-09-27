// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CryptoGameCards (TCGC)
 * @dev ERC-721 NFT implementation for playable Tolarian cards, foil editions,
 * and minted in-game items for The Crypto Game.
 */
contract CryptoGameCards {
    string public constant name = "Crypto Game Cards";
    string public constant symbol = "TCGC";

    address public owner;
    address public marketplaceContract;

    uint256 private _nextTokenId = 1;

    struct CardMeta {
        string cardId;       // e.g. "scryfall-oracle-id" or card name slug
        string edition;      // "standard", "foil", "borderless", "alpha"
        uint16 power;
        uint16 toughness;
        uint8 rarity;        // 1=Common, 2=Uncommon, 3=Rare, 4=Mythic, 5=Artifact
        bool isFoil;
    }

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _tokenApprovals;
    mapping(address => mapping(address => bool)) private _operatorApprovals;
    mapping(uint256 => string) private _tokenURIs;
    mapping(uint256 => CardMeta) public cardDetails;
    mapping(address => bool) public isMinter;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event CardMinted(uint256 indexed tokenId, address indexed recipient, string cardId, bool isFoil);
    event MinterUpdated(address indexed minter, bool status);
    event MarketplaceUpdated(address indexed marketplace);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyMinter() {
        require(msg.sender == owner || isMinter[msg.sender], "Not authorized to mint cards");
        _;
    }

    constructor() {
        owner = msg.sender;
        isMinter[msg.sender] = true;
    }

    function balanceOf(address account) external view returns (uint256) {
        require(account != address(0), "Zero address inquiry");
        return _balances[account];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address cardOwner = _owners[tokenId];
        require(cardOwner != address(0), "Token does not exist");
        return cardOwner;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_owners[tokenId] != address(0), "Token does not exist");
        return _tokenURIs[tokenId];
    }

    function approve(address to, uint256 tokenId) external {
        address cardOwner = ownerOf(tokenId);
        require(to != cardOwner, "Approval to current owner");
        require(msg.sender == cardOwner || isApprovedForAll(cardOwner, msg.sender), "Not authorized to approve");

        _tokenApprovals[tokenId] = to;
        emit Approval(cardOwner, to, tokenId);
    }

    function getApproved(uint256 tokenId) public view returns (address) {
        require(_owners[tokenId] != address(0), "Token does not exist");
        return _tokenApprovals[tokenId];
    }

    function setApprovalForAll(address operator, bool approved) external {
        require(operator != msg.sender, "Approve to caller");
        _operatorApprovals[msg.sender][operator] = approved;
        emit ApprovalForAll(msg.sender, operator, approved);
    }

    function isApprovedForAll(address cardOwner, address operator) public view returns (bool) {
        if (operator == marketplaceContract && marketplaceContract != address(0)) {
            return true;
        }
        return _operatorApprovals[cardOwner][operator];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        require(_isApprovedOrOwner(msg.sender, tokenId), "Caller is not owner nor approved");
        _transfer(from, to, tokenId);
    }

    function mintCard(
        address to,
        string calldata cardId,
        string calldata edition,
        uint16 power,
        uint16 toughness,
        uint8 rarity,
        bool isFoil,
        string calldata uri
    ) external onlyMinter returns (uint256) {
        require(to != address(0), "Mint to zero address");

        uint256 tokenId = _nextTokenId++;
        _balances[to] += 1;
        _owners[tokenId] = to;
        _tokenURIs[tokenId] = uri;

        cardDetails[tokenId] = CardMeta({
            cardId: cardId,
            edition: edition,
            power: power,
            toughness: toughness,
            rarity: rarity,
            isFoil: isFoil
        });

        emit Transfer(address(0), to, tokenId);
        emit CardMinted(tokenId, to, cardId, isFoil);

        return tokenId;
    }

    function setMinter(address minter, bool status) external onlyOwner {
        require(minter != address(0), "Invalid minter address");
        isMinter[minter] = status;
        emit MinterUpdated(minter, status);
    }

    function setMarketplace(address _marketplace) external onlyOwner {
        marketplaceContract = _marketplace;
        emit MarketplaceUpdated(_marketplace);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function _isApprovedOrOwner(address spender, uint256 tokenId) internal view returns (bool) {
        address cardOwner = ownerOf(tokenId);
        return (spender == cardOwner || isApprovedForAll(cardOwner, spender) || getApproved(tokenId) == spender);
    }

    function _transfer(address from, address to, uint256 tokenId) internal {
        require(ownerOf(tokenId) == from, "Transfer from incorrect owner");
        require(to != address(0), "Transfer to zero address");

        delete _tokenApprovals[tokenId];

        unchecked {
            _balances[from] -= 1;
            _balances[to] += 1;
        }
        _owners[tokenId] = to;

        emit Transfer(from, to, tokenId);
    }
}
