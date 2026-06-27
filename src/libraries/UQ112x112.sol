// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Library untuk unsigned fixed-point Q112.112.
/// @dev 112 bit untuk bagian integer dan 112 bit untuk bagian pecahan.
library UQ112x112 {
    uint224 internal constant Q112 = uint224(1) << 112;

    /// @notice Mengubah uint112 menjadi format UQ112x112.
    function encode(uint112 y) internal pure returns (uint224 z) {
        z = uint224(y) * Q112;
    }

    /// @notice Membagi nilai UQ112x112 dengan uint112.
    function uqdiv(
        uint224 x,
        uint112 y
    ) internal pure returns (uint224 z) {
        z = x / uint224(y);
    }
}