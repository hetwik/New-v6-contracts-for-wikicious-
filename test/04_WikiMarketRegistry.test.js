const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('WikiMarketRegistry', () => {
  let registry, owner, alice;

  before(async () => {
    [owner, alice] = await ethers.getSigners();
    registry = await (await ethers.getContractFactory('WikiMarketRegistry')).deploy(owner.address);
  });

  it('deploys', async () => {
    expect(await registry.owner()).to.equal(owner.address);
  });

  it('adds market via struct and pause/resume', async () => {
    await registry.addMarket({
      symbol: 'BTC/USD', base: 'BTC', quote: 'USD',
      category: 0, oracleSrc: 0, feed: ethers.ZeroAddress, pythId: ethers.ZeroHash,
      baseM: 0, quoteM: 0,
      maxLev: 12500, maint: 40, taker: 5, maker: 2,
      oiL: 1_000_000_000n, oiS: 1_000_000_000n, minP: 10_000_000n, maxP: 1_000_000_000n,
      spread: 2, offH: 0, prec: 2,
    });
    const id = await registry.symbolToId('BTC/USD');
    await registry.pauseMarket(id);
    await registry.resumeMarket(id);
    expect((await registry.markets(id)).active).to.equal(true);
  });

  it('blocks non-owner add', async () => {
    await expect(registry.connect(alice).addMarket({
      symbol: 'ETH/USD', base: 'ETH', quote: 'USD', category: 0, oracleSrc: 0, feed: ethers.ZeroAddress, pythId: ethers.ZeroHash,
      baseM: 0, quoteM: 0, maxLev: 10000, maint: 40, taker: 5, maker: 2,
      oiL: 1n, oiS: 1n, minP: 1n, maxP: 1n, spread: 1, offH: 0, prec: 2,
    })).to.be.reverted;
  });
});
