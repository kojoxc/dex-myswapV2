// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {UniswapV2Factory} from "../../src/core/UniswapV2Factory.sol";
import {IUniswapV2Pair} from "../../src/interfaces/IUniswapV2Pair.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {UniswapV2Library} from "../../src/periphery/UniswapV2Library.sol";
import {Errors} from "../../src/libraries/Errors.sol";

contract UniswapV2LibraryHarness {
    function sortTokens(address tokenA, address tokenB) external pure returns (address token0, address token1) {
        return UniswapV2Library.sortTokens(tokenA, tokenB);
    }

    function pairFor(address factory, address tokenA, address tokenB) external pure returns (address pair) {
        return UniswapV2Library.pairFor(factory, tokenA, tokenB);
    }

    function getReserves(address factory, address tokenA, address tokenB)
        external
        view
        returns (uint256 reserveA, uint256 reserveB)
    {
        return UniswapV2Library.getReserves(factory, tokenA, tokenB);
    }

    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) external pure returns (uint256 amountB) {
        return UniswapV2Library.quote(amountA, reserveA, reserveB);
    }

    function getAmountOut(uint256 amountIn, uint256 reserveIn, uint256 reserveOut)
        external
        pure
        returns (uint256 amountOut)
    {
        return UniswapV2Library.getAmountOut(amountIn, reserveIn, reserveOut);
    }

    function getAmountIn(uint256 amountOut, uint256 reserveIn, uint256 reserveOut)
        external
        pure
        returns (uint256 amountIn)
    {
        return UniswapV2Library.getAmountIn(amountOut, reserveIn, reserveOut);
    }

    function getAmountsOut(address factory, uint256 amountIn, address[] memory path)
        external
        view
        returns (uint256[] memory amounts)
    {
        return UniswapV2Library.getAmountsOut(factory, amountIn, path);
    }

    function getAmountsIn(address factory, uint256 amountOut, address[] memory path)
        external
        view
        returns (uint256[] memory amounts)
    {
        return UniswapV2Library.getAmountsIn(factory, amountOut, path);
    }
}

contract UniswapV2LibraryTest is Test {
    UniswapV2LibraryHarness internal libraryHarness;
    UniswapV2Factory internal factory;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;
    MockERC20 internal tokenC;

    function setUp() public {
        libraryHarness = new UniswapV2LibraryHarness();
        factory = new UniswapV2Factory(address(this));
        tokenA = new MockERC20("Token A", "TKNA");
        tokenB = new MockERC20("Token B", "TKNB");
        tokenC = new MockERC20("Token C", "TKNC");
    }

    function testSortTokensOrdersAddresses() public view {
        (address token0, address token1) = libraryHarness.sortTokens(address(tokenA), address(tokenB));

        assertLt(uint160(token0), uint160(token1));
        assertTrue(token0 == address(tokenA) || token0 == address(tokenB));
        assertTrue(token1 == address(tokenA) || token1 == address(tokenB));
    }

    function testSortTokensRevertsForInvalidInputs() public {
        vm.expectRevert(Errors.LibraryIdenticalAddresses.selector);
        libraryHarness.sortTokens(address(tokenA), address(tokenA));

        vm.expectRevert(Errors.LibraryZeroAddress.selector);
        libraryHarness.sortTokens(address(0), address(tokenA));
    }

    function testPairForAndGetReserves() public {
        address pair = _createPairWithLiquidity(tokenA, tokenB, 5 ether, 10 ether);

        assertEq(libraryHarness.pairFor(address(factory), address(tokenA), address(tokenB)), pair);

        (uint256 reserveA, uint256 reserveB) =
            libraryHarness.getReserves(address(factory), address(tokenA), address(tokenB));

        assertEq(reserveA, 5 ether);
        assertEq(reserveB, 10 ether);

        (uint256 reserveBReverse, uint256 reserveAReverse) =
            libraryHarness.getReserves(address(factory), address(tokenB), address(tokenA));

        assertEq(reserveBReverse, 10 ether);
        assertEq(reserveAReverse, 5 ether);
    }

    function testGetReservesRevertsWhenPairDoesNotExist() public {
        vm.expectRevert();
        libraryHarness.getReserves(address(factory), address(tokenA), address(tokenB));
    }

    function testPairForReturnsDeterministicAddressForNonExistentPair() public view {
        address computed = libraryHarness.pairFor(address(factory), address(tokenA), address(tokenB));
        assertTrue(computed != address(0));
        assertEq(computed.code.length, 0);
    }

    function testQuoteAndAmountMath() public view {
        assertEq(libraryHarness.quote(2 ether, 5 ether, 10 ether), 4 ether);

        uint256 amountOut = libraryHarness.getAmountOut(1 ether, 5 ether, 10 ether);
        uint256 expectedOut = (uint256(1 ether) * 997 * 10 ether) / (uint256(5 ether) * 1_000 + 1 ether * 997);
        assertEq(amountOut, expectedOut);

        uint256 amountIn = libraryHarness.getAmountIn(amountOut, 5 ether, 10 ether);
        assertGe(amountIn, 1 ether);
    }

    function testQuoteAndAmountMathRevertsForInvalidInputs() public {
        vm.expectRevert(Errors.LibraryInsufficientAmount.selector);
        libraryHarness.quote(0, 5 ether, 10 ether);

        vm.expectRevert(Errors.LibraryInsufficientLiquidity.selector);
        libraryHarness.quote(1 ether, 0, 10 ether);

        vm.expectRevert(Errors.LibraryInsufficientInputAmount.selector);
        libraryHarness.getAmountOut(0, 5 ether, 10 ether);

        vm.expectRevert(Errors.LibraryInsufficientOutputAmount.selector);
        libraryHarness.getAmountIn(0, 5 ether, 10 ether);

        vm.expectRevert(Errors.LibraryInsufficientLiquidity.selector);
        libraryHarness.getAmountIn(10 ether, 5 ether, 10 ether);
    }

    function testGetAmountsOutAndInForMultiHopPath() public {
        _createPairWithLiquidity(tokenA, tokenB, 5 ether, 10 ether);
        _createPairWithLiquidity(tokenB, tokenC, 10 ether, 20 ether);

        address[] memory path = new address[](3);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
        path[2] = address(tokenC);

        uint256[] memory amountsOut = libraryHarness.getAmountsOut(address(factory), 1 ether, path);

        assertEq(amountsOut.length, 3);
        assertEq(amountsOut[0], 1 ether);
        assertGt(amountsOut[1], 0);
        assertGt(amountsOut[2], 0);

        uint256[] memory amountsIn = libraryHarness.getAmountsIn(address(factory), amountsOut[2], path);

        assertEq(amountsIn.length, 3);
        assertLe(amountsIn[0], 1 ether + 2);
        assertEq(amountsIn[2], amountsOut[2]);
    }

    function testGetAmountsRevertsForInvalidPath() public {
        address[] memory path = new address[](1);
        path[0] = address(tokenA);

        vm.expectRevert(Errors.LibraryInvalidPath.selector);
        libraryHarness.getAmountsOut(address(factory), 1 ether, path);

        vm.expectRevert(Errors.LibraryInvalidPath.selector);
        libraryHarness.getAmountsIn(address(factory), 1 ether, path);
    }

    function _createPairWithLiquidity(MockERC20 left, MockERC20 right, uint256 leftAmount, uint256 rightAmount)
        private
        returns (address pair)
    {
        pair = factory.createPair(address(left), address(right));

        left.mint(pair, leftAmount);
        right.mint(pair, rightAmount);

        IUniswapV2Pair(pair).mint(address(this));
    }
}
