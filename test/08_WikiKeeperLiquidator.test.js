const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('WikiKeeperRegistry', () => {
  it('registers keeper with stake', async () => {
    const [owner, keeper] = await ethers.getSigners();
    const WIK = await ethers.getContractFactory('WIKToken');
    const wik = await WIK.deploy(owner.address, owner.address, owner.address, owner.address, owner.address, owner.address, owner.address, owner.address);
    const reg = await (await ethers.getContractFactory('WikiKeeperRegistry')).deploy(await wik.getAddress(), await wik.getAddress(), owner.address);
    const stake = await reg.MIN_STAKE();
    await wik.transfer(keeper.address, stake);
    await wik.connect(keeper).approve(await reg.getAddress(), stake);
    await reg.connect(keeper).register(stake);
    expect((await reg.getKeeperInfo(keeper.address)).active).to.equal(true);
  });
});

describe('WikiLiquidator', () => {
  it('deploys and funds reward pool', async () => {
    const [owner] = await ethers.getSigners();
    const usdc = await (await ethers.getContractFactory('MockERC20')).deploy('USDC', 'USDC', 6);
    const vault = await (await ethers.getContractFactory('WikiVault')).deploy(await usdc.getAddress(), owner.address);
    const liq = await (await ethers.getContractFactory('WikiLiquidator')).deploy(owner.address, await vault.getAddress(), owner.address, await usdc.getAddress(), owner.address);
    await usdc.mint(owner.address, 1_000_000_000n);
    await usdc.approve(await liq.getAddress(), 500_000_000n);
    await liq.fundRewardPool(500_000_000n);
    expect(await liq.rewardPool()).to.equal(500_000_000n);
  });
});
