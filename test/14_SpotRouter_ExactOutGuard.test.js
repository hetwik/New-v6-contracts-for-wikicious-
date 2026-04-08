const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('WikiSpotRouter exactOut guard', () => {
  let owner, alice, tokenA, tokenB, router;
  const U18 = (n) => ethers.parseUnits(String(n), 18);

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    tokenA = await MockERC20.deploy('TokenA', 'TKA', 18);
    tokenB = await MockERC20.deploy('TokenB', 'TKB', 18);

    const WikiSpotRouter = await ethers.getContractFactory('WikiSpotRouter');
    router = await WikiSpotRouter.deploy(owner.address, owner.address);

    await router.setPool(
      await tokenA.getAddress(),
      await tokenB.getAddress(),
      500,                // 0.05%
      ethers.ZeroAddress, // no hop
      0,
      true
    );

    await tokenA.mint(alice.address, U18(1_000));
    await tokenA.connect(alice).approve(await router.getAddress(), U18(1_000));
  });

  it('reverts early when maxAmountIn cannot satisfy requested exactOut', async () => {
    await expect(
      router.connect(alice).swapExactOut(
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        U18(100), // desired out
        U18(1),   // max in far too small
        alice.address
      )
    ).to.be.revertedWith('Spot: insufficient maxIn');
  });
});
