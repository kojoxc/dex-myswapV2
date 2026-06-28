// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {UniswapV2ERC20} from "../../src/core/UniswapV2ERC20.sol";

contract UniswapV2ERC20Harness is UniswapV2ERC20 {
    function mint(address to, uint256 value) external {
        _mint(to, value);
    }

    function burn(address from, uint256 value) external {
        _burn(from, value);
    }
}

contract UniswapV2ERC20Test is Test {
    UniswapV2ERC20Harness internal token;

    uint256 internal ownerPrivateKey = 0xA11CE;
    address internal owner;
    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    function setUp() public {
        token = new UniswapV2ERC20Harness();
        owner = vm.addr(ownerPrivateKey);
    }

    function testMetadata() public view {
        assertEq(token.name(), "Uniswap V2");
        assertEq(token.symbol(), "UNI-V2");
        assertEq(token.decimals(), 18);
    }

    function testMintBurnAndTransfer() public {
        token.mint(alice, 10 ether);

        assertEq(token.totalSupply(), 10 ether);
        assertEq(token.balanceOf(alice), 10 ether);

        vm.prank(alice);
        assertTrue(token.transfer(bob, 3 ether));

        assertEq(token.balanceOf(alice), 7 ether);
        assertEq(token.balanceOf(bob), 3 ether);

        token.burn(bob, 1 ether);

        assertEq(token.totalSupply(), 9 ether);
        assertEq(token.balanceOf(bob), 2 ether);
    }

    function testApproveAndTransferFromDecrementsAllowance() public {
        token.mint(alice, 10 ether);

        vm.prank(alice);
        assertTrue(token.approve(bob, 4 ether));

        vm.prank(bob);
        assertTrue(token.transferFrom(alice, bob, 2 ether));

        assertEq(token.allowance(alice, bob), 2 ether);
        assertEq(token.balanceOf(alice), 8 ether);
        assertEq(token.balanceOf(bob), 2 ether);
    }

    function testTransferFromWithMaxAllowanceDoesNotDecrementAllowance() public {
        token.mint(alice, 10 ether);

        vm.prank(alice);
        assertTrue(token.approve(bob, type(uint256).max));

        vm.prank(bob);
        assertTrue(token.transferFrom(alice, bob, 2 ether));

        assertEq(token.allowance(alice, bob), type(uint256).max);
    }

    function testPermitSetsAllowanceAndIncrementsNonce() public {
        uint256 value = 5 ether;
        uint256 deadline = block.timestamp + 1 days;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(ownerPrivateKey, owner, bob, value, deadline);

        token.permit(owner, bob, value, deadline, v, r, s);

        assertEq(token.allowance(owner, bob), value);
        assertEq(token.nonces(owner), 1);
    }

    function testPermitRevertsWhenExpired() public {
        uint256 deadline = block.timestamp - 1;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(ownerPrivateKey, owner, bob, 1 ether, deadline);

        vm.expectRevert(bytes("UniswapV2: EXPIRED"));
        token.permit(owner, bob, 1 ether, deadline, v, r, s);
    }

    function testPermitRevertsWithInvalidSignature() public {
        uint256 deadline = block.timestamp + 1 days;
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(ownerPrivateKey, owner, bob, 1 ether, deadline);

        vm.expectRevert(bytes("UniswapV2: INVALID_SIGNATURE"));
        token.permit(alice, bob, 1 ether, deadline, v, r, s);
    }

    function testZeroAddressGuards() public {
        vm.expectRevert(bytes("ERC20: mint to zero address"));
        token.mint(address(0), 1);

        vm.expectRevert(bytes("ERC20: burn from zero address"));
        token.burn(address(0), 1);

        (bool success,) = address(token).call(abi.encodeCall(token.transfer, (address(0), 1)));
        assertFalse(success);

        vm.expectRevert(bytes("ERC20: approve to zero address"));
        token.approve(address(0), 1);
    }

    function _signPermit(uint256 privateKey, address owner_, address spender, uint256 value, uint256 deadline)
        private
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                token.DOMAIN_SEPARATOR(),
                keccak256(abi.encode(token.PERMIT_TYPEHASH(), owner_, spender, value, token.nonces(owner_), deadline))
            )
        );

        (v, r, s) = vm.sign(privateKey, digest);
    }
}
