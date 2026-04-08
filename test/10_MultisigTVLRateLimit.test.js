const { expect } = require('chai');
const { ethers } = require('hardhat');
const { time } = require('@nomicfoundation/hardhat-network-helpers');

describe('WikiMultisigGuard', () => {
  it('tracks approvals and blocks non-signers', async () => {
    const [s1, s2, s3, outsider] = await ethers.getSigners();
    const m = await (await ethers.getContractFactory('WikiMultisigGuard')).deploy([s1.address, s2.address, s3.address], 2);
    const id = await m.connect(s1).propose.staticCall(0, s1.address, '0x', 0, 'noop');
    await m.connect(s1).propose(0, s1.address, '0x', 0, 'noop');
    await expect(m.connect(outsider).approve(id)).to.be.revertedWith('Multisig: not signer');
    await m.connect(s2).approve(id);
    expect(await m.getApprovalCount(id)).to.equal(2n);
  });
});

describe('WikiTVLGuard', () => {
  it('registers vault and checks whitelist mode', async () => {
    const [owner, alice] = await ethers.getSigners();
    const ERC20 = await ethers.getContractFactory('MockERC20');
    const usdc = await ERC20.deploy('USDC', 'USDC', 6);
    const vault = await (await ethers.getContractFactory('WikiVault')).deploy(await usdc.getAddress(), owner.address);
    const g = await (await ethers.getContractFactory('WikiTVLGuard')).deploy(owner.address);
    await g.registerVault(await vault.getAddress(), 10_000_000_000n, 5_000_000_000n, 2_000_000_000n, true);
    await vault.setTVLGuard(await g.getAddress());
    await usdc.mint(alice.address, 3_000_000_000n);
    await usdc.connect(alice).approve(await vault.getAddress(), 1_000_000_000n);
    await expect(vault.connect(alice).deposit(1_000_000_000n)).to.be.revertedWith('TVLGuard: not whitelisted');
  });
});

describe('WikiRateLimiter', () => {
  it('enforces cooldown and allows after time passes', async () => {
    const [owner, alice] = await ethers.getSigners();
    const r = await (await ethers.getContractFactory('WikiRateLimiter')).deploy(owner.address);
    const k = await r.ACTION('VAULT_WITHDRAW');
    await r.checkAndRecord(alice.address, k, 20_000_000_000n);
    await expect(r.checkAndRecord(alice.address, k, 20_000_000_000n)).to.be.reverted;
    await time.increase(31);
    await expect(r.checkAndRecord(alice.address, k, 20_000_000_000n)).to.not.be.reverted;
  });
});
