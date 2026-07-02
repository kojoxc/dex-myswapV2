// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {UniswapV2Factory} from "../src/core/UniswapV2Factory.sol";
import {WETH9} from "../src/mocks/WETH9.sol";
import {UniswapV2Router02} from "../src/periphery/UniswapV2Router02.sol";

contract DeployCoreScript is Script {
    function run() external returns (UniswapV2Factory factory, address weth, UniswapV2Router02 router) {
        address feeToSetter = vm.envOr("FEE_TO_SETTER", msg.sender);
        address configuredWeth = vm.envOr("WETH_ADDRESS", address(0));

        vm.startBroadcast();

        if (configuredWeth == address(0)) {
            weth = address(new WETH9());
        } else {
            weth = configuredWeth;
        }

        factory = new UniswapV2Factory(feeToSetter);
        router = new UniswapV2Router02(address(factory), weth);

        vm.stopBroadcast();

        console2.log("Factory:", address(factory));
        console2.log("WETH:", weth);
        console2.log("Router:", address(router));
        console2.log("FeeToSetter:", feeToSetter);

        _writeDeployment(address(factory), weth, address(router));
    }

    function _writeDeployment(address factory, address weth, address router) private {
        string memory chainId = vm.toString(block.chainid);
        string memory json = string.concat(
            "{\n",
            "  \"chainId\": ",
            chainId,
            ",\n",
            "  \"factory\": \"",
            vm.toString(factory),
            "\",\n",
            "  \"router\": \"",
            vm.toString(router),
            "\",\n",
            "  \"weth\": \"",
            vm.toString(weth),
            "\",\n",
            "  \"tokens\": []\n",
            "}\n"
        );
        string memory root = vm.projectRoot();
        vm.writeFile(string.concat(root, "/deployments/", chainId, ".json"), json);
        vm.writeFile(string.concat(root, "/frontend/public/deployments/", chainId, ".json"), json);
    }
}
