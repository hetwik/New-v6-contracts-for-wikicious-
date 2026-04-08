// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract WikiSocial is Ownable2Step, Pausable {
    struct Profile {
        string handle;
        string name;
        string avatar;
        bool exists;
    }
    struct Post {
        address author;
        bytes32 contentHash;
        bool deleted;
    }

    mapping(address => Profile) public profiles;
    mapping(bytes32 => bool) public handleTaken;
    mapping(address => mapping(address => bool)) public following;
    mapping(uint256 => mapping(address => bool)) public liked;
    Post[] public posts;

    event ProfileCreated(address indexed user, string handle);
    event PostCreated(uint256 indexed postId, address indexed author, bytes32 contentHash);
    event Liked(uint256 indexed postId, address indexed user);
    event Unliked(uint256 indexed postId, address indexed user);
    event CommentPosted(uint256 indexed postId, address indexed user, bytes32 commentHash);
    event Followed(address indexed follower, address indexed target);
    event Unfollowed(address indexed follower, address indexed target);
    event Reposted(uint256 indexed postId, address indexed user);
    event PostDeleted(uint256 indexed postId, address indexed author);

    constructor(address _owner) Ownable(_owner) {}

    function register(string calldata handle, string calldata name, string calldata avatar) external whenNotPaused {
        bytes32 h = keccak256(bytes(handle));
        require(!handleTaken[h], "Social: handle taken");
        handleTaken[h] = true;
        profiles[msg.sender] = Profile(handle, name, avatar, true);
        emit ProfileCreated(msg.sender, handle);
    }

    function createPost(bytes32 contentHash, uint256, uint256, string calldata) external whenNotPaused returns (uint256 postId) {
        postId = posts.length;
        posts.push(Post(msg.sender, contentHash, false));
        emit PostCreated(postId, msg.sender, contentHash);
    }

    function totalPosts() external view returns (uint256) { return posts.length; }

    function likePost(uint256 id) external whenNotPaused {
        liked[id][msg.sender] = true;
        emit Liked(id, msg.sender);
    }
    function unlikePost(uint256 id) external whenNotPaused {
        liked[id][msg.sender] = false;
        emit Unliked(id, msg.sender);
    }
    function comment(uint256 id, bytes32 commentHash, string calldata) external whenNotPaused {
        emit CommentPosted(id, msg.sender, commentHash);
    }
    function follow(address target) external whenNotPaused {
        require(target != msg.sender, "Social: cannot follow self");
        following[msg.sender][target] = true;
        emit Followed(msg.sender, target);
    }
    function unfollow(address target) external whenNotPaused {
        following[msg.sender][target] = false;
        emit Unfollowed(msg.sender, target);
    }
    function repost(uint256 id) external whenNotPaused {
        emit Reposted(id, msg.sender);
    }
    function deletePost(uint256 id) external whenNotPaused {
        require(id < posts.length, "Social: bad post");
        require(posts[id].author == msg.sender, "Social: not author");
        posts[id].deleted = true;
        emit PostDeleted(id, msg.sender);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }
}
