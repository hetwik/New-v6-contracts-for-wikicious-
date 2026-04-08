// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockChainlinkFeed {
    uint8 public immutable decimals;
    int256 public answer;
    uint256 public updatedAt;
    uint80 public roundId;
    uint80 public answeredInRound;

    constructor(uint8 _decimals) {
        decimals = _decimals;
        answer = 0;
        updatedAt = block.timestamp;
        roundId = 1;
        answeredInRound = 1;
    }

    function setRoundData(int256 _answer, uint256 _updatedAt, uint80 _roundId, uint80 _answeredInRound) external {
        answer = _answer;
        updatedAt = _updatedAt;
        roundId = _roundId;
        answeredInRound = _answeredInRound;
    }

    /// @notice Legacy helper used by tests: updates answer and bumps round metadata.
    function setPrice(int256 _answer) external {
        answer = _answer;
        updatedAt = block.timestamp;
        roundId += 1;
        answeredInRound = roundId;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (roundId, answer, updatedAt, updatedAt, answeredInRound);
    }
}
