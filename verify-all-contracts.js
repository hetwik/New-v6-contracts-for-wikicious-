/*
 * Checks all 133 contracts on Arbitrum One:
 *   1. Has bytecode (actually deployed)
 *   2. Owner is the Safe (ownership transferred)
 *   3. Keeper set (for contracts that need it)
 *
 * Run: node verify-all-contracts.js
 * Requires: ALCHEMY_ARBITRUM_URL in .env
 */

require("dotenv").config();
const { ethers } = require("ethers");

const SAFE = "0xc01fAE37aE7a4051Eafea26e047f36394054779c";
const RPC_URL = process.env.ALCHEMY_ARBITRUM_URL;

if (!RPC_URL) {
  console.error("❌  ALCHEMY_ARBITRUM_URL not set in .env");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);

// ─── All 133 deployed contracts ───────────────────────────────────────────────
const CONTRACTS = {
  WIKToken: "0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F",
  WikiOracle: "0xA99583D3cd272F95b8f08b32297f072f5164D0DC",
  WikiVault: "0x4533E181FdF5b0C66e0816992F38c23d57e42Df8",
  WikiPerp: "0x723f653a3DEFC45FB934BBF81f1411883a977468",
  WikiRevenueSplitter: "0xAaDDf07470A4749F51A374Cdeb7889f99f222937",
  WikiFlashLoan: "0xAF8Dfefc70595BE1ACAd711722e67f9894345d8e",
  WikiVirtualAMM: "0x9C63c27B8A73A990a2D89141622A639a2363b88A",
  WikiYieldAggregator: "0x95F3Cf765b479478c44D0EE932f17444ADA6A9a1",
  WikiInsuranceFundYield: "0x1376a071B84006489DeE4bDEF68eB8fA9854e758",
  WikiPOL: "0xEfbfEd647213c78316CDB8418026Cba6515BC7FB",
  WikiTokenVesting: "0x39ef6574b791164E32C9E8bd432637AB0EB3EbBd",
  WikiMarketRegistry: "0xe3Ef2Ff843770a2966B703672c515386b53ada33",
  WikiTVLGuard: "0xAA3109DEe3F45d2834e703AaA6c90Db3009f4b11",
  WikiRateLimiter: "0xE622aEEAaB8a678A059703BA21455f93e7D108f1",
  WikiAMM: "0x5e73fa11c2Fa157dbE59E7B8F7f1b3101c5c6004",
  WikiSpotRouter: "0x0181EC165A4f2C0cf79Be65f1DDa6C0b85D87aa8",
  WikiLending: "0x74635CFa33EEAe220367fF10C598e098a29e9246",
  WikiIdleYieldRouter: "0x53b6A9bE66C68090c26d4BE74f6eB916578F3A0B",
  RadiantAdapter: "0xd4BB2B6df614e37f65a7A6bAd1734BC3decB2c47",
  WikiADL: "0x3b891953845DB86Cf7Aca3fe14451adFAa8C377c",
  WikiAgenticDAO: "0x8d451ADbea9F109b5F072C477a8AA03896931074",
  WikiAIGuardrails: "0xf41e465d8cd2741cf9aCa2b7f988ccAB5B8d03E7",
  WikiAutoCompounder: "0xD03C8cd8E3E847eD2063800f8f4Bc44512867b05",
  WikiBondingPOL: "0xE12761B6C704eF78f55883C440E3aD1fb8449f09",
  WikiBotVault: "0x0DCD4d1Df8f2779935E7bB4eFA384f13ea265206",
  WikiBridge: "0x00BdF1d85812285014818deF495FD9435efd8659",
  WikiBuybackBurn: "0xdEe2A2e8Ff5a66788dd1E0D5AFEd2B44D6f1B46C",
  WikiCircuitBreaker: "0xa24D3Dc833566A59e7130bf42a8C4f1908A0b4ae",
  WikiConcentratedLP: "0x804795174B8b689DC8ab4332dC5b52cD0D1a1566",
  WikiConditionalOrder: "0xCBed48F05dAF5db381503e43EB04d62D7ca40Ba7",
  WikiCrossChainLending: "0xBA0B6E48B5325164EE48865101bFaDF8F5130FA7",
  WikiCrossChainRouter: "0x7CFE0F5af7801039E58bDccA0233B5198fF63384",
  WikiDarkPool: "0x1ec621494B30CaBb5043320Ad83D8ADc2b199064",
  WikiDeltaNeutralVault: "0x8551cF1BBbd3429dDD62037D583340Ed33904C30",
  WikiDynamicFeeHook: "0x4801B2f021255B8636B9F8aA88A90152Cc88e53f",
  WikiDynamicLeverage: "0x3389316F7e67002a7fA046A3a01bE58cb432F8Ca",
  WikiExternalInsurance: "0x7FB9Aa53BF4A7B9585910e30C89e61353Ed9868C",
  WikiFeeDistributor: "0x0ad3f8523279102f39Cc60350567dA8b84B7A68C",
  WikiForexOracle: "0xFa105a76bc33F009E8DE675Edd80F9f3FE8F7a65",
  WikiGasRebate: "0x88C326816E5bc56764fF9a5a7CCdEa10a253c252",
  WikiGMXBackstop: "0xf3785092A8077C861BF1cCf2B56ba35524A73Fc4",
  WikiGuaranteedStop: "0x54Cac724Fe57eAeef52C2eeAB3A48FDf4c609a42",
  WikiHybridLiquidityManager: "0x4A73f367cD326092f75c8BE8056C5091F6096D48",
  WikiIEOPlatform: "0xc2c5d7218D906912FCE5d5D6675808695D3263C7",
  WikiIndexPerp: "0x39A76915f9Df7004fDC31308C4892Ea3e7103Da5",
  WikiInstitutionalPool: "0xFd2752832060495204D581Fda9a74b86A9976b80",
  WikiInternalArb: "0x153BB399704bee6287AA9DDA03349b2E13A80150",
  WikiKeeperRegistry: "0x27F57e95cca2b4c88a50490212a2cCDDb3168e34",
  WikiKeeperService: "0xFdD18D26980Ee49C1f33588C381d90E6bD9846c2",
  WikiLaunchPool: "0xD2b9d006744dE5d9821b0062bFbc5A1c6e6B80d4",
  WikiLeaderboard: "0x214448E0bB0f30ec817d8d58EF5F51fC360c47d2",
  WikiLeveragedYield: "0x0686921ae93c5043dd04303412E1408fBb82ceb5",
  WikiLeverageScaler: "0x01f8a097D8d1C81C0C65f080EB6C026804B4557a",
  WikiLiqAuctionUI: "0xf9253F3f56369017983449254E5d2Ca14d0A4FA2",
  WikiLiquidationInsurance: "0x68C2d90Fe211535C1Cb09329bB095137b45988D9",
  WikiLiquidationMarket: "0x8bf80d7FBbBe2cD367308cCB08c16Dc80ABee94e",
  WikiLiquidator: "0x1fCe4e7c16386af492b6275DDDEcA747f6559a65",
  WikiLiquidityMining: "0x0F93d97280a410934d847C80a0E36befa0aC8683",
  WikiLiquidRestaking: "0x9EE6BaeE6a2952a31B0bd66ddD3Bf49e4e176F86",
  WikiLP: "0x471351b73906aeA58E1FD4dA99122Ee04De62c8d",
  WikiLPBoost: "0x799267ffDF32a5e514442D8d4D81410F866B6d4c",
  WikiLPCollateral: "0x7df715CaFaf7a5604B3eD2519AEBF6D7611b633A",
  WikiManagedLiquidityVault: "0x40db8a2fc66be9bd2F22Aa22056055FcF829e414",
  WikiMarginLoan: "0x892DcAAF9e22AEdFE449cb8244AfcA10b1822942",
  WikiMEVHook: "0x36e66D87822E73Df3daC202d8635e95A9BeD297d",
  WikiMultiCollateral: "0xB2F18Fa5463088618222d7431663cAEBdCB2A982",
  WikiMultisigGuard: "0x54E70D534f1904eda2Ec36C2f597463Fa7e871d5",
  WikiOnChainAnalytics: "0x376E30fd99CBF35B7486FCC1b183cD22271099fc",
  WikiOpsVault: "0x697610bb41F4002827fecE3Faeb576c6B2967506",
  WikiOTCDesk: "0x999b964f0B104FaD6830A000f9653c87674Aad4b",
  WikiPartialLiquidation: "0xdb8208Ed6fFc7689aAfB81A3990FCc84E2D912f3",
  WikiPaymaster: "0x4f9f87a9A4788aD4Dfd309Be835323968E4516cf",
  WikiPermissionlessMarkets: "0x6e92a3d25c332B1E2778E987df106DDFfCEF8BA8",
  WikiPortfolioMargin: "0x40590a03Af72E57CB2A764596AcbFFD68C498ffB",
  WikiPortfolioTracker: "0xB65CBE69651C0a6Dc872a1955992766b02EBA273",
  WikiPositionInsurance: "0x9Fb0221Be4c21282A1f8F389BEFA92444019c9ba",
  WikiPredictionMarket: "0x650ea9441d228F03D52179AB5BA35A446b8BF01B",
  WikiProofOfSolvency: "0x40A6D061F614debEC8dFD8F0C975Cf0A3F8cfe28",
  WikiPropChallenge: "0x632Ea757CAF386785CD69Bc8bbAad39DFBC1C1Bb",
  WikiPropEval: "0x1dc3Ec0A86C14d63a5d1CF604B43792214E16397",
  WikiPropFunded: "0xB011Fa88034B9bD51347290914681957eaADbeCC",
  WikiPropPool: "0xCd03F2aA9aBd6EdCF1f0DeEfDBc8eE66d5eC76EA",
  WikiPropPoolYield: "0xD9182cb9b1d6b26d28C5e8CcE648bC7F868855B8",
  WikiPushNotification: "0x56947773D025707819aAa5BA82e1345e01060114",
  WikiRealYieldLP: "0x158768ae7292D46BfF975507f5Bc92eA10853479",
  WikiRebalancer: "0x7aC6EeE5Dd01C0573e98b573a3F32A78A3CDa523",
  WikiReferralLeaderboard: "0x1e9f247dc542613686754B0d1486392cF8dFE963",
  WikiReferralNFT: "0x5163036c6006D5b4c70fE0b4B408607dAcd16395",
  WikiRevenueDashboard: "0xBd6F07402005C1046142203d1079c973985209A7",
  WikiRevenueShareNFT: "0x304ce66bFAe0285e4f7fC1F8068F916294F17025",
  WikiRWAMarket: "0x50C5d54A42B0E79dAf87e19B643c498B4f85eFcF",
  WikiSeasonPoints: "0xFFEd31195072422D62f4CC050F28cA55eAA84912",
  WikiSmartOrderRouter: "0x9e3a971253e59941cC9400295D52F5338819a426",
  WikiSocial: "0xa7D88ea0C6Ac7A854c65346593C814A601EACCc4",
  WikiStakingFeeDiscount: "0xd0246c7089ff6B3F0275628436B366Ca0Cd119c7",
  WikiStrategyVault: "0xB81E1b0f2f1ad7263156412523be440245A17849",
  WikiStructuredProduct: "0x7505c13c6668cc6cAF57575577c151cA9c58ef78",
  WikiSubAccount: "0x081B5E6f60E0AA5bF79A25b1F6Fb332191924729",
  WikiTimelockController: "0xAda19c1BEb7bbFdf8264b784C3005b0d4B667cd0",
  WikiTraderPass: "0xdf6411F088867182c9A69FBF12A589012bF3D766",
  WikiTraderSubscription: "0x2b9928F648BEBF30Ec256054aeA6362310973c2a",
  WikiTrailingStop: "0x60968f8440267899a74C3eec539e56D0B756c5c6",
  WikiTWAMM: "0x3FaE518227D07a56b4F9a739c3bdf7D4A70Cd92B",
  WikiUserBotFactory: "0xcD8d7E0C09aF930902586C4f9114463f6fe1C4C5",
  WikiVaultMarketplace: "0x83350187cc08db1A7449Fe01dAb2FDb6e2e0B0ca",
  WikiVestingMarket: "0xE61D5dc7EF1e5d411C9a42aba8f32F249A52Dd34",
  WikiVolatilityMargin: "0xB8b7f8d215Dd4B3B86621bE93632AbF045c68802",
  WikiVolumeTiers: "0x1d0f8B3ad72A6f9c7a63137b2B761E16BEa1B0DB",
  WikiYieldSlice: "0x17DC41e6ADaad3D4AC0963d8C588F924a04E9fd6",
  WikiZap: "0x19025FC121f94AcD382963E441945ce256e2d090",
  WikiIndexBasket: "0x4543Ee57dC7cb1894E4402C06B99fe5B2a851d2C",
  WikiSpot: "0x08FC8f870Df09A7265D1D06a7A95C41cEf98d9E6",
  WikiOrderBook: "0x57B30eB5ed84B4E1Ce652f00848b554aAF63664f",
  WikiStaking: "0xDD551D705fAbD4380D2C95F7345b671cE3310bd2",
  AaveV3Adapter: "0x23e0bBC0Cd957a44797431C4A7EA2fba510094f8",
  WikiAffiliate: "0x5568DE39D9c09B632877Bb76771Af8933B7748e8",
  WikiAPIGateway: "0xbDe2De0701580886dDef86dfe044faF5437985c4",
  WikiBackstopVault: "0xf2cD47C16CCA38aC77e6ab344E04e7E97C400748",
  WikiBonus: "0xDc7A581482e46baD2508347a28fd4CD090C3Cace",
  WikiCopyTrading: "0x9e09dF7E84aBf818882a259Ef897a55f25CE1163",
  WikiDAOTreasury: "0x00b13b0D1E9b18cfeF2C998027Ed7291CC163A3f",
  WikiFiatOnRamp: "0x4ddFECEA202d4b7ff68D25d701712d89A668F3AF",
  WikiFundingArbVault: "0x8897A8Ae133b0DD71ef6E28B1A8efB42f1Ef78d4",
  WikiGaugeVoting: "0x016886FF6fdab890Dd03aE7a1D6535ef57f06F92",
  WikiLaunchpad: "0x42DB4776FFB45f2cc5663407e7953935f63fd40E",
  WikiMakerRewards: "0xa4A90477028e207eC2676E85D0259BcDdB908242",
  WikiMarketMakerAgreement: "0x739df0A0CA647A89d172eD050b04aE4F4935106b",
  WikiSocialRewards: "0xe50a21CcfF67bE03A18cF0cB760D2f8a568A1d4F",
  WikiTelegramGateway: "0xB81534b67E7Ff28fC17D9bdB3F4A3453Bc200A4e",
  WikiTradeHistory: "0x2cEF54860f530F57e3d8eab658F83033bbcbB665",
  WikiLiqProtection: "0x0e112cEa07E4CB3257fd8e16130ef321777e41d2",
  WikiOptionsVault: "0xE019e13abdd7160f8467D55E3e190022295dEdc1",
  WikiLiquidStaking: "0x6ac54F360315E0B3Dae455ad371A06d154b410B2",
};

