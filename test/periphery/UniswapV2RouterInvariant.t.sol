// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {StdInvariant} from "forge-std/StdInvariant.sol";
import {Test} from "forge-std/Test.sol";

import {UniswapV2Factory} from "../../src/core/UniswapV2Factory.sol";
import {IUniswapV2Pair} from "../../src/interfaces/IUniswapV2Pair.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {WETH9} from "../../src/mocks/WETH9.sol";
import {UniswapV2Router02} from "../../src/periphery/UniswapV2Router02.sol";

contract RouterInvariantHandler is Test {
    uint256 internal constant MIN_HANDLER_AMOUNT = 1e15;

    UniswapV2Factory public factory;
    UniswapV2Router02 public router;
    WETH9 public weth;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    IUniswapV2Pair public pair;
    IUniswapV2Pair public ethPair;

    constructor() {
        factory = new UniswapV2Factory(address(this));
        weth = new WETH9();
        router = new UniswapV2Router02(address(factory), address(weth));
        tokenA = new MockERC20("Token A", "TKNA");
        tokenB = new MockERC20("Token B", "TKNB");
        vm.deal(address(this), 1_000_000 ether);

        tokenA.mint(address(this), 1_000_000 ether);
        tokenB.mint(address(this), 1_000_000 ether);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);

        router.addLiquidity(
            address(tokenA), address(tokenB), 1_000 ether, 1_000 ether, 0, 0, address(this), block.timestamp
        );
        pair = IUniswapV2Pair(factory.getPair(address(tokenA), address(tokenB)));

        router.addLiquidityETH{value: 1_000 ether}(address(tokenB), 1_000 ether, 0, 0, address(this), block.timestamp);
        ethPair = IUniswapV2Pair(factory.getPair(address(tokenB), address(weth)));
    }

    receive() external payable {}

    function addLiquidity(uint256 amountASeed, uint256 amountBSeed) external {
        uint256 amountA = bound(amountASeed, 1e9, 10 ether);
        uint256 amountB = bound(amountBSeed, 1e9, 10 ether);
        router.addLiquidity(address(tokenA), address(tokenB), amountA, amountB, 0, 0, address(this), block.timestamp);
    }

    function swapAForB(uint256 amountSeed) external {
        uint256 amountIn = bound(amountSeed, 1e9, 5 ether);
        address[] memory path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        router.swapExactTokensForTokens(amountIn, 0, path, address(this), block.timestamp);
    }

    function swapBForA(uint256 amountSeed) external {
        uint256 amountIn = bound(amountSeed, 1e9, 5 ether);
        address[] memory path = new address[](2);
        path[0] = address(tokenB);
        path[1] = address(tokenA);
        router.swapExactTokensForTokens(amountIn, 0, path, address(this), block.timestamp);
    }

    function addLiquidityEth(uint256 amountTokenSeed, uint256 amountEthSeed) external {
        uint256 amountToken = _boundHeld(amountTokenSeed, tokenB.balanceOf(address(this)), 10 ether);
        uint256 amountEth = _boundHeld(amountEthSeed, address(this).balance, 10 ether);
        if (amountToken == 0 || amountEth == 0) return;

        router.addLiquidityETH{value: amountEth}(address(tokenB), amountToken, 0, 0, address(this), block.timestamp);
    }

    function removeLiquidityEth(uint256 liquiditySeed) external {
        uint256 balance = ethPair.balanceOf(address(this));
        if (balance == 0) return;

        if (balance < MIN_HANDLER_AMOUNT) return;

        uint256 liquidity = bound(liquiditySeed, MIN_HANDLER_AMOUNT, balance);
        ethPair.approve(address(router), liquidity);
        router.removeLiquidityETH(address(tokenB), liquidity, 0, 0, address(this), block.timestamp);
    }

    function swapEthForTokenB(uint256 amountSeed) external {
        uint256 amountIn = _boundHeld(amountSeed, address(this).balance, 5 ether);
        if (amountIn == 0) return;

        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(tokenB);
        router.swapExactETHForTokens{value: amountIn}(0, path, address(this), block.timestamp);
    }

    function swapTokenBForEth(uint256 amountSeed) external {
        uint256 amountIn = _boundHeld(amountSeed, tokenB.balanceOf(address(this)), 5 ether);
        if (amountIn == 0) return;

        address[] memory path = new address[](2);
        path[0] = address(tokenB);
        path[1] = address(weth);
        router.swapExactTokensForETH(amountIn, 0, path, address(this), block.timestamp);
    }

    function _boundHeld(uint256 seed, uint256 balance, uint256 maxAmount) private pure returns (uint256) {
        if (balance < MIN_HANDLER_AMOUNT) return 0;
        uint256 upper = balance < maxAmount ? balance : maxAmount;
        return bound(seed, MIN_HANDLER_AMOUNT, upper);
    }
}

contract UniswapV2RouterInvariantTest is StdInvariant, Test {
    RouterInvariantHandler internal handler;

    function setUp() public {
        handler = new RouterInvariantHandler();
        targetContract(address(handler));
    }

    function invariantRouterPairReservesMatchBalances() public view {
        _assertPairReservesMatchBalances(handler.pair());
        _assertPairReservesMatchBalances(handler.ethPair());
    }

    function _assertPairReservesMatchBalances(IUniswapV2Pair nextPair) private view {
        (uint112 reserve0, uint112 reserve1,) = nextPair.getReserves();
        address token0 = nextPair.token0();
        address token1 = nextPair.token1();

        assertEq(uint256(reserve0), MockERC20(token0).balanceOf(address(nextPair)));
        assertEq(uint256(reserve1), MockERC20(token1).balanceOf(address(nextPair)));
        assertTrue(token0 != token1);
    }
}
