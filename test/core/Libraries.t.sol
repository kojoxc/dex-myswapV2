// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {Math} from "../../src/libraries/Math.sol";
import {UQ112x112} from "../../src/libraries/UQ112x112.sol";

contract LibrariesTest is Test {
    function testMathMin() public pure {
        assertEq(Math.min(1, 2), 1);
        assertEq(Math.min(2, 1), 1);
    }

    function testMathSqrt() public pure {
        assertEq(Math.sqrt(0), 0);
        assertEq(Math.sqrt(1), 1);
        assertEq(Math.sqrt(2), 1);
        assertEq(Math.sqrt(3), 1);
        assertEq(Math.sqrt(4), 2);
        assertEq(Math.sqrt(8), 2);
        assertEq(Math.sqrt(9), 3);
        assertEq(Math.sqrt(10), 3);
    }

    function testUQ112x112EncodeAndDivide() public pure {
        uint224 encoded = UQ112x112.encode(5);

        assertEq(encoded, uint224(5) << 112);
        assertEq(UQ112x112.uqdiv(encoded, 2), (uint224(5) << 112) / 2);
    }
}
