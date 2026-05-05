// Constructor args for WikiMultisigGuard
// From deploy-multisigguard-fix.js:
//   signers = [deployer, Safe, third wallet]
//   threshold = 2
module.exports = [
  [
    "0x79698a8D914016b770AF796D8F08D660d64C0997", // deployer
    "0xc01fAE37aE7a4051Eafea26e047f36394054779c", // Safe
    "0x34f192e2338cdbbccd9afbb06a3f7ac0bd18c128"  // third signer
  ],
  2
];
