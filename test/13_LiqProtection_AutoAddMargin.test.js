const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('WikiLiqProtection autoAddMargin guards', () => {
  let owner, alice, usdc, protection;
  const U = (n) => BigInt(n) * 1_000_000n;

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    usdc = await MockERC20.deploy('USD Coin', 'USDC', 6);

    const WikiLiqProtection = await ethers.getContractFactory('WikiLiqProtection');
    protection = await WikiLiqProtection.deploy(
      owner.address,
      await usdc.getAddress(),
      owner.address
    );

    await usdc.mint(alice.address, U(10_000));
    await usdc.connect(alice).approve(await protection.getAddress(), U(10_000));

    // SubTier.BASIC = 0, 1 month, reserve 500 USDC
    await protection.connect(alice).subscribe(0, 1, U(500));
  });

  it('reverts when margin add low-level call fails', async () => {
    // Pass USDC contract as perp target; it doesn't implement addMarginForProtection
    await expect(
      protection.autoAddMargin(
        alice.address,
        1000, // health below BASIC threshold 1500
        U(100),
        await usdc.getAddress()
      )
    ).to.be.revertedWith('LP: add margin failed');
  });

});
