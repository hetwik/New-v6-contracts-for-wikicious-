const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('WikiPerp', () => {
  it('deploys and creates a market', async () => {
    const [owner] = await ethers.getSigners();
    const usdc = await (await ethers.getContractFactory('MockERC20')).deploy('USDC', 'USDC', 6);
    const vault = await (await ethers.getContractFactory('WikiVault')).deploy(await usdc.getAddress(), owner.address);
    const seq = await (await ethers.getContractFactory('MockSequencerFeed')).deploy();
    const oracle = await (await ethers.getContractFactory('WikiOracle')).deploy(owner.address, await seq.getAddress(), await seq.getAddress());
    const perp = await (await ethers.getContractFactory('WikiPerp')).deploy(await vault.getAddress(), await oracle.getAddress(), owner.address);
    await perp.createMarket('BTCUSDT', ethers.id('BTCUSDT'), 125, 2, 5, 40, 10_000_000_000n, 10_000_000_000n, 1_000_000_000n);
    expect(await perp.marketCount()).to.equal(1n);
  });
});
