const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('WikiRateLimiter core guards', () => {
  let owner, alice, rl;
  const U = (n) => BigInt(n) * 1_000_000n; // USDC 6-dec style amounts

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();
    const WikiRateLimiter = await ethers.getContractFactory('WikiRateLimiter');
    rl = await WikiRateLimiter.deploy(owner.address);
  });

  it('enforces per-block op limit', async () => {
    const action = ethers.encodeBytes32String('VAULT_WITHDRAW');
    await rl.checkAndRecord(alice.address, action, 0);
    await rl.checkAndRecord(alice.address, action, 0);
    await rl.checkAndRecord(alice.address, action, 0);

    await expect(
      rl.checkAndRecord(alice.address, action, 0)
    ).to.be.revertedWith('RateLimiter: per-block ops exceeded');
  });

  it('enforces per-user hourly volume cap', async () => {
    const action = ethers.encodeBytes32String('VAULT_WITHDRAW');
    const cap = await rl.maxUserHourlyVolume();

    await expect(
      rl.checkAndRecord(alice.address, action, cap + U(1))
    ).to.be.revertedWith('RateLimiter: user hourly volume exceeded');
  });
});
