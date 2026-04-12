#!/usr/bin/env node
/**
 * Legacy entrypoint kept for compatibility.
 * Arbiscan verification now runs through Etherscan V2.
 */
console.log('ℹ️  Arbiscan verification migrated to Etherscan V2. Running verify-etherscan-v2.js...');
require('./verify-etherscan-v2');
