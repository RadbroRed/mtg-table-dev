// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title GGToken ($GG)
 * @dev Good Game token for The Crypto Game ecosystem.
 * - Total supply: 1,000,000,000,000 GG (1 Trillion)
 * - Decimals: 18
 * - Designed to be held in the deposit contract with exclusive access for Amber.
 */
contract GGToken {
    string public constant name = "Good Game";
    string public constant symbol = "GG";
    uint8 public constant decimals = 18;

    uint256 public constant TOTAL_SUPPLY = 1_000_000_000_000 * 1e18; // 1 Trillion GG

    uint256 private _totalSupply;
    address public owner;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    /**
     * @param initialRecipient If set to a deposit contract address, the 1T GG is minted directly into the deposit vault.
     * If address(0), the 1T GG is minted directly to Amber (msg.sender).
     */
    constructor(address initialRecipient) {
        owner = msg.sender;
        address recipient = initialRecipient != address(0) ? initialRecipient : msg.sender;
        _mint(recipient, TOTAL_SUPPLY);
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
