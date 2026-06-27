// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {MockERC20} from "../../src/mocks/MockERC20.sol";

contract MockERC20Test is Test {
    MockERC20 internal token;

    address internal alice = address(0xA11CE);

    function setUp() public {
        token = new MockERC20("Mock Token", "MOCK");
    }

    function testMintIncreasesBalanceAndSupply() public {
        token.mint(alice, 100 ether);

        assertEq(token.balanceOf(alice), 100 ether);
        assertEq(token.totalSupply(), 100 ether);
    }

    function testMintToZeroAddressReverts() public {
        vm.expectRevert();
        token.mint(address(0), 1);
    }
}
