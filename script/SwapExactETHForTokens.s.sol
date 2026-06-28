// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {UniswapV2Router02} from "../src/periphery/UniswapV2Router02.sol";

contract SwapExactETHForTokensScript is Script {
    function run() external returns (uint256[] memory amounts) {
        UniswapV2Router02 router = UniswapV2Router02(payable(vm.envAddress("ROUTER")));
        address weth = router.WETH();
        address tokenOut = vm.envAddress("TOKEN_OUT");
        address to = vm.envOr("SWAP_TO", msg.sender);
        uint256 amountETHIn = vm.envOr("AMOUNT_ETH_IN", uint256(1 ether));
        uint256 amountOutMin = vm.envOr("AMOUNT_OUT_MIN", uint256(0));
        uint256 deadline = vm.envOr("DEADLINE", block.timestamp + 20 minutes);
        address[] memory path = new address[](2);
        path[0] = weth;
        path[1] = tokenOut;

        vm.startBroadcast();

        amounts = router.swapExactETHForTokens{value: amountETHIn}(amountOutMin, path, to, deadline);

        vm.stopBroadcast();

        console2.log("AmountETHIn:", amounts[0]);
        console2.log("AmountTokenOut:", amounts[1]);
    }
}
