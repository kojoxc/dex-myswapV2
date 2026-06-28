// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {IERC20} from "../src/interfaces/IERC20.sol";
import {UniswapV2Router02} from "../src/periphery/UniswapV2Router02.sol";

contract SwapExactTokensForTokensScript is Script {
    function run() external returns (uint256[] memory amounts) {
        UniswapV2Router02 router = UniswapV2Router02(payable(vm.envAddress("ROUTER")));
        address tokenIn = vm.envAddress("TOKEN_IN");
        address tokenOut = vm.envAddress("TOKEN_OUT");
        address to = vm.envOr("SWAP_TO", msg.sender);
        uint256 amountIn = vm.envOr("AMOUNT_IN", uint256(1 ether));
        uint256 amountOutMin = vm.envOr("AMOUNT_OUT_MIN", uint256(0));
        uint256 deadline = vm.envOr("DEADLINE", block.timestamp + 20 minutes);
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        vm.startBroadcast();

        IERC20(tokenIn).approve(address(router), amountIn);
        amounts = router.swapExactTokensForTokens(amountIn, amountOutMin, path, to, deadline);

        vm.stopBroadcast();

        console2.log("AmountIn:", amounts[0]);
        console2.log("AmountOut:", amounts[1]);
    }
}
