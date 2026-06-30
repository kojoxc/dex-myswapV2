# dex-myswapV2

Foundry workspace for learning and building a Uniswap V2/SushiSwap-style AMM.

## Current Status

This repository now contains a working Uniswap V2-style learning DEX core and periphery.

- `src/core/UniswapV2ERC20.sol`: LP token with EIP-2612-style permit.
- `src/core/UniswapV2Factory.sol`: pair factory with fee setter controls.
- `src/core/UniswapV2Pair.sol`: AMM pair with mint, burn, swap, skim, sync, flash-swap callback, and fee-on support.
- `src/periphery/UniswapV2Library.sol`: reserve lookup and swap/liquidity math helpers.
- `src/periphery/UniswapV2Router02.sol`: token-token and ETH/WETH liquidity/swap router.
- `src/mocks/MockERC20.sol`: unrestricted ERC20 mock for tests/local deployments.
- `src/mocks/WETH9.sol`: local WETH-compatible mock.
- `script/`: Foundry deployment and interaction scripts.
- `frontend/`: Vite + React wallet UI for exact-in/exact-out swaps, liquidity management, and pool discovery.
- `test/`: unit, fuzz, invariant, and integration tests.

## Roadmap

1. Strengthen the existing contracts:
   - deeper TWAP scenarios
   - fork tests against known token behaviors
   - production audit review
2. Add frontend polish:
   - richer token list management
   - native liquidity UX
   - advanced multi-hop route controls
3. Add deployment hardening:
   - network config files
   - broadcast verification notes
   - explorer verification scripts
4. Add audit-oriented checks:
   - static analysis
   - invariant suites for router flows
   - fork tests against known token behaviors

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
forge script script/DeployLocal.s.sol --broadcast --rpc-url <RPC_URL>
forge script script/DeployCore.s.sol --broadcast --rpc-url <RPC_URL>
ROUTER=<router> TOKEN_A=<tokenA> TOKEN_B=<tokenB> forge script script/AddLiquidity.s.sol --broadcast --rpc-url <RPC_URL>
ROUTER=<router> TOKEN_IN=<tokenA> TOKEN_OUT=<tokenB> forge script script/SwapExactTokensForTokens.s.sol --broadcast --rpc-url <RPC_URL>
ETHERSCAN_API_KEY=<key> CHAIN_ID=<id> FACTORY=<factory> WETH=<weth> ROUTER=<router> FEE_TO_SETTER=<owner> script/verify-contracts.sh
```

Deployment templates live in `deployments/`. The frontend reads public deployment files from `frontend/public/deployments/<chainId>.json` to prefill router, WETH, and token list data. Deployment token entries can include `decimals`; if omitted, the frontend falls back to `18`.

## Frontend

The frontend is a static Vite + React app. It supports token-token swaps, ETH-token swaps through WETH, exact-in/exact-out quotes, quote refresh/stale warnings, add/remove liquidity, token discovery, and searchable pool discovery from the configured router factory.

```shell
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173`, connect a wallet, and enter the deployed Router and token addresses in the settings dialog.

Common frontend environment variables:

- `VITE_RPC_URL`: defaults to `http://127.0.0.1:8545`.
- `VITE_ROUTER_ADDRESS`: optional default router address.
- `VITE_TOKEN_IN_ADDRESS`: optional default token A/pay token address.
- `VITE_TOKEN_OUT_ADDRESS`: optional default token B/receive token address.
- `VITE_WETH_ADDRESS`: optional default WETH address for native ETH routes.
- `VITE_WALLETCONNECT_PROJECT_ID`: optional RainbowKit WalletConnect project id.
- `VITE_TOKEN_LIST_URL`: optional Uniswap-token-list-compatible URL loaded at runtime.

## Security Checks

CI runs Foundry tests, coverage, gas snapshot generation, frontend tests/build, and a non-blocking Slither static analysis job. The suite includes malicious-token behavior checks for false-returning tokens and fee-on-transfer input tokens, plus pair and router invariant tests.

## Notes

Mocks in `src/mocks` are for local tests only. Do not deploy `MockERC20` as a real token because anyone can mint unlimited supply.
