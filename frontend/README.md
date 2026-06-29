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
5. Open `http://localhost:5173`, connect wallet, paste Router and token addresses, then swap or manage liquidity.

## Features

- Token-token swap with quote, approval, slippage, and deadline controls.
- Add liquidity for a configured token pair.
- Remove liquidity by approving and burning LP tokens through the router.
- Pair discovery through the configured router factory.

## Build

```shell
npm run build
```

The output is static and can be served from `dist/` by any static hosting provider.

## Test

```shell
npm test
```

## Environment

- `VITE_RPC_URL`: defaults to `http://127.0.0.1:8545`.
- `VITE_ROUTER_ADDRESS`: optional default router address.
- `VITE_TOKEN_IN_ADDRESS`: optional default token A/pay token address.
- `VITE_TOKEN_OUT_ADDRESS`: optional default token B/receive token address.
- `VITE_WALLETCONNECT_PROJECT_ID`: optional RainbowKit WalletConnect project id.
