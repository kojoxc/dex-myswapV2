// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";

import {UniswapV2Factory} from "../../src/core/UniswapV2Factory.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {WETH9} from "../../src/mocks/WETH9.sol";
import {UniswapV2Router02} from "../../src/periphery/UniswapV2Router02.sol";
import {IUniswapV2Pair} from "../../src/interfaces/IUniswapV2Pair.sol";
import {Errors} from "../../src/libraries/Errors.sol";

contract FalseTransferFromToken is ERC20 {
    constructor() ERC20("False Transfer", "FALSE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}

contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee Token", "FEE") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0xdead), fee);
            super._update(from, to, value - fee);
            return;
        }

        super._update(from, to, value);
    }
}

contract RouterTokenBehaviorTest is Test {
    UniswapV2Factory internal factory;
    UniswapV2Router02 internal router;
    WETH9 internal weth;
    MockERC20 internal tokenB;
    address internal alice = address(0xA11CE);

    function setUp() public {
        factory = new UniswapV2Factory(address(this));
        weth = new WETH9();
        router = new UniswapV2Router02(address(factory), address(weth));
        tokenB = new MockERC20("Token B", "TKNB");
        tokenB.mint(alice, 1_000 ether);
    }

    function testRouterRejectsTokenReturningFalseFromTransferFrom() public {
        FalseTransferFromToken falseToken = new FalseTransferFromToken();
        falseToken.mint(alice, 1_000 ether);

        vm.startPrank(alice);
        falseToken.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);

        vm.expectRevert(Errors.RouterTransferFromFailed.selector);
        router.addLiquidity(address(falseToken), address(tokenB), 10 ether, 10 ether, 0, 0, alice, block.timestamp);
        vm.stopPrank();
    }

    function testFeeOnTransferInputTokenIsNotSupportedByStandardSwapPath() public {
        FeeOnTransferToken feeToken = new FeeOnTransferToken();
        feeToken.mint(alice, 1_000 ether);

        vm.startPrank(alice);
        feeToken.approve(address(router), type(uint256).max);
        tokenB.approve(address(router), type(uint256).max);
        router.addLiquidity(address(feeToken), address(tokenB), 100 ether, 100 ether, 0, 0, alice, block.timestamp);

        address[] memory path = new address[](2);
        path[0] = address(feeToken);
        path[1] = address(tokenB);

        vm.expectRevert(Errors.PairK.selector);
        router.swapExactTokensForTokens(1 ether, 0, path, alice, block.timestamp);
        vm.stopPrank();
    }

    function testFeeOnTransferInputTokenIsSupportedBySupportingFunction() public {
        FeeOnTransferToken feeToken = new FeeOnTransferToken();
        feeToken.mint(alice, 1_000 ether);

        address pair = factory.createPair(address(feeToken), address(tokenB));

        vm.startPrank(alice);
        feeToken.transfer(pair, 101 ether);
        tokenB.transfer(pair, 100 ether);
        vm.stopPrank();

        IUniswapV2Pair(pair).mint(alice);

        vm.startPrank(alice);
        feeToken.approve(address(router), type(uint256).max);
        address[] memory path = new address[](2);
        path[0] = address(feeToken);
        path[1] = address(tokenB);

        uint256 balanceBefore = tokenB.balanceOf(alice);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(1 ether, 0, path, alice, block.timestamp);
        uint256 amountOut = tokenB.balanceOf(alice) - balanceBefore;

        assertGt(amountOut, 0);
        vm.stopPrank();
    }

    function testSupportingFeeOnTransferSwapWorksWhenInputIsToken1() public {
        FeeOnTransferToken feeToken = new FeeOnTransferToken();
        feeToken.mint(alice, 1_000 ether);

        address pair = factory.createPair(address(feeToken), address(tokenB));

        vm.startPrank(alice);
        feeToken.transfer(pair, 101 ether);
        tokenB.transfer(pair, 100 ether);
        vm.stopPrank();

        IUniswapV2Pair(pair).mint(alice);

        address input = IUniswapV2Pair(pair).token0() == address(feeToken) ? address(tokenB) : address(feeToken);
        address output = input == address(tokenB) ? address(feeToken) : address(tokenB);

        vm.startPrank(alice);
        ERC20(input).approve(address(router), type(uint256).max);
        address[] memory path = new address[](2);
        path[0] = input;
        path[1] = output;

        uint256 balanceBefore = ERC20(output).balanceOf(alice);
        router.swapExactTokensForTokensSupportingFeeOnTransferTokens(1 ether, 0, path, alice, block.timestamp);
        uint256 amountOut = ERC20(output).balanceOf(alice) - balanceBefore;

        assertGt(amountOut, 0);
        vm.stopPrank();
    }

    function testFeeOnTransferTokensSupportingSwapExactETHForTokens() public {
        vm.deal(alice, 100 ether);
        FeeOnTransferToken feeToken = new FeeOnTransferToken();
        feeToken.mint(alice, 1_000 ether);

        address pair = factory.createPair(address(feeToken), address(weth));

        vm.startPrank(alice);
        feeToken.transfer(pair, 101 ether);
        vm.stopPrank();

        weth.deposit{value: 100 ether}();
        weth.transfer(pair, 100 ether);

        IUniswapV2Pair(pair).mint(alice);

        address[] memory path = new address[](2);
        path[0] = address(weth);
        path[1] = address(feeToken);

        vm.prank(alice);
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: 1 ether}(0, path, alice, block.timestamp);

        assertGt(feeToken.balanceOf(alice), 0);
    }

    function testFeeOnTransferTokensSupportingSwapExactTokensForETH() public {
        vm.deal(alice, 100 ether);
        FeeOnTransferToken feeToken = new FeeOnTransferToken();
        feeToken.mint(alice, 1_000 ether);

        address pair = factory.createPair(address(feeToken), address(weth));

        vm.startPrank(alice);
        feeToken.transfer(pair, 101 ether);
        feeToken.approve(address(router), type(uint256).max);
        vm.stopPrank();

        weth.deposit{value: 100 ether}();
        weth.transfer(pair, 100 ether);

        IUniswapV2Pair(pair).mint(alice);

        address[] memory path = new address[](2);
        path[0] = address(feeToken);
        path[1] = address(weth);

        uint256 ethBefore = alice.balance;

        vm.prank(alice);
        router.swapExactTokensForETHSupportingFeeOnTransferTokens(1 ether, 0, path, alice, block.timestamp);

        assertGt(alice.balance, ethBefore);
    }

    function testRemoveLiquidityETHSupportingFeeOnTransferTokens() public {
        vm.deal(alice, 100 ether);
        FeeOnTransferToken feeToken = new FeeOnTransferToken();
        feeToken.mint(alice, 1_000 ether);

        address pair = factory.createPair(address(feeToken), address(weth));

        vm.startPrank(alice);
        feeToken.transfer(pair, 101 ether);
        weth.deposit{value: 100 ether}();
        weth.transfer(pair, 100 ether);
        vm.stopPrank();

        uint256 liquidity = IUniswapV2Pair(pair).mint(alice);

        vm.startPrank(alice);
        IUniswapV2Pair(pair).approve(address(router), liquidity);

        vm.expectRevert(Errors.RouterTransferFailed.selector);
        router.removeLiquidityETH(address(feeToken), liquidity, 0, 0, alice, block.timestamp);

        uint256 ethBefore = alice.balance;
        router.removeLiquidityETHSupportingFeeOnTransferTokens(
            address(feeToken), liquidity, 0, 0, alice, block.timestamp
        );

        assertGt(alice.balance, ethBefore);
        assertGt(feeToken.balanceOf(alice), 0);
        vm.stopPrank();
    }

    receive() external payable {}
}
