// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockGMXBackstop {
    uint256 public minGMXRouteSize = 0;
    mapping(bytes32 => bool) public supported;

    function setSupported(bytes32 marketId, bool ok) external {
        supported[marketId] = ok;
    }

    function routeToGMX(
        address,
        bytes32 marketId,
        bool,
        uint256,
        uint256
    ) external view returns (bytes32) {
        require(supported[marketId], "GMX: market unsupported");
        return keccak256(abi.encodePacked(marketId, block.number));
    }

    function isMarketSupported(bytes32 marketId) external view returns (bool) {
        return supported[marketId];
    }
}
