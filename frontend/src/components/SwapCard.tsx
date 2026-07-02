import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, isAddress } from "viem";
import { useAccount, useChainId, usePublicClient } from "wagmi";

import { useDeploymentConfig } from "../hooks/useDeploymentConfig";
import { useLiquidityPair } from "../hooks/useLiquidityPair";
import { useSwapQuote } from "../hooks/useSwapQuote";
import { useSwapSubmit } from "../hooks/useSwapSubmit";
import { useToken } from "../hooks/useToken";
import { useTokenList } from "../hooks/useTokenList";
import { useTransactionHistory } from "../hooks/useTransactionHistory";
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
import { QuoteDetails } from "./swap/QuoteDetails";
import { SwapActionButton } from "./swap/SwapActionButton";
import { SwapConfirmDialog } from "./swap/SwapConfirmDialog";
import { SwapDirectionButton } from "./swap/SwapDirectionButton";
import { SwapHistory } from "./SwapHistory";
import { SwapSettingsDialog } from "./swap/SwapSettingsDialog";
import { TokenAmountPanel } from "./swap/TokenAmountPanel";
import { TokenSelectorDialog } from "./swap/TokenSelectorDialog";
import { TransactionToast } from "./TransactionToast";

type SwapCardProps = {
    historyEntries?: HistoryEntry[];
    onAddHistoryEntry?: (entry: HistoryEntry) => void;
};

function WarningIcon() {
    return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 3 18 17H2L10 3Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            <path d="M10 8v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            <path d="M10 15h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    );
}

