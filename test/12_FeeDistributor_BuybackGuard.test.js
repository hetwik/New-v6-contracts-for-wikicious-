const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('WikiFeeDistributor buyback guard', () => {
  it('reverts for unsupported slippage guard path', async () => {
    const [owner] = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory('MockERC20');
    const usdc = await ERC20.deploy('USDC', 'USDC', 6);
    const dist = await (await ethers.getContractFactory('WikiFeeDistributor')).deploy(
      await usdc.getAddress(),
      owner.address,
      owner.address,
      owner.address,
      owner.address,
    );
    await dist.setBuybackTarget(owner.address);
    await expect(dist.executeBuyback(1)).to.be.reverted;
  });
});
