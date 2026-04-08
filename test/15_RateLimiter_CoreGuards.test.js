const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('WikiRateLimiter core guards', () => {
  it('enforces user hourly volume cap', async () => {
    const [owner, alice] = await ethers.getSigners();
    const rl = await (await ethers.getContractFactory('WikiRateLimiter')).deploy(owner.address);
    const action = await rl.ACTION('VAULT_WITHDRAW');
    const cap = await rl.maxUserHourlyVolume();
    await expect(rl.checkAndRecord(alice.address, action, cap + 1n)).to.be.revertedWith('RateLimiter: user hourly volume exceeded');
  });
});
