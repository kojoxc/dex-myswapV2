// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {IERC20} from "../src/interfaces/IERC20.sol";
import {UniswapV2Router02} from "../src/periphery/UniswapV2Router02.sol";

contract AddLiquidityETHScript is Script {
    function run() external returns (uint256 amountToken, uint256 amountETH, uint256 liquidity) {
        UniswapV2Router02 router = UniswapV2Router02(payable(vm.envAddress("ROUTER")));
        address token = vm.envAddress("TOKEN");
        address to = vm.envOr("LIQUIDITY_TO", msg.sender);
        uint256 amountTokenDesired = vm.envOr("AMOUNT_TOKEN", uint256(1 ether));
        uint256 amountTokenMin = vm.envOr("AMOUNT_TOKEN_MIN", uint256(0));
        uint256 amountETHMin = vm.envOr("AMOUNT_ETH_MIN", uint256(0));
        uint256 amountETHDesired = vm.envOr("AMOUNT_ETH", uint256(1 ether));
        uint256 deadline = vm.envOr("DEADLINE", block.timestamp + 20 minutes);

        vm.startBroadcast();

        IERC20(token).approve(address(router), amountTokenDesired);
        (amountToken, amountETH, liquidity) = router.addLiquidityETH{value: amountETHDesired}(
            token, amountTokenDesired, amountTokenMin, amountETHMin, to, deadline
        );

        vm.stopBroadcast();

        console2.log("AmountToken:", amountToken);
        console2.log("AmountETH:", amountETH);
        console2.log("Liquidity:", liquidity);
    }
}
