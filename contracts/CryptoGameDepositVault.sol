// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/**
 * @title CryptoGameDepositVault
 * @dev Simple deposit and reserve vault for $TCG, $GG, and ETH.
 * - Supports user deposits and withdrawals for $TCG and other tokens.
 * - Holds the $GG 1 Trillion reserve supply with exclusive access for Amber (owner).
 */
contract CryptoGameDepositVault {
    address public owner;
    address public tcgToken;
    address public ggToken;

    // token => user => deposited balance
    mapping(address => mapping(address => uint256)) public userDeposits;
    // user => ETH deposited
    mapping(address => uint256) public ethDeposits;

    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event ETHDeposited(address indexed user, uint256 amount);
    event ETHWithdrawn(address indexed user, uint256 amount);
    event AdminWithdrawn(address indexed token, address indexed to, uint256 amount);
    event TokensConfigured(address tcg, address gg);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only Amber/owner authorized");
        _;
    }

    constructor(address _tcgToken, address _ggToken) {
        owner = msg.sender;
        tcgToken = _tcgToken;
        ggToken = _ggToken;
    }

    function setTokens(address _tcg, address _gg) external onlyOwner {
        tcgToken = _tcg;
        ggToken = _gg;
        emit TokensConfigured(_tcg, _gg);
    }

    /**
     * @dev Deposit ERC-20 tokens ($TCG, $GG, etc.) into the vault.
     */
    function deposit(address token, uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(token != address(0), "Invalid token address");

        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Transfer failed");
        userDeposits[token][msg.sender] += amount;

        emit Deposited(msg.sender, token, amount);
    }

    /**
     * @dev Withdraw user's deposited tokens.
     */
    function withdraw(address token, uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(userDeposits[token][msg.sender] >= amount, "Insufficient deposit balance");

        userDeposits[token][msg.sender] -= amount;
        require(IERC20(token).transfer(msg.sender, amount), "Transfer failed");

        emit Withdrawn(msg.sender, token, amount);
    }

    /**
     * @dev Deposit native ETH.
     */
    function depositETH() external payable {
        require(msg.value > 0, "Zero ETH sent");
        ethDeposits[msg.sender] += msg.value;
        emit ETHDeposited(msg.sender, msg.value);
    }

    /**
     * @dev Withdraw user's deposited ETH.
     */
    function withdrawETH(uint256 amount) external {
        require(amount > 0, "Amount must be > 0");
        require(ethDeposits[msg.sender] >= amount, "Insufficient ETH balance");

        ethDeposits[msg.sender] -= amount;
        (bool sent, ) = msg.sender.call{value: amount}("");
        require(sent, "ETH transfer failed");

        emit ETHWithdrawn(msg.sender, amount);
    }

    receive() external payable {
        ethDeposits[msg.sender] += msg.value;
        emit ETHDeposited(msg.sender, msg.value);
    }

    /**
     * @dev Amber's exclusive access to vault reserves (including the 1T $GG token reserve).
     * Only Amber can access or withdraw reserve funds.
     */
    function adminWithdraw(address token, uint256 amount, address to) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        require(IERC20(token).balanceOf(address(this)) >= amount, "Exceeds vault token balance");

        require(IERC20(token).transfer(to, amount), "Admin transfer failed");
        emit AdminWithdrawn(token, to, amount);
    }

    /**
     * @dev Amber's exclusive access to withdraw unallocated ETH.
     */
    function adminWithdrawETH(address payable to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");
        require(address(this).balance >= amount, "Exceeds vault ETH balance");

        (bool sent, ) = to.call{value: amount}("");
        require(sent, "Admin ETH transfer failed");
        emit AdminWithdrawn(address(0), to, amount);
    }

    /**
     * @dev Helper to view total tokens of any type held by this vault.
     */
    function vaultBalance(address token) external view returns (uint256) {
        if (token == address(0)) {
            return address(this).balance;
        }
        return IERC20(token).balanceOf(address(this));
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        address old = owner;
        owner = newOwner;
        emit OwnershipTransferred(old, newOwner);
    }
}
