# dex-myswapV2

Foundry workspace for learning and building a Uniswap V2/SushiSwap-style AMM.

## Current Status

This repository contains a working Uniswap V2-style learning DEX core, periphery, and frontend.

### Contracts

- `src/core/UniswapV2ERC20.sol`: LP token with EIP-2612-style permit.
- `src/core/UniswapV2Factory.sol`: pair factory with fee setter controls.
- `src/core/UniswapV2Pair.sol`: AMM pair with mint, burn, swap, skim, sync, flash-swap callback, and fee-on support.
- `src/periphery/UniswapV2Library.sol`: reserve lookup and swap/liquidity math helpers.
- `src/periphery/UniswapV2Router02.sol`: token-token and ETH/WETH liquidity/swap router.
- `src/periphery/Multicall.sol`: abstract contract enabling batched multi-function calls on the router.
- `src/mocks/MockERC20.sol`: unrestricted ERC20 mock for tests/local deployments.
- `src/mocks/WETH9.sol`: local WETH-compatible mock.
- `script/`: Foundry deployment and interaction scripts.
- `test/`: unit, fuzz, invariant, and integration tests (77 tests).

### Frontend

- `frontend/`: Vite + React wallet UI for token swaps (`exactIn`), add/remove liquidity, and pool discovery.
- React Error Boundary for crash resilience.
- SwapConfirmationDialog with focus trap and keyboard navigation.
- Token selector with search, quick chips, and accessible listbox.
- Activity drawer scoped per wallet+chain with receipt verification.
- Docker Compose workflow for local Anvil deployment.

## Commands

```shell
forge fmt
forge build
forge test -vvv
forge coverage
forge snapshot
```

Frontend checks:

```shell
cd frontend
npm ci
npm test
npm run build
```

Optional Sepolia fork checks:

```shell
SEPOLIA_RPC_URL=<rpc> \
SEPOLIA_ROUTER=<router> \
SEPOLIA_TOKEN_IN=<tokenIn> \
SEPOLIA_TOKEN_OUT=<tokenOut> \
forge test --match-contract SepoliaRouterForkTest
```

The fork tests are skipped when these environment variables are not provided, so local and CI test runs remain deterministic.

## Deployment Scripts

```shell
forge script script/DeployLocal.s.sol --broadcast --rpc-url <RPC_URL> --private-key <PRIVATE_KEY>
forge script script/DeployCore.s.sol --broadcast --rpc-url <RPC_URL> --private-key <PRIVATE_KEY>
ROUTER=<router> TOKEN_A=<tokenA> TOKEN_B=<tokenB> forge script script/AddLiquidity.s.sol --broadcast --rpc-url <RPC_URL>
ROUTER=<router> TOKEN_IN=<tokenA> TOKEN_OUT=<tokenB> forge script script/SwapExactTokensForTokens.s.sol --broadcast --rpc-url <RPC_URL>
```

For non-local core deployments, pass `WETH_ADDRESS=<canonical-weth>` to `DeployCore.s.sol`; otherwise the script deploys a local mock WETH.

Deployment templates live in `deployments/`. The frontend reads public deployment files from `frontend/public/deployments/<chainId>.json` to prefill router, WETH, and token list data. Deployment token entries can include `decimals`; if omitted, the frontend falls back to `18`.

### Docker Compose

```shell
docker compose up -d
```

Starts Anvil (port 8545), deploys contracts via `DeployLocal.s.sol`, and serves the frontend (port 5173). The browser RPC defaults to `http://127.0.0.1:8545`; the deploy container still uses `http://anvil:8545` internally.

## Frontend

The frontend is a static Vite + React app. It supports token-token and ETH-token swaps (exact-in), quote refresh with stale warnings, add/remove liquidity, token discovery, and searchable pool discovery from the configured router factory.

```shell
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173`, connect a wallet, and enter the deployed Router and token addresses in the settings dialog.

### Frontend Quality Checks

```shell
cd frontend
npx tsc --noEmit   # TypeScript strict check
npm test            # Vitest (69 tests)
npm run build       # Production build
```

Common frontend environment variables:

- `VITE_RPC_URL`: defaults to `http://127.0.0.1:8545`.
- `VITE_ROUTER_ADDRESS`: optional default router address.
- `VITE_TOKEN_IN_ADDRESS`: optional default token A/pay token address.
- `VITE_TOKEN_OUT_ADDRESS`: optional default token B/receive token address.
- `VITE_WETH_ADDRESS`: optional default WETH address for native ETH routes.
- `VITE_WALLETCONNECT_PROJECT_ID`: optional RainbowKit WalletConnect project id.
- `VITE_TOKEN_LIST_URL`: optional Uniswap-token-list-compatible URL loaded at runtime.

## CI / Security

CI runs on push/PR to main with two jobs:

- **Solidity**: `forge build`, `forge test`, `forge coverage`, `forge snapshot --check`, and a non-blocking Slither static analysis.
- **Frontend**: `tsc --noEmit`, `vitest`, `vite build`.

The test suite includes malicious-token behavior checks (false-returning tokens, fee-on-transfer input tokens), pair and router invariant tests, and Multicall batching tests.

## Notes

Mocks in `src/mocks` are for local tests only. Do not deploy `MockERC20` as a real token because anyone can mint unlimited supply.
