// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract WikiSocialRewards is Ownable2Step {
    using SafeERC20 for IERC20;

    IERC20 public immutable wik;
    address public immutable social;
    mapping(address => uint256) public pendingRewards;

    event RewardAllocated(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);

    constructor(address _wik, address _social, address _owner) Ownable(_owner) {
        wik = IERC20(_wik);
        social = _social;
    }

    function allocate(address user, uint256 amount) external onlyOwner {
        pendingRewards[user] += amount;
        emit RewardAllocated(user, amount);
    }

    function claim() external {
        uint256 amt = pendingRewards[msg.sender];
        require(amt > 0, "SocialRewards: no rewards");
        pendingRewards[msg.sender] = 0;
        wik.safeTransfer(msg.sender, amt);
        emit RewardClaimed(msg.sender, amt);
    }
}
