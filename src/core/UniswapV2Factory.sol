// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IUniswapV2Factory} from "../interfaces/IUniswapV2Factory.sol";
import {IUniswapV2Pair} from "../interfaces/IUniswapV2Pair.sol";
import {UniswapV2Pair} from "./UniswapV2Pair.sol";
import {Errors} from "../libraries/Errors.sol";

contract UniswapV2Factory is IUniswapV2Factory {
    address public override feeTo;
    address public override feeToSetter;

    mapping(address => mapping(address => address)) public override getPair;
    address[] public override allPairs;

    constructor(address feeToSetter_) {
        feeToSetter = feeToSetter_;
    }

    function allPairsLength() external view override returns (uint256) {
        return allPairs.length;
    }

    function createPair(address tokenA, address tokenB) external override returns (address pair) {
        if (tokenA == tokenB) revert Errors.FactoryIdenticalAddresses();

        (address token0, address token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);

        if (token0 == address(0)) revert Errors.FactoryZeroAddress();
        if (getPair[token0][token1] != address(0)) revert Errors.FactoryPairExists();

        bytes32 salt = keccak256(abi.encodePacked(token0, token1));
        UniswapV2Pair _pair = new UniswapV2Pair{salt: salt}();
        pair = address(_pair);

        IUniswapV2Pair(pair).initialize(token0, token1);

        getPair[token0][token1] = pair;
        getPair[token1][token0] = pair;
        allPairs.push(pair);

        emit PairCreated(token0, token1, pair, allPairs.length);
    }

    function setFeeTo(address newFeeTo) external override {
        if (msg.sender != feeToSetter) revert Errors.FactoryForbidden();
        feeTo = newFeeTo;
    }

    function setFeeToSetter(address newFeeSetter) external override {
        if (msg.sender != feeToSetter) revert Errors.FactoryForbidden();
        feeToSetter = newFeeSetter;
    }
}
