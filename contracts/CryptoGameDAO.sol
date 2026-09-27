// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20Votes {
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title CryptoGameDAO
 * @dev Governance & Treasury contract for The Crypto Game.
 * Community members vote on game proposals, balance updates, and tournament prize allocations.
 */
contract CryptoGameDAO {
    string public constant name = "Crypto Game DAO";

    address public owner;
    address public goldToken;
    uint256 public proposalCount;
    uint256 public votingPeriod = 3 days;
    uint256 public proposalThreshold = 1000 * 10**18; // 1,000 GOLD to submit proposal

    struct Proposal {
        uint256 id;
        address proposer;
        string title;
        string description;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 startTime;
        uint256 endTime;
        bool executed;
        address payable targetAddress;
        uint256 requestedPayout;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(uint256 indexed id, address indexed proposer, string title, uint256 requestedPayout);
    event Voted(uint256 indexed id, address indexed voter, bool support, uint256 weight);
    event ProposalExecuted(uint256 indexed id, address target, uint256 payout);
    event FundsReceived(address indexed sender, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(address _goldToken) {
        owner = msg.sender;
        goldToken = _goldToken;
    }

    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }

    function createProposal(
        string calldata title,
        string calldata description,
        address payable targetAddress,
        uint256 requestedPayout
    ) external returns (uint256) {
        if (goldToken != address(0)) {
            require(IERC20Votes(goldToken).balanceOf(msg.sender) >= proposalThreshold, "Below proposal threshold");
        }

        uint256 pId = ++proposalCount;
        proposals[pId] = Proposal({
            id: pId,
            proposer: msg.sender,
            title: title,
            description: description,
            votesFor: 0,
            votesAgainst: 0,
            startTime: block.timestamp,
            endTime: block.timestamp + votingPeriod,
            executed: false,
            targetAddress: targetAddress,
            requestedPayout: requestedPayout
        });

        emit ProposalCreated(pId, msg.sender, title, requestedPayout);
        return pId;
    }

    function vote(uint256 proposalId, bool support) external {
        Proposal storage p = proposals[proposalId];
        require(block.timestamp >= p.startTime, "Voting not started");
        require(block.timestamp <= p.endTime, "Voting ended");
        require(!hasVoted[proposalId][msg.sender], "Already voted");

        uint256 weight = 1;
        if (goldToken != address(0)) {
            uint256 bal = IERC20Votes(goldToken).balanceOf(msg.sender);
            weight = bal > 0 ? bal : 1;
        }

        hasVoted[proposalId][msg.sender] = true;

        if (support) {
            p.votesFor += weight;
        } else {
            p.votesAgainst += weight;
        }

        emit Voted(proposalId, msg.sender, support, weight);
    }

    function executeProposal(uint256 proposalId) external {
        Proposal storage p = proposals[proposalId];
        require(block.timestamp > p.endTime, "Voting still active");
        require(!p.executed, "Already executed");
        require(p.votesFor > p.votesAgainst, "Proposal defeated");

        p.executed = true;

        if (p.requestedPayout > 0 && p.targetAddress != address(0)) {
            require(address(this).balance >= p.requestedPayout, "Insufficient treasury balance");
            (bool success, ) = p.targetAddress.call{value: p.requestedPayout}("");
            require(success, "Payout execution failed");
        }

        emit ProposalExecuted(proposalId, p.targetAddress, p.requestedPayout);
    }

    function setGoldToken(address _token) external onlyOwner {
        goldToken = _token;
    }

    function setVotingPeriod(uint256 _period) external onlyOwner {
        votingPeriod = _period;
    }
}
