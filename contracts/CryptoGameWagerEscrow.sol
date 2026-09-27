// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title CryptoGameWagerEscrow
 * @dev On-chain Escrow for table matches in The Crypto Game.
 * Players stake Gold tokens or ETH. Winner claims the match pot minus a 3% DAO fee.
 */
contract CryptoGameWagerEscrow {
    address public owner;
    address public daoTreasury;
    address public referee; // Game server referee public key for verifying match results
    uint256 public constant DAO_FEE_BPS = 300; // 3% fee (300 basis points)
    uint256 public constant BPS_DENOMINATOR = 10000;

    enum MatchState { Created, Seated, Active, Settled, Cancelled }

    struct Match {
        bytes32 tableCode;     // e.g. keccak256("XK7M2P")
        address token;         // address(0) for native ETH, or ERC20 GOLD address
        uint256 wagerPerPlayer;
        address player1;
        address player2;
        MatchState state;
        address winner;
        uint256 createdAt;
    }

    mapping(bytes32 => Match) public matches;

    event MatchCreated(bytes32 indexed matchId, bytes32 indexed tableCode, address indexed player1, address token, uint256 wager);
    event PlayerJoined(bytes32 indexed matchId, address indexed player2);
    event MatchSettled(bytes32 indexed matchId, address indexed winner, uint256 payout, uint256 daoFee);
    event MatchCancelled(bytes32 indexed matchId, string reason);
    event RefereeUpdated(address indexed newReferee);
    event TreasuryUpdated(address indexed newTreasury);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address _referee, address _daoTreasury) {
        owner = msg.sender;
        referee = _referee != address(0) ? _referee : msg.sender;
        daoTreasury = _daoTreasury != address(0) ? _daoTreasury : msg.sender;
    }

    /**
     * @dev Player 1 creates a wager match table and stakes their wager.
     */
    function createMatch(
        bytes32 matchId,
        bytes32 tableCode,
        address token,
        uint256 wager
    ) external payable {
        require(matches[matchId].createdAt == 0, "Match already exists");
        require(wager > 0 || msg.value > 0, "Wager must be positive");

        if (token == address(0)) {
            require(msg.value == wager, "Incorrect ETH sent");
        } else {
            require(msg.value == 0, "ETH sent for ERC20 wager");
            require(IERC20(token).transferFrom(msg.sender, address(this), wager), "Token transfer failed");
        }

        matches[matchId] = Match({
            tableCode: tableCode,
            token: token,
            wagerPerPlayer: wager,
            player1: msg.sender,
            player2: address(0),
            state: MatchState.Created,
            winner: address(0),
            createdAt: block.timestamp
        });

        emit MatchCreated(matchId, tableCode, msg.sender, token, wager);
    }

    /**
     * @dev Player 2 joins the table and stakes matching wager.
     */
    function joinMatch(bytes32 matchId) external payable {
        Match storage m = matches[matchId];
        require(m.state == MatchState.Created, "Match not accepting players");
        require(msg.sender != m.player1, "Player 1 cannot sit in Seat 2");

        if (m.token == address(0)) {
            require(msg.value == m.wagerPerPlayer, "Incorrect ETH sent for match stake");
        } else {
            require(msg.value == 0, "ETH sent for token wager");
            require(IERC20(m.token).transferFrom(msg.sender, address(this), m.wagerPerPlayer), "Token stake failed");
        }

        m.player2 = msg.sender;
        m.state = MatchState.Active;

        emit PlayerJoined(matchId, msg.sender);
    }

    /**
     * @dev Settles the match and pays winner. Can be submitted by referee or with referee signature.
     */
    function settleMatch(
        bytes32 matchId,
        address winner,
        bytes calldata signature
    ) external {
        Match storage m = matches[matchId];
        require(m.state == MatchState.Active, "Match is not active");
        require(winner == m.player1 || winner == m.player2, "Winner must be a player");

        // Verify authority: either caller is referee/owner or cryptographic signature from referee
        if (msg.sender != referee && msg.sender != owner) {
            bytes32 messageHash = keccak256(abi.encodePacked(matchId, winner, address(this)));
            bytes32 ethSignedMessageHash = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", messageHash));
            address recoveredSigner = _recoverSigner(ethSignedMessageHash, signature);
            require(recoveredSigner == referee || recoveredSigner == owner, "Invalid referee signature");
        }

        m.state = MatchState.Settled;
        m.winner = winner;

        uint256 totalPot = m.wagerPerPlayer * 2;
        uint256 daoFee = (totalPot * DAO_FEE_BPS) / BPS_DENOMINATOR;
        uint256 winnerPayout = totalPot - daoFee;

        if (m.token == address(0)) {
            if (daoFee > 0) {
                (bool feeSent, ) = daoTreasury.call{value: daoFee}("");
                require(feeSent, "DAO fee payout failed");
            }
            (bool winnerSent, ) = winner.call{value: winnerPayout}("");
            require(winnerSent, "Winner payout failed");
        } else {
            if (daoFee > 0) {
                require(IERC20(m.token).transfer(daoTreasury, daoFee), "DAO fee transfer failed");
            }
            require(IERC20(m.token).transfer(winner, winnerPayout), "Winner transfer failed");
        }

        emit MatchSettled(matchId, winner, winnerPayout, daoFee);
    }

    /**
     * @dev Cancels match and refunds deposited funds if match never started or opponent abandoned.
     */
    function cancelMatch(bytes32 matchId, string calldata reason) external {
        Match storage m = matches[matchId];
        require(m.state == MatchState.Created || m.state == MatchState.Active, "Cannot cancel match");
        require(msg.sender == m.player1 || msg.sender == referee || msg.sender == owner, "Not authorized to cancel");

        MatchState prevState = m.state;
        m.state = MatchState.Cancelled;

        if (m.token == address(0)) {
            (bool p1Refund, ) = m.player1.call{value: m.wagerPerPlayer}("");
            require(p1Refund, "Player 1 refund failed");
            if (prevState == MatchState.Active && m.player2 != address(0)) {
                (bool p2Refund, ) = m.player2.call{value: m.wagerPerPlayer}("");
                require(p2Refund, "Player 2 refund failed");
            }
        } else {
            require(IERC20(m.token).transfer(m.player1, m.wagerPerPlayer), "Player 1 token refund failed");
            if (prevState == MatchState.Active && m.player2 != address(0)) {
                require(IERC20(m.token).transfer(m.player2, m.wagerPerPlayer), "Player 2 token refund failed");
            }
        }

        emit MatchCancelled(matchId, reason);
    }

    function setReferee(address _referee) external onlyOwner {
        require(_referee != address(0), "Invalid referee address");
        referee = _referee;
        emit RefereeUpdated(_referee);
    }

    function setDaoTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury address");
        daoTreasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }

    function _recoverSigner(bytes32 _ethSignedMessageHash, bytes memory _sig) internal pure returns (address) {
        require(_sig.length == 65, "Invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(_sig, 32))
            s := mload(add(_sig, 64))
            v := byte(0, mload(add(_sig, 96)))
        }
        return ecrecover(_ethSignedMessageHash, v, r, s);
    }
}
