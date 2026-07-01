import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useState } from "react";
import { type Address, formatUnits, isAddress } from "viem";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";

import { routerAbi } from "../abis";
import { useApproval } from "../hooks/useApproval";
import { useDeploymentConfig } from "../hooks/useDeploymentConfig";
import { useLiquidityPair } from "../hooks/useLiquidityPair";
import { useSwapQuote } from "../hooks/useSwapQuote";
import { useToken } from "../hooks/useToken";
import { useTokenList } from "../hooks/useTokenList";
import { useTransactionHistory } from "../hooks/useTransactionHistory";
import { normalizeTransactionError } from "../lib/errors";
import { formatDisplayAmount, formatPercentBps, formatTokenAmount } from "../lib/format";
import { getWethAddress, isNativeAddress } from "../lib/tokenRegistry";
import {
    DEFAULT_DEADLINE_MINUTES,
    DEFAULT_ROUTER_ADDRESS,
    DEFAULT_SLIPPAGE_BPS,
    DEFAULT_TOKEN_IN_ADDRESS,
    DEFAULT_TOKEN_OUT_ADDRESS,
    STORAGE_KEYS,
    loadStorage,
    persist,
    sanitizeDeadlineMinutes,
    sanitizeSlippageBps,
} from "../lib/tradeConfig";
import type { HistoryEntry } from "../hooks/useTransactionHistory";
import type { TransactionState } from "../types";
import { QuoteDetails } from "./swap/QuoteDetails";
import { SwapActionButton } from "./swap/SwapActionButton";
import { SwapConfirmDialog } from "./swap/SwapConfirmDialog";
import { SwapDirectionButton } from "./swap/SwapDirectionButton";
import { SwapHistory } from "./SwapHistory";
import { SwapSettingsDialog } from "./swap/SwapSettingsDialog";
import { TokenAmountPanel } from "./swap/TokenAmountPanel";
import { TokenSelectorDialog } from "./swap/TokenSelectorDialog";
import { TransactionToast } from "./TransactionToast";

function resolveAddress(address: string, weth: Address | undefined): Address {
    if (isNativeAddress(address) && weth) return weth;
    return address as Address;
}

type SwapCardProps = {
    historyEntries?: HistoryEntry[];
    onAddHistoryEntry?: (entry: HistoryEntry) => void;
};

