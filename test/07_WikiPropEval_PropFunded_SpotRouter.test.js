const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('WikiPropEval', () => {
  it('deploys and exposes eval fee', async () => {
    const [owner] = await ethers.getSigners();
    const usdc = await (await ethers.getContractFactory('MockERC20')).deploy('USDC', 'USDC', 6);
    const seq = await (await ethers.getContractFactory('MockSequencerFeed')).deploy();
    const oracle = await (await ethers.getContractFactory('WikiOracle')).deploy(owner.address, await seq.getAddress(), await seq.getAddress());
    const evalC = await (await ethers.getContractFactory('WikiPropEval')).deploy(await usdc.getAddress(), await oracle.getAddress(), owner.address);
    expect(await evalC.owner()).to.equal(owner.address);
    expect(await evalC.evalFee(0, 1_000_000_000n)).to.be.gte(0n);
  });
});

describe('WikiPropFunded', () => {
  it('deploys', async () => {
    const [owner] = await ethers.getSigners();
    const usdc = await (await ethers.getContractFactory('MockERC20')).deploy('USDC', 'USDC', 6);
    const funded = await (await ethers.getContractFactory('WikiPropFunded')).deploy(await usdc.getAddress(), owner.address);
    expect(await funded.owner()).to.equal(owner.address);
  });
});

describe('WikiSpotRouter', () => {
  it('deploys and allows owner config', async () => {
    const [owner, alice] = await ethers.getSigners();
    const r = await (await ethers.getContractFactory('WikiSpotRouter')).deploy(owner.address, owner.address);
    await r.setSpread(15);
    await expect(r.connect(alice).setSpread(5)).to.be.reverted;
    await r.setTimelock(owner.address);
    expect(await r.timelock()).to.equal(owner.address);
  });
});
