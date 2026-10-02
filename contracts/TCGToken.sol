// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TCGToken ($TCG)
 * @dev The official game token for The Crypto Game.
 * - Total supply: 1,000,000,000 TCG (1 Billion)
 * - Decimals: 18
 * - Instant Buy Rate: 0.0001 ETH per 1 TCG (1 ETH = 10,000 TCG)
 */
contract TCGToken {
    string public constant name = "The Crypto Game";
    string public constant symbol = "TCG";
    uint8 public constant decimals = 18;

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000 * 1e18; // 1 Billion TCG
    uint256 public pricePerTokenWei = 0.0001 ether; // 0.0001 ETH per 1 TCG (1e14 wei)

    uint256 private _totalSupply;
    address public owner;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event TokensPurchased(address indexed buyer, uint256 ethSpent, uint256 tokensReceived);
    event PriceUpdated(uint256 oldPrice, uint256 newPrice);
    event ETHWithdrawn(address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    /**
     * @param initialSaleReserve Amount of TCG allocated to the contract's public sale pool (e.g. 200,000,000 * 1e18).
     * The remaining tokens from the 1 Billion total supply are minted directly to Amber (msg.sender).
     */
    constructor(uint256 initialSaleReserve) {
        owner = msg.sender;
        require(initialSaleReserve <= TOTAL_SUPPLY, "Sale reserve exceeds total supply");

        uint256 ownerAmount = TOTAL_SUPPLY - initialSaleReserve;
        if (ownerAmount > 0) {
            _mint(msg.sender, ownerAmount);
        }
        if (initialSaleReserve > 0) {
            _mint(address(this), initialSaleReserve);
        }
    }

    function totalSupply() external view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function allowance(address holder, address spender) external view returns (uint256) {
        return _allowances[holder][spender];
    }

    function approve(address spender, uint256 value) external returns (bool) {
        _approve(msg.sender, spender, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 currentAllowance = _allowances[from][msg.sender];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= value, "ERC20: insufficient allowance");
            unchecked {
                _approve(from, msg.sender, currentAllowance - value);
            }
        }
        _transfer(from, to, value);
        return true;
    }

    /**
     * @dev Buy TCG with ETH at the fixed rate of 0.0001 ETH per 1 TCG.
     * e.g. 0.0001 ETH -> 1 TCG (1e18 units).
     *      0.01 ETH   -> 100 TCG.
     *      1.0 ETH    -> 10,000 TCG.
     */
    function buyTokens() public payable returns (uint256 tokensBought) {
        require(msg.value > 0, "Must send ETH to buy TCG");
        require(pricePerTokenWei > 0, "Sale is inactive");

        tokensBought = (msg.value * 1e18) / pricePerTokenWei;
        require(tokensBought > 0, "Payment too small for 1 token unit");
        require(_balances[address(this)] >= tokensBought, "Insufficient TCG in public sale pool");

        _transfer(address(this), msg.sender, tokensBought);
        emit TokensPurchased(msg.sender, msg.value, tokensBought);
        return tokensBought;
    }

    receive() external payable {
        buyTokens();
    }

    /**
     * @dev Deposit additional TCG tokens into the contract's public sale pool.
     */
    function depositToSalePool(uint256 amount) external {
        _transfer(msg.sender, address(this), amount);
    }

    /**
     * @dev Withdraw unsold TCG tokens from the public sale pool.
     */
    function withdrawFromSalePool(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        _transfer(address(this), to, amount);
    }

    /**
     * @dev Withdraw ETH collected from token sales to owner.
     */
    function withdrawETH(address payable to) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        uint256 balance = address(this).balance;
        require(balance > 0, "No ETH to withdraw");
        (bool sent, ) = to.call{value: balance}("");
        require(sent, "ETH transfer failed");
        emit ETHWithdrawn(to, balance);
    }

    /**
     * @dev Update token price if needed.
     */
    function setPrice(uint256 newPriceWei) external onlyOwner {
        require(newPriceWei > 0, "Price must be > 0");
        uint256 oldPrice = pricePerTokenWei;
        pricePerTokenWei = newPriceWei;
        emit PriceUpdated(oldPrice, newPriceWei);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        address old = owner;
        owner = newOwner;
        emit OwnershipTransferred(old, newOwner);
    }

    function _transfer(address from, address to, uint256 value) internal {
        require(from != address(0), "ERC20: transfer from zero");
        require(to != address(0), "ERC20: transfer to zero");
        require(_balances[from] >= value, "ERC20: transfer exceeds balance");

        unchecked {
            _balances[from] -= value;
            _balances[to] += value;
        }
        emit Transfer(from, to, value);
    }

    function _approve(address holder, address spender, uint256 value) internal {
        require(holder != address(0), "ERC20: approve from zero");
        require(spender != address(0), "ERC20: approve to zero");
        _allowances[holder][spender] = value;
        emit Approval(holder, spender, value);
    }

    function _mint(address account, uint256 value) internal {
        require(account != address(0), "ERC20: mint to zero");
        _totalSupply += value;
        unchecked {
            _balances[account] += value;
        }
        emit Transfer(address(0), account, value);
    }
}
