const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('WikiRevenueShareNFT view guards', () => {
  let owner, alice, usdc, nft;

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    usdc = await MockERC20.deploy('USD Coin', 'USDC', 6);

    const WikiRevenueShareNFT = await ethers.getContractFactory('WikiRevenueShareNFT');
    nft = await WikiRevenueShareNFT.deploy(
      owner.address,
      await usdc.getAddress(),
      'ipfs://wikicious/'
    );
  });

  it('pendingFeesAll returns 0 for holders with zero NFT balance', async () => {
    expect(await nft.balanceOf(alice.address)).to.equal(0n);
    expect(await nft.pendingFeesAll(alice.address)).to.equal(0n);
  });
});
