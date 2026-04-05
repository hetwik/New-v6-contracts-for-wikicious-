# New-v6-contracts-for-wikicious-

New v6 contracts for wikicious.

## Deployment troubleshooting

If deploy fails with `resolveName` or `EXT_* is not a valid hex address`, one of your env values is malformed.

Checklist:
- Address must start with `0x`
- Address must contain exactly 40 hex characters after `0x`
- No extra characters like `g-z`, spaces, commas, or quotes inside the value

Example:
```env
EXT_SEQ_FEED=0xFdB631F5EE196F0ed6FAa767959853A9F217697D
```

Run deploy again after fixing the env value:
```bash
npm run deploy:testnet
```


Note: if `EXT_SEQ_FEED` is set but malformed, the deploy script now falls back to the built-in default sequencer feed and prints a warning.

The deploy script also auto-pads addresses with 39 hex characters (after `0x`) by adding a leading `0` and logs a warning.
