// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";

import {UniswapV2Factory} from "../src/core/UniswapV2Factory.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {WETH9} from "../src/mocks/WETH9.sol";
import {UniswapV2Router02} from "../src/periphery/UniswapV2Router02.sol";

contract DeployLocalScript is Script {
    function run()
        external
        returns (UniswapV2Factory factory, WETH9 weth, UniswapV2Router02 router, MockERC20 tokenA, MockERC20 tokenB)
    {
        address feeToSetter = vm.envOr("FEE_TO_SETTER", msg.sender);
        address initialHolder = vm.envOr("INITIAL_HOLDER", msg.sender);
        uint256 initialSupply = vm.envOr("INITIAL_SUPPLY", uint256(1_000_000 ether));

        vm.startBroadcast();

        weth = new WETH9();
        factory = new UniswapV2Factory(feeToSetter);
        router = new UniswapV2Router02(address(factory), address(weth));
        tokenA = new MockERC20("Token A", "TKNA");
        tokenB = new MockERC20("Token B", "TKNB");

        tokenA.mint(initialHolder, initialSupply);
        tokenB.mint(initialHolder, initialSupply);

        vm.stopBroadcast();

        console2.log("Factory:", address(factory));
        console2.log("WETH:", address(weth));
        console2.log("Router:", address(router));
        console2.log("TokenA:", address(tokenA));
        console2.log("TokenB:", address(tokenB));
        console2.log("InitialHolder:", initialHolder);
        console2.log("InitialSupply:", initialSupply);

        _writeDeployment(address(factory), address(weth), address(router), address(tokenA), address(tokenB));
    }

    function _writeDeployment(address factory, address weth, address router, address tokenA, address tokenB) private {
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
            "  \"tokens\": [\n",
            "    { \"address\": \"",
            vm.toString(tokenA),
            "\", \"symbol\": \"TKNA\", \"name\": \"Token A\", \"decimals\": 18 },\n",
            "    { \"address\": \"",
            vm.toString(tokenB),
            "\", \"symbol\": \"TKNB\", \"name\": \"Token B\", \"decimals\": 18 }\n",
            "  ]\n",
            "}\n"
        );
        string memory root = vm.projectRoot();
        vm.writeFile(string.concat(root, "/deployments/", chainId, ".json"), json);
        vm.writeFile(string.concat(root, "/frontend/public/deployments/", chainId, ".json"), json);
    }
}
