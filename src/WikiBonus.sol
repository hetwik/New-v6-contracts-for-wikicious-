// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract WikiBonus is Ownable2Step {
    address public treasury;
    address public perpContract;
    address public vaultContract;

    mapping(address => bytes32) private _codes;
    mapping(bytes32 => address) public codeOwner;
    mapping(address => address) public referrerOf;
    mapping(address => uint256) public bonusBalance;
    mapping(address => bool) public blacklisted;

    event ReferralCodeCreated(address indexed user, bytes32 code);
    event ReferralRegistered(address indexed user, address indexed referrer);
    event BonusGranted(address indexed user, uint256 amount);

    constructor(address, address _treasury, address _owner) Ownable(_owner) {
        treasury = _treasury;
    }

    function register(bytes32 refCode) external {
        require(!blacklisted[msg.sender], "Bonus: blacklisted");
        if (_codes[msg.sender] == bytes32(0)) {
            bytes32 code = keccak256(abi.encodePacked(msg.sender, block.timestamp));
            _codes[msg.sender] = code;
            codeOwner[code] = msg.sender;
            emit ReferralCodeCreated(msg.sender, code);
        }
        if (refCode != bytes32(0) && codeOwner[refCode] != address(0)) {
            referrerOf[msg.sender] = codeOwner[refCode];
            emit ReferralRegistered(msg.sender, codeOwner[refCode]);
        }
    }

    function getReferralCode(address user) external view returns (bytes32) {
        return _codes[user];
    }

    function setPerpContract(address p) external onlyOwner { perpContract = p; }
    function setVaultContract(address v) external onlyOwner { vaultContract = v; }

    function onFirstDeposit(address user, uint256 amount) external {
        require(msg.sender == vaultContract, "Bonus: not vault");
        uint256 bonus = amount / 10;
        bonusBalance[user] += bonus;
        emit BonusGranted(user, bonus);
    }

    function getBonusBalance(address user) external view returns (uint256) {
        return bonusBalance[user];
    }

    function blacklist(address user, string calldata) external onlyOwner { blacklisted[user] = true; }
    function unblacklist(address user) external onlyOwner { blacklisted[user] = false; }
}
