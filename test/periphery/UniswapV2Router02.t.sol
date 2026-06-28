// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {UniswapV2Factory} from "../../src/core/UniswapV2Factory.sol";
import {IUniswapV2Pair} from "../../src/interfaces/IUniswapV2Pair.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {WETH9} from "../../src/mocks/WETH9.sol";
import {UniswapV2Library} from "../../src/periphery/UniswapV2Library.sol";
import {UniswapV2Router02} from "../../src/periphery/UniswapV2Router02.sol";

contract UniswapV2Router02Test is Test {
    UniswapV2Factory internal factory;
    UniswapV2Router02 internal router;
    WETH9 internal weth;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;
    MockERC20 internal tokenC;

    address internal alice = address(0xA11CE);

    receive() external payable {}

    function setUp() public {
        factory = new UniswapV2Factory(address(this));
        weth = new WETH9();
        router = new UniswapV2Router02(address(factory), address(weth));

        tokenA = new MockERC20("Token A", "TKNA");
        tokenB = new MockERC20("Token B", "TKNB");
        tokenC = new MockERC20("Token C", "TKNC");

        vm.deal(alice, 100 ether);
        tokenA.mint(alice, 1_000 ether);
        tokenB.mint(alice, 1_000 ether);
        tokenC.mint(alice, 1_000 ether);

        vm.startPrank(alice);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        tokenC.approve(address(router), type(uint256).max);
        vm.stopPrank();
    }

    function testAddLiquidityCreatesPairAndMintsLp() public {
        vm.prank(alice);
        (uint256 amountA, uint256 amountB, uint256 liquidity) = router.addLiquidity(
            address(tokenA), address(tokenB), 10 ether, 20 ether, 10 ether, 20 ether, alice, block.timestamp
        );

        address pair = factory.getPair(address(tokenA), address(tokenB));
        (uint256 reserveA, uint256 reserveB) =
            UniswapV2Library.getReserves(address(factory), address(tokenA), address(tokenB));

        assertEq(amountA, 10 ether);
        assertEq(amountB, 20 ether);
        assertGt(liquidity, 0);
        assertEq(reserveA, 10 ether);
        assertEq(reserveB, 20 ether);
        assertEq(IUniswapV2Pair(pair).balanceOf(alice), liquidity);
    }

    function testAddLiquidityExistingPoolUsesOptimalAmounts() public {
        _addTokenLiquidity(10 ether, 20 ether);

        uint256 balanceBBefore = tokenB.balanceOf(alice);

        vm.prank(alice);
        (uint256 amountA, uint256 amountB,) = router.addLiquidity(
            address(tokenA), address(tokenB), 5 ether, 20 ether, 5 ether, 10 ether, alice, block.timestamp
        );

        assertEq(amountA, 5 ether);
        assertEq(amountB, 10 ether);
        assertEq(balanceBBefore - tokenB.balanceOf(alice), 10 ether);
    }

    function testAddLiquidityRevertsWhenInitialAmountsBelowMin() public {
        vm.prank(alice);
        vm.expectRevert(bytes("UniswapV2Router: INSUFFICIENT_A_AMOUNT"));
        router.addLiquidity(
            address(tokenA), address(tokenB), 10 ether, 20 ether, 11 ether, 20 ether, alice, block.timestamp
        );
    }

    function testRemoveLiquidityReturnsUnderlyingTokens() public {
        address pair = _addTokenLiquidity(10 ether, 20 ether);
        uint256 liquidity = IUniswapV2Pair(pair).balanceOf(alice) / 2;

        vm.startPrank(alice);
        IUniswapV2Pair(pair).approve(address(router), liquidity);
        (uint256 amountA, uint256 amountB) =
            router.removeLiquidity(address(tokenA), address(tokenB), liquidity, 0, 0, alice, block.timestamp);
        vm.stopPrank();

        assertGt(amountA, 0);
        assertGt(amountB, 0);
        assertGe(tokenA.balanceOf(alice), amountA);
        assertGe(tokenB.balanceOf(alice), amountB);
    }

    function testSwapExactTokensForTokens() public {
        _addTokenLiquidity(10 ether, 10 ether);
        address[] memory path = _path(address(tokenA), address(tokenB));
        uint256[] memory expectedAmounts = router.getAmountsOut(1 ether, path);

        vm.prank(alice);
        uint256[] memory amounts = router.swapExactTokensForTokens(1 ether, 0, path, alice, block.timestamp);

        assertEq(amounts[1], expectedAmounts[1]);
        assertEq(tokenB.balanceOf(alice), 1_000 ether - 10 ether + expectedAmounts[1]);
    }

    function testSwapTokensForExactTokens() public {
        _addTokenLiquidity(10 ether, 10 ether);
        address[] memory path = _path(address(tokenA), address(tokenB));
        uint256[] memory expectedAmounts = router.getAmountsIn(1 ether, path);

        vm.prank(alice);
        uint256[] memory amounts =
            router.swapTokensForExactTokens(1 ether, expectedAmounts[0], path, alice, block.timestamp);

        assertEq(amounts[0], expectedAmounts[0]);
        assertEq(amounts[1], 1 ether);
    }

    function testMultiHopSwapExactTokensForTokens() public {
        _addTokenLiquidity(tokenA, tokenB, 10 ether, 10 ether);
        _addTokenLiquidity(tokenB, tokenC, 10 ether, 20 ether);

        address[] memory path = new address[](3);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        path[2] = address(tokenC);

        uint256[] memory expectedAmounts = router.getAmountsOut(1 ether, path);

        vm.prank(alice);
        uint256[] memory amounts = router.swapExactTokensForTokens(1 ether, 0, path, alice, block.timestamp);

        assertEq(amounts[2], expectedAmounts[2]);
        assertGt(tokenC.balanceOf(alice), 1_000 ether - 20 ether);
    }

    function testSwapRevertsForSlippageAndDeadline() public {
        _addTokenLiquidity(10 ether, 10 ether);
        address[] memory path = _path(address(tokenA), address(tokenB));

        vm.prank(alice);
        vm.expectRevert(bytes("UniswapV2Router: INSUFFICIENT_OUTPUT_AMOUNT"));
        router.swapExactTokensForTokens(1 ether, type(uint256).max, path, alice, block.timestamp);

        vm.prank(alice);
        vm.expectRevert(bytes("UniswapV2Router: EXPIRED"));
        router.swapExactTokensForTokens(1 ether, 0, path, alice, block.timestamp - 1);
    }

    function testAddLiquidityETHAndRemoveLiquidityETH() public {
        vm.prank(alice);
        (uint256 amountToken, uint256 amountETH, uint256 liquidity) = router.addLiquidityETH{value: 10 ether}(
            address(tokenA), 20 ether, 20 ether, 10 ether, alice, block.timestamp
        );

        address pair = factory.getPair(address(tokenA), address(weth));
        assertEq(amountToken, 20 ether);
        assertEq(amountETH, 10 ether);
        assertGt(liquidity, 0);
        assertEq(weth.balanceOf(pair), 10 ether);

        uint256 aliceEthBefore = alice.balance;

        vm.startPrank(alice);
        IUniswapV2Pair(pair).approve(address(router), liquidity / 2);
        (uint256 removedToken, uint256 removedETH) =
            router.removeLiquidityETH(address(tokenA), liquidity / 2, 0, 0, alice, block.timestamp);
        vm.stopPrank();

        assertGt(removedToken, 0);
        assertGt(removedETH, 0);
        assertEq(alice.balance, aliceEthBefore + removedETH);
    }

    function testSwapExactETHForTokens() public {
        _addEthLiquidity(20 ether, 10 ether);
        address[] memory path = _path(address(weth), address(tokenA));
        uint256[] memory expectedAmounts = router.getAmountsOut(1 ether, path);

        vm.prank(alice);
        uint256[] memory amounts = router.swapExactETHForTokens{value: 1 ether}(0, path, alice, block.timestamp);

        assertEq(amounts[1], expectedAmounts[1]);
        assertGt(tokenA.balanceOf(alice), 1_000 ether - 20 ether);
    }

    function testSwapExactTokensForETH() public {
        _addEthLiquidity(20 ether, 10 ether);
        address[] memory path = _path(address(tokenA), address(weth));
        uint256[] memory expectedAmounts = router.getAmountsOut(1 ether, path);
        uint256 aliceEthBefore = alice.balance;

        vm.prank(alice);
        uint256[] memory amounts = router.swapExactTokensForETH(1 ether, 0, path, alice, block.timestamp);

        assertEq(amounts[1], expectedAmounts[1]);
        assertEq(alice.balance, aliceEthBefore + expectedAmounts[1]);
    }

    function testSwapETHForExactTokensRefundsDust() public {
        _addEthLiquidity(20 ether, 10 ether);
        address[] memory path = _path(address(weth), address(tokenA));
        uint256[] memory expectedAmounts = router.getAmountsIn(1 ether, path);
        uint256 aliceEthBefore = alice.balance;

        vm.prank(alice);
        uint256[] memory amounts = router.swapETHForExactTokens{value: 2 ether}(1 ether, path, alice, block.timestamp);

        assertEq(amounts[0], expectedAmounts[0]);
        assertEq(amounts[1], 1 ether);
        assertEq(alice.balance, aliceEthBefore - expectedAmounts[0]);
    }

    function testSwapTokensForExactETH() public {
        _addEthLiquidity(20 ether, 10 ether);
        address[] memory path = _path(address(tokenA), address(weth));
        uint256[] memory expectedAmounts = router.getAmountsIn(1 ether, path);
        uint256 aliceEthBefore = alice.balance;

        vm.prank(alice);
        uint256[] memory amounts =
            router.swapTokensForExactETH(1 ether, expectedAmounts[0], path, alice, block.timestamp);

        assertEq(amounts[0], expectedAmounts[0]);
        assertEq(amounts[1], 1 ether);
        assertEq(alice.balance, aliceEthBefore + 1 ether);
    }

    function _addTokenLiquidity(uint256 amountA, uint256 amountB) private returns (address pair) {
        pair = _addTokenLiquidity(tokenA, tokenB, amountA, amountB);
    }

    function _addTokenLiquidity(MockERC20 tokenX, MockERC20 tokenY, uint256 amountX, uint256 amountY)
        private
        returns (address pair)
    {
        vm.prank(alice);
        router.addLiquidity(address(tokenX), address(tokenY), amountX, amountY, 0, 0, alice, block.timestamp);

        pair = factory.getPair(address(tokenX), address(tokenY));
    }

    function _addEthLiquidity(uint256 amountToken, uint256 amountETH) private returns (address pair) {
        vm.prank(alice);
        router.addLiquidityETH{value: amountETH}(address(tokenA), amountToken, 0, 0, alice, block.timestamp);

        pair = factory.getPair(address(tokenA), address(weth));
    }

    function _path(address token0, address token1) private pure returns (address[] memory path) {
        path = new address[](2);
        path[0] = token0;
        path[1] = token1;
    }
}
