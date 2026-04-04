const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('WikiFeeDistributor buyback guard', () => {
  let owner, usdc, dist;
  const U = (n) => BigInt(n) * 1_000_000n; // USDC 6 decimals

  beforeEach(async () => {
    [owner] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    usdc = await MockERC20.deploy('USD Coin', 'USDC', 6);

    const WikiFeeDistributor = await ethers.getContractFactory('WikiFeeDistributor');
    dist = await WikiFeeDistributor.deploy(
      await usdc.getAddress(),
      owner.address, // staking (placeholder)
      owner.address, // vault (placeholder)
      owner.address, // treasury
      owner.address
    );

    // Seed fees and create pending buyback balance
    await usdc.mint(owner.address, U(10_000));
    await usdc.approve(await dist.getAddress(), U(10_000));
    await dist.depositFees(U(10_000));
    await dist.distribute();
    await dist.setBuybackTarget(owner.address);
  });

  it('reverts when minWikOut is non-zero in placeholder buyback path', async () => {
    await expect(dist.executeBuyback(1)).to.be.revertedWith('Dist: buyback slippage unsupported');
  });

  it('allows buyback when minWikOut is zero and emits event', async () => {
    const [pendingBefore] = await dist.pendingBuckets();
    expect(pendingBefore).to.be.gt(0n);

    await expect(dist.executeBuyback(0))
      .to.emit(dist, 'BuybackExecuted');

    const [pendingAfter] = await dist.pendingBuckets();
    expect(pendingAfter).to.equal(0n);
  });
});
