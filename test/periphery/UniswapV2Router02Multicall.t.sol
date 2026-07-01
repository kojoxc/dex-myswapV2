// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {UniswapV2Factory} from "../../src/core/UniswapV2Factory.sol";
import {UniswapV2Pair} from "../../src/core/UniswapV2Pair.sol";
import {UniswapV2Router02} from "../../src/periphery/UniswapV2Router02.sol";
import {WETH9} from "../mocks/WETH9.t.sol";
import {MockERC20} from "../mocks/MockERC20.t.sol";

contract UniswapV2Router02MulticallTest is Test {
    UniswapV2Factory internal factory;
    UniswapV2Router02 internal router;
    WETH9 internal weth;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;
    address internal pairAddress;

    address internal alice = address(0xA11CE);

    receive() external payable {}

    function setUp() public {
        factory = new UniswapV2Factory(address(this));
        weth = new WETH9();
        router = new UniswapV2Router02(address(factory), address(weth));

        tokenA = new MockERC20("Token A", "TKNA");
        tokenB = new MockERC20("Token B", "TKNB");

        tokenA.mint(alice, 100 ether);
        tokenB.mint(alice, 100 ether);
        vm.deal(alice, 100 ether);
        pairAddress = factory.createPair(address(tokenA), address(tokenB));

        vm.startPrank(alice);
        tokenA.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(address(tokenA), address(tokenB), 10 ether, 10 ether, 0, 0, alice, block.timestamp);
        vm.stopPrank();
    }

    function test_multicall_addLiquidityAndSwap() public {
        bytes[] memory calls = new bytes[](2);

        calls[0] = abi.encodeWithSelector(
            router.addLiquidity.selector,
            address(tokenA),
            address(tokenB),
            1 ether,
            1 ether,
            0,
            0,
            alice,
            block.timestamp
        );

        calls[1] = abi.encodeWithSelector(
            router.swapExactTokensForTokens.selector, 1 ether, 0, _directPath(), alice, block.timestamp
        );

        vm.prank(alice);
        bytes[] memory results = router.multicall(calls);

        assertEq(results.length, 2, "Two results expected");
    }

    function test_multicall_revertsOnBadCall() public {
        bytes[] memory calls = new bytes[](1);

        // swap with 0 amount — invalid, should revert
        calls[0] = abi.encodeWithSelector(
            router.swapExactTokensForTokens.selector, 0, 0, _directPath(), alice, block.timestamp
        );

        vm.expectRevert();
        router.multicall(calls);
    }

    function test_multicall_removeLiquidity() public {
        uint256 lpBalance = IERC20(pairAddress).balanceOf(alice);
        assertGt(lpBalance, 0, "Alice should hold LP tokens");

        vm.prank(alice);
        IERC20(pairAddress).approve(address(router), lpBalance);

        bytes[] memory calls = new bytes[](1);
        calls[0] = abi.encodeWithSelector(
            router.removeLiquidity.selector, address(tokenA), address(tokenB), lpBalance, 0, 0, alice, block.timestamp
        );

        vm.prank(alice);
        bytes[] memory results = router.multicall(calls);

        assertEq(results.length, 1, "One result expected");
    }

    function _directPath() private view returns (address[] memory path) {
        path = new address[](2);
        path[0] = address(tokenA);
        path[1] = address(tokenB);
    }
}

interface IERC20 {
    function balanceOf(address owner) external view returns (uint256);
    function approve(address spender, uint256 value) external returns (bool);
}
