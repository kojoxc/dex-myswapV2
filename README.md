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
- `frontend/`: Vite + React wallet UI for swaps and liquidity management.
- `test/`: unit, fuzz, invariant, and integration tests.

## Roadmap

1. Strengthen the existing contracts:
   - more malicious-token tests
   - deeper fee-on and TWAP scenarios
   - gas snapshots
2. Add frontend polish:
   - ETH swap forms
   - token list/pair discovery UX
   - multi-hop route controls
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
```

Frontend checks:

```shell
cd frontend
npm ci
npm test
npm run build
```

## Deployment Scripts

```shell
forge script script/DeployLocal.s.sol --broadcast --rpc-url <RPC_URL>
forge script script/DeployCore.s.sol --broadcast --rpc-url <RPC_URL>
ROUTER=<router> TOKEN_A=<tokenA> TOKEN_B=<tokenB> forge script script/AddLiquidity.s.sol --broadcast --rpc-url <RPC_URL>
ROUTER=<router> TOKEN_IN=<tokenA> TOKEN_OUT=<tokenB> forge script script/SwapExactTokensForTokens.s.sol --broadcast --rpc-url <RPC_URL>
```

## Frontend

The frontend is a static Vite + React app. It supports token-token swaps and add/remove liquidity for a configured router/token pair.

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
- `VITE_WALLETCONNECT_PROJECT_ID`: optional RainbowKit WalletConnect project id.

## Notes

Mocks in `src/mocks` are for local tests only. Do not deploy `MockERC20` as a real token because anyone can mint unlimited supply.
