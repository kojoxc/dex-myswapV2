# dex-myswapV2

Foundry workspace for learning and building a Uniswap V2/SushiSwap-style AMM.

## Current Status

This repository is currently a clean baseline, not a complete DEX yet.

- `src/mocks/MockERC20.sol`: unrestricted ERC20 mock for tests.
- `src/mocks/WETH9.sol`: local WETH-compatible mock.
- `src/core/`: reserved for Factory, Pair, and LP ERC20 contracts.
- `src/periphery/`: reserved for Router and Library contracts.
- `src/interfaces/`: reserved for public interfaces.
- `test/`: Foundry tests, split by contract area.

## Roadmap

1. Port core contracts first:
   - `UniswapV2ERC20`
   - `UniswapV2Factory`
   - `UniswapV2Pair`
2. Add core tests:
   - pair creation
   - add liquidity through `Pair.mint`
   - remove liquidity through `Pair.burn`
   - token0/token1 swaps
   - invariant checks around reserves and `k`
3. Port periphery contracts:
   - `UniswapV2Library`
   - `UniswapV2Router02`
4. Add router tests:
   - add/remove liquidity
   - token-to-token swaps
   - ETH swaps through WETH
   - slippage and deadline reverts

## Commands

```shell
forge fmt
forge build
forge test -vvv
```

## Notes

Mocks in `src/mocks` are for local tests only. Do not deploy `MockERC20` as a real token because anyone can mint unlimited supply.
