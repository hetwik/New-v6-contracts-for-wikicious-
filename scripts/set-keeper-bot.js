const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
require("dotenv").config({ override: true });

async function main() {
  const [deployer] = await ethers.getSigners();
  const KEEPER = process.env.KEEPER_BOT_WALLET;
  if (!ethers.isAddress(KEEPER)) throw new Error("Set KEEPER_BOT_WALLET in .env");

  const deps = JSON.parse(fs.readFileSync("deployments.arbitrum_one.auto.json", "utf8"));
  const A = deps.addresses;

  const keeperContracts = [
    ["WikiKeeperService",    A.WikiKeeperService,    "setKeeper(address,bool)",  [KEEPER, true]],
    ["WikiBuybackBurn",      A.WikiBuybackBurn,      "setKeeper(address,bool)",  [KEEPER, true]],
    ["WikiLiqProtection",    A.WikiLiqProtection,    "setKeeper(address,bool)",  [KEEPER, true]],
    ["WikiInternalArb",      A.WikiInternalArb,      "setKeeper(address,bool)",  [KEEPER, true]],
    ["WikiOrderBook",        A.WikiOrderBook,        "setKeeper(address,bool)",  [KEEPER, true]],
    ["WikiConditionalOrder", A.WikiConditionalOrder, "setKeeper(address,bool)",  [KEEPER, true]],
    ["WikiTWAMM",            A.WikiTWAMM,            "setKeeper(address,bool)",  [KEEPER, true]],
    ["WikiProofOfSolvency",  A.WikiProofOfSolvency,  "setKeeper(address)",       [KEEPER]],
    ["WikiGuaranteedStop",   A.WikiGuaranteedStop,   "setKeeper(address)",       [KEEPER]],
    ["WikiLeveragedYield",   A.WikiLeveragedYield,   "setKeeper(address)",       [KEEPER]],
    ["WikiPositionInsurance",A.WikiPositionInsurance,"setKeeper(address)",       [KEEPER]],
    ["WikiPropPoolYield",    A.WikiPropPoolYield,    "setKeeper(address)",       [KEEPER]],
    ["WikiIdleRouter",       A.WikiIdleRouter,       "setKeeper(address)",       [KEEPER]],
  ];

  for (const [name, addr, sig, args] of keeperContracts) {
    if (!addr) { console.log(`⚠️  ${name} address missing, skipping`); continue; }
    const c = await ethers.getContractAt([`function ${sig}`], addr);
    process.stdout.write(`🔑 ${name}.setKeeper ... `);
    const tx = await c[sig.split("(")[0]](...args);
    await tx.wait();
    console.log("✅");
  }

  console.log(`\n✅ All keepers transferred to ${KEEPER}`);
}

main().catch(e => { console.error(e); process.exit(1); });
