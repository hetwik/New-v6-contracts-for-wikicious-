/**
 * Wikicious V6 — Arbiscan Source Code Verification
 *
 * Verifies all 133 contracts on Arbiscan using hardhat verify.
 * Reads constructor args from deployment JSON automatically.
 *
 * Run: node verify-arbiscan.js
 * Requires: ALCHEMY_ARBITRUM_URL + ARBISCAN_API_KEY in .env
 */

require("dotenv").config();
const { execSync } = require("child_process");
const fs = require("fs");

if (!process.env.ARBISCAN_API_KEY) {
  console.error("❌  ARBISCAN_API_KEY not set in .env");
  console.error("    Get one free at: https://arbiscan.io/myapikey");
  process.exit(1);
}

// ─── Contract addresses + constructor args ─────────────────────────────────
// Source: deployments_arbitrum_one_auto__1_.json (details field)
// Note: WikiCopyTrading, WikiDAOTreasury, WikiLiquidStaking use OLD addresses
//       (the ones actually owned by Safe, confirmed on-chain)

const CONTRACTS = [
  { name: "WIKToken",                   address: "0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997","0x79698a8D914016b770AF796D8F08D660d64C0997","0x79698a8D914016b770AF796D8F08D660d64C0997","0x79698a8D914016b770AF796D8F08D660d64C0997","0x79698a8D914016b770AF796D8F08D660d64C0997","0x79698a8D914016b770AF796D8F08D660d64C0997","0x79698a8D914016b770AF796D8F08D660d64C0997","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiOracle",                 address: "0xA99583D3cd272F95b8f08b32297f072f5164D0DC", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997","0xFdB631F5EE196F0ed6FAa767959853A9F217697D","0xff1a0f4744e8582DF1aE09D5611b887B6a12925C"] },
  { name: "WikiVault",                  address: "0x4533E181FdF5b0C66e0816992F38c23d57e42Df8", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiPerp",                   address: "0x723f653a3DEFC45FB934BBF81f1411883a977468", args: ["0x4533E181FdF5b0C66e0816992F38c23d57e42Df8","0xA99583D3cd272F95b8f08b32297f072f5164D0DC","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiRevenueSplitter",        address: "0xAaDDf07470A4749F51A374Cdeb7889f99f222937", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiFlashLoan",              address: "0xAF8Dfefc70595BE1ACAd711722e67f9894345d8e", args: ["0x4533E181FdF5b0C66e0816992F38c23d57e42Df8","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiVirtualAMM",             address: "0x9C63c27B8A73A990a2D89141622A639a2363b88A", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiYieldAggregator",        address: "0x95F3Cf765b479478c44D0EE932f17444ADA6A9a1", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiInsuranceFundYield",     address: "0x1376a071B84006489DeE4bDEF68eB8fA9854e758", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiPOL",                    address: "0xEfbfEd647213c78316CDB8418026Cba6515BC7FB", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x5e73fa11c2Fa157dbE59E7B8F7f1b3101c5c6004","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiTokenVesting",           address: "0x39ef6574b791164E32C9E8bd432637AB0EB3EbBd", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiMarketRegistry",         address: "0xe3Ef2Ff843770a2966B703672c515386b53ada33", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiTVLGuard",               address: "0xAA3109DEe3F45d2834e703AaA6c90Db3009f4b11", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiRateLimiter",            address: "0xE622aEEAaB8a678A059703BA21455f93e7D108f1", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiAMM",                    address: "0x5e73fa11c2Fa157dbE59E7B8F7f1b3101c5c6004", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiSpotRouter",             address: "0x0181EC165A4f2C0cf79Be65f1DDa6C0b85D87aa8", args: ["0x08FC8f870Df09A7265D1D06a7A95C41cEf98d9E6","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiLending",                address: "0x74635CFa33EEAe220367fF10C598e098a29e9246", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiIdleYieldRouter",        address: "0x53b6A9bE66C68090c26d4BE74f6eB916578F3A0B", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "RadiantAdapter",             address: "0xd4BB2B6df614e37f65a7A6bAd1734BC3decB2c47", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiADL",                    address: "0x3b891953845DB86Cf7Aca3fe14451adFAa8C377c", args: ["0x723f653a3DEFC45FB934BBF81f1411883a977468","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiAgenticDAO",             address: "0x8d451ADbea9F109b5F072C477a8AA03896931074", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiAIGuardrails",           address: "0xf41e465d8cd2741cf9aCa2b7f988ccAB5B8d03E7", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiAutoCompounder",         address: "0xD03C8cd8E3E847eD2063800f8f4Bc44512867b05", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiBondingPOL",             address: "0xE12761B6C704eF78f55883C440E3aD1fb8449f09", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiBotVault",               address: "0x0DCD4d1Df8f2779935E7bB4eFA384f13ea265206", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiBridge",                 address: "0x00BdF1d85812285014818deF495FD9435efd8659", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiBuybackBurn",            address: "0xdEe2A2e8Ff5a66788dd1E0D5AFEd2B44D6f1B46C", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiCircuitBreaker",         address: "0xa24D3Dc833566A59e7130bf42a8C4f1908A0b4ae", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiConcentratedLP",         address: "0x804795174B8b689DC8ab4332dC5b52cD0D1a1566", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiConditionalOrder",       address: "0xCBed48F05dAF5db381503e43EB04d62D7ca40Ba7", args: ["0x723f653a3DEFC45FB934BBF81f1411883a977468","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiCrossChainLending",      address: "0xBA0B6E48B5325164EE48865101bFaDF8F5130FA7", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiCrossChainRouter",       address: "0x7CFE0F5af7801039E58bDccA0233B5198fF63384", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiDarkPool",               address: "0x1ec621494B30CaBb5043320Ad83D8ADc2b199064", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiDeltaNeutralVault",      address: "0x8551cF1BBbd3429dDD62037D583340Ed33904C30", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiDynamicFeeHook",         address: "0x4801B2f021255B8636B9F8aA88A90152Cc88e53f", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiDynamicLeverage",        address: "0x3389316F7e67002a7fA046A3a01bE58cb432F8Ca", args: ["0x723f653a3DEFC45FB934BBF81f1411883a977468","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiExternalInsurance",      address: "0x7FB9Aa53BF4A7B9585910e30C89e61353Ed9868C", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiFeeDistributor",         address: "0x0ad3f8523279102f39Cc60350567dA8b84B7A68C", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiForexOracle",            address: "0xFa105a76bc33F009E8DE675Edd80F9f3FE8F7a65", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiGasRebate",              address: "0x88C326816E5bc56764fF9a5a7CCdEa10a253c252", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiGMXBackstop",            address: "0xf3785092A8077C861BF1cCf2B56ba35524A73Fc4", args: ["0x4533E181FdF5b0C66e0816992F38c23d57e42Df8","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiGuaranteedStop",         address: "0x54Cac724Fe57eAeef52C2eeAB3A48FDf4c609a42", args: ["0x723f653a3DEFC45FB934BBF81f1411883a977468","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiHybridLiquidityManager", address: "0x4A73f367cD326092f75c8BE8056C5091F6096D48", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiIEOPlatform",            address: "0xc2c5d7218D906912FCE5d5D6675808695D3263C7", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiIndexPerp",              address: "0x39A76915f9Df7004fDC31308C4892Ea3e7103Da5", args: ["0x723f653a3DEFC45FB934BBF81f1411883a977468","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiInstitutionalPool",      address: "0xFd2752832060495204D581Fda9a74b86A9976b80", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiInternalArb",            address: "0x153BB399704bee6287AA9DDA03349b2E13A80150", args: ["0x723f653a3DEFC45FB934BBF81f1411883a977468","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiKeeperRegistry",         address: "0x27F57e95cca2b4c88a50490212a2cCDDb3168e34", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiKeeperService",          address: "0xFdD18D26980Ee49C1f33588C381d90E6bD9846c2", args: ["0x27F57e95cca2b4c88a50490212a2cCDDb3168e34","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiLaunchPool",             address: "0xD2b9d006744dE5d9821b0062bFbc5A1c6e6B80d4", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiLeaderboard",            address: "0x214448E0bB0f30ec817d8d58EF5F51fC360c47d2", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiLeveragedYield",         address: "0x0686921ae93c5043dd04303412E1408fBb82ceb5", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiLeverageScaler",         address: "0x01f8a097D8d1C81C0C65f080EB6C026804B4557a", args: ["0x723f653a3DEFC45FB934BBF81f1411883a977468","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiLiqAuctionUI",           address: "0xf9253F3f56369017983449254E5d2Ca14d0A4FA2", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiLiquidationInsurance",   address: "0x68C2d90Fe211535C1Cb09329bB095137b45988D9", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiLiquidationMarket",      address: "0x8bf80d7FBbBe2cD367308cCB08c16Dc80ABee94e", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiLiquidator",             address: "0x1fCe4e7c16386af492b6275DDDEcA747f6559a65", args: ["0x723f653a3DEFC45FB934BBF81f1411883a977468","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiLiquidityMining",        address: "0x0F93d97280a410934d847C80a0E36befa0aC8683", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiLiquidRestaking",        address: "0x9EE6BaeE6a2952a31B0bd66ddD3Bf49e4e176F86", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiLP",                     address: "0x471351b73906aeA58E1FD4dA99122Ee04De62c8d", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiLPBoost",                address: "0x799267ffDF32a5e514442D8d4D81410F866B6d4c", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiLPCollateral",           address: "0x7df715CaFaf7a5604B3eD2519AEBF6D7611b633A", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiManagedLiquidityVault",  address: "0x40db8a2fc66be9bd2F22Aa22056055FcF829e414", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiMarginLoan",             address: "0x892DcAAF9e22AEdFE449cb8244AfcA10b1822942", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiMEVHook",                address: "0x36e66D87822E73Df3daC202d8635e95A9BeD297d", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiMultiCollateral",        address: "0xB2F18Fa5463088618222d7431663cAEBdCB2A982", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiMultisigGuard",          address: "0x54E70D534f1904eda2Ec36C2f597463Fa7e871d5", args: ["0xc01fAE37aE7a4051Eafea26e047f36394054779c"] },
  { name: "WikiOnChainAnalytics",       address: "0x376E30fd99CBF35B7486FCC1b183cD22271099fc", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiOpsVault",               address: "0x697610bb41F4002827fecE3Faeb576c6B2967506", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiOTCDesk",                address: "0x999b964f0B104FaD6830A000f9653c87674Aad4b", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiPartialLiquidation",     address: "0xdb8208Ed6fFc7689aAfB81A3990FCc84E2D912f3", args: ["0x723f653a3DEFC45FB934BBF81f1411883a977468","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiPaymaster",              address: "0x4f9f87a9A4788aD4Dfd309Be835323968E4516cf", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiPermissionlessMarkets",  address: "0x6e92a3d25c332B1E2778E987df106DDFfCEF8BA8", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiPortfolioMargin",        address: "0x40590a03Af72E57CB2A764596AcbFFD68C498ffB", args: ["0x723f653a3DEFC45FB934BBF81f1411883a977468","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiPortfolioTracker",       address: "0xB65CBE69651C0a6Dc872a1955992766b02EBA273", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiPositionInsurance",      address: "0x9Fb0221Be4c21282A1f8F389BEFA92444019c9ba", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiPredictionMarket",       address: "0x650ea9441d228F03D52179AB5BA35A446b8BF01B", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiProofOfSolvency",        address: "0x40A6D061F614debEC8dFD8F0C975Cf0A3F8cfe28", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiPropChallenge",          address: "0x632Ea757CAF386785CD69Bc8bbAad39DFBC1C1Bb", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiPropEval",               address: "0x1dc3Ec0A86C14d63a5d1CF604B43792214E16397", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiPropFunded",             address: "0xB011Fa88034B9bD51347290914681957eaADbeCC", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiPropPool",               address: "0xCd03F2aA9aBd6EdCF1f0DeEfDBc8eE66d5eC76EA", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiPropPoolYield",          address: "0xD9182cb9b1d6b26d28C5e8CcE648bC7F868855B8", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiPushNotification",       address: "0x56947773D025707819aAa5BA82e1345e01060114", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiRealYieldLP",            address: "0x158768ae7292D46BfF975507f5Bc92eA10853479", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiRebalancer",             address: "0x7aC6EeE5Dd01C0573e98b573a3F32A78A3CDa523", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiReferralLeaderboard",    address: "0x1e9f247dc542613686754B0d1486392cF8dFE963", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiReferralNFT",            address: "0x5163036c6006D5b4c70fE0b4B408607dAcd16395", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiRevenueDashboard",       address: "0xBd6F07402005C1046142203d1079c973985209A7", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiRevenueShareNFT",        address: "0x304ce66bFAe0285e4f7fC1F8068F916294F17025", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiRWAMarket",              address: "0x50C5d54A42B0E79dAf87e19B643c498B4f85eFcF", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiSeasonPoints",           address: "0xFFEd31195072422D62f4CC050F28cA55eAA84912", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiSmartOrderRouter",       address: "0x9e3a971253e59941cC9400295D52F5338819a426", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiSocial",                 address: "0xa7D88ea0C6Ac7A854c65346593C814A601EACCc4", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiStakingFeeDiscount",     address: "0xd0246c7089ff6B3F0275628436B366Ca0Cd119c7", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0xDD551D705fAbD4380D2C95F7345b671cE3310bd2","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiStrategyVault",          address: "0xB81E1b0f2f1ad7263156412523be440245A17849", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiStructuredProduct",      address: "0x7505c13c6668cc6cAF57575577c151cA9c58ef78", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiSubAccount",             address: "0x081B5E6f60E0AA5bF79A25b1F6Fb332191924729", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiTimelockController",     address: "0xAda19c1BEb7bbFdf8264b784C3005b0d4B667cd0", args: ["86400","[]","[]","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiTraderPass",             address: "0xdf6411F088867182c9A69FBF12A589012bF3D766", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiTraderSubscription",     address: "0x2b9928F648BEBF30Ec256054aeA6362310973c2a", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiTrailingStop",           address: "0x60968f8440267899a74C3eec539e56D0B756c5c6", args: ["0x723f653a3DEFC45FB934BBF81f1411883a977468","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiTWAMM",                  address: "0x3FaE518227D07a56b4F9a739c3bdf7D4A70Cd92B", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiUserBotFactory",         address: "0xcD8d7E0C09aF930902586C4f9114463f6fe1C4C5", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiVaultMarketplace",       address: "0x83350187cc08db1A7449Fe01dAb2FDb6e2e0B0ca", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiVestingMarket",          address: "0xE61D5dc7EF1e5d411C9a42aba8f32F249A52Dd34", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiVolatilityMargin",       address: "0xB8b7f8d215Dd4B3B86621bE93632AbF045c68802", args: ["0x723f653a3DEFC45FB934BBF81f1411883a977468","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiVolumeTiers",            address: "0x1d0f8B3ad72A6f9c7a63137b2B761E16BEa1B0DB", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiYieldSlice",             address: "0x17DC41e6ADaad3D4AC0963d8C588F924a04E9fd6", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiZap",                    address: "0x19025FC121f94AcD382963E441945ce256e2d090", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiIndexBasket",            address: "0x4543Ee57dC7cb1894E4402C06B99fe5B2a851d2C", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiSpot",                   address: "0x08FC8f870Df09A7265D1D06a7A95C41cEf98d9E6", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiOrderBook",              address: "0x57B30eB5ed84B4E1Ce652f00848b554aAF63664f", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiStaking",                address: "0xDD551D705fAbD4380D2C95F7345b671cE3310bd2", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "AaveV3Adapter",              address: "0x23e0bBC0Cd957a44797431C4A7EA2fba510094f8", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiAffiliate",              address: "0x5568DE39D9c09B632877Bb76771Af8933B7748e8", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiAPIGateway",             address: "0xbDe2De0701580886dDef86dfe044faF5437985c4", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiBackstopVault",          address: "0xf2cD47C16CCA38aC77e6ab344E04e7E97C400748", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiBonus",                  address: "0xDc7A581482e46baD2508347a28fd4CD090C3Cace", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  // ⚠️  These 3 use OLD addresses (Safe-owned, confirmed on-chain)
  { name: "WikiCopyTrading",            address: "0x9e09dF7E84aBf818882a259Ef897a55f25CE1163", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x723f653a3DEFC45FB934BBF81f1411883a977468","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiDAOTreasury",            address: "0x00b13b0D1E9b18cfeF2C998027Ed7291CC163A3f", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiLiquidStaking",          address: "0x6ac54F360315E0B3Dae455ad371A06d154b410B2", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0x79698a8D914016b770AF796D8F08D660d64C0997",100] },
  { name: "WikiFiatOnRamp",             address: "0x4ddFECEA202d4b7ff68D25d701712d89A668F3AF", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiFundingArbVault",        address: "0x8897A8Ae133b0DD71ef6E28B1A8efB42f1Ef78d4", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiGaugeVoting",            address: "0x016886FF6fdab890Dd03aE7a1D6535ef57f06F92", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiLaunchpad",              address: "0x42DB4776FFB45f2cc5663407e7953935f63fd40E", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiMakerRewards",           address: "0xa4A90477028e207eC2676E85D0259BcDdB908242", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiMarketMakerAgreement",   address: "0x739df0A0CA647A89d172eD050b04aE4F4935106b", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiSocialRewards",          address: "0xe50a21CcfF67bE03A18cF0cB760D2f8a568A1d4F", args: ["0xa681Bf6f0449ABc4E98DCa3468488Fe1b24FdD0F","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiTelegramGateway",        address: "0xB81534b67E7Ff28fC17D9bdB3F4A3453Bc200A4e", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiTradeHistory",           address: "0x2cEF54860f530F57e3d8eab658F83033bbcbB665", args: ["0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiLiqProtection",          address: "0x0e112cEa07E4CB3257fd8e16130ef321777e41d2", args: ["0x723f653a3DEFC45FB934BBF81f1411883a977468","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
  { name: "WikiOptionsVault",           address: "0xE019e13abdd7160f8467D55E3e190022295dEdc1", args: ["0xaf88d065e77c8cC2239327C5EDb3A432268e5831","0x79698a8D914016b770AF796D8F08D660d64C0997"] },
];

// ─── Verify one contract ───────────────────────────────────────────────────
function verify(contract) {
  const argsStr = contract.args.map(a => JSON.stringify(a)).join(" ");
  const cmd = `npx hardhat verify --network arbitrum_one ${contract.address} ${argsStr}`;
  try {
    const out = execSync(cmd, { stdio: "pipe", timeout: 60000 }).toString();
    if (out.includes("Already Verified") || out.includes("Successfully verified")) {
      return { status: "verified", output: out.trim() };
    }
    return { status: "verified", output: out.trim() };
  } catch (e) {
    const msg = (e.stdout?.toString() || "") + (e.stderr?.toString() || "");
    if (msg.includes("Already Verified") || msg.includes("already verified")) {
      return { status: "already_verified", output: msg.trim() };
    }
    return { status: "failed", output: msg.trim() };
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("🔍  Wikicious V6 — Arbiscan Source Verification");
  console.log(`    Verifying ${CONTRACTS.length} contracts on Arbitrum One...\n`);

  const results = { verified: [], already_verified: [], failed: [] };
  const DELAY = 1500; // ms between contracts — Arbiscan free tier: 5 req/sec

  for (let i = 0; i < CONTRACTS.length; i++) {
    const c = CONTRACTS[i];
    process.stdout.write(`  [${i + 1}/${CONTRACTS.length}] ${c.name}...`);
    const result = verify(c);
    results[result.status].push({ name: c.name, address: c.address, output: result.output });

    const icon = result.status === "failed" ? "❌" : "✅";
    console.log(` ${icon} ${result.status}`);

    if (i < CONTRACTS.length - 1) await new Promise(r => setTimeout(r, DELAY));
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log(`✅  Verified:          ${results.verified.length}`);
  console.log(`⚡  Already verified:  ${results.already_verified.length}`);
  console.log(`❌  Failed:            ${results.failed.length}`);
  console.log("═".repeat(60));

  if (results.failed.length > 0) {
    console.log("\n⚠️   FAILED CONTRACTS:\n");
    for (const r of results.failed) {
      console.log(`  ${r.name} (${r.address})`);
      // Show last 3 lines of output — usually the actual error
      const lines = r.output.split("\n").filter(Boolean);
      lines.slice(-3).forEach(l => console.log(`    ${l}`));
      console.log();
    }
    console.log("💡  Tips for failures:");
    console.log("    - 'No contract at address' → wrong address or not deployed");
    console.log("    - 'Constructor args mismatch' → check args in deployment JSON");
    console.log("    - 'Bytecode mismatch' → source was changed after deploy");
    console.log("    - Rate limited → re-run, only failed ones will retry\n");
  } else {
    console.log("\n🎉  All contracts verified on Arbiscan!");
  }

  // Save full report
  fs.writeFileSync(
    "arbiscan-verification-report.json",
    JSON.stringify({ timestamp: new Date().toISOString(), ...results }, null, 2)
  );
  console.log("📄  Full report saved to arbiscan-verification-report.json");
}

main().catch(e => { console.error(e); process.exit(1); });