export function SwapCard({ historyEntries: extHistoryEntries, onAddHistoryEntry: extAddHistoryEntry }: SwapCardProps = {}) {
    const { address: account, chain, isConnected } = useAccount();
    const { openConnectModal } = useConnectModal();
    const publicClient = usePublicClient();
    const chainId = useChainId();
    const { approve, isApproving } = useApproval();
    const { writeContractAsync, isPending: isSwapPending } = useWriteContract();

    const [routerAddress, setRouterAddress] = useState(() => loadStorage(STORAGE_KEYS.router, DEFAULT_ROUTER_ADDRESS));
    const [tokenInAddress, setTokenInAddress] = useState(() => loadStorage(STORAGE_KEYS.tokenIn, DEFAULT_TOKEN_IN_ADDRESS));
    const [tokenOutAddress, setTokenOutAddress] = useState(() => loadStorage(STORAGE_KEYS.tokenOut, DEFAULT_TOKEN_OUT_ADDRESS));
    const [amount, setAmount] = useState("");
    const [slippageBps, setSlippageBps] = useState(() => sanitizeSlippageBps(Number(loadStorage(STORAGE_KEYS.slippageBps, String(DEFAULT_SLIPPAGE_BPS)))));
    const [deadlineMinutes, setDeadlineMinutes] = useState(() => sanitizeDeadlineMinutes(Number(loadStorage(STORAGE_KEYS.deadlineMinutes, String(DEFAULT_DEADLINE_MINUTES)))));
    const [tx, setTx] = useState<TransactionState>({ title: "", status: "idle" });
    const [isConfirming, setIsConfirming] = useState(false);
    const [isRefreshingQuote, setIsRefreshingQuote] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const internalHistory = useTransactionHistory();
    const historyEntries = extHistoryEntries ?? internalHistory.entries;
    const addHistoryEntry = extAddHistoryEntry ?? internalHistory.addEntry;
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [tokenDialog, setTokenDialog] = useState<"pay" | "receive" | null>(null);

    const deployment = useDeploymentConfig();
    const tokenList = useTokenList({ deployment: deployment.deployment });
    const wethAddress = deployment.deployment?.weth ?? getWethAddress(chainId);

    const tokenIn = useToken(tokenInAddress, routerAddress);
    const tokenOut = useToken(tokenOutAddress, routerAddress);
    const weth = useToken(wethAddress ?? "", routerAddress);
    const quote = useSwapQuote({
        routerAddress,
        tokenIn: tokenIn.token,
        tokenOut: tokenOut.token,
        intermediateToken: weth.token,
        amount,
        slippageBps,
    });
    const quotePair = useLiquidityPair({ routerAddress, tokenA: tokenIn.token, tokenB: tokenOut.token, wethAddress });

    // Clear selected tokens when chain changes and token is not supported
    useEffect(() => {
        if (!chainId || deployment.isLoading) return;
        const isNative = (addr: string) => isNativeAddress(addr);
        const hasToken = (addr: string) => isNative(addr) || (tokenList.tokens ?? []).some(
            (t) => t.address && t.address.toLowerCase() === addr.toLowerCase(),
        );

        if (tokenInAddress && !hasToken(tokenInAddress)) {
            updateTokenIn("");
        }
        if (tokenOutAddress && !hasToken(tokenOutAddress)) {
            updateTokenOut("");
        }
    }, [chainId, deployment.isLoading, tokenList.tokens, tokenInAddress, tokenOutAddress]);

    const hasValidRouter = isAddress(routerAddress);
    const tokenInIsNative = isNativeAddress(tokenInAddress);
    const tokenOutIsNative = isNativeAddress(tokenOutAddress);
    const hasValidTokenInAddress = isAddress(tokenInAddress) || tokenInIsNative;
    const hasValidTokenOutAddress = isAddress(tokenOutAddress) || tokenOutIsNative;
    const hasNativeRouteWeth = !(tokenInIsNative || tokenOutIsNative) || Boolean(wethAddress);
    const routeSetupComplete = hasValidRouter && hasValidTokenInAddress && hasValidTokenOutAddress && hasNativeRouteWeth && !(tokenInIsNative && tokenOutIsNative);
    const hasTypedAmount = Boolean(quote.amountIn !== undefined && quote.amountIn > 0n);
    const hasQuotedAmount = Boolean(quote.amountIn !== undefined && quote.amountIn > 0n && quote.amountOut !== undefined && quote.amountOut > 0n);
    const hasInsufficientBalance = Boolean(isConnected && quote.amountIn !== undefined && tokenIn.balance !== undefined && tokenIn.balance < quote.amountIn);
    const isBusy = isApproving || isSwapPending || isConfirming;

    const networkLabel = chain?.name ?? "EVM";
    const routeLabel = quote.routeLabel ?? (tokenIn.token && tokenOut.token ? `${tokenIn.token.symbol} to ${tokenOut.token.symbol}` : "Direct token route");
    const shouldShowQuote = routeSetupComplete && Boolean(amount) && hasTypedAmount;
    const hasHighSlippage = slippageBps > 5_000;
    const isQuoteStale = Boolean(quote.updatedAt && hasQuotedAmount && now - quote.updatedAt > 30_000 && !quote.isLoading);

    useEffect(() => {
        if (!quote.updatedAt) return;
        setNow(Date.now());
        const intervalId = window.setInterval(() => setNow(Date.now()), 10_000);
        return () => window.clearInterval(intervalId);
    }, [quote.updatedAt]);

    useEffect(() => {
        if (!deployment.deployment) return;

        if (!loadStorage(STORAGE_KEYS.router) && deployment.deployment.router) updateRouter(deployment.deployment.router);
        if (!loadStorage(STORAGE_KEYS.tokenIn) && deployment.deployment.tokens[0]?.address) updateTokenIn(deployment.deployment.tokens[0].address);
        if (!loadStorage(STORAGE_KEYS.tokenOut) && deployment.deployment.tokens[1]?.address) updateTokenOut(deployment.deployment.tokens[1].address);
    }, [deployment.deployment]);

    const needsApproval = useMemo(() => {
        if (!quote.amountIn || tokenIn.allowance === undefined) return false;
        return tokenIn.allowance < quote.amountIn;
    }, [quote.amountIn, tokenIn.allowance]);

    const priceImpactBps = useMemo(() => {
        if (!quote.amountIn || !quote.amountOut || quote.path?.length !== 2 || !quotePair.reserveA || !quotePair.reserveB || quotePair.reserveA === 0n) return undefined;
        const expectedNoFeeOutput = (quote.amountIn * quotePair.reserveB) / quotePair.reserveA;
        if (expectedNoFeeOutput === 0n || quote.amountOut >= expectedNoFeeOutput) return 0n;
        return ((expectedNoFeeOutput - quote.amountOut) * 10_000n) / expectedNoFeeOutput;
    }, [quote.amountIn, quote.amountOut, quote.path, quotePair.reserveA, quotePair.reserveB]);

    const canSubmit = Boolean(
        isConnected &&
            publicClient &&
            routeSetupComplete &&
            tokenIn.token &&
            tokenOut.token &&
            hasQuotedAmount &&
            quote.amountOutMin !== undefined &&
            !quote.error &&
            !quote.isLoading &&
            !isQuoteStale &&
            !hasInsufficientBalance &&
            !isBusy,
    );

    const actionLabel = useMemo(() => {
        if (tx.status === "pending" && tx.hash) return "Transaction submitted";
        if (isSwapPending) return "Swapping...";
        if (isApproving || isConfirming) return "Confirming...";
        if (!isConnected) return "Connect Wallet";
        if (!publicClient) return "Route unavailable";
        if (!routeSetupComplete) return "Route unavailable";
        if (!tokenIn.token || !tokenOut.token) return "Select a token";
        if (!hasTypedAmount) return "Enter an amount";
        if (quote.isLoading) return "Fetching quote";
        if (hasInsufficientBalance) return "Insufficient balance";
        if (quote.error) return "Route unavailable";
        if (!hasQuotedAmount) return "Enter an amount";
        if (needsApproval) return `Approve ${tokenIn.token?.symbol ?? "token"}`;
        return "Swap";
    }, [hasQuotedAmount, hasTypedAmount, hasInsufficientBalance, isApproving, isConfirming, isConnected, isSwapPending, needsApproval, publicClient, quote.error, quote.isLoading, routeSetupComplete, tokenIn.token, tokenOut.token, tx.hash, tx.status]);

    const isActionDisabled = isConnected ? !canSubmit : !openConnectModal || isBusy;
    const displayedActionLabel = isRefreshingQuote ? "Refreshing quote…" : isQuoteStale ? "Refresh quote" : actionLabel;
    const displayedActionDisabled = isRefreshingQuote || (isQuoteStale ? quote.isLoading : isActionDisabled);
    const displayedActionLoading = isRefreshingQuote || (!isQuoteStale && (isBusy || quote.isLoading));

    function updateRouter(value: string) {
        setRouterAddress(value);
        persist(STORAGE_KEYS.router, value);
    }

    function updateTokenIn(value: string) {
        setTokenInAddress(value);
        persist(STORAGE_KEYS.tokenIn, value);
    }

    function updateTokenOut(value: string) {
        setTokenOutAddress(value);
        persist(STORAGE_KEYS.tokenOut, value);
    }

    function updateSlippage(value: number) {
        const nextValue = sanitizeSlippageBps(value);
        setSlippageBps(nextValue);
        persist(STORAGE_KEYS.slippageBps, String(nextValue));
    }

    function updateDeadline(value: number) {
        const nextValue = sanitizeDeadlineMinutes(value);
        setDeadlineMinutes(nextValue);
        persist(STORAGE_KEYS.deadlineMinutes, String(nextValue));
    }

    function switchTokens() {
        if (quote.isLoading || isBusy) return;
        updateTokenIn(tokenOutAddress);
        updateTokenOut(tokenInAddress);
        setAmount("");
    }

    function setMaxAmount() {
        if (!tokenIn.balance || !tokenIn.token) return;
        setAmount(formatUnits(tokenIn.balance, tokenIn.token.decimals));
    }

    async function refreshQuote() {
        if (isRefreshingQuote || quote.isLoading) return;
        setIsRefreshingQuote(true);
        try {
            await quote.refetch();
        } finally {
            setIsRefreshingQuote(false);
        }
    }

    async function submit() {
        if (!account || !hasValidRouter || !tokenIn.token || !tokenOut.token || quote.amountIn === undefined || quote.amountIn <= 0n || quote.amountOut === undefined || quote.amountOut <= 0n) return;
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
            const path = (quote.path ?? [tokenIn.token.address, tokenOut.token.address]).map(
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
                label: `${tokenIn.token?.symbol ?? ""} → ${tokenOut.token?.symbol ?? ""}`,
                pairLabel: `${tokenIn.token?.symbol ?? ""} → ${tokenOut.token?.symbol ?? ""}`,
                amountLabel: `${formatDisplayAmount(amount)} ${tokenIn.token?.symbol ?? ""} → ${formatDisplayAmount(formatTokenAmount(quote.amountOut, tokenOut.token?.decimals ?? 18))} ${tokenOut.token?.symbol ?? ""}`,
                status: "confirmed",
                blockNumber: receipt.blockNumber.toString(),
                transactionIndex: receipt.transactionIndex,
            });
            tokenIn.refetch();
            tokenOut.refetch();
            setTx({ title: "Swap confirmed", status: "success", hash, message: "Balances updated." });

            tokenOut.refetch();
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

    function handlePrimaryAction() {
        if (!isConnected) {
            if (openConnectModal) openConnectModal();
            else setTx({ title: "Wallet unavailable", status: "error", message: "Wallet connection failed to initialize. Refresh and try again." });
            return;
        }

        if (!canSubmit) return;

        if (needsApproval) {
            void submit();
        } else {
            setShowConfirm(true);
        }
    }

    function handleActionButtonClick() {
        if (isQuoteStale) {
            void refreshQuote();
            return;
        }

        handlePrimaryAction();
    }

    function WarningIcon() {
        return (
            <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M10 3 18 17H2L10 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                <path d="M10 8v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                <path d="M10 15h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
        );
    }

    return (
        <>
            <section className="surface-card trade-card" aria-label="Swap tokens">
                <div className="mb-5 flex min-w-0 items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="font-black tracking-tight text-primary">Swap</h1>
                        <p className="mt-0.5 text-sm text-secondary">Trade tokens instantly</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            aria-label="Open swap settings"
                            onClick={() => setIsSettingsOpen(true)}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg surface-elevated text-sm text-muted transition duration-150 hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                        >
                            ⚙
                        </button>
                    </div>
                </div>

                <div className="token-panels min-w-0 max-w-full">
                    <TokenAmountPanel
                        label="Sell"
                        amount={amount}
                        token={tokenIn.token}
                        balance={tokenIn.balance}
                        tokenTone="pay"
                        showMax
                        onAmountChange={setAmount}
                        onMax={setMaxAmount}
                        onSelectToken={() => setTokenDialog("pay")}
                    />

                    <SwapDirectionButton disabled={quote.isLoading || isBusy} onClick={switchTokens} />

                    <TokenAmountPanel
                        label="Buy"
                        amount={quote.amountOut && tokenOut.token ? formatDisplayAmount(formatTokenAmount(quote.amountOut, tokenOut.token.decimals, 8)) : ""}
                        token={tokenOut.token}
                        balance={tokenOut.balance}
                        readOnly
                        isLoading={quote.isLoading}
                        tokenTone="receive"
                        onSelectToken={() => setTokenDialog("receive")}
                    />
                </div>

                {!routeSetupComplete ? (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg surface-elevated p-3">
                        <p className="min-w-0 truncate text-xs text-muted" aria-live="polite">
                            Swap route is not configured
                        </p>
                        <button
                            type="button"
                            onClick={() => setIsSettingsOpen(true)}
                            className="shrink-0 rounded-lg surface-elevated px-3 py-1.5 text-xs font-black text-secondary transition duration-150 hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                        >
                            Configure route
                        </button>
                    </div>
                ) : null}

                {hasHighSlippage ? (
                    <p role="alert" className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                        Slippage is very high. Review settings before swapping.
                    </p>
                ) : null}

                <QuoteDetails
                    show={shouldShowQuote}
                    isLoading={quote.isLoading}
                    error={quote.error}
                    rate={quote.rate}
                    priceImpact={formatPercentBps(priceImpactBps)}
                    amountOutMin={quote.amountOutMin}
                    tokenIn={tokenIn.token}
                    tokenOut={tokenOut.token}
                    routeLabel={routeLabel}
                    routes={quote.routes}
                    selectedRouteIndex={quote.selectedRouteIndex}
                    onRouteChange={quote.setSelectedRouteIndex}
                    updatedAt={quote.updatedAt}
                />

                {isQuoteStale ? (
                    <div className="quote-warning" role="status">
                        <WarningIcon />
                        <span>Quote expired. Refresh to get the latest price.</span>
                    </div>
                ) : null}

                <SwapActionButton label={displayedActionLabel} disabled={displayedActionDisabled} loading={displayedActionLoading} onClick={handleActionButtonClick} />
            </section>

            <SwapSettingsDialog
                open={isSettingsOpen}
                routerAddress={routerAddress}
                tokenInAddress={tokenInAddress}
                tokenOutAddress={tokenOutAddress}
                slippageBps={slippageBps}
                deadlineMinutes={deadlineMinutes}
                hasValidRouter={hasValidRouter}
                hasValidTokenInAddress={hasValidTokenInAddress}
                hasValidTokenOutAddress={hasValidTokenOutAddress}
                onClose={() => setIsSettingsOpen(false)}
                onRouterChange={updateRouter}
                onTokenInChange={updateTokenIn}
                onTokenOutChange={updateTokenOut}
                onSlippageChange={updateSlippage}
                onDeadlineChange={updateDeadline}
            />

            <TokenSelectorDialog
                open={tokenDialog === "pay"}
                title="Select pay token"
                value={tokenInAddress}
                token={tokenIn.token}
                isValidAddress={hasValidTokenInAddress}
                isLoading={tokenIn.isLoading}
                error={tokenIn.error}
                tokens={tokenList.tokens}
                tokenListLoading={tokenList.isLoading || deployment.isLoading}
                excludeAddress={tokenOutAddress}
                onChange={updateTokenIn}
                onClose={() => setTokenDialog(null)}
            />

            <TokenSelectorDialog
                open={tokenDialog === "receive"}
                title="Select receive token"
                value={tokenOutAddress}
                token={tokenOut.token}
                isValidAddress={hasValidTokenOutAddress}
                isLoading={tokenOut.isLoading}
                error={tokenOut.error}
                tokens={tokenList.tokens}
                tokenListLoading={tokenList.isLoading || deployment.isLoading}
                excludeAddress={tokenInAddress}
                onChange={updateTokenOut}
                onClose={() => setTokenDialog(null)}
            />

            <TransactionToast tx={tx} />

            <SwapConfirmDialog
                open={showConfirm}
                sellAmount={amount}
                sellSymbol={tokenIn.token?.symbol ?? ""}
                buyAmount={quote.amountOut && tokenOut.token ? formatDisplayAmount(formatTokenAmount(quote.amountOut, tokenOut.token.decimals, 8)) : ""}
                buySymbol={tokenOut.token?.symbol ?? ""}
                priceImpact={formatPercentBps(priceImpactBps)}
                minimumReceived={quote.amountOutMin && tokenOut.token ? `Min: ${formatDisplayAmount(formatTokenAmount(quote.amountOutMin, tokenOut.token.decimals, 6))} ${tokenOut.token.symbol}` : "-"}
                route={routeLabel}
                slippage={`${(slippageBps / 100).toFixed(1)}%`}
                onConfirm={() => {
                    setShowConfirm(false);
                    void submit();
                }}
                onClose={() => setShowConfirm(false)}
            />

            {!extHistoryEntries ? <SwapHistory entries={historyEntries} /> : null}
        </>
    );
}