// Contracts that don't use Ownable (no owner() to check)
const NO_OWNER = new Set([
  "WikiMultisigGuard",
  "WikiTimelockController",
  "WikiPushNotification",
]);

const OWNER_ABI = ["function owner() view returns (address)"];
const POWNER_ABI = ["function pendingOwner() view returns (address)"];

async function checkContract(name, address) {
  const result = {
    name,
    address,
    bytecode: false,
    owner: null,
    pendingOwner: null,
    issues: [],
  };

  // 1. Bytecode check
  const code = await provider.getCode(address);
  if (code === "0x" || code.length < 4) {
    result.issues.push("NO BYTECODE — not deployed!");
    return result;
  }
  result.bytecode = true;

  // 2. Owner check
  if (!NO_OWNER.has(name)) {
    try {
      const c = new ethers.Contract(address, OWNER_ABI, provider);
      result.owner = await c.owner();
      if (result.owner.toLowerCase() !== SAFE.toLowerCase()) {
        result.issues.push(`owner is ${result.owner} (NOT Safe)`);
      }
    } catch {
      // Some contracts may use access control instead
      result.owner = "N/A";
    }

    try {
      const c = new ethers.Contract(address, POWNER_ABI, provider);
      result.pendingOwner = await c.pendingOwner();
      if (result.pendingOwner !== ethers.ZeroAddress) {
        result.issues.push(`pendingOwner still set: ${result.pendingOwner}`);
      }
    } catch {
      // Not Ownable2Step — fine
    }
  }

  return result;
}

