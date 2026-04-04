const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('WikiVault core flow', () => {
  let owner, alice, usdc, vault;
  const U = (n) => BigInt(n) * 1_000_000n;

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    usdc = await MockERC20.deploy('USD Coin', 'USDC', 6);

    const WikiVault = await ethers.getContractFactory('WikiVault');
    vault = await WikiVault.deploy(await usdc.getAddress(), owner.address);

    await usdc.mint(alice.address, U(1_000));
    await usdc.connect(alice).approve(await vault.getAddress(), U(1_000));
  });

  it('supports deposit, lock/release by operator, and withdraw', async () => {
    await vault.connect(alice).deposit(U(100));
    expect(await vault.freeMargin(alice.address)).to.equal(U(100));
    expect(await vault.lockedMargin(alice.address)).to.equal(0n);

    await vault.setOperator(owner.address, true);
    await vault.lockMargin(alice.address, U(40));
    expect(await vault.freeMargin(alice.address)).to.equal(U(60));
    expect(await vault.lockedMargin(alice.address)).to.equal(U(40));

    await vault.releaseMargin(alice.address, U(10));
    expect(await vault.freeMargin(alice.address)).to.equal(U(70));
    expect(await vault.lockedMargin(alice.address)).to.equal(U(30));

    await vault.connect(alice).withdraw(U(50));
    expect(await vault.freeMargin(alice.address)).to.equal(U(20));
    expect(await vault.lockedMargin(alice.address)).to.equal(U(30));
  });
});
