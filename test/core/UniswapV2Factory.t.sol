// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {UniswapV2Factory} from "../../src/core/UniswapV2Factory.sol";
import {IUniswapV2Pair} from "../../src/interfaces/IUniswapV2Pair.sol";
import {MockERC20} from "../../src/mocks/MockERC20.sol";

contract UniswapV2FactoryTest is Test {
    UniswapV2Factory internal factory;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        factory = new UniswapV2Factory(address(this));
        tokenA = new MockERC20("Token A", "TKNA");
        tokenB = new MockERC20("Token B", "TKNB");
    }

    function testCreatePairStoresOrderedPair() public {
        address pair = factory.createPair(address(tokenA), address(tokenB));
        (address token0, address token1) = _sortTokens(address(tokenA), address(tokenB));

        assertEq(factory.getPair(address(tokenA), address(tokenB)), pair);
        assertEq(factory.getPair(address(tokenB), address(tokenA)), pair);
        assertEq(factory.allPairs(0), pair);
        assertEq(factory.allPairsLength(), 1);

        assertEq(IUniswapV2Pair(pair).factory(), address(factory));
        assertEq(IUniswapV2Pair(pair).token0(), token0);
        assertEq(IUniswapV2Pair(pair).token1(), token1);
    }

    function testCreatePairRevertsForDuplicatePair() public {
        factory.createPair(address(tokenA), address(tokenB));

        vm.expectRevert(bytes("UniswapV2: PAIR_EXISTS"));
        factory.createPair(address(tokenB), address(tokenA));
    }

    function testCreatePairRevertsForIdenticalAddresses() public {
        vm.expectRevert(bytes("UniswapV2: IDENTICAL_ADDRESSES"));
        factory.createPair(address(tokenA), address(tokenA));
    }

    function testCreatePairRevertsForZeroAddress() public {
        vm.expectRevert(bytes("UniswapV2: ZERO_ADDRESS"));
        factory.createPair(address(0), address(tokenB));
    }

    function testOnlyFeeToSetterCanSetFeeTo() public {
        vm.prank(alice);
        vm.expectRevert(bytes("UniswapV2: FORBIDDEN"));
        factory.setFeeTo(bob);

        factory.setFeeTo(bob);

        assertEq(factory.feeTo(), bob);
    }

    function testFeeToSetterCanBeTransferred() public {
        factory.setFeeToSetter(alice);

        assertEq(factory.feeToSetter(), alice);

        vm.prank(alice);
        factory.setFeeTo(bob);

        assertEq(factory.feeTo(), bob);
    }

    function _sortTokens(address tokenA_, address tokenB_) private pure returns (address token0, address token1) {
        (token0, token1) = tokenA_ < tokenB_ ? (tokenA_, tokenB_) : (tokenB_, tokenA_);
    }
}
