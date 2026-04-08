// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockOracle {
    mapping(bytes32 => uint256) public prices;
    mapping(bytes32 => uint256) public updatedAt;

    function setPrice(bytes32 id, uint256 p) external {
        prices[id] = p;
        updatedAt[id] = block.timestamp;
    }

    function getPrice(bytes32 id) external view returns (uint256, uint256) {
        return (prices[id], updatedAt[id]);
    }
}
