const { ethers } = require("hardhat");

async function main() {
  // 1. Target Safe Address
    const SAFE_ADDRESS = "0xC01F099905F216e512411516eB414E539494779C";
      
        // 2. Your Contracts (Correctly Checksummed)
          const CONTRACTS = {
              WikiCopyTrading: "0x63b384666f8E622141528652D02A24F3A531D4Fd",
                  WikiDAOTreasury: "0x81c220DbaC0567f78D0A82199F9203387796fb08",
                      WikiLiquidStaking: "0x46c4f03F647e30d1d60C9263914aA741E00299A9"
                        };

                          const [deployer] = await ethers.getSigners();
                            console.log(`Using wallet: ${deployer.address}`);

                              const ABI = [
                                  "function owner() view returns (address)",
                                      "function pendingOwner() view returns (address)",
                                          "function transferOwnership(address newOwner) public"
                                            ];

                                              for (const [name, address] of Object.entries(CONTRACTS)) {
                                                  console.log(`\n--- Processing ${name} ---`);
                                                      
                                                          try {
                                                                const contract = new ethers.Contract(address, ABI, deployer);

                                                                      // Check current owner
                                                                            const currentOwner = await contract.owner();
                                                                                  console.log(`Current Owner: ${currentOwner}`);

                                                                                        if (currentOwner.toLowerCase() === SAFE_ADDRESS.toLowerCase()) {
                                                                                                console.log(`✅ Safe is already the owner.`);
                                                                                                        continue;
                                                                                                              }

                                                                                                                    console.log(`Initiating transferOwnership to Safe...`);
                                                                                                                          const tx = await contract.transferOwnership(SAFE_ADDRESS);
                                                                                                                                console.log(`Tx Sent: ${tx.hash}`);
                                                                                                                                      await tx.wait();
                                                                                                                                            console.log(`✅ Success: Transfer confirmed for ${name}`);

                                                                                                                                                } catch (error) {
                                                                                                                                                      console.error(`❌ Error with ${name}: ${error.message}`);
                                                                                                                                                          }
                                                                                                                                                            }
                                                                                                                                                            }

                                                                                                                                                            main().catch((error) => {
                                                                                                                                                              console.error(error);
                                                                                                                                                                process.exit(1);
                                                                                                                                                                });
                                                                                                                                                                