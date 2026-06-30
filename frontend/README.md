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
5. Open `http://localhost:5173`, connect wallet, use deployment-loaded tokens or paste addresses, then swap or manage liquidity.

## Features

- Token-token swap with exact-in/exact-out mode, quote refresh/stale warning, approval, slippage, deadline, price impact, and direct/multi-hop route preview.
- Native ETH swap mode through configured WETH: `ETH → Token` and `Token → ETH`.
- Deployment/env/external token list inside token selector dialogs.
- Add liquidity with reserve-ratio auto calculation, estimated LP, and pool share.
- Remove liquidity with `25%`, `50%`, `75%`, and `MAX` shortcuts.
- `/pools` explorer with search, sorting, reserves, total LP supply, user LP balance, and quick actions.
- Pair discovery through the configured router factory.
- Mobile bottom navigation and transaction timeline toast with explorer links when available.

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
- `VITE_WETH_ADDRESS`: optional default WETH address for native ETH swap mode.
- `VITE_WALLETCONNECT_PROJECT_ID`: optional RainbowKit WalletConnect project id.
- `VITE_TOKEN_LIST_URL`: optional Uniswap-token-list-compatible URL. Leave blank to avoid external network calls.

## Deployment Files

The app fetches `/deployments/<chainId>.json` at runtime. Keep `frontend/public/deployments/31337.json` updated after local deploys so the UI can prefill router, WETH, and token list data without manual paste. Token entries may include `decimals`; missing decimals default to `18`.
