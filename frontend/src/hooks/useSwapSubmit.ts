import { useEffect, useMemo, useState } from "react";
import { type Address } from "viem";
import { useWriteContract } from "wagmi";

import { routerAbi } from "../abis";
import { useApproval } from "./useApproval";
import { normalizeTransactionError } from "../lib/errors";
import { formatDisplayAmount, formatTokenAmount } from "../lib/format";
import { isNativeAddress } from "../lib/tokenRegistry";
import type { HistoryEntry } from "./useTransactionHistory";
import type { TokenInfo, TransactionState } from "../types";

function resolveAddress(address: string, weth: Address | undefined): Address {
    if (isNativeAddress(address) && weth) return weth;
    return address as Address;
}

type UseSwapSubmitArgs = {
    account: Address | undefined;
    publicClient: {
        waitForTransactionReceipt: (args: { hash: `0x${string}` }) => Promise<{
            status: string;
            blockNumber: bigint;
            transactionIndex: number;
        }>;
    } | undefined;
    isConnected: boolean;
    routerAddress: string;
    hasValidRouter: boolean;
    tokenIn: {
        token?: TokenInfo;
        balance?: bigint;
        allowance?: bigint;
        refetch: () => void;
    };
    tokenOut: {
        token?: TokenInfo;
        balance?: bigint;
        refetch: () => void;
    };
    tokenInAddress: string;
    tokenOutAddress: string;
    tokenInIsNative: boolean;
    tokenOutIsNative: boolean;
    wethAddress: Address | undefined;
    amount: string;
    slippageBps: number;
    deadlineMinutes: number;
    quote: {
        amountIn?: bigint;
        amountOut?: bigint;
        amountOutMin?: bigint;
        isLoading: boolean;
        error?: string;
        updatedAt?: number;
        path?: Address[];
        refetch: () => void;
    };
    addHistoryEntry: (entry: HistoryEntry) => void;
    openConnectModal?: () => void;
};

