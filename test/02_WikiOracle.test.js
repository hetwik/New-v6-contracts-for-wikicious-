const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('WikiOracle', () => {
  let oracle, seqFeed, clFeed;
  let owner, guardian, alice;
  const BTC_ID = ethers.id('BTCUSDT');

  before(async () => {
    [owner, guardian, alice] = await ethers.getSigners();
    const MockSeq = await ethers.getContractFactory('MockSequencerFeed');
    seqFeed = await MockSeq.deploy();
    const MockCL = await ethers.getContractFactory('MockChainlinkFeed');
    clFeed = await MockCL.deploy(8);
    const WikiOracle = await ethers.getContractFactory('WikiOracle');
    oracle = await WikiOracle.deploy(owner.address, await seqFeed.getAddress(), await seqFeed.getAddress());
  });

  it('deploys with owner guardian', async () => {
    expect(await oracle.owner()).to.equal(owner.address);
    expect(await oracle.guardians(owner.address)).to.equal(true);
  });

  it('owner can configure chainlink feed', async () => {
    await oracle.setChainlinkFeed(BTC_ID, await clFeed.getAddress(), 86400, 8, ethers.parseUnits('100', 18), ethers.parseUnits('200000', 18));
    const feed = await oracle.chainlinkFeeds(BTC_ID);
    expect(feed.active).to.equal(true);
  });

  it('guardian flow and pause work', async () => {
    await oracle.setGuardian(guardian.address, true);
    await oracle.connect(guardian).submitGuardianPrice(BTC_ID, ethers.parseUnits('50000', 18));
    await oracle.setMarketPaused(BTC_ID, true);
    await expect(oracle.getPrice(BTC_ID)).to.be.revertedWith('Oracle: market paused');
  });

  it('non-guardian cannot submit', async () => {
    await expect(oracle.connect(alice).submitGuardianPrice(BTC_ID, 1)).to.be.revertedWith('Oracle: not guardian');
  });
});
