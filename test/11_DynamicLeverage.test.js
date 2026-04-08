const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('WikiDynamicLeverage', () => {
  it('deploys and updates leverage caps permissionlessly', async () => {
    const [owner, alice] = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory('MockERC20');
    const usdc = await ERC20.deploy('USDC', 'USDC', 6);
    const vault = await (await ethers.getContractFactory('WikiVault')).deploy(await usdc.getAddress(), owner.address);
    const d = await (await ethers.getContractFactory('WikiDynamicLeverage')).deploy(owner.address, await vault.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress);
    expect(await d.maxLeverageFor(alice.address)).to.equal(5n);
    await usdc.mint(owner.address, 1_000_000_000n);
    await usdc.approve(await vault.getAddress(), 1_000_000_000n);
    await vault.fundInsurance(100_000_000n);
    await time.increase(301);
    await expect(d.connect(alice).updateLeverageCaps()).to.not.be.reverted;
    expect(await d.maxLeverageFor(alice.address)).to.be.gte(10n);
  });
});
