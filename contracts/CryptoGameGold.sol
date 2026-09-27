// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title CryptoGameGold (GOLD)
 * @dev The official ERC-20 currency for The Crypto Game.
 * Used for match wagering, marketplace card trading, tournament entry stakes,
 * and DAO governance voting.
 */
contract CryptoGameGold {
    string public constant name = "Crypto Game Gold";
    string public constant symbol = "GOLD";
    uint8 public constant decimals = 18;

    uint256 private _totalSupply;
    address public owner;
    address public escrowContract;

    mapping(address => uint256) private _balances;
    mapping(address => mapping(address => uint256)) private _allowances;
    mapping(address => bool) public isMinter;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event MinterUpdated(address indexed minter, bool status);
    event EscrowUpdated(address indexed escrow);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyMinter() {
        require(msg.sender == owner || isMinter[msg.sender] || msg.sender == escrowContract, "Not authorized to mint");
        _;
    }

    constructor(uint256 initialSupply) {
        owner = msg.sender;
        isMinter[msg.sender] = true;
        if (initialSupply > 0) {
            _mint(msg.sender, initialSupply);
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

    function mint(address to, uint256 amount) external onlyMinter returns (bool) {
        _mint(to, amount);
        return true;
    }

    function burn(uint256 amount) external returns (bool) {
        _burn(msg.sender, amount);
        return true;
    }

    function burnFrom(address account, uint256 amount) external returns (bool) {
        uint256 currentAllowance = _allowances[account][msg.sender];
        if (currentAllowance != type(uint256).max) {
            require(currentAllowance >= amount, "ERC20: insufficient allowance");
            unchecked {
                _approve(account, msg.sender, currentAllowance - amount);
            }
        }
        _burn(account, amount);
        return true;
    }

    function setMinter(address minter, bool status) external onlyOwner {
        require(minter != address(0), "Invalid minter address");
        isMinter[minter] = status;
        emit MinterUpdated(minter, status);
    }

    function setEscrowContract(address _escrow) external onlyOwner {
        escrowContract = _escrow;
        emit EscrowUpdated(_escrow);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
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

    function _mint(address account, uint256 value) internal {
        require(account != address(0), "ERC20: mint to zero");
        _totalSupply += value;
        unchecked {
            _balances[account] += value;
        }
        emit Transfer(address(0), account, value);
    }

    function _burn(address account, uint256 value) internal {
        require(account != address(0), "ERC20: burn from zero");
        require(_balances[account] >= value, "ERC20: burn exceeds balance");

        unchecked {
            _balances[account] -= value;
            _totalSupply -= value;
        }

        emit Transfer(account, address(0), value);
    }
}
