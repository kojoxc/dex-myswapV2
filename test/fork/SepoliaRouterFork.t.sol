// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

interface IRouterFork {
    function factory() external view returns (address);
    function WETH() external view returns (address);
    function getAmountsOut(uint256 amountIn, address[] calldata path) external view returns (uint256[] memory amounts);
    function getAmountsIn(uint256 amountOut, address[] calldata path) external view returns (uint256[] memory amounts);
}

contract SepoliaRouterForkTest is Test {
    IRouterFork internal router;
    address internal tokenIn;
    address internal tokenOut;
    uint256 internal amountIn;
    uint256 internal amountOut;
    bool internal forkConfigured;

    function setUp() public {
        string memory rpcUrl = vm.envOr("SEPOLIA_RPC_URL", string(""));
        address routerAddress = vm.envOr("SEPOLIA_ROUTER", address(0));
        tokenIn = vm.envOr("SEPOLIA_TOKEN_IN", address(0));
        tokenOut = vm.envOr("SEPOLIA_TOKEN_OUT", address(0));
        amountIn = vm.envOr("SEPOLIA_AMOUNT_IN", uint256(1_000_000));
        amountOut = vm.envOr("SEPOLIA_AMOUNT_OUT", uint256(1_000_000));

        forkConfigured =
            bytes(rpcUrl).length != 0 && routerAddress != address(0) && tokenIn != address(0) && tokenOut != address(0);
        if (!forkConfigured) return;

        vm.createSelectFork(rpcUrl);
        router = IRouterFork(routerAddress);
    }

    modifier whenForkConfigured() {
        if (!forkConfigured) return;
        _;
    }

    function testSepoliaRouterCoreAddressesAreConfigured() public view whenForkConfigured {
        assertTrue(router.factory() != address(0));
        assertTrue(router.WETH() != address(0));
    }

    function testSepoliaExactInQuote() public view whenForkConfigured {
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint256[] memory amounts = router.getAmountsOut(amountIn, path);

        assertEq(amounts[0], amountIn);
        assertGt(amounts[amounts.length - 1], 0);
    }

    function testSepoliaExactOutQuote() public view whenForkConfigured {
        address[] memory path = new address[](2);
        path[0] = tokenIn;
        path[1] = tokenOut;

        uint256[] memory amounts = router.getAmountsIn(amountOut, path);

        assertGt(amounts[0], 0);
        assertEq(amounts[amounts.length - 1], amountOut);
    }
}
