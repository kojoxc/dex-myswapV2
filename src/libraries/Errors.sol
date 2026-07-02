// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Shared custom errors for the myswapV2 AMM protocol.
library Errors {
    // ── Factory ──
    error FactoryIdenticalAddresses();
    error FactoryZeroAddress();
    error FactoryPairExists();
    error FactoryForbidden();

    // ── Pair ──
    error PairLocked();
    error PairForbidden();
    error PairAlreadyInitialized();
    error PairZeroAddress();
    error PairIdenticalAddresses();
    error PairInvalidToken();
    error PairTransferFailed();
    error PairOverflow();
    error PairInsufficientInputAmount();
    error PairK();
    error PairInsufficientLiquidityMinted();
    error PairInsufficientLiquidityBurned();
    error PairInsufficientOutputAmount();
    error PairInsufficientLiquidity();
    error PairInvalidTo();

    // ── ERC20 ──
    error ERC20MintToZero();
    error ERC20BurnFromZero();
    error ERC20ApproveFromZero();
    error ERC20ApproveToZero();
    error ERC20TransferFromZero();
    error ERC20TransferToZero();
    error ERC20Expired();
    error ERC20InvalidSignature();

    // ── Router ──
    error RouterExpired();
    error RouterEthNotAccepted();
    error RouterInsufficientAAmount();
    error RouterInsufficientBAmount();
    error RouterExcessiveAAmount();
    error RouterInsufficientOutputAmount();
    error RouterExcessiveInputAmount();
    error RouterInvalidPath();
    error RouterTransferFailed();
    error RouterTransferFromFailed();
    error RouterEthTransferFailed();
    error RouterWethTransferFailed();

    // ── Library ──
    error LibraryIdenticalAddresses();
    error LibraryZeroAddress();
    error LibraryInsufficientAmount();
    error LibraryInsufficientLiquidity();
    error LibraryInsufficientInputAmount();
    error LibraryInsufficientOutputAmount();
    error LibraryInvalidPath();

    // ── Oracle ──
    error OracleZeroTimeElapsed();
}
