// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IUniswapV2Pair} from "../interfaces/IUniswapV2Pair.sol";
import {UQ112x112} from "./UQ112x112.sol";
import {Errors} from "./Errors.sol";

library UniswapV2OracleLibrary {
    using UQ112x112 for uint224;

    function currentCumulativePrices(address pair)
        internal
        view
        returns (uint256 price0Cumulative, uint256 price1Cumulative, uint32 blockTimestamp)
    {
        blockTimestamp = currentBlockTimestamp();
        price0Cumulative = IUniswapV2Pair(pair).price0CumulativeLast();
        price1Cumulative = IUniswapV2Pair(pair).price1CumulativeLast();

        (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast) = IUniswapV2Pair(pair).getReserves();

        if (blockTimestampLast != blockTimestamp) {
            uint32 timeElapsed;

            unchecked {
                timeElapsed = blockTimestamp - blockTimestampLast;
                price0Cumulative += uint256(UQ112x112.encode(reserve1).uqdiv(reserve0)) * timeElapsed;
                price1Cumulative += uint256(UQ112x112.encode(reserve0).uqdiv(reserve1)) * timeElapsed;
            }
        }
    }

    function computeAmountOut(
        uint256 priceCumulativeStart,
        uint256 priceCumulativeEnd,
        uint32 timeElapsed,
        uint256 amountIn
    ) internal pure returns (uint256 amountOut) {
        uint224 twap = computeTwap(priceCumulativeStart, priceCumulativeEnd, timeElapsed);
        amountOut = (amountIn * twap) / uint224(2 ** 112);
    }

    function computeTwap(uint256 priceCumulativeStart, uint256 priceCumulativeEnd, uint32 timeElapsed)
        internal
        pure
        returns (uint224 twap)
    {
        if (timeElapsed == 0) revert Errors.OracleZeroTimeElapsed();
        uint256 priceCumulativeDelta;
        unchecked {
            priceCumulativeDelta = priceCumulativeEnd - priceCumulativeStart;
        }
        twap = uint224(priceCumulativeDelta / timeElapsed);
    }

    function currentBlockTimestamp() internal view returns (uint32 timestamp) {
        timestamp = uint32(block.timestamp);
    }
}
