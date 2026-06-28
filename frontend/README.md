# MySwap V2 Frontend

Minimal static frontend for local/manual testing.

## Usage

1. Deploy contracts with `forge script script/DeployLocal.s.sol --broadcast --rpc-url <RPC_URL>`.
2. Serve this folder with any static server, for example `python3 -m http.server 5173` from `frontend/`.
3. Open `http://localhost:5173`, connect a wallet, fill Router/Factory/Token addresses, and save config.
4. Approve both tokens before adding liquidity or swapping.

This frontend intentionally has no build pipeline. It uses ethers from a CDN and is meant as a lightweight integration surface while the DEX contracts evolve.
