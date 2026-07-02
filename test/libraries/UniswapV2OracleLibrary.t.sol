// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {UniswapV2OracleLibrary} from "../../src/libraries/UniswapV2OracleLibrary.sol";
import {Errors} from "../../src/libraries/Errors.sol";

contract OracleWrapper {
    function computeTwap(uint256 start, uint256 end, uint32 elapsed) external pure returns (uint224) {
        return UniswapV2OracleLibrary.computeTwap(start, end, elapsed);
    }

    function computeAmountOut(uint256 start, uint256 end, uint32 elapsed, uint256 amountIn)
        external
        pure
        returns (uint256)
    {
        return UniswapV2OracleLibrary.computeAmountOut(start, end, elapsed, amountIn);
    }

    function currentBlockTimestamp() external view returns (uint32) {
        return UniswapV2OracleLibrary.currentBlockTimestamp();
    }
}

contract UniswapV2OracleLibraryTest is Test {
    OracleWrapper internal wrapper;

    function setUp() public {
        wrapper = new OracleWrapper();
    }

    function testCurrentBlockTimestamp() public {
        uint32 ts = wrapper.currentBlockTimestamp();
        assertEq(ts, uint32(block.timestamp));
    }

    function testComputeTwap() public {
        uint256 start = 1_000_000 * 2 ** 112;
        uint256 end = start + (100 * 2 ** 112);
        uint32 elapsed = 100;

        uint224 twap = wrapper.computeTwap(start, end, elapsed);

        assertEq(twap, uint224(1 * 2 ** 112));
    }

    function testComputeTwapHandlesCumulativeWraparound() public {
        uint256 start = type(uint256).max - (50 * 2 ** 112);
        uint256 end;
        unchecked {
            end = start + (100 * 2 ** 112);
        }

        uint224 twap = wrapper.computeTwap(start, end, 100);

        assertEq(twap, uint224(1 * 2 ** 112));
    }

    function testComputeTwapRevertsForZeroTime() public {
        vm.expectRevert(Errors.OracleZeroTimeElapsed.selector);
        wrapper.computeTwap(100, 200, 0);
    }

    function testComputeAmountOut() public {
        uint256 start = 1_000_000 * 2 ** 112;
        uint256 end = start + (100 * 2 ** 112);
        uint32 elapsed = 100;
        uint256 amountIn = 2 ether;

        uint256 amountOut = wrapper.computeAmountOut(start, end, elapsed, amountIn);

        assertEq(amountOut, 2 ether);
    }

    function testComputeAmountOutWithHigherPrice() public {
        uint256 start = 1_000_000 * 2 ** 112;
        uint256 end = start + (200 * 2 ** 112);
        uint32 elapsed = 100;
        uint256 amountIn = 2 ether;

        uint256 amountOut = wrapper.computeAmountOut(start, end, elapsed, amountIn);

        assertEq(amountOut, 4 ether);
    }

    function testComputeAmountOutWithUnitPrice() public {
        uint256 start = 0;
        uint256 end = uint256(3600) * 2 ** 112;
        uint32 elapsed = 3600;

        uint256 amountOut = wrapper.computeAmountOut(start, end, elapsed, 5 ether);

        assertEq(amountOut, 5 ether);
    }
}
