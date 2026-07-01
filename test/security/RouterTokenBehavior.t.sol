// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Test} from "forge-std/Test.sol";

import {UniswapV2Factory} from "../../src/core/UniswapV2Factory.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";
import {WETH9} from "../../src/mocks/WETH9.sol";
import {UniswapV2Router02} from "../../src/periphery/UniswapV2Router02.sol";

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

        vm.expectRevert(bytes("UniswapV2Router: TRANSFER_FROM_FAILED"));
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

        vm.expectRevert(bytes("UniswapV2: K"));
        router.swapExactTokensForTokens(1 ether, 0, path, alice, block.timestamp);
        vm.stopPrank();
    }
}
