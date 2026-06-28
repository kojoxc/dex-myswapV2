// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {IERC20} from "../src/interfaces/IERC20.sol";
import {UniswapV2Router02} from "../src/periphery/UniswapV2Router02.sol";

contract AddLiquidityScript is Script {
    function run() external returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        UniswapV2Router02 router = UniswapV2Router02(payable(vm.envAddress("ROUTER")));
        address tokenA = vm.envAddress("TOKEN_A");
        address tokenB = vm.envAddress("TOKEN_B");
        address to = vm.envOr("LIQUIDITY_TO", msg.sender);
        uint256 amountADesired = vm.envOr("AMOUNT_A", uint256(1 ether));
        uint256 amountBDesired = vm.envOr("AMOUNT_B", uint256(1 ether));
        uint256 amountAMin = vm.envOr("AMOUNT_A_MIN", uint256(0));
        uint256 amountBMin = vm.envOr("AMOUNT_B_MIN", uint256(0));
        uint256 deadline = vm.envOr("DEADLINE", block.timestamp + 20 minutes);

        vm.startBroadcast();

        IERC20(tokenA).approve(address(router), amountADesired);
        IERC20(tokenB).approve(address(router), amountBDesired);
        (amountA, amountB, liquidity) =
            router.addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin, to, deadline);

        vm.stopBroadcast();

        console2.log("AmountA:", amountA);
        console2.log("AmountB:", amountB);
        console2.log("Liquidity:", liquidity);
    }
}
