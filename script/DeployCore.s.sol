// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {UniswapV2Factory} from "../src/core/UniswapV2Factory.sol";
import {WETH9} from "../src/mocks/WETH9.sol";
import {UniswapV2Router02} from "../src/periphery/UniswapV2Router02.sol";

contract DeployCoreScript is Script {
    function run() external returns (UniswapV2Factory factory, WETH9 weth, UniswapV2Router02 router) {
        address feeToSetter = vm.envOr("FEE_TO_SETTER", msg.sender);

        vm.startBroadcast();

        weth = new WETH9();
        factory = new UniswapV2Factory(feeToSetter);
        router = new UniswapV2Router02(address(factory), address(weth));

        vm.stopBroadcast();

        console2.log("Factory:", address(factory));
        console2.log("WETH:", address(weth));
        console2.log("Router:", address(router));
        console2.log("FeeToSetter:", feeToSetter);
    }
}
