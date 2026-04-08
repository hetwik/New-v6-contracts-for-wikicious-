const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Composite protocol contracts', () => {
  it('WikiAMM basic flow', async () => {
    const [owner, alice] = await ethers.getSigners();
    const usdc = await (await ethers.getContractFactory('MockERC20')).deploy('USDC', 'USDC', 6);
    const vault = await (await ethers.getContractFactory('WikiVault')).deploy(await usdc.getAddress(), owner.address);
    const seq = await (await ethers.getContractFactory('MockSequencerFeed')).deploy();
    const oracle = await (await ethers.getContractFactory('WikiOracle')).deploy(owner.address, await seq.getAddress(), await seq.getAddress());
    const amm = await (await ethers.getContractFactory('WikiAMM')).deploy(await usdc.getAddress(), await vault.getAddress(), await oracle.getAddress(), owner.address);
    await usdc.mint(alice.address, 1_000_000_000n);
    await usdc.connect(alice).approve(await amm.getAddress(), 1_000_000_000n);
    await amm.connect(alice).addLiquidity(1_000_000_000n);
    expect(await amm.totalSupply()).to.be.gt(0n);
  });

  it('WikiSpot create pool', async () => {
    const [owner] = await ethers.getSigners();
    const usdc = await (await ethers.getContractFactory('MockERC20')).deploy('USDC', 'USDC', 6);
    const weth = await (await ethers.getContractFactory('MockERC20')).deploy('WETH', 'WETH', 18);
    const spot = await (await ethers.getContractFactory('WikiSpot')).deploy(owner.address, owner.address);
    await spot.createPool(await usdc.getAddress(), await weth.getAddress(), 15);
    expect(await spot.poolCount()).to.equal(1n);
  });

  it('WikiSocial + rewards + bonus + pool + gmx deploy', async () => {
    const [owner] = await ethers.getSigners();
    const usdc = await (await ethers.getContractFactory('MockERC20')).deploy('USDC', 'USDC', 6);
    const wik = await (await ethers.getContractFactory('MockERC20')).deploy('WIK', 'WIK', 18);
    const social = await (await ethers.getContractFactory('WikiSocial')).deploy(owner.address);
    await social.register('alice', 'Alice', 'ipfs://alice');
    const rewards = await (await ethers.getContractFactory('WikiSocialRewards')).deploy(await wik.getAddress(), await social.getAddress(), owner.address);
    const bonus = await (await ethers.getContractFactory('WikiBonus')).deploy(owner.address, owner.address, owner.address);
    const pool = await (await ethers.getContractFactory('WikiPropPool')).deploy(await usdc.getAddress(), owner.address);
    const seq = await (await ethers.getContractFactory('MockSequencerFeed')).deploy();
    const oracle = await (await ethers.getContractFactory('WikiOracle')).deploy(owner.address, await seq.getAddress(), await seq.getAddress());
    const vault = await (await ethers.getContractFactory('WikiVault')).deploy(await usdc.getAddress(), owner.address);
    const gmx = await (await ethers.getContractFactory('WikiGMXBackstop')).deploy(await vault.getAddress(), await oracle.getAddress(), owner.address, owner.address);
    expect(await rewards.owner()).to.equal(owner.address);
    expect(await bonus.owner()).to.equal(owner.address);
    expect(await pool.owner()).to.equal(owner.address);
    expect(await gmx.owner()).to.equal(owner.address);
  });
});
