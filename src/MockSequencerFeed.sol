// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockSequencerFeed {
    int256 public answer = 0; // 0 = up, 1 = down
    uint256 public startedAt = block.timestamp;

    function setStatus(int256 _answer, uint256 _startedAt) external {
        answer = _answer;
        startedAt = _startedAt;
    }

    function latestRoundData()
        external
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (1, answer, startedAt, block.timestamp, 1);
    }
}
