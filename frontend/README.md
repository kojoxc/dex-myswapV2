# MySwap V2 Frontend

Static React frontend for the MySwap V2 router. It targets local Anvil development by default and builds to plain static files in `dist/`.

## Stack

- Vite + React + TypeScript
- wagmi + viem
- RainbowKit
- TanStack Query
- Tailwind CSS

## Usage

1. Start Anvil: `anvil`.
2. Deploy contracts from the repository root: `forge script script/DeployLocal.s.sol --broadcast --rpc-url http://127.0.0.1:8545`.
3. Install frontend dependencies: `npm install`.
4. Run the frontend from this folder: `npm run dev`.
5. Open `http://localhost:5173`, connect wallet, paste Router and token addresses, then swap.

## Build

```shell
npm run build
```

The output is static and can be served from `dist/` by any static hosting provider.

## Environment

- `VITE_RPC_URL`: defaults to `http://127.0.0.1:8545`.
- `VITE_WALLETCONNECT_PROJECT_ID`: optional RainbowKit WalletConnect project id.