export function SwapCard({ historyEntries: extHistoryEntries, onAddHistoryEntry: extAddHistoryEntry }: SwapCardProps = {}) {
    const { address: account, isConnected } = useAccount();
    const { openConnectModal } = useConnectModal();
    const publicClient = usePublicClient();
    const chainId = useChainId();

    const [routerAddress, setRouterAddress] = useState(() => loadStorage(STORAGE_KEYS.router, DEFAULT_ROUTER_ADDRESS));
    const [tokenInAddress, setTokenInAddress] = useState(() => loadStorage(STORAGE_KEYS.tokenIn, DEFAULT_TOKEN_IN_ADDRESS));
    const [tokenOutAddress, setTokenOutAddress] = useState(() => loadStorage(STORAGE_KEYS.tokenOut, DEFAULT_TOKEN_OUT_ADDRESS));
    const [amount, setAmount] = useState("");
    const [slippageBps, setSlippageBps] = useState(() => sanitizeSlippageBps(Number(loadStorage(STORAGE_KEYS.slippageBps, String(DEFAULT_SLIPPAGE_BPS)))));
    const [deadlineMinutes, setDeadlineMinutes] = useState(() => sanitizeDeadlineMinutes(Number(loadStorage(STORAGE_KEYS.deadlineMinutes, String(DEFAULT_DEADLINE_MINUTES)))));
    const [showConfirm, setShowConfirm] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [tokenDialog, setTokenDialog] = useState<"pay" | "receive" | null>(null);
    const internalHistory = useTransactionHistory();
    const historyEntries = extHistoryEntries ?? internalHistory.entries;
    const addHistoryEntry = extAddHistoryEntry ?? internalHistory.addEntry;

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

    const swapSubmit = useSwapSubmit({
        account,
        publicClient,
        isConnected,
        routerAddress,
        hasValidRouter: isAddress(routerAddress),
        tokenIn,
        tokenOut,
        tokenInAddress,
        tokenOutAddress,
        tokenInIsNative: isNativeAddress(tokenInAddress),
        tokenOutIsNative: isNativeAddress(tokenOutAddress),
        wethAddress,
        amount,
        slippageBps,
        deadlineMinutes,
        quote,
        addHistoryEntry,
        openConnectModal,
    });

    useEffect(() => {
        if (!chainId || deployment.isLoading) return;
        const isNative = (addr: string) => isNativeAddress(addr);
        const hasToken = (addr: string) => isNative(addr) || (tokenList.tokens ?? []).some(
            (t) => t.address && t.address.toLowerCase() === addr.toLowerCase(),
        );

        if (tokenInAddress && !hasToken(tokenInAddress)) updateTokenIn("");
        if (tokenOutAddress && !hasToken(tokenOutAddress)) updateTokenOut("");
    }, [chainId, deployment.isLoading, tokenList.tokens, tokenInAddress, tokenOutAddress]);

    const hasValidRouter = isAddress(routerAddress);
    const tokenInIsNative = isNativeAddress(tokenInAddress);
    const tokenOutIsNative = isNativeAddress(tokenOutAddress);
    const hasValidTokenInAddress = isAddress(tokenInAddress) || tokenInIsNative;
    const hasValidTokenOutAddress = isAddress(tokenOutAddress) || tokenOutIsNative;
    const hasNativeRouteWeth = !(tokenInIsNative || tokenOutIsNative) || Boolean(wethAddress);
    const routeSetupComplete = hasValidRouter && hasValidTokenInAddress && hasValidTokenOutAddress && hasNativeRouteWeth && !(tokenInIsNative && tokenOutIsNative);
    const hasHighSlippage = slippageBps > 5_000;

    const priceImpactBps = useMemo(() => {
        if (!quote.amountIn || !quote.amountOut || quote.path?.length !== 2 || !quotePair.reserveA || !quotePair.reserveB || quotePair.reserveA === 0n) return undefined;
        const expectedNoFeeOutput = (quote.amountIn * quotePair.reserveB) / quotePair.reserveA;
        if (expectedNoFeeOutput === 0n || quote.amountOut >= expectedNoFeeOutput) return 0n;
        return ((expectedNoFeeOutput - quote.amountOut) * 10_000n) / expectedNoFeeOutput;
    }, [quote.amountIn, quote.amountOut, quote.path, quotePair.reserveA, quotePair.reserveB]);

    const routeLabel = quote.routeLabel ?? (tokenIn.token && tokenOut.token ? `${tokenIn.token.symbol} to ${tokenOut.token.symbol}` : "Direct token route");
    const shouldShowQuote = routeSetupComplete && Boolean(amount) && Boolean(quote.amountIn !== undefined && quote.amountIn > 0n);

    useEffect(() => {
        if (!deployment.deployment) return;

        if (!loadStorage(STORAGE_KEYS.router) && deployment.deployment.router) updateRouter(deployment.deployment.router);
        if (!loadStorage(STORAGE_KEYS.tokenIn) && deployment.deployment.tokens[0]?.address) updateTokenIn(deployment.deployment.tokens[0].address);
        if (!loadStorage(STORAGE_KEYS.tokenOut) && deployment.deployment.tokens[1]?.address) updateTokenOut(deployment.deployment.tokens[1].address);
    }, [deployment.deployment]);

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
        if (quote.isLoading || swapSubmit.isBusy) return;
        updateTokenIn(tokenOutAddress);
        updateTokenOut(tokenInAddress);
        setAmount("");
    }

    function setMaxAmount() {
        if (!tokenIn.balance || !tokenIn.token) return;
        setAmount(formatUnits(tokenIn.balance, tokenIn.token.decimals));
    }

    function handlePrimaryAction() {
        if (!isConnected) {
            if (openConnectModal) openConnectModal();
            return;
        }
        if (!swapSubmit.canSubmit) return;
        if (swapSubmit.needsApproval) {
            void swapSubmit.submit();
        } else {
            setShowConfirm(true);
        }
    }

    function handleActionButtonClick() {
        if (swapSubmit.isQuoteStale) {
            void swapSubmit.refreshQuote();
            return;
        }
        handlePrimaryAction();
    }

    const payAmount = amount;
    const receiveAmount = quote.amountOut && tokenOut.token ? formatDisplayAmount(formatTokenAmount(quote.amountOut, tokenOut.token.decimals, 8)) : "";

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
                        amount={payAmount}
                        token={tokenIn.token}
                        balance={tokenIn.balance}
                        tokenTone="pay"
                        showMax
                        onAmountChange={setAmount}
                        onMax={setMaxAmount}
                        onSelectToken={() => setTokenDialog("pay")}
                    />

                    <TokenAmountPanel
                        label="Buy"
                        amount={receiveAmount}
                        token={tokenOut.token}
                        balance={tokenOut.balance}
                        readOnly
                        isLoading={quote.isLoading}
                        tokenTone="receive"
                        onSelectToken={() => setTokenDialog("receive")}
                    />

                    <SwapDirectionButton disabled={quote.isLoading || swapSubmit.isBusy} onClick={switchTokens} />
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

                {swapSubmit.isQuoteStale ? (
                    <div className="quote-warning" role="status">
                        <WarningIcon />
                        <span>Quote expired. Refresh to get the latest price.</span>
                    </div>
                ) : null}

                <SwapActionButton
                    label={swapSubmit.displayedActionLabel}
                    disabled={swapSubmit.displayedActionDisabled}
                    loading={swapSubmit.displayedActionLoading}
                    onClick={handleActionButtonClick}
                />
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

            <TransactionToast tx={swapSubmit.tx} />

            <SwapConfirmDialog
                open={showConfirm}
                sellAmount={payAmount}
                sellSymbol={tokenIn.token?.symbol ?? ""}
                buyAmount={receiveAmount}
                buySymbol={tokenOut.token?.symbol ?? ""}
                priceImpact={formatPercentBps(priceImpactBps)}
                minimumReceived={
                    quote.amountOutMin && tokenOut.token
                        ? `Min: ${formatDisplayAmount(formatTokenAmount(quote.amountOutMin, tokenOut.token.decimals, 6))} ${tokenOut.token.symbol}`
                        : "-"
                }
                route={routeLabel}
                slippage={`${(slippageBps / 100).toFixed(1)}%`}
                onConfirm={() => {
                    setShowConfirm(false);
                    void swapSubmit.submit();
                }}
                onClose={() => setShowConfirm(false)}
            />

            {!extHistoryEntries ? <SwapHistory entries={historyEntries} /> : null}
        </>
    );
}
