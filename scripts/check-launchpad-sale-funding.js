#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { ethers } = require('ethers');

['.env', '.env.local', 'wikicious-v6-mainnet.env.txt'].forEach((f) => {
  const p = path.resolve(process.cwd(), f);
  if (fs.existsSync(p)) dotenv.config({ path: p });
});

function load(p) {
  return JSON.parse(fs.readFileSync(path.resolve(p), 'utf8'));
}

async function main() {
  const manifestPath = process.argv[2] || 'safe-launchpad-wik-25m-mainnet.json';
  const rpc = [
    process.env.ALCHEMY_ARBITRUM_URL,
    process.env.ARBITRUM_RPC_URL,
    process.env.RPC_URL,
    'https://arb1.arbitrum.io/rpc'
  ].filter(Boolean)[0];

  const provider = new ethers.JsonRpcProvider(rpc);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== 42161) throw new Error(`Expected chainId 42161, got ${net.chainId}`);

  const manifest = load(manifestPath);
  const createSale = manifest.transactions.find((t) => t.contractMethod?.name === 'createSale');
  if (!createSale) throw new Error('createSale tx not found in manifest');

  const launchpad = createSale.to;
  const vals = createSale.contractInputsValues;
  const projectOwner = vals.projectOwner;
  const saleToken = vals.saleToken;
  const totalTokens = BigInt(vals.totalTokens);

  const erc20 = new ethers.Contract(
    saleToken,
    [
      'function balanceOf(address) view returns (uint256)',
      'function allowance(address,address) view returns (uint256)',
      'function symbol() view returns (string)',
      'function decimals() view returns (uint8)'
    ],
    provider
  );

  const [balance, allowance, symbol, decimals] = await Promise.all([
    erc20.balanceOf(projectOwner),
    erc20.allowance(projectOwner, launchpad),
    erc20.symbol().catch(() => 'TOKEN'),
    erc20.decimals().catch(() => 18)
  ]);

  const enoughBalance = balance >= totalTokens;
  const enoughAllowance = allowance >= totalTokens;

  const fmt = (x) => ethers.formatUnits(x, decimals);

  const out = {
    manifest: manifestPath,
    launchpad,
    projectOwner,
    saleToken,
    symbol,
    decimals,
    requiredTotalTokensRaw: totalTokens.toString(),
    requiredTotalTokens: fmt(totalTokens),
    projectOwnerBalanceRaw: balance.toString(),
    projectOwnerBalance: fmt(balance),
    projectOwnerAllowanceToLaunchpadRaw: allowance.toString(),
    projectOwnerAllowanceToLaunchpad: fmt(allowance),
    enoughBalance,
    enoughAllowance,
    readyForDepositSaleTokens: enoughBalance && enoughAllowance
  };

  console.log(JSON.stringify(out, null, 2));
  if (!out.readyForDepositSaleTokens) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
