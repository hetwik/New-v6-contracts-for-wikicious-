const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('Security Invariants', () => {
  it('vault remains solvent through deposit/withdraw', async () => {
    const [owner, alice] = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory('MockERC20');
    const usdc = await ERC20.deploy('USDC', 'USDC', 6);
    const vault = await (await ethers.getContractFactory('WikiVault')).deploy(await usdc.getAddress(), owner.address);
    await usdc.mint(alice.address, 5_000_000_000n);
    await usdc.connect(alice).approve(await vault.getAddress(), 5_000_000_000n);
    await vault.connect(alice).deposit(2_000_000_000n);
    await vault.connect(alice).withdraw(1_000_000_000n);
    expect(await vault.isSolvent()).to.equal(true);
  });

  it('only owner can execute owner-only functions', async () => {
    const [owner, attacker] = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory('MockERC20');
    const usdc = await ERC20.deploy('USDC', 'USDC', 6);
    const vault = await (await ethers.getContractFactory('WikiVault')).deploy(await usdc.getAddress(), owner.address);
    await expect(vault.connect(attacker).pause()).to.be.revertedWithCustomError(vault, 'OwnableUnauthorizedAccount');
  });

  it('rate limiter enforces large-op cooldown', async () => {
    const [owner, alice] = await ethers.getSigners();
    const rl = await (await ethers.getContractFactory('WikiRateLimiter')).deploy(owner.address);
    const action = await rl.ACTION('VAULT_DEPOSIT');
    await rl.checkAndRecord(alice.address, action, 20_000_000_000n);
    await expect(rl.checkAndRecord(alice.address, action, 20_000_000_000n)).to.be.revertedWith('RateLimiter: large op cooldown active');
  });
});
