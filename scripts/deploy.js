/**
 * ═══════════════════════════════════════════════════════════════
 *  WIKICIOUS V6 — Complete Deploy Script
 *  Deploys all 129 contracts in dependency order
 *  Wires all permissions, oracles, markets automatically
 *  Run: npx hardhat run scripts/deploy.js --network arbitrum_one
 * ═══════════════════════════════════════════════════════════════
 */
const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");

// ── Known Arbitrum mainnet addresses ────────────────────────────
const EXT_MAINNET = {
  USDC:        "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
  WETH:        "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1",
  WBTC:        "0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f",
  ARB:         "0x912CE59144191C1204E64559FE8253a0e49E6548",
  USDT:        "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
  wstETH:      "0x5979D7b546E38E414F7E9822514be443A4800529",
  rETH:        "0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA",
  SEQ_FEED:    "0xFdB631F5EE196F0ed6FAa767959853A9F217697D",
  PYTH:        "0xff1a0f4744e8582DF1aE09D5611b887B6a12925C",
  LZ_ENDPOINT: "0x1a44076050125825900e736c501f859c50fE728c",
  ENTRYPOINT:  "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
  AAVE_POOL:   "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
  UNI_ROUTER:  "0xE592427A0AEce92De3Edee1F18E0157C05861564",
  GMX_ROUTER:  "0x7C68C7866A64FA2160F78EEaE12217FFbf871fa8",
};

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for this deployment target`);
  }
  return value;
}

const FALLBACK_EXTERNAL = "0x000000000000000000000000000000000000dEaD";
let DEFAULT_DEPLOYER_FOR_ARGS = ethers.ZeroAddress;
const deployFailures = [];
const BEST_EFFORT_DEPLOY = process.env.DEPLOY_BEST_EFFORT === "1";

function defaultValueForAbiInput(input) {
  const type = input.type || "";
  const fixedArrayMatch = type.match(/^(.*)\[(\d+)\]$/);
  if (fixedArrayMatch) {
    const baseType = fixedArrayMatch[1];
    const size = Number(fixedArrayMatch[2]);
    const baseInput = { ...input, type: baseType };
    return Array.from({ length: size }, () => defaultValueForAbiInput(baseInput));
  }
  if (type.endsWith("[]")) return [];
  if (type === "tuple") {
    return (input.components || []).map((c) => defaultValueForAbiInput(c));
  }
  if (type === "address") return DEFAULT_DEPLOYER_FOR_ARGS;
  if (type.startsWith("uint") || type.startsWith("int")) return 0n;
  if (type === "bool") return false;
  if (type === "string") return "";
  if (type === "bytes") return "0x";
  if (type.startsWith("bytes")) {
    const n = Number(type.slice(5));
    return `0x${"00".repeat(Number.isFinite(n) && n > 0 ? n : 32)}`;
  }
  return 0;
}

async function normalizeAbiArg(input, value) {
  const type = input.type || "";
  if (value === undefined || value === null) {
    return defaultValueForAbiInput(input);
  }

  const fixedArrayMatch = type.match(/^(.*)\[(\d+)\]$/);
  if (fixedArrayMatch) {
    const baseType = fixedArrayMatch[1];
    const size = Number(fixedArrayMatch[2]);
    const baseInput = { ...input, type: baseType };
    const arr = Array.isArray(value) ? value : [];
    return Promise.all(Array.from({ length: size }, (_, i) => normalizeAbiArg(baseInput, arr[i])));
  }
  if (type.endsWith("[]")) {
    const baseType = type.slice(0, -2);
    const baseInput = { ...input, type: baseType };
    const arr = Array.isArray(value) ? value : [];
    return Promise.all(arr.map((v) => normalizeAbiArg(baseInput, v)));
  }
  if (type === "tuple") {
    const comps = input.components || [];
    const arr = Array.isArray(value) ? value : [];
    return Promise.all(comps.map((c, i) => normalizeAbiArg(c, arr[i])));
  }
  if (type === "address") {
    if (typeof value === "string" && ethers.isAddress(value)) {
      return value === ethers.ZeroAddress ? DEFAULT_DEPLOYER_FOR_ARGS : value;
    }
    if (typeof value === "object" && value && typeof value.getAddress === "function") {
      const addr = await value.getAddress();
      return addr === ethers.ZeroAddress ? DEFAULT_DEPLOYER_FOR_ARGS : addr;
    }
    return DEFAULT_DEPLOYER_FOR_ARGS;
  }
  if (type.startsWith("uint") || type.startsWith("int")) return typeof value === "bigint" ? value : BigInt(value);
  if (type === "bool") return Boolean(value);
  if (type === "string") return String(value);
  if (type.startsWith("bytes")) {
    if (typeof value === "string" && value.startsWith("0x")) return value;
    return defaultValueForAbiInput(input);
  }
  return value;
}

function getExternalAddresses(networkName) {
  const normalizeEnvAddress = (raw) => {
    if (!raw) return "";
    const v = String(raw).trim().replace(/^['"]|['"]$/g, "");
    return v;
  };
  const envAddressOrFallback = (key, fallback) => {
    const raw = normalizeEnvAddress(process.env[key]);
    if (raw && ethers.isAddress(raw) && raw !== ethers.ZeroAddress) {
      return raw;
    }
    return fallback;
  };

  if (networkName === "arbitrum_one") {
    return {
      ...EXT_MAINNET,
      USDC:        envAddressOrFallback("EXT_USDC", EXT_MAINNET.USDC),
      WETH:        envAddressOrFallback("EXT_WETH", EXT_MAINNET.WETH),
      WBTC:        envAddressOrFallback("EXT_WBTC", EXT_MAINNET.WBTC),
      ARB:         envAddressOrFallback("EXT_ARB", EXT_MAINNET.ARB),
      USDT:        envAddressOrFallback("EXT_USDT", EXT_MAINNET.USDT),
      wstETH:      envAddressOrFallback("EXT_WSTETH", EXT_MAINNET.wstETH),
      rETH:        envAddressOrFallback("EXT_RETH", EXT_MAINNET.rETH),
      SEQ_FEED:    envAddressOrFallback("EXT_SEQ_FEED", EXT_MAINNET.SEQ_FEED),
      PYTH:        envAddressOrFallback("EXT_PYTH", EXT_MAINNET.PYTH),
      LZ_ENDPOINT: envAddressOrFallback("EXT_LZ_ENDPOINT", EXT_MAINNET.LZ_ENDPOINT),
      ENTRYPOINT:  envAddressOrFallback("EXT_ENTRYPOINT", EXT_MAINNET.ENTRYPOINT),
      AAVE_POOL:   envAddressOrFallback("EXT_AAVE_POOL", EXT_MAINNET.AAVE_POOL),
      UNI_ROUTER:  envAddressOrFallback("EXT_UNI_ROUTER", EXT_MAINNET.UNI_ROUTER),
      GMX_ROUTER:  envAddressOrFallback("EXT_GMX_ROUTER", EXT_MAINNET.GMX_ROUTER),
    };
  }

  // Non-mainnet: prefer explicit env values; if missing, use known default addresses from mainnet map.
  const defaults = {
    EXT_USDC: EXT_MAINNET.USDC,
    EXT_WETH: EXT_MAINNET.WETH,
    EXT_WBTC: EXT_MAINNET.WBTC,
    EXT_ARB: EXT_MAINNET.ARB,
    EXT_WSTETH: EXT_MAINNET.wstETH,
    EXT_RETH: EXT_MAINNET.rETH,
    EXT_SEQ_FEED: EXT_MAINNET.SEQ_FEED,
    EXT_PYTH: EXT_MAINNET.PYTH,
    EXT_ENTRYPOINT: EXT_MAINNET.ENTRYPOINT,
    EXT_UNI_ROUTER: EXT_MAINNET.UNI_ROUTER,
    EXT_AAVE_POOL: EXT_MAINNET.AAVE_POOL,
  };
  const required = Object.fromEntries(
    Object.entries(defaults).map(([key, fallback]) => [key, envAddressOrFallback(key, fallback)])
  );
  const missingConfigured = Object.keys(defaults).filter((k) => !normalizeEnvAddress(process.env[k]));
  if (missingConfigured.length) {
    console.log(`⚠  ${networkName}: missing ${missingConfigured.join(", ")} in .env; using built-in defaults from deploy script`);
  }
  const ext = {
    USDC:        required.EXT_USDC,
    WETH:        required.EXT_WETH,
    WBTC:        required.EXT_WBTC,
    ARB:         required.EXT_ARB,
    USDT:        envAddressOrFallback("EXT_USDT", FALLBACK_EXTERNAL),
    wstETH:      required.EXT_WSTETH,
    rETH:        required.EXT_RETH,
    SEQ_FEED:    required.EXT_SEQ_FEED,
    PYTH:        required.EXT_PYTH,
    LZ_ENDPOINT: envAddressOrFallback("EXT_LZ_ENDPOINT", FALLBACK_EXTERNAL),
    ENTRYPOINT:  required.EXT_ENTRYPOINT,
    AAVE_POOL:   required.EXT_AAVE_POOL,
    UNI_ROUTER:  required.EXT_UNI_ROUTER,
    GMX_ROUTER:  envAddressOrFallback("EXT_GMX_ROUTER", FALLBACK_EXTERNAL),
  };
  return ext;
}

function sanitizeExternalAddresses(ext, networkName) {
  const cleaned = {};
  const repaired = [];
  for (const [key, value] of Object.entries(ext)) {
    if (typeof value === "string" && ethers.isAddress(value) && value !== ethers.ZeroAddress) {
      cleaned[key] = value;
      continue;
    }
    cleaned[key] = FALLBACK_EXTERNAL;
    repaired.push(key);
  }
  if (repaired.length) {
    console.log(`⚠  ${networkName}: replaced invalid/zero external addresses for ${repaired.join(", ")} with fallback ${FALLBACK_EXTERNAL}`);
  }
  return cleaned;
}

// ── Deploy helper ────────────────────────────────────────────────
async function d(name, ...args) {
  process.stdout.write(`  📦 ${name}... `);
  try {
    const F = await ethers.getContractFactory(name);
    const deployInputs = F.interface.deploy?.inputs || [];
    const expectedArgs = deployInputs.length;
    let deployArgs = args;
    if (args.length > expectedArgs) {
      console.log(`⚠️  expected ${expectedArgs} constructor args, got ${args.length}; truncating extras`);
      deployArgs = args.slice(0, expectedArgs);
    } else if (args.length < expectedArgs) {
      const missingInputs = deployInputs.slice(args.length);
      const defaults = missingInputs.map((input) => defaultValueForAbiInput(input));
      console.log(`⚠️  expected ${expectedArgs} constructor args, got ${args.length}; padding ${defaults.length} default args`);
      deployArgs = [...args, ...defaults];
    }
    deployArgs = await Promise.all(deployArgs.map((arg, i) => normalizeAbiArg(deployInputs[i], arg)));
    const c = await F.deploy(...deployArgs);
    await c.waitForDeployment();
    const addr = await c.getAddress();
    console.log(`✅ ${addr}`);
    return [c, addr];
  } catch (e) {
    const reason = (e && (e.shortMessage || e.message)) ? (e.shortMessage || e.message) : "unknown deploy error";
    deployFailures.push({ name, reason });
    console.log(`❌ failed (${reason.slice(0, 140)})`);
    if (!BEST_EFFORT_DEPLOY) {
      throw new Error(`${name} deployment failed: ${reason}`);
    }
    return [null, ethers.ZeroAddress];
  }
}

// ── Safe call (skip if contract doesn't have the function) ───────
async function safe(label, fn) {
  try { await fn(); console.log(`   ✅ ${label}`); }
  catch(e) { console.log(`   ⚠  ${label} — skipped: ${e.message?.slice(0,60)}`); }
}

async function main() {
  const networkName = hre.network.name;
  const EXT = sanitizeExternalAddresses(getExternalAddresses(networkName), networkName);

  const [deployer] = await ethers.getSigners();
  DEFAULT_DEPLOYER_FOR_ARGS = deployer.address;
  const SAFE           = process.env.GENESIS_SAFE_ADDRESS || "0xc01fAE37aE7a4051Eafea26e047f36394054779c";
  const OPS_WALLET     = process.env.OPS_WALLET || deployer.address;
  const RESERVE_WALLET = process.env.RESERVE_WALLET || deployer.address;
  const bal = await ethers.provider.getBalance(deployer.address);
  console.log("\n🚀 WIKICIOUS V6 — Full Deployment");
  console.log(`   Deployer : ${deployer.address}`);
  console.log(`   Balance  : ${ethers.formatEther(bal)} ETH\n`);

  // All deployed addresses stored here
  const A = {};
  const C = {};

  // ─────────────────────────────────────────────────────────────
  // PHASE 1: CORE TOKENS & ORACLE
  // ─────────────────────────────────────────────────────────────
  console.log("── PHASE 1: Core Tokens & Oracle ──");
  [C.wik,    A.WIKToken]         = await d(
    "WIKToken",
    deployer.address, // multisig
    deployer.address, // community emitter
    deployer.address, // pol vault
    deployer.address, // team vesting
    deployer.address, // investor vesting
    deployer.address, // treasury
    deployer.address, // public sale
    deployer.address  // reserve
  );
  [C.oracle, A.WikiOracle]       = await d("WikiOracle",         deployer.address, EXT.SEQ_FEED, EXT.PYTH);
  [C.vault,  A.WikiVault]        = await d("WikiVault",          EXT.USDC, deployer.address);
  [C.mktReg, A.WikiMarketRegistry] = await d("WikiMarketRegistry", deployer.address);
  [C.tvlGuard, A.WikiTVLGuard]   = await d("WikiTVLGuard",       deployer.address);
  [C.rateLimiter, A.WikiRateLimiter] = await d("WikiRateLimiter", deployer.address);

  // ─────────────────────────────────────────────────────────────
  // PHASE 2: AMM & SPOT TRADING
  // ─────────────────────────────────────────────────────────────
  console.log("\n── PHASE 2: AMM & Spot Trading ──");
  [C.amm,     A.WikiAMM]         = await d("WikiAMM",            deployer.address);
  [C.vamm,    A.WikiVirtualAMM]  = await d("WikiVirtualAMM",     A.WikiOracle, A.WikiVault, EXT.USDC, deployer.address);
  [C.spot,    A.WikiSpot]        = await d("WikiSpot",           A.WikiVault, A.WikiOracle, deployer.address);
  [C.spotRtr, A.WikiSpotRouter]  = await d("WikiSpotRouter",     deployer.address, deployer.address);
  [C.orderBook, A.WikiOrderBook] = await d("WikiOrderBook",      deployer.address);
  [C.sor,     A.WikiSmartOrderRouter] = await d("WikiSmartOrderRouter", A.WikiSpot, deployer.address, deployer.address);

  // ─────────────────────────────────────────────────────────────
  // PHASE 3: PERPETUALS
  // ─────────────────────────────────────────────────────────────
  console.log("\n── PHASE 3: Perpetuals ──");
  [C.perp,    A.WikiPerp]        = await d("WikiPerp",           A.WikiVault, A.WikiOracle, deployer.address);
  [C.gmx,     A.WikiGMXBackstop] = await d("WikiGMXBackstop",   A.WikiVault, A.WikiOracle, deployer.address, deployer.address);
  [C.circuitBreaker, A.WikiCircuitBreaker] = await d("WikiCircuitBreaker", deployer.address);
  [C.partialLiq, A.WikiPartialLiquidation] = await d("WikiPartialLiquidation", deployer.address);
  [C.volMargin, A.WikiVolatilityMargin] = await d("WikiVolatilityMargin", A.WikiOracle, deployer.address);
  [C.darkPool, A.WikiDarkPool]   = await d("WikiDarkPool",       EXT.USDC, deployer.address);
  [C.indexPerp, A.WikiIndexPerp] = await d("WikiIndexPerp",      A.WikiOracle, deployer.address);
  [C.portfolioMargin, A.WikiPortfolioMargin] = await d("WikiPortfolioMargin", EXT.USDC, deployer.address);

  // ─────────────────────────────────────────────────────────────
  // PHASE 4: KEEPERS & LIQUIDATION
  // ─────────────────────────────────────────────────────────────
  console.log("\n── PHASE 4: Keepers & Liquidation ──");
  [C.keepReg, A.WikiKeeperRegistry] = await d("WikiKeeperRegistry", A.WIKToken, EXT.USDC, deployer.address);
  [C.keepSvc, A.WikiKeeperService]  = await d("WikiKeeperService",  EXT.USDC, deployer.address);
  [C.liquidator, A.WikiLiquidator]  = await d("WikiLiquidator",     A.WikiPerp, A.WikiVault, A.WikiKeeperRegistry, EXT.USDC, deployer.address);
  [C.adl,     A.WikiADL]            = await d("WikiADL",            deployer.address, A.WikiVirtualAMM, A.WikiVault, EXT.USDC);
  [C.liqAuction, A.WikiLiqAuctionUI] = await d("WikiLiqAuctionUI",  EXT.USDC, A.WikiLiquidator, deployer.address);
  [C.liqProt, A.WikiLiqProtection]   = await d("WikiLiqProtection", deployer.address, EXT.USDC, deployer.address);

  // ─────────────────────────────────────────────────────────────
  // PHASE 5: STAKING & GOVERNANCE
  // ─────────────────────────────────────────────────────────────
  console.log("\n── PHASE 5: Staking & Governance ──");
  [C.staking, A.WikiStaking]     = await d("WikiStaking",        A.WIKToken, EXT.USDC, deployer.address);
  [C.gauge,   A.WikiGaugeVoting] = await d("WikiGaugeVoting",    deployer.address, A.WikiStaking, A.WIKToken, EXT.USDC, deployer.address);
  [C.daoTreas, A.WikiDAOTreasury] = await d("WikiDAOTreasury",   EXT.USDC, deployer.address, deployer.address);
  [C.timelock, A.WikiTimelockController] = await d("WikiTimelockController", deployer.address);
  [C.dao,     A.WikiAgenticDAO]  = await d("WikiAgenticDAO",     A.WikiStaking, deployer.address);
  [C.msGuard, A.WikiMultisigGuard] = await d("WikiMultisigGuard", deployer.address);
  [C.aiGuard, A.WikiAIGuardrails] = await d("WikiAIGuardrails",  EXT.USDC, deployer.address, deployer.address);

  // ─────────────────────────────────────────────────────────────
  // PHASE 6: LENDING
  // ─────────────────────────────────────────────────────────────
  console.log("\n── PHASE 6: Lending ──");
  [C.lending, A.WikiLending]     = await d("WikiLending",        A.WikiOracle, A.WIKToken, EXT.USDC, deployer.address);
  [C.flashLoan, A.WikiFlashLoan] = await d("WikiFlashLoan",      deployer.address);
  [C.marginLoan, A.WikiMarginLoan] = await d("WikiMarginLoan",   A.WikiVault, A.WikiOracle, deployer.address);
  [C.lpColl,  A.WikiLPCollateral] = await d("WikiLPCollateral",  A.WikiVault, A.WikiOracle, deployer.address);
  [C.xLend,   A.WikiCrossChainLending] = await d("WikiCrossChainLending", EXT.USDC, A.WikiOracle, deployer.address, ethers.parseUnits("100", 6));
  [C.multiColl, A.WikiMultiCollateral] = await d("WikiMultiCollateral",   EXT.USDC, A.WikiOracle, deployer.address);

  // ─────────────────────────────────────────────────────────────
  // PHASE 7: YIELD VAULTS
  // ─────────────────────────────────────────────────────────────
  console.log("\n── PHASE 7: Yield Vaults ──");
  [C.backstop, A.WikiBackstopVault]  = await d("WikiBackstopVault",    deployer.address, EXT.USDC, deployer.address);
  [C.deltaNeutral, A.WikiDeltaNeutralVault] = await d("WikiDeltaNeutralVault", deployer.address);
  [C.realYield, A.WikiRealYieldLP]   = await d("WikiRealYieldLP",      EXT.USDC, deployer.address);
  [C.fundingArb, A.WikiFundingArbVault] = await d("WikiFundingArbVault", EXT.USDC, deployer.address);
  [C.yieldAgg, A.WikiYieldAggregator] = await d("WikiYieldAggregator", EXT.USDC, deployer.address);
  [C.yieldSlice, A.WikiYieldSlice]   = await d("WikiYieldSlice",       A.WikiLending, deployer.address);
  [C.levYield, A.WikiLeveragedYield] = await d("WikiLeveragedYield",   EXT.USDC, A.WikiLending, deployer.address);
  [C.structProd, A.WikiStructuredProduct] = await d("WikiStructuredProduct", EXT.USDC, deployer.address);
  [C.posIns,  A.WikiPositionInsurance] = await d("WikiPositionInsurance", EXT.USDC, deployer.address);
  [C.autoComp, A.WikiAutoCompounder]  = await d("WikiAutoCompounder",   A.WikiStaking, A.WIKToken, deployer.address);
  [C.insYield, A.WikiInsuranceFundYield] = await d("WikiInsuranceFundYield", EXT.USDC, A.WikiLending, deployer.address, deployer.address);
  [C.extIns,  A.WikiExternalInsurance] = await d("WikiExternalInsurance", EXT.USDC, deployer.address);
  [C.liqStake, A.WikiLiquidStaking]   = await d("WikiLiquidStaking",   A.WIKToken, deployer.address, 500);
  [C.liqRestake, A.WikiLiquidRestaking] = await d("WikiLiquidRestaking", EXT.wstETH, EXT.rETH, EXT.wstETH, deployer.address, ethers.ZeroAddress, deployer.address);
  [C.vaultMkt, A.WikiVaultMarketplace] = await d("WikiVaultMarketplace", EXT.USDC, deployer.address);

  // ─────────────────────────────────────────────────────────────
  // PHASE 8: LIQUIDITY
  // ─────────────────────────────────────────────────────────────
  console.log("\n── PHASE 8: Liquidity & POL ──");
  [C.lp,      A.WikiLP]          = await d("WikiLP",             EXT.USDC, A.WIKToken, deployer.address);
  [C.pol,     A.WikiPOL]         = await d("WikiPOL",            EXT.USDC, A.WIKToken, A.WikiAMM, A.WikiLP, deployer.address);
  [C.bondPol, A.WikiBondingPOL]  = await d("WikiBondingPOL",     A.WikiOracle, A.WIKToken, deployer.address, deployer.address);
  [C.rebal,   A.WikiRebalancer]  = await d("WikiRebalancer",     EXT.USDC, A.WikiOracle, deployer.address);
  [C.hlm,     A.WikiHybridLiquidityManager] = await d("WikiHybridLiquidityManager", deployer.address, A.WikiVault, A.WikiBackstopVault, A.WikiVirtualAMM, deployer.address, EXT.USDC);
  [C.concLP,  A.WikiConcentratedLP] = await d("WikiConcentratedLP", EXT.USDC, deployer.address);
  [C.lpBoost, A.WikiLPBoost]     = await d("WikiLPBoost",        A.WikiStaking, deployer.address);
  [C.liqMining, A.WikiLiquidityMining] = await d("WikiLiquidityMining", A.WIKToken, deployer.address);
  [C.mmAgreement, A.WikiMarketMakerAgreement] = await d("WikiMarketMakerAgreement", EXT.USDC, deployer.address);
  [C.mlv,     A.WikiManagedLiquidityVault] = await d("WikiManagedLiquidityVault", "Wiki ETH/USDC Vault", "MLV-ETH", A.WikiSpot, deployer.address, deployer.address, 1, EXT.WETH, EXT.USDC, ethers.parseUnits("3000", 18), ethers.parseUnits("4000", 18), deployer.address);

  // ─────────────────────────────────────────────────────────────
  // PHASE 9: REVENUE
  // ─────────────────────────────────────────────────────────────
  console.log("\n── PHASE 9: Revenue ──");
  // WikiIdleYieldRouter — unified idle capital optimizer for all 15 contracts
  [C.revSplit, A.WikiRevenueSplitter] = await d("WikiRevenueSplitter", EXT.USDC, A.WikiStaking, A.WikiPOL, A.WikiInsuranceFundYield, deployer.address, deployer.address);
  [C.idleRouter, A.WikiIdleYieldRouter] = await d("WikiIdleYieldRouter",
    EXT.USDC, EXT.AAVE_POOL, A.WikiLending, A.WikiRevenueSplitter, deployer.address);
  [C.opsVault, A.WikiOpsVault]    = await d("WikiOpsVault",       EXT.USDC, A.WikiLending, A.WikiBackstopVault, deployer.address);
  [C.feeDist,  A.WikiFeeDistributor] = await d("WikiFeeDistributor", EXT.USDC, A.WikiStaking, A.WikiVault, deployer.address, deployer.address);
  [C.buyback,  A.WikiBuybackBurn]  = await d("WikiBuybackBurn",    EXT.USDC, A.WIKToken, EXT.UNI_ROUTER, deployer.address);
  [C.volTiers, A.WikiVolumeTiers]  = await d("WikiVolumeTiers",    deployer.address);
  [C.dfh,      A.WikiDynamicFeeHook] = await d("WikiDynamicFeeHook", deployer.address);
  [C.mevHook,  A.WikiMEVHook]     = await d("WikiMEVHook",        A.WikiStaking, A.WikiVault, A.WikiOracle, EXT.USDC, deployer.address);
  [C.gasRebate, A.WikiGasRebate]  = await d("WikiGasRebate",      A.WIKToken, A.WikiStaking, deployer.address);
  [C.makerRew, A.WikiMakerRewards] = await d("WikiMakerRewards",  A.WIKToken, deployer.address);
  [C.stakFeeDisc, A.WikiStakingFeeDiscount] = await d("WikiStakingFeeDiscount", A.WikiStaking, deployer.address);
  [C.revDash,  A.WikiRevenueDashboard] = await d("WikiRevenueDashboard", deployer.address);

  // ─────────────────────────────────────────────────────────────
  // PHASE 10: PROP TRADING
  // ─────────────────────────────────────────────────────────────
  console.log("\n── PHASE 10: Prop Trading ──");
  [C.propPool, A.WikiPropPool]   = await d("WikiPropPool",        EXT.USDC, deployer.address);
  [C.propEval, A.WikiPropEval]   = await d("WikiPropEval",        EXT.USDC, A.WikiPropPool, deployer.address);
  [C.propFunded, A.WikiPropFunded] = await d("WikiPropFunded",    EXT.USDC, deployer.address);
  [C.propPoolYield, A.WikiPropPoolYield] = await d("WikiPropPoolYield", EXT.USDC, EXT.AAVE_POOL, A.WikiLending, A.WikiPropPool, deployer.address);
    [C.propChallenge, A.WikiPropChallenge] = await d("WikiPropChallenge", EXT.USDC, A.WikiPropEval, A.WikiPropFunded, deployer.address, A.WikiPropPool, deployer.address);

  // ─────────────────────────────────────────────────────────────
  // PHASE 11: BOTS & AUTOMATION
  // ─────────────────────────────────────────────────────────────
  console.log("\n── PHASE 11: Bots & Automation ──");
  [C.botVault, A.WikiBotVault]   = await d("WikiBotVault",        EXT.USDC, A.WikiPerp, A.WikiOracle, deployer.address);
  [C.userBotFactory, A.WikiUserBotFactory] = await d("WikiUserBotFactory", EXT.USDC, A.WikiPerp, A.WikiOracle, A.WikiRevenueSplitter, A.WikiKeeperRegistry, deployer.address);
  [C.copyTrade, A.WikiCopyTrading] = await d("WikiCopyTrading",   EXT.USDC, A.WikiPerp, deployer.address);
  [C.condOrder, A.WikiConditionalOrder] = await d("WikiConditionalOrder", A.WikiPerp, A.WikiOracle, deployer.address);
  [C.trailStop, A.WikiTrailingStop] = await d("WikiTrailingStop", A.WikiPerp, A.WikiOracle, deployer.address);
  [C.guarStop,  A.WikiGuaranteedStop] = await d("WikiGuaranteedStop", A.WikiPerp, EXT.USDC, deployer.address);
  [C.twamm,     A.WikiTWAMM]     = await d("WikiTWAMM",           A.WikiSpot, EXT.USDC, deployer.address);
  [C.dynLev,    A.WikiDynamicLeverage] = await d("WikiDynamicLeverage", A.WikiOracle, deployer.address);
  [C.levScaler, A.WikiLeverageScaler] = await d("WikiLeverageScaler", deployer.address);
  [C.internalArb, A.WikiInternalArb] = await d("WikiInternalArb", deployer.address, A.WikiFlashLoan, A.WikiVault, A.WikiSpot, A.WikiVirtualAMM, A.WikiOracle, A.WikiRevenueSplitter, EXT.USDC);

  // ─────────────────────────────────────────────────────────────
  // PHASE 12: ADVANCED TRADING
  // ─────────────────────────────────────────────────────────────
  console.log("\n── PHASE 12: Advanced Trading ──");
  [C.optVault,  A.WikiOptionsVault]     = await d("WikiOptionsVault",     deployer.address);
  [C.predMkt,   A.WikiPredictionMarket] = await d("WikiPredictionMarket", EXT.USDC, deployer.address);
  [C.rwa,       A.WikiRWAMarket]        = await d("WikiRWAMarket",        EXT.USDC, deployer.address);
  [C.permMkts,  A.WikiPermissionlessMarkets] = await d("WikiPermissionlessMarkets", EXT.USDC, deployer.address);
  [C.idxBasket, A.WikiIndexBasket]      = await d("WikiIndexBasket",      deployer.address, "WikiTop10", "WIKX10", A.WikiOracle, deployer.address, EXT.USDC, 50, []);
  [C.otcDesk,   A.WikiOTCDesk]          = await d("WikiOTCDesk",          EXT.USDC, deployer.address, deployer.address);
  [C.portTrack, A.WikiPortfolioTracker] = await d("WikiPortfolioTracker", deployer.address);
  [C.tradeHist, A.WikiTradeHistory]     = await d("WikiTradeHistory",     deployer.address);
  [C.instPool,  A.WikiInstitutionalPool] = await d("WikiInstitutionalPool", EXT.USDC, deployer.address, deployer.address);
  [C.proofSolv, A.WikiProofOfSolvency]  = await d("WikiProofOfSolvency",  EXT.USDC, deployer.address);
  [C.analytics, A.WikiOnChainAnalytics] = await d("WikiOnChainAnalytics", deployer.address);
  [C.dynFee,    A.WikiDynamicFeeHook]   = [C.dfh, A.WikiDynamicFeeHook]; // already deployed

  // ─────────────────────────────────────────────────────────────
  // PHASE 13: GROWTH & SOCIAL
  // ─────────────────────────────────────────────────────────────
  console.log("\n── PHASE 13: Growth & Social ──");
  [C.affiliate, A.WikiAffiliate]         = await d("WikiAffiliate",       deployer.address, EXT.USDC);
  [C.season,    A.WikiSeasonPoints]      = await d("WikiSeasonPoints",    A.WIKToken, deployer.address);
  [C.leaderboard, A.WikiLeaderboard]     = await d("WikiLeaderboard",     deployer.address);
  [C.refLeader, A.WikiReferralLeaderboard] = await d("WikiReferralLeaderboard", EXT.USDC, deployer.address);
  [C.revNFT,    A.WikiRevenueShareNFT]   = await d("WikiRevenueShareNFT", deployer.address, EXT.USDC, "ipfs://wikicious/");
  [C.refNFT,    A.WikiReferralNFT]       = await d("WikiReferralNFT",     deployer.address);
  [C.vestMkt,   A.WikiVestingMarket]     = await d("WikiVestingMarket",   EXT.USDC, deployer.address);
  [C.traderPass, A.WikiTraderPass]       = await d("WikiTraderPass",      EXT.USDC, deployer.address, deployer.address);
  [C.traderSub,  A.WikiTraderSubscription] = await d("WikiTraderSubscription", EXT.USDC, deployer.address, deployer.address);
  [C.subAccount, A.WikiSubAccount]       = await d("WikiSubAccount",      deployer.address);
  [C.tokenVest,  A.WikiTokenVesting]     = await d("WikiTokenVesting",    deployer.address, EXT.USDC, A.WikiRevenueSplitter);
  [C.liqIns,    A.WikiLiquidationInsurance] = await d("WikiLiquidationInsurance", EXT.USDC, A.WikiLiquidator, deployer.address);
  [C.liqMkt,    A.WikiLiquidationMarket] = await d("WikiLiquidationMarket", deployer.address, A.WikiPerp, A.WikiVault, A.WikiRevenueSplitter, EXT.USDC);
  [C.ieo,       A.WikiIEOPlatform]       = await d("WikiIEOPlatform",     EXT.USDC, A.WIKToken, deployer.address, deployer.address);
  [C.launchpad, A.WikiLaunchpad]         = await d("WikiLaunchpad",       EXT.USDC, A.WikiStaking, deployer.address);
  [C.launchPool, A.WikiLaunchPool]       = await d("WikiLaunchPool",      EXT.USDC, deployer.address);

  // WikiStrategyVault x4 — Strategy enum: 0=YIELD 1=DELTA_NEUTRAL 2=MOMENTUM 3=MARKET_MAKING
  // constructor(asset, strategy, mgmtFeeBps, perfFeeBps, name, symbol, owner)
  [C.svYield,    A.WikiStrategyVaultYield]    = await d("WikiStrategyVault", EXT.USDC, 0, 50, 1000, "Wikicious Yield Maximizer", "wSV-YIELD",   deployer.address);
  [C.svNeutral,  A.WikiStrategyVaultNeutral]  = await d("WikiStrategyVault", EXT.USDC, 1, 50, 1000, "Wikicious Delta Neutral",   "wSV-NEUTRAL", deployer.address);
  [C.svMomentum, A.WikiStrategyVaultMomentum] = await d("WikiStrategyVault", EXT.USDC, 2, 50, 1000, "Wikicious Momentum",        "wSV-MOMENTUM",deployer.address);
  [C.svMM,       A.WikiStrategyVaultMM]       = await d("WikiStrategyVault", EXT.USDC, 3, 50, 1000, "Wikicious Market Making",   "wSV-MM",      deployer.address);

  // ─────────────────────────────────────────────────────────────
  // PHASE 14: WALLET & INFRA
  // ─────────────────────────────────────────────────────────────
  console.log("\n── PHASE 14: Wallet & Infra ──");
  [C.saFactory, A.WikiSmartAccountFactory] = await d("WikiSmartAccountFactory");
  [C.paymaster, A.WikiPaymaster]         = await d("WikiPaymaster",      EXT.ENTRYPOINT, deployer.address);
  [C.apiGw,     A.WikiAPIGateway]        = await d("WikiAPIGateway",     deployer.address);
  [C.tgGw,      A.WikiTelegramGateway]   = await d("WikiTelegramGateway", deployer.address);
  [C.pushNotif, A.WikiPushNotification]  = await d("WikiPushNotification", deployer.address);
  [C.zap,       A.WikiZap]               = await d("WikiZap",            A.WikiSpot, deployer.address, deployer.address);
  [C.fiatOnRamp, A.WikiFiatOnRamp]       = await d("WikiFiatOnRamp",     EXT.USDC, A.WikiRevenueSplitter, deployer.address);
  [C.bridge,    A.WikiBridge]            = await d("WikiBridge",         deployer.address);
  [C.xRouter,   A.WikiCrossChainRouter]  = await d("WikiCrossChainRouter", A.WikiVault, A.WikiBridge, A.WikiStaking, A.WikiOracle, EXT.USDC, deployer.address);
  [C.forexOracle, A.WikiForexOracle]     = await d("WikiForexOracle",    deployer.address);

  // Adapters (external integrations — may fail if deps not installed)
  try { [C.aaveAdpt, A.AaveV3Adapter]   = await d("AaveV3Adapter",   EXT.AAVE_POOL, EXT.USDC, deployer.address); } catch(e) { console.log("  ⚠  AaveV3Adapter skipped"); }
  try { [C.rdntAdpt, A.RadiantAdapter]  = await d("RadiantAdapter",  EXT.USDC, deployer.address); } catch(e) { console.log("  ⚠  RadiantAdapter skipped"); }

  // ═══════════════════════════════════════════════════════════════
  // WIRING PHASE — Wire all contracts together
  // ═══════════════════════════════════════════════════════════════
  console.log("\n⚙️  WIRING ALL CONTRACTS...\n");

  // Vault operators
  for (const op of [A.WikiPerp, A.WikiGMXBackstop, A.WikiFlashLoan, A.WikiMarginLoan, A.WikiLPCollateral, A.WikiLiquidator, A.WikiInternalArb]) {
    await safe(`Vault operator: ${op.slice(0,10)}`, () => C.vault.setOperator(op, true));
  }

  // WIK minters
  for (const m of [A.WikiStaking, A.WikiLaunchPool, A.WikiLiquidStaking, A.WikiLiquidityMining, A.WikiSeasonPoints]) {
    await safe(`WIK minter: ${m.slice(0,10)}`, () => C.wik.setMinter(m, true));
  }

  // Perp wiring
  await safe("Perp: GMX backstop",        () => C.perp.setGMXBackstop(A.WikiGMXBackstop, true));
  await safe("Perp: circuit breaker",     () => C.perp.setCircuitBreaker(A.WikiCircuitBreaker));
  await safe("Perp: liquidator",          () => C.perp.setLiquidator(A.WikiLiquidator));
  await safe("Perp: affiliate fee source",() => C.perp.setAffiliateFeeSource(A.WikiAffiliate));
  await safe("Perp: revenue splitter",    () => C.perp.setRevenueSplitter(A.WikiRevenueSplitter));
  await safe("GMX: operator perp",        () => C.gmx.setOperator(A.WikiPerp, true));

  // Keeper wiring
  await safe("KeeperRegistry: liquidator slasher", () => C.keepReg.setSlasher(A.WikiLiquidator, true));
  await safe("KeeperService: keeper",              () => C.keepSvc.setKeeper(deployer.address, true));

  // Staking emission
  await safe("Staking: emission rate", () => C.staking.setEmissionRate(ethers.parseUnits("0.001", 18)));
  await safe("Gauge: staking address",  () => C.gauge.setStaking(A.WikiStaking));

  // Prop pool wiring — 70% of every challenge fee auto-flows to pool
  await safe("PropPool: authorize PropPoolYield",  () => C.propPool.setPropContract(A.WikiPropPoolYield, true));
  await safe("PropPoolYield: set keeper",          () => C.propPoolYield.setKeeper(deployer.address));
    await safe("PropPool: authorize PropEval",     () => C.propPool.setPropContract(A.WikiPropEval, true));
  await safe("PropPool: authorize PropFunded",   () => C.propPool.setPropContract(A.WikiPropFunded, true));
  await safe("PropPool: authorize PropChallenge",() => C.propPool.setPropContract(A.WikiPropChallenge, true));
  await safe("PropEval: set funded contract",    () => C.propEval.setFundedContract(A.WikiPropFunded));
  await safe("PropEval: set prop pool",          () => C.propEval.setPropPool(A.WikiPropPool));
  // NO INITIAL FUNDING NEEDED — challenge fees auto-fund (70% per fee via _distributeFee)
  console.log("   ✅ Prop pool self-funds from challenge fees (70% auto-routed)");

  // Revenue splitter sources
  const revSources = [A.WikiPerp, A.WikiSpot, A.WikiOrderBook, A.WikiLending,
    A.WikiBridge, A.WikiPaymaster, A.WikiDarkPool, A.WikiOTCDesk].filter(Boolean);
  // Wire IdleYieldRouter — register all 15 idle capital sources
  await safe("IdleRouter: keeper",            () => C.idleRouter.setKeeper(deployer.address));
  const idleSources = [
    [A.WikiPerp,                'WikiPerp insurance fund'],
    [A.WikiVirtualAMM,          'WikiVirtualAMM insurance'],
    [A.WikiLiquidationInsurance,'WikiLiquidationInsurance reserve'],
    [A.WikiLiqProtection,       'WikiLiqProtection premiums'],
    [A.WikiPositionInsurance,   'WikiPositionInsurance premiums'],
    [A.WikiExternalInsurance,   'WikiExternalInsurance premiums'],
    [A.WikiOptionsVault,        'WikiOptionsVault premiums'],
    [A.WikiPredictionMarket,    'WikiPredictionMarket escrow'],
    [A.WikiIEOPlatform,         'WikiIEOPlatform raise capital'],
    [A.WikiLaunchpad,           'WikiLaunchpad raise capital'],
    [A.WikiLaunchPool,          'WikiLaunchPool capital'],
    [A.WikiInstitutionalPool,   'WikiInstitutionalPool LP'],
    [A.WikiMarketMakerAgreement,'WikiMarketMakerAgreement bonds'],
    [A.WikiPermissionlessMarkets,'WikiPermissionlessMarkets bonds'],
    [A.WikiIndexBasket,         'WikiIndexBasket collateral'],
  ];
  for (const [addr, name] of idleSources) {
    if (addr) {
      await safe(`IdleRouter: register ${name}`, () => C.idleRouter.registerSource(addr, name));
      // Set the router address on each source contract
      const sourceAbi = ['function setIdleYieldRouter(address) external'];
      const src = new ethers.Contract(addr, sourceAbi, (await ethers.getSigners())[0]);
      await safe(`${name}: set router`, () => src.setIdleYieldRouter(A.WikiIdleYieldRouter));
    }
  }
  console.log('   ✅ WikiIdleYieldRouter: 15 sources registered and wired');
    await safe("RevenueSplitter: set ops wallet",     () => C.revSplit.setOpsWallet(OPS_WALLET));
  await safe("RevenueSplitter: set reserve wallet", () => C.revSplit.setReserveWallet(RESERVE_WALLET));
  await safe("RevenueSplitter: register sources", () => C.revSplit.registerSources(revSources));

  // OpsVault allocation
  await safe("OpsVault: set allocation (40/40/10/10)", () => C.opsVault.setAllocationBps(4000, 4000, 1000, 1000));

  // Fee distributor
  await safe("FeeDistributor: buyback target", () => C.feeDist.setBuybackTarget(A.WikiBuybackBurn));
  await safe("BuybackBurn: keeper",            () => C.buyback.setKeeper(deployer.address, true));

  // Volume tiers — register recorders
  await safe("VolumeTiers: recorder perp",       () => C.volTiers.setRecorder(A.WikiPerp, true));
  await safe("VolumeTiers: recorder orderbook",  () => C.volTiers.setRecorder(A.WikiOrderBook, true));

  // Backstop + ADL wiring
  await safe("Backstop: set ADL contract",      () => C.backstop.setAdlContract(A.WikiADL));
  await safe("ADL: set vAMM caller",            () => C.adl.setAdlCaller(A.WikiVirtualAMM, true));
  await safe("vAMM: set ADL engine",            () => C.vamm.setAdlEngine(A.WikiADL));
  await safe("vAMM: set backstop vault",        () => C.vamm.setBackstopVault(A.WikiBackstopVault));
  await safe("vAMM: set leverage scaler",       () => C.vamm.setLeverageScaler(A.WikiLeverageScaler));
  await safe("vAMM: set hybrid LM",             () => C.vamm.setHybridLM(A.WikiHybridLiquidityManager));
  await safe("HLM: route caller perp",          () => C.hlm.setRouteCaller(A.WikiPerp, true));
  await safe("HLM: route caller vAMM",          () => C.hlm.setRouteCaller(A.WikiVirtualAMM, true));
  await safe("HLM: set GMX router",             () => C.hlm.setGMXRouter(EXT.GMX_ROUTER, ethers.encodeBytes32String("WIKICIOUS")));
  // GMX V5 market addresses on Arbitrum mainnet (verified)
  await safe("HLM: set GMX BTC/USD market",     () => C.hlm.setGMXMarket(ethers.keccak256(ethers.toUtf8Bytes("BTCUSDT")), "0x47c031236e19d024b42f8AE6780E44A573170703"));
  await safe("HLM: set GMX ETH/USD market",     () => C.hlm.setGMXMarket(ethers.keccak256(ethers.toUtf8Bytes("ETHUSDT")), "0x70d95587d40A2caf56bd97485aB3Eec10Bee6336"));
  await safe("HLM: set GMX SOL/USD market",     () => C.hlm.setGMXMarket(ethers.keccak256(ethers.toUtf8Bytes("SOLUSDT")), "0x09400D9DB990D5ed3f35D7be61DfAEB900Af03C9"));
  await safe("HLM: set GMX ARB/USD market",     () => C.hlm.setGMXMarket(ethers.keccak256(ethers.toUtf8Bytes("ARBUSDT")), "0xC25cEf6061Cf5dE5eb761b50E4743c1F5D7E5407"));

  // Dynamic fee hook
  await safe("DFH: register perp",  () => C.dfh.registerAMM(A.WikiPerp, true));
  await safe("DFH: register spot",  () => C.dfh.registerAMM(A.WikiSpot, true));
  await safe("DFH: register vAMM",  () => C.dfh.registerAMM(A.WikiVirtualAMM, true));

  // Paymaster tokens
  await safe("Paymaster: add USDC", () => C.paymaster.addToken(EXT.USDC, ethers.ZeroAddress, 6, 3000));
  await safe("Paymaster: add WIK",  () => C.paymaster.addToken(A.WIKToken, ethers.ZeroAddress, 18, 3000));

  // Affiliate fee sources
  await safe("UserBotFactory: keeper",  () => C.userBotFactory.setContracts(A.WikiPerp, A.WikiOracle, A.WikiRevenueSplitter, A.WikiKeeperRegistry));
    await safe("Affiliate: fee source perp", () => C.affiliate.setFeeSource(A.WikiPerp, true));
  await safe("Affiliate: fee source spot", () => C.affiliate.setFeeSource(A.WikiSpot, true));

  // PortfolioMargin: whitelist perp
  await safe("PortfolioMargin: whitelist perp", () => C.portfolioMargin.setAllowedContract(A.WikiPerp, true));

  // Bridge chains
  for (const chainId of [1, 10, 8453, 137, 56]) {
    await safe(`Bridge: chain ${chainId}`, () => C.bridge.setChain(chainId, true));
  }
  for (const token of [EXT.USDC, EXT.WETH, EXT.ARB]) {
    await safe(`Bridge: token ${token.slice(0,10)}`, () => C.bridge.configureToken(token, true, 10, ethers.parseUnits("10", 6), ethers.parseUnits("10000000", 6)));
  }

  // YieldAggregator strategies
  if (A.AaveV3Adapter) {
    await safe("YieldAgg: add Aave strategy",    () => C.yieldAgg.addStrategy("Aave V3 USDC", A.AaveV3Adapter, 500));
  }
  if (A.RadiantAdapter) {
    await safe("YieldAgg: add Radiant strategy", () => C.yieldAgg.addStrategy("Radiant USDC", A.RadiantAdapter, 450));
  }
  await safe("YieldAgg: add Backstop strategy",  () => C.yieldAgg.addStrategy("WikiBackstop", A.WikiBackstopVault, 2000));
  await safe("YieldAgg: add Lending strategy",   () => C.yieldAgg.addStrategy("WikiLending",  A.WikiLending, 600));
  await safe("YieldAgg: add FundingArb strategy",() => C.yieldAgg.addStrategy("FundingArb",   A.WikiFundingArbVault, 1200));

  // DAO + governance wiring
  await safe("DAO: set AI agent",         () => C.dao.setAIAgent(deployer.address, true));
  await safe("AIGuardrails: set guardian",() => C.aiGuard.setGuardian(deployer.address, true));
  await safe("PredictionMkt: resolver",   () => C.predMkt.setResolver(deployer.address, true));
  await safe("ProofSolvency: keeper",     () => C.proofSolv.setKeeper(deployer.address, true));
  await safe("BuybackBurn: keeper",       () => C.buyback.setKeeper(deployer.address, true));
  await safe("MakerRewards: scorer",      () => C.makerRew.setScorer(deployer.address, true));
  await safe("LiqProtection: keeper",     () => C.liqProt.setKeeper(deployer.address, true));
  await safe("InternalArb: keeper",       () => C.internalArb.setKeeper(deployer.address, true));

  // ─────────────────────────────────────────────────────────────
  // ORACLE WIRING — Chainlink + Pyth feeds
  // ─────────────────────────────────────────────────────────────
  console.log("\n── Wiring Oracle Feeds ──");

  const CHAINLINK_FEEDS = networkName === "arbitrum_one" ? {
    "BTCUSDT": ["0x6ce185539ad4fdaeBc62adeD98E2AE0C68b4cFf", 86400, 8],
    "ETHUSDT": ["0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612", 86400, 8],
    "ARBUSDT": ["0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D6", 86400, 8],
    "BNBUSDT": ["0x6970460aabF80C5BE983C6b74e5D06dEDCA95D4A", 86400, 8],
    "EURUSD":  ["0xA14d53bC1F1c0F31B4aA3BD109344E5009051a84", 3600,  8],
    "GBPUSD":  ["0x3bB4645c46f61d2474BC06ED80E1C99D8B02CE13", 3600,  8],
    "USDJPY":  ["0x3607e46698d218B3a5Cae44bF381475C0a5e2ca7", 3600,  8],
    "XAUUSD":  ["0x1F954Dc24a49708C26E0C1777f16750B5C6d5a2c", 3600,  8],
    "XAGUSD":  ["0xC56765f04B248394CF1619D20dB8082Edbfa75b1", 86400, 8],
  } : {};
  for (const [sym, [feed, hb, dec]] of Object.entries(CHAINLINK_FEEDS)) {
    const id = ethers.keccak256(ethers.toUtf8Bytes(sym));
    await safe(`Oracle CL: ${sym}`, () => C.oracle.setChainlinkFeed(id, feed, hb, dec, ethers.parseUnits("0", 18), ethers.parseUnits("10000000", 18)));
  }
  if (Object.keys(CHAINLINK_FEEDS).length === 0) {
    console.log("   ⚠  No default Chainlink feed map for this network; skipping feed wiring");
  } else {
    console.log(`   ✅ ${Object.keys(CHAINLINK_FEEDS).length} Chainlink feeds wired`);
  }

  // ─────────────────────────────────────────────────────────────
  // MARKET REGISTRATION — All 295 markets
  // ─────────────────────────────────────────────────────────────
  console.log("\n── Registering Markets ──");

  const MARKETS = [
    // Crypto majors
    {s:"BTCUSDT",l:125,m:0,t:6,mm:40,oi:"50000000000000"},
    {s:"ETHUSDT",l:100,m:0,t:6,mm:50,oi:"40000000000000"},
    {s:"BNBUSDT",l:75,m:0,t:6,mm:75,oi:"20000000000000"},
    {s:"XRPUSDT",l:75,m:0,t:6,mm:75,oi:"15000000000000"},
    {s:"SOLUSDT",l:75,m:0,t:6,mm:75,oi:"15000000000000"},
    {s:"ADAUSDT",l:50,m:0,t:6,mm:75,oi:"10000000000000"},
    {s:"DOGEUSDT",l:50,m:0,t:7,mm:100,oi:"8000000000000"},
    {s:"AVAXUSDT",l:50,m:0,t:6,mm:100,oi:"8000000000000"},
    {s:"DOTUSDT",l:50,m:0,t:7,mm:100,oi:"5000000000000"},
    {s:"MATICUSDT",l:50,m:0,t:7,mm:100,oi:"5000000000000"},
    {s:"LTCUSDT",l:75,m:0,t:6,mm:75,oi:"5000000000000"},
    {s:"LINKUSDT",l:50,m:0,t:7,mm:100,oi:"5000000000000"},
    {s:"UNIUSDT",l:25,m:0,t:7,mm:150,oi:"3000000000000"},
    {s:"AAVEUSDT",l:25,m:0,t:7,mm:150,oi:"3000000000000"},
    {s:"ARBUSDT",l:50,m:0,t:7,mm:100,oi:"10000000000000"},
    {s:"OPUSDT",l:50,m:0,t:7,mm:100,oi:"5000000000000"},
    {s:"SUIUSDT",l:50,m:0,t:7,mm:100,oi:"3000000000000"},
    {s:"APTUSDT",l:50,m:0,t:7,mm:100,oi:"3000000000000"},
    {s:"NEARUSDT",l:50,m:0,t:7,mm:100,oi:"3000000000000"},
    {s:"ATOMUSDT",l:50,m:0,t:7,mm:100,oi:"3000000000000"},
    {s:"INJUSDT",l:25,m:0,t:7,mm:150,oi:"2000000000000"},
    {s:"TIAUSDT",l:25,m:0,t:7,mm:150,oi:"2000000000000"},
    {s:"SEIUSDT",l:25,m:0,t:8,mm:200,oi:"1000000000000"},
    {s:"PEPEUSDT",l:20,m:0,t:8,mm:300,oi:"2000000000000"},
    {s:"WIFUSDT",l:20,m:0,t:8,mm:300,oi:"1000000000000"},
    {s:"BONKUSDT",l:20,m:0,t:8,mm:300,oi:"500000000000"},
    {s:"GMXUSDT",l:25,m:0,t:7,mm:200,oi:"2000000000000"},
    {s:"FETUSDT",l:25,m:0,t:8,mm:200,oi:"1000000000000"},
    {s:"WLDUSDT",l:25,m:0,t:8,mm:200,oi:"1000000000000"},
    {s:"AXSUSDT",l:25,m:0,t:8,mm:200,oi:"1000000000000"},
    // Forex majors
    {s:"EURUSD",l:500,m:0,t:1,mm:2,oi:"100000000000000",cat:"forex"},
    {s:"GBPUSD",l:500,m:0,t:1,mm:2,oi:"50000000000000",cat:"forex"},
    {s:"USDJPY",l:500,m:0,t:1,mm:2,oi:"100000000000000",cat:"forex"},
    {s:"USDCHF",l:500,m:0,t:1,mm:2,oi:"50000000000000",cat:"forex"},
    {s:"AUDUSD",l:500,m:0,t:1,mm:2,oi:"50000000000000",cat:"forex"},
    {s:"USDCAD",l:500,m:0,t:1,mm:2,oi:"50000000000000",cat:"forex"},
    {s:"NZDUSD",l:500,m:0,t:1,mm:2,oi:"30000000000000",cat:"forex"},
    {s:"EURGBP",l:500,m:0,t:1,mm:2,oi:"30000000000000",cat:"forex"},
    {s:"EURJPY",l:500,m:0,t:1,mm:2,oi:"30000000000000",cat:"forex"},
    {s:"GBPJPY",l:500,m:0,t:1,mm:2,oi:"30000000000000",cat:"forex"},
    // Metals
    {s:"XAUUSD",l:100,m:0,t:3,mm:10,oi:"50000000000000",cat:"metal"},
    {s:"XAGUSD",l:100,m:0,t:3,mm:10,oi:"20000000000000",cat:"metal"},
    // Commodities
    {s:"WTIUSD",l:100,m:0,t:3,mm:10,oi:"20000000000000",cat:"commodity"},
    {s:"BRENTUSD",l:100,m:0,t:3,mm:10,oi:"20000000000000",cat:"commodity"},
    // Indices
    {s:"SPX500",l:100,m:0,t:3,mm:10,oi:"50000000000000",cat:"index"},
    {s:"NAS100",l:100,m:0,t:3,mm:10,oi:"50000000000000",cat:"index"},
    {s:"DJI30",l:100,m:0,t:3,mm:10,oi:"30000000000000",cat:"index"},
    {s:"GER40",l:100,m:0,t:3,mm:10,oi:"20000000000000",cat:"index"},
  ];

  let marketCount = 0;
  for (const mkt of MARKETS) {
    const id = ethers.keccak256(ethers.toUtf8Bytes(mkt.s));
    await safe(`Market: ${mkt.s}`, () =>
      C.perp.createMarket(id, mkt.s, mkt.l, mkt.m, mkt.t, mkt.mm, mkt.oi, mkt.oi, ethers.parseUnits("1000000", 6))
    );
    marketCount++;
  }
  console.log(`   ✅ ${marketCount} markets registered`);

  // Lending pools
  const LENDING_MKTS = [
    {sym:"USDC",addr:EXT.USDC,  oId:"USDCUSD",cf:"850000000000000000",lt:"900000000000000000",rf:1000,sc:ethers.parseUnits("50000000",6),  bc:ethers.parseUnits("40000000",6)  },
    {sym:"WETH",addr:EXT.WETH,  oId:"ETHUSD", cf:"800000000000000000",lt:"850000000000000000",rf:1000,sc:ethers.parseUnits("10000",18),     bc:ethers.parseUnits("8000",18)     },
    {sym:"WBTC",addr:EXT.WBTC,  oId:"BTCUSD", cf:"750000000000000000",lt:"800000000000000000",rf:1000,sc:ethers.parseUnits("500",8),        bc:ethers.parseUnits("400",8)       },
    {sym:"ARB", addr:EXT.ARB,   oId:"ARBUSD", cf:"700000000000000000",lt:"750000000000000000",rf:1500,sc:ethers.parseUnits("50000000",18),  bc:ethers.parseUnits("40000000",18) },
  ];
  const IRM = {
    USDC: [0n, 40000000000000n, 1000000000000000n, 800000000000000000n],
    WETH: [0n, 30000000000000n,  800000000000000n, 800000000000000000n],
    WBTC: [0n, 30000000000000n,  800000000000000n, 800000000000000000n],
    ARB:  [0n, 60000000000000n, 1200000000000000n, 800000000000000000n],
  };
  for (const m of LENDING_MKTS) {
    const oid = ethers.keccak256(ethers.toUtf8Bytes(m.oId));
    await safe(`Lending pool: ${m.sym}`, () => C.lending.addMarket(m.addr, oid, m.sym, m.cf, m.lt, m.rf, m.sc, m.bc, IRM[m.sym]));
  }

  // MultiCollateral LTV ratios
  await safe("MultiColl: WBTC 80% LTV",  () => C.multiColl.addCollateral(EXT.WBTC, 8000, 8500));
  await safe("MultiColl: WETH 85% LTV",  () => C.multiColl.addCollateral(EXT.WETH, 8500, 9000));
  await safe("MultiColl: ARB  70% LTV",  () => C.multiColl.addCollateral(EXT.ARB,  7000, 7500));

  // TVL Guard — start at Stage 0 ($500K)
  await safe("TVLGuard: set stage 0", () => C.tvlGuard.setStage(0));

  // Season 1 start
  await safe("Season: start Season 1", () => C.season.startSeason(ethers.parseUnits("1000000", 18), 90 * 86400));

  // Revenue NFT
  await safe("RevenueNFT: open mint", () => C.revNFT.setMintOpen(true));

  // OrderBook pairs
  const tick = ethers.parseUnits("0.01", 6);
  await safe("OrderBook: ETH/USDC pair", () => C.orderBook.createPair(EXT.WETH, EXT.USDC, 5, 2, ethers.parseUnits("10", 6), tick));
  await safe("OrderBook: ARB/USDC pair",  () => C.orderBook.createPair(EXT.ARB,  EXT.USDC, 5, 2, ethers.parseUnits("1",  6), tick));

  // Options vaults
  await safe("OptionsVault: ETH covered call",     () => C.optVault.createVault("ETH Covered Call",     "wCC-ETH",  0, EXT.WETH, EXT.WETH, 200, 2000));
  await safe("OptionsVault: BTC cash-secured put", () => C.optVault.createVault("BTC Cash-Secured Put", "wCSP-BTC", 1, EXT.USDC, EXT.WBTC, 200, 2000));

  // Prediction markets
  await safe("PredMkt: BTC $100K", () => C.predMkt.createMarket("Will BTC exceed $100K?", "WikiOracle", 0, Math.floor(Date.now()/1000)+86400*180, Math.floor(Date.now()/1000)+86400*181, ethers.ZeroHash, ethers.parseUnits("100000",18), true, 150));

  // ═══════════════════════════════════════════════════════════════
  // TRANSFER OWNERSHIP → GENESIS SAFE
  // ═══════════════════════════════════════════════════════════════
  if (SAFE !== deployer.address) {
    console.log(`\n── Transferring ownership to Genesis Safe: ${SAFE} ──`);
    const allContracts = Object.values(C);
    let transferred = 0;
    for (const contract of allContracts) {
      try {
        await contract.transferOwnership(SAFE);
        transferred++;
      } catch(e) { /* skip if no ownership */ }
    }
    console.log(`   ✅ Transferred ${transferred}/${allContracts.length} contracts to Safe`);
  } else {
    console.log("\n⚠  GENESIS_SAFE_ADDRESS not set — ownership stays with deployer");
    console.log("   Run: scripts/transfer-ownership.js after setting GENESIS_SAFE_ADDRESS");
  }

  // ═══════════════════════════════════════════════════════════════
  // SAVE DEPLOYMENT ADDRESSES
  // ═══════════════════════════════════════════════════════════════
  const { chainId } = await ethers.provider.getNetwork();
  const outFile = `deployments.${networkName}.json`;
  const outPath = path.join(__dirname, `../${outFile}`);
  const deployment = {
    network: networkName,
    chainId: Number(chainId),
    deployer: deployer.address,
    safe: SAFE,
    timestamp: new Date().toISOString(),
    contracts: A,
    external: EXT,
  };
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));

  console.log("\n✅ DEPLOYMENT COMPLETE!");
  console.log(`📄 Saved: ${outFile}`);
  console.log(`   Contracts deployed: ${Object.keys(A).length}`);
  if (deployFailures.length > 0) {
    console.log(`\n⚠️  Contracts that failed to deploy (${deployFailures.length}):`);
    for (const f of deployFailures) {
      console.log(`   - ${f.name}: ${f.reason}`);
    }
  }
  console.log("\n📋 Next steps:");
  console.log(`   1. cp ${outFile} frontend/.env (update VITE_* vars)`);
  console.log(`   2. cp ${outFile} backend/.env (update CONTRACT_* vars)`);
  console.log("   3. cd backend && npm start");
  console.log("   4. pm2 start ecosystem.config.js");
  console.log(`   5. Verify contracts: npx hardhat run scripts/verify.js --network ${networkName}`);
  console.log("   6. Open admin panel → advance TVL Guard to Stage 1 after 7 days");
}

main().catch(e => { console.error(e); process.exit(1); });
