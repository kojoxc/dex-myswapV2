// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IUniswapV2ERC20} from "../interfaces/IUniswapV2ERC20.sol";
import {Errors} from "../libraries/Errors.sol";

contract UniswapV2ERC20 is IUniswapV2ERC20 {
    string public constant name = "Uniswap V2";
    string public constant symbol = "UNI-V2";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public nonces;

    bytes32 public immutable DOMAIN_SEPARATOR;
    bytes32 public constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function _mint(address to, uint256 value) internal {
        if (to == address(0)) revert Errors.ERC20MintToZero();

        totalSupply += value;
        balanceOf[to] += value;

        emit Transfer(address(0), to, value);
    }

    function _burn(address from, uint256 value) internal {
        if (from == address(0)) revert Errors.ERC20BurnFromZero();

        balanceOf[from] -= value;
        totalSupply -= value;

        emit Transfer(from, address(0), value);
    }

    function _approve(address owner, address spender, uint256 value) private {
        if (owner == address(0)) revert Errors.ERC20ApproveFromZero();
        if (spender == address(0)) revert Errors.ERC20ApproveToZero();

        allowance[owner][spender] = value;

        emit Approval(owner, spender, value);
    }

    function _transfer(address from, address to, uint256 value) private {
        if (from == address(0)) revert Errors.ERC20TransferFromZero();
        if (to == address(0)) revert Errors.ERC20TransferToZero();

        balanceOf[from] -= value;
        balanceOf[to] += value;

        emit Transfer(from, to, value);
    }

    function approve(address spender, uint256 value) external returns (bool) {
        _approve(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];

        if (currentAllowance != type(uint256).max) {
            allowance[from][msg.sender] = currentAllowance - value;
        }

        _transfer(from, to, value);
        return true;
    }

    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
    {
        if (block.timestamp > deadline) revert Errors.ERC20Expired();

        uint256 nonce = nonces[owner];

        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR,
                keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonce, deadline))
            )
        );

        address recoveredAddress = ecrecover(digest, v, r, s);

        if (recoveredAddress == address(0) || recoveredAddress != owner) revert Errors.ERC20InvalidSignature();

        nonces[owner] = nonce + 1;

        _approve(owner, spender, value);
    }
}