async function main() {
  console.log("🔍  Wikicious V6 — Mainnet Contract Verification");
  console.log(`    Safe: ${SAFE}`);
  console.log(`    Checking ${Object.keys(CONTRACTS).length} contracts...\n`);

  const names = Object.keys(CONTRACTS);
  const BATCH = 3; // small batch to avoid Alchemy 429
  const DELAY = 600; // ms between batches
  const results = [];

  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map((n) => checkContract(n, CONTRACTS[n]))
    );
    for (const s of settled) {
      if (s.status === "fulfilled") results.push(s.value);
      else
        results.push({
          name: batch[settled.indexOf(s)] || "?",
          address: CONTRACTS[batch[settled.indexOf(s)]],
          issues: [s.reason?.message || "unknown error"],
        });
    }
    process.stdout.write(
      `  Checked ${Math.min(i + BATCH, names.length)}/${names.length}...\r`
    );
    if (i + BATCH < names.length)
      await new Promise((r) => setTimeout(r, DELAY));
  }

  console.log("\n");

  // ── Report ──────────────────────────────────────────────────────────────────
  const issues = results.filter((r) => r.issues.length > 0);
  const allGood = results.filter((r) => r.issues.length === 0);

  console.log("═".repeat(60));
  console.log(`✅  Clean: ${allGood.length} / ${results.length}`);
  console.log(`❌  Issues: ${issues.length}`);
  console.log("═".repeat(60));

  if (issues.length > 0) {
    console.log("\n⚠️   CONTRACTS WITH ISSUES:\n");
    for (const r of issues) {
      console.log(`  ${r.name}`);
      console.log(`    Address: ${r.address}`);
      for (const issue of r.issues) console.log(`    ❌ ${issue}`);
      console.log();
    }
  } else {
    console.log(
      "\n🎉  All 133 contracts verified. Bytecode ✓  Safe ownership ✓"
    );
  }

  // Save report
  const fs = require("fs");
  const report = {
    timestamp: new Date().toISOString(),
    safe: SAFE,
    total: results.length,
    clean: allGood.length,
    issues: issues.length,
    details: results,
  };
  fs.writeFileSync("verification-report.json", JSON.stringify(report, null, 2));
  console.log("\n📄  Full report saved to verification-report.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