export function useSwapSubmit(args: UseSwapSubmitArgs) {
    const { writeContractAsync, isPending: isSwapPending } = useWriteContract();
    const { approve, isApproving } = useApproval();
    const [tx, setTx] = useState<TransactionState>({ title: "", status: "idle" });
    const [isConfirming, setIsConfirming] = useState(false);
    const [isRefreshingQuote, setIsRefreshingQuote] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    const hasTypedAmount = Boolean(args.quote.amountIn !== undefined && args.quote.amountIn > 0n);
    const hasQuotedAmount = Boolean(args.quote.amountIn !== undefined && args.quote.amountIn > 0n && args.quote.amountOut !== undefined && args.quote.amountOut > 0n);
    const hasInsufficientBalance = Boolean(args.isConnected && args.quote.amountIn !== undefined && args.tokenIn.balance !== undefined && args.tokenIn.balance < args.quote.amountIn);
    const isBusy = isApproving || isSwapPending || isConfirming;
    const isQuoteStale = Boolean(args.quote.updatedAt && hasQuotedAmount && now - args.quote.updatedAt > 30_000 && !args.quote.isLoading);

    useEffect(() => {
        if (!args.quote.updatedAt) return;
        setNow(Date.now());
        const intervalId = window.setInterval(() => setNow(Date.now()), 10_000);
        return () => window.clearInterval(intervalId);
    }, [args.quote.updatedAt]);

    const needsApproval = useMemo(() => {
        if (!args.quote.amountIn || args.tokenIn.allowance === undefined) return false;
        return args.tokenIn.allowance < args.quote.amountIn;
    }, [args.quote.amountIn, args.tokenIn.allowance]);

    const canSubmit = Boolean(
        args.isConnected &&
            args.publicClient &&
            args.hasValidRouter &&
            args.tokenIn.token &&
            args.tokenOut.token &&
            hasQuotedAmount &&
            args.quote.amountOutMin !== undefined &&
            !args.quote.error &&
            !args.quote.isLoading &&
            !isQuoteStale &&
            !hasInsufficientBalance &&
            !isBusy,
    );

    const actionLabel = useMemo(() => {
        if (tx.status === "pending" && tx.hash) return "Transaction submitted";
        if (isSwapPending) return "Swapping...";
        if (isApproving || isConfirming) return "Confirming...";
        if (!args.isConnected) return "Connect Wallet";
        if (!args.publicClient) return "Route unavailable";
        if (!args.hasValidRouter) return "Route unavailable";
        if (!args.tokenIn.token || !args.tokenOut.token) return "Select a token";
        if (!hasTypedAmount) return "Enter an amount";
        if (args.quote.isLoading) return "Fetching quote";
        if (hasInsufficientBalance) return "Insufficient balance";
        if (args.quote.error) return "Route unavailable";
        if (!hasQuotedAmount) return "Enter an amount";
        if (needsApproval) return `Approve ${args.tokenIn.token?.symbol ?? "token"}`;
        return "Swap";
    }, [hasQuotedAmount, hasTypedAmount, hasInsufficientBalance, isApproving, isConfirming, args.isConnected, isSwapPending, needsApproval, args.publicClient, args.quote.error, args.quote.isLoading, args.hasValidRouter, args.tokenIn.token, args.tokenOut.token, tx.hash, tx.status]);

    const isActionDisabled = args.isConnected ? !canSubmit : !args.openConnectModal || isBusy;
    const displayedActionLabel = isRefreshingQuote ? "Refreshing quote…" : isQuoteStale ? "Refresh quote" : actionLabel;
    const displayedActionDisabled = isRefreshingQuote || (isQuoteStale ? args.quote.isLoading : isActionDisabled);
    const displayedActionLoading = isRefreshingQuote || (!isQuoteStale && (isBusy || args.quote.isLoading));

    async function refreshQuote() {
        if (isRefreshingQuote || args.quote.isLoading) return;
        setIsRefreshingQuote(true);
        try {
            await args.quote.refetch();
        } finally {
            setIsRefreshingQuote(false);
        }
    }

    async function submit() {
        const { account, hasValidRouter, tokenIn, tokenOut: tOut, quote, wethAddress, deadlineMinutes, routerAddress, tokenInIsNative, tokenOutIsNative, amount, addHistoryEntry, publicClient } = args;

        if (!account || !hasValidRouter || !tokenIn.token || !tOut.token || quote.amountIn === undefined || quote.amountIn <= 0n || quote.amountOut === undefined || quote.amountOut <= 0n) return;
        if (quote.amountOutMin === undefined) return;
        if (!publicClient) {
            setTx({ title: "Unsupported network", status: "error", message: "Switch to a supported EVM network or check your RPC URL." });
            return;
        }

        setIsConfirming(true);
        try {
            if (needsApproval) {
                if (!tokenIn.token) return;
                setTx({ title: "Approve pending", status: "pending", message: `Approving ${tokenIn.token.symbol}` });
                const hash = await approve(resolveAddress(tokenIn.token.address, wethAddress), routerAddress as Address, quote.amountIn);
                setTx({ title: "Approve submitted", status: "pending", hash, message: "Waiting for on-chain confirmation" });
                const receipt = await publicClient.waitForTransactionReceipt({ hash });
                if (receipt.status !== "success") throw new Error("Approval transaction reverted");
                tokenIn.refetch();
                quote.refetch();
            }

            const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60);
            const path = (quote.path ?? [tokenIn.token.address, tOut.token.address]).map(
                (addr) => resolveAddress(addr, wethAddress),
            );

            setTx({ title: "Swap pending", status: "pending", message: "Confirm the transaction in your wallet" });
            const hash = tokenInIsNative
                ? await writeContractAsync({
                      address: routerAddress as Address,
                      abi: routerAbi,
                      functionName: "swapExactETHForTokens",
                      args: [quote.amountOutMin!, path, account, deadline],
                      value: quote.amountIn,
                  })
                : tokenOutIsNative
                  ? await writeContractAsync({
                        address: routerAddress as Address,
                        abi: routerAbi,
                        functionName: "swapExactTokensForETH",
                        args: [quote.amountIn, quote.amountOutMin!, path, account, deadline],
                    })
                  : await writeContractAsync({
                        address: routerAddress as Address,
                        abi: routerAbi,
                        functionName: "swapExactTokensForTokens",
                        args: [quote.amountIn, quote.amountOutMin!, path, account, deadline],
                    });
            setTx({ title: "Swap submitted", status: "pending", hash, message: "Waiting for on-chain confirmation" });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status !== "success") throw new Error("Swap transaction reverted");
            addHistoryEntry({
                hash,
                type: "swap",
                timestamp: Date.now(),
                label: `${tokenIn.token?.symbol ?? ""} → ${tOut.token?.symbol ?? ""}`,
                pairLabel: `${tokenIn.token?.symbol ?? ""} → ${tOut.token?.symbol ?? ""}`,
                amountLabel: `${formatDisplayAmount(amount)} ${tokenIn.token?.symbol ?? ""} → ${formatDisplayAmount(formatTokenAmount(quote.amountOut, tOut.token?.decimals ?? 18))} ${tOut.token?.symbol ?? ""}`,
                status: "confirmed",
                blockNumber: receipt.blockNumber.toString(),
                transactionIndex: receipt.transactionIndex,
            });
            tokenIn.refetch();
            tOut.refetch();
            setTx({ title: "Swap confirmed", status: "success", hash, message: "Balances updated." });
            tOut.refetch();
        } catch (caught) {
            setTx({
                title: "Swap failed",
                status: "error",
                message: normalizeTransactionError(caught, "Swap failed. Check route, liquidity, and wallet status."),
            });
        } finally {
            setIsConfirming(false);
        }
    }

    return {
        tx,
        isConfirming,
        isBusy,
        isRefreshingQuote,
        hasQuotedAmount,
        hasInsufficientBalance,
        isQuoteStale,
        needsApproval,
        canSubmit,
        actionLabel,
        displayedActionLabel,
        displayedActionDisabled,
        displayedActionLoading,
        submit,
        refreshQuote,
    };
}
