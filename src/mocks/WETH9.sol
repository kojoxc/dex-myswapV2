// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract WETH9 {
    string private constant NAME = "Wrapped Ether";
    string private constant SYMBOL = "WETH";
    uint8 private constant DECIMALS = 18;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Deposit(address indexed dst, uint256 wad);
    event Withdrawal(address indexed src, uint256 wad);

    error InsufficientBalance();
    error EtherTransferFailed();

    receive() external payable {
        deposit();
    }

    function name() external pure returns (string memory) {
        return NAME;
    }

    function symbol() external pure returns (string memory) {
        return SYMBOL;
    }

    function decimals() external pure returns (uint8) {
        return DECIMALS;
    }

    function deposit() public payable {
        balanceOf[msg.sender] += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    function withdraw(uint256 wad) external {
        if (balanceOf[msg.sender] < wad) revert InsufficientBalance();

        balanceOf[msg.sender] -= wad;
        (bool success,) = msg.sender.call{value: wad}("");
        if (!success) revert EtherTransferFailed();

        emit Withdrawal(msg.sender, wad);
    }

    function totalSupply() external view returns (uint256) {
        return address(this).balance;
    }

    function approve(address guy, uint256 wad) external returns (bool) {
        allowance[msg.sender][guy] = wad;
        emit Approval(msg.sender, guy, wad);
        return true;
    }

    function transfer(address dst, uint256 wad) external returns (bool) {
        return transferFrom(msg.sender, dst, wad);
    }

    function transferFrom(address src, address dst, uint256 wad) public returns (bool) {
        if (balanceOf[src] < wad) revert InsufficientBalance();

        if (src != msg.sender && allowance[src][msg.sender] != type(uint256).max) {
            allowance[src][msg.sender] -= wad;
        }

        balanceOf[src] -= wad;
        balanceOf[dst] += wad;

        emit Transfer(src, dst, wad);
        return true;
    }
}
