// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";

import {UniswapV2Factory} from "../../src/core/UniswapV2Factory.sol";
import {UniswapV2Pair} from "../../src/core/UniswapV2Pair.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {UniswapV2Library} from "../../src/periphery/UniswapV2Library.sol";

contract PairInvariantHandler is Test {
    UniswapV2Factory public factory;
    UniswapV2Pair public pair;
    MockERC20 public token0;
    MockERC20 public token1;

    constructor() {
        factory = new UniswapV2Factory(address(this));
        MockERC20 tokenA = new MockERC20("Token A", "TKNA");
        MockERC20 tokenB = new MockERC20("Token B", "TKNB");

        pair = UniswapV2Pair(factory.createPair(address(tokenA), address(tokenB)));
        token0 = MockERC20(pair.token0());
        token1 = MockERC20(pair.token1());
    }

    function addLiquidity(uint256 amount0Seed, uint256 amount1Seed) external {
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        if (reserve0 != 0 || reserve1 != 0) return;

        uint256 amount0 = bound(amount0Seed, 1e9, 1e22);
        uint256 amount1 = bound(amount1Seed, 1e9, 1e22);

        token0.mint(address(pair), amount0);
        token1.mint(address(pair), amount1);

        pair.mint(address(this));
    }

    function swap0For1(uint256 amountInSeed) external {
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        if (reserve0 < 2e9 || reserve1 == 0) return;

        uint256 amountIn = bound(amountInSeed, 1e9, uint256(reserve0) / 2);
        uint256 amountOut = UniswapV2Library.getAmountOut(amountIn, reserve0, reserve1);
        if (amountOut == 0 || amountOut >= reserve1) return;

        token0.mint(address(pair), amountIn);
        pair.swap(0, amountOut, address(this), "");
    }

    function swap1For0(uint256 amountInSeed) external {
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        if (reserve1 < 2e9 || reserve0 == 0) return;

        uint256 amountIn = bound(amountInSeed, 1e9, uint256(reserve1) / 2);
        uint256 amountOut = UniswapV2Library.getAmountOut(amountIn, reserve1, reserve0);
        if (amountOut == 0 || amountOut >= reserve0) return;

        token1.mint(address(pair), amountIn);
        pair.swap(amountOut, 0, address(this), "");
    }
}

contract UniswapV2PairInvariantTest is StdInvariant, Test {
    PairInvariantHandler internal handler;

    function setUp() public {
        handler = new PairInvariantHandler();
        targetContract(address(handler));
    }

    function invariantReservesMatchPairBalances() public view {
        UniswapV2Pair pair = handler.pair();
        MockERC20 token0 = handler.token0();
        MockERC20 token1 = handler.token1();
        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();

        assertEq(uint256(reserve0), token0.balanceOf(address(pair)));
        assertEq(uint256(reserve1), token1.balanceOf(address(pair)));
    }
}
