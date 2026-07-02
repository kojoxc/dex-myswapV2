// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {UniswapV2Factory} from "../../src/core/UniswapV2Factory.sol";
import {UniswapV2Pair} from "../../src/core/UniswapV2Pair.sol";
import {IUniswapV2Callee} from "../../src/interfaces/IUniswapV2Callee.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {Errors} from "../../src/libraries/Errors.sol";

contract FlashSwapCallee is IUniswapV2Callee {
    address internal immutable PAIR;
    MockERC20 internal immutable TOKEN0;
    MockERC20 internal immutable TOKEN1;

    bool public called;
    address public sender;

    constructor(address pair_, MockERC20 token0_, MockERC20 token1_) {
        PAIR = pair_;
        TOKEN0 = token0_;
        TOKEN1 = token1_;
    }

    function uniswapV2Call(address sender_, uint256 amount0, uint256 amount1, bytes calldata) external override {
        require(msg.sender == PAIR, "FlashSwapCallee: FORBIDDEN");

        called = true;
        sender = sender_;

        if (amount0 > 0) {
            TOKEN0.mint(PAIR, amount0 * 2);
        }

        if (amount1 > 0) {
            TOKEN1.mint(PAIR, amount1 * 2);
        }
    }
}

contract UniswapV2PairTest is Test {
    UniswapV2Factory internal factory;
    UniswapV2Pair internal pair;

    MockERC20 internal tokenA;
    MockERC20 internal tokenB;
    MockERC20 internal token0;
    MockERC20 internal token1;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        factory = new UniswapV2Factory(address(this));
        tokenA = new MockERC20("Token A", "TKNA");
        tokenB = new MockERC20("Token B", "TKNB");

        pair = UniswapV2Pair(factory.createPair(address(tokenA), address(tokenB)));

        token0 = MockERC20(pair.token0());
        token1 = MockERC20(pair.token1());
    }

    function testInitialMintLocksMinimumLiquidity() public {
        uint256 liquidity = _addLiquidity(alice, 1 ether, 1 ether);

        assertEq(liquidity, 1 ether - pair.MINIMUM_LIQUIDITY());
        assertEq(pair.balanceOf(alice), liquidity);
        assertEq(pair.balanceOf(address(0)), pair.MINIMUM_LIQUIDITY());
        assertEq(pair.totalSupply(), 1 ether);

        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        assertEq(uint256(reserve0), 1 ether);
        assertEq(uint256(reserve1), 1 ether);
    }

    function testBurnReturnsProportionalLiquidity() public {
        _addLiquidity(address(this), 5 ether, 10 ether);

        uint256 burnLiquidity = pair.balanceOf(address(this)) / 2;
        uint256 totalSupply = pair.totalSupply();
        uint256 pairBalance0 = token0.balanceOf(address(pair));
        uint256 pairBalance1 = token1.balanceOf(address(pair));
        uint256 expectedAmount0 = (burnLiquidity * pairBalance0) / totalSupply;
        uint256 expectedAmount1 = (burnLiquidity * pairBalance1) / totalSupply;

        assertTrue(pair.transfer(address(pair), burnLiquidity));

        (uint256 amount0, uint256 amount1) = pair.burn(alice);

        assertEq(amount0, expectedAmount0);
        assertEq(amount1, expectedAmount1);
        assertEq(token0.balanceOf(alice), expectedAmount0);
        assertEq(token1.balanceOf(alice), expectedAmount1);

        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        assertEq(uint256(reserve0), pairBalance0 - expectedAmount0);
        assertEq(uint256(reserve1), pairBalance1 - expectedAmount1);
    }

    function testSecondMintUsesLowerLiquiditySide() public {
        _addLiquidity(address(this), 5 ether, 5 ether);

        uint256 liquidity = _addLiquidity(alice, 1 ether, 2 ether);

        assertEq(liquidity, 1 ether);
        assertEq(pair.balanceOf(alice), 1 ether);
    }

    function testMintRevertsWhenLiquidityIsTooSmall() public {
        token0.mint(address(this), pair.MINIMUM_LIQUIDITY());
        token1.mint(address(this), pair.MINIMUM_LIQUIDITY());

        assertTrue(token0.transfer(address(pair), pair.MINIMUM_LIQUIDITY()));
        assertTrue(token1.transfer(address(pair), pair.MINIMUM_LIQUIDITY()));

        vm.expectRevert(Errors.PairInsufficientLiquidityMinted.selector);
        pair.mint(alice);
    }

    function testBurnRevertsWithoutLiquiditySentToPair() public {
        _addLiquidity(address(this), 5 ether, 10 ether);

        vm.expectRevert(Errors.PairInsufficientLiquidityBurned.selector);
        pair.burn(alice);
    }

    function testSwapToken0ForToken1() public {
        _addLiquidity(address(this), 5 ether, 10 ether);

        uint256 amountIn = 1 ether;
        uint256 amountOut = _getAmountOut(amountIn, 5 ether, 10 ether);

        token0.mint(address(this), amountIn);
        assertTrue(token0.transfer(address(pair), amountIn));

        pair.swap(0, amountOut, alice, "");

        assertEq(token1.balanceOf(alice), amountOut);

        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        assertEq(uint256(reserve0), 5 ether + amountIn);
        assertEq(uint256(reserve1), 10 ether - amountOut);
    }

    function testFuzzSwapToken0ForToken1DoesNotDecreaseK(uint96 amountInSeed) public {
        _addLiquidity(address(this), 100 ether, 100 ether);
        (uint112 reserve0Before, uint112 reserve1Before,) = pair.getReserves();
        uint256 amountIn = bound(uint256(amountInSeed), 1e9, 50 ether);
        uint256 amountOut = _getAmountOut(amountIn, reserve0Before, reserve1Before);

        token0.mint(address(this), amountIn);
        assertTrue(token0.transfer(address(pair), amountIn));

        pair.swap(0, amountOut, alice, "");

        (uint112 reserve0After, uint112 reserve1After,) = pair.getReserves();
        assertGe(uint256(reserve0After) * uint256(reserve1After), uint256(reserve0Before) * uint256(reserve1Before));
    }

    function testSwapRevertsWithoutInputAmount() public {
        _addLiquidity(address(this), 5 ether, 10 ether);

        vm.expectRevert(Errors.PairInsufficientInputAmount.selector);
        pair.swap(0, 1 ether, alice, "");
    }

    function testSwapRevertsForZeroOutputAmount() public {
        _addLiquidity(address(this), 5 ether, 10 ether);

        vm.expectRevert(Errors.PairInsufficientOutputAmount.selector);
        pair.swap(0, 0, alice, "");
    }

    function testSwapRevertsForInsufficientLiquidity() public {
        _addLiquidity(address(this), 5 ether, 10 ether);

        vm.expectRevert(Errors.PairInsufficientLiquidity.selector);
        pair.swap(0, 10 ether, alice, "");
    }

    function testSwapRevertsForInvalidRecipient() public {
        _addLiquidity(address(this), 5 ether, 10 ether);

        vm.expectRevert(Errors.PairInvalidTo.selector);
        pair.swap(0, 1 ether, address(token1), "");
    }

    function testSwapRevertsWhenInvariantIsBroken() public {
        _addLiquidity(address(this), 5 ether, 10 ether);

        token0.mint(address(this), 0.01 ether);
        assertTrue(token0.transfer(address(pair), 0.01 ether));

        vm.expectRevert(Errors.PairK.selector);
        pair.swap(0, 1 ether, alice, "");
    }

    function testFlashSwapCallbackIsCalled() public {
        _addLiquidity(address(this), 5 ether, 10 ether);
        FlashSwapCallee callee = new FlashSwapCallee(address(pair), token0, token1);

        pair.swap(0, 1 ether, address(callee), abi.encode("flash"));

        assertTrue(callee.called());
        assertEq(callee.sender(), address(this));
        assertEq(token1.balanceOf(address(callee)), 1 ether);

        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        assertEq(uint256(reserve0), 5 ether);
        assertEq(uint256(reserve1), 11 ether);
    }

    function testSkimTransfersExcessBalances() public {
        _addLiquidity(address(this), 5 ether, 10 ether);

        token0.mint(address(pair), 1 ether);
        token1.mint(address(pair), 2 ether);

        pair.skim(alice);

        assertEq(token0.balanceOf(alice), 1 ether);
        assertEq(token1.balanceOf(alice), 2 ether);
    }

    function testSyncUpdatesReservesToCurrentBalances() public {
        _addLiquidity(address(this), 5 ether, 10 ether);

        token0.mint(address(pair), 1 ether);
        token1.mint(address(pair), 2 ether);

        pair.sync();

        (uint112 reserve0, uint112 reserve1,) = pair.getReserves();
        assertEq(uint256(reserve0), 6 ether);
        assertEq(uint256(reserve1), 12 ether);
    }

    function testPriceCumulativeUpdatesAfterElapsedTime() public {
        _addLiquidity(address(this), 5 ether, 10 ether);

        vm.warp(block.timestamp + 10);
        _addLiquidity(address(this), 1 ether, 2 ether);

        assertEq(pair.price0CumulativeLast(), _expectedCumulative(5 ether, 10 ether, 10));
        assertEq(pair.price1CumulativeLast(), _expectedCumulative(10 ether, 5 ether, 10));
    }

    function testPriceCumulativeDoesNotUpdateInSameBlock() public {
        _addLiquidity(address(this), 5 ether, 10 ether);

        uint256 price0Before = pair.price0CumulativeLast();
        uint256 price1Before = pair.price1CumulativeLast();

        pair.sync();

        assertEq(pair.price0CumulativeLast(), price0Before);
        assertEq(pair.price1CumulativeLast(), price1Before);
    }

    function testPriceCumulativeHandlesTimestampWraparound() public {
        vm.warp(uint256(type(uint32).max) - 5);
        _addLiquidity(address(this), 5 ether, 10 ether);

        vm.warp(uint256(type(uint32).max) + 5);
        pair.sync();

        assertEq(pair.price0CumulativeLast(), _expectedCumulative(5 ether, 10 ether, 10));
        assertEq(pair.price1CumulativeLast(), _expectedCumulative(10 ether, 5 ether, 10));
    }

    function testFeeOnMintsProtocolLiquidity() public {
        factory.setFeeTo(alice);
        _addLiquidity(address(this), 1_000 ether, 1_000 ether);

        token0.mint(address(this), 100 ether);
        assertTrue(token0.transfer(address(pair), 100 ether));
        pair.swap(0, _getAmountOut(100 ether, 1_000 ether, 1_000 ether), bob, "");

        uint256 feeBalanceBefore = pair.balanceOf(alice);

        _addLiquidity(address(this), 100 ether, 100 ether);

        assertGt(pair.balanceOf(alice), feeBalanceBefore);
        assertGt(pair.kLast(), 0);
    }

    function testFeeOffClearsKLast() public {
        factory.setFeeTo(alice);
        _addLiquidity(address(this), 1_000 ether, 1_000 ether);

        assertGt(pair.kLast(), 0);

        factory.setFeeTo(address(0));
        _addLiquidity(address(this), 100 ether, 100 ether);

        assertEq(pair.kLast(), 0);
    }

    function _addLiquidity(address to, uint256 amount0, uint256 amount1) private returns (uint256 liquidity) {
        token0.mint(address(this), amount0);
        token1.mint(address(this), amount1);

        assertTrue(token0.transfer(address(pair), amount0));
        assertTrue(token1.transfer(address(pair), amount1));

        liquidity = pair.mint(to);
    }

    function _getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut) private pure returns (uint256) {
        uint256 amountInWithFee = amountIn * 997;
        return (amountInWithFee * reserveOut) / (reserveIn * 1_000 + amountInWithFee);
    }

    function _expectedCumulative(uint256 reserveIn, uint256 reserveOut, uint256 elapsed)
        private
        pure
        returns (uint256)
    {
        return ((reserveOut * elapsed) << 112) / reserveIn;
    }
}
