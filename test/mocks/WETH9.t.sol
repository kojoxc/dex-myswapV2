// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {WETH9} from "../../src/mocks/WETH9.sol";

contract WETH9Test is Test {
    WETH9 internal weth;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        weth = new WETH9();
        vm.deal(alice, 10 ether);
    }

    function testMetadataMatchesWeth() public view {
        assertEq(weth.name(), "Wrapped Ether");
        assertEq(weth.symbol(), "WETH");
        assertEq(weth.decimals(), 18);
    }

    function testDepositWrapsEther() public {
        vm.prank(alice);
        weth.deposit{value: 1 ether}();

        assertEq(weth.balanceOf(alice), 1 ether);
        assertEq(weth.totalSupply(), 1 ether);
        assertEq(address(weth).balance, 1 ether);
    }

    function testReceiveWrapsEther() public {
        vm.prank(alice);
        (bool success,) = address(weth).call{value: 1 ether}("");

        assertTrue(success);
        assertEq(weth.balanceOf(alice), 1 ether);
    }

    function testWithdrawUnwrapsEther() public {
        vm.startPrank(alice);
        weth.deposit{value: 1 ether}();
        weth.withdraw(0.4 ether);
        vm.stopPrank();

        assertEq(weth.balanceOf(alice), 0.6 ether);
        assertEq(alice.balance, 9.4 ether);
        assertEq(weth.totalSupply(), 0.6 ether);
    }

    function testTransferFromUsesAllowance() public {
        vm.startPrank(alice);
        weth.deposit{value: 1 ether}();
        weth.approve(bob, 0.5 ether + 1 ether);
        vm.stopPrank();

        vm.prank(bob);
        assertTrue(weth.transferFrom(alice, bob, 0.5 ether));

        assertEq(weth.balanceOf(alice), 0.5 ether);
        assertEq(weth.balanceOf(bob), 0.5 ether);
        assertEq(weth.allowance(alice, bob), 1 ether);
    }

    function testWithdrawRevertsWhensBalanceInsufficient() public {
        vm.expectRevert();
        weth.withdraw(1 ether);
    }

    function testTransferFromUsersRevertWhensBalanceInsufficient() public {
        vm.startPrank(bob);
        vm.expectRevert();
        weth.transfer(alice, 1 ether);
        vm.stopPrank();
    }
}
