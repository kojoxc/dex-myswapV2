import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useState } from "react";
import { type Address, formatUnits, isAddress } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { routerAbi } from "../abis";
import { useApproval } from "../hooks/useApproval";
import { useDeploymentConfig } from "../hooks/useDeploymentConfig";
import { useLiquidityPair } from "../hooks/useLiquidityPair";
import { useSwapQuote } from "../hooks/useSwapQuote";
import { useToken } from "../hooks/useToken";
import { useTokenList } from "../hooks/useTokenList";
import { normalizeTransactionError } from "../lib/errors";
import { formatTokenAmount } from "../lib/format";
import {
    DEFAULT_DEADLINE_MINUTES,
    DEFAULT_ROUTER_ADDRESS,
    DEFAULT_SLIPPAGE_BPS,
    DEFAULT_TOKEN_IN_ADDRESS,
    DEFAULT_TOKEN_OUT_ADDRESS,
    DEFAULT_WETH_ADDRESS,
    STORAGE_KEYS,
    loadStorage,
    persist,
    sanitizeDeadlineMinutes,
    sanitizeSlippageBps,
} from "../lib/tradeConfig";
import type { TransactionState } from "../types";
import { QuoteDetails } from "./swap/QuoteDetails";
import { SwapActionButton } from "./swap/SwapActionButton";
import { SwapDirectionButton } from "./swap/SwapDirectionButton";
import { SwapSettingsDialog } from "./swap/SwapSettingsDialog";
import { TokenAmountPanel } from "./swap/TokenAmountPanel";
import { TokenSelectorDialog } from "./swap/TokenSelectorDialog";
import { TransactionToast } from "./TransactionToast";

function formatPercentBps(value?: bigint) {
    if (value === undefined) return "-";
    const whole = value / 100n;
    const fraction = (value % 100n).toString().padStart(2, "0").replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}%` : `${whole}%`;
}

export function SwapCard() {
    const { address: account, chain, isConnected } = useAccount();
    const { openConnectModal } = useConnectModal();
    const publicClient = usePublicClient();
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
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [tokenDialog, setTokenDialog] = useState<"pay" | "receive" | null>(null);

    const deployment = useDeploymentConfig();
    const tokenList = useTokenList({ deployment: deployment.deployment, extraAddresses: [tokenInAddress, tokenOutAddress] });
    const wethAddress = deployment.deployment?.weth ?? DEFAULT_WETH_ADDRESS;

    const tokenIn = useToken(tokenInAddress, routerAddress);
    const tokenOut = useToken(tokenOutAddress, routerAddress);
    const weth = useToken(wethAddress, routerAddress);
    const quote = useSwapQuote({
        routerAddress,
        tokenIn: tokenIn.token,
        tokenOut: tokenOut.token,
        intermediateToken: weth.token,
        amount,
        slippageBps,
    });
    const quotePair = useLiquidityPair({ routerAddress, tokenA: tokenIn.token, tokenB: tokenOut.token });

    const hasValidRouter = isAddress(routerAddress);
    const hasValidTokenInAddress = isAddress(tokenInAddress);
    const hasValidTokenOutAddress = isAddress(tokenOutAddress);
    const routeSetupComplete = hasValidRouter && hasValidTokenInAddress && hasValidTokenOutAddress;
    const hasAmount = quote.amountIn !== undefined && quote.amountIn > 0n;
    const hasInsufficientBalance = Boolean(isConnected && quote.amountIn !== undefined && tokenIn.balance !== undefined && tokenIn.balance < quote.amountIn);
    const isBusy = isApproving || isSwapPending || isConfirming;
    const networkLabel = chain?.name ?? "EVM";
    const routeLabel = quote.routeLabel ?? (tokenIn.token && tokenOut.token ? `${tokenIn.token.symbol} to ${tokenOut.token.symbol}` : "Direct token route");
    const outputValue = quote.amountOut && tokenOut.token ? formatTokenAmount(quote.amountOut, tokenOut.token.decimals, 8) : "";
    const shouldShowQuote = routeSetupComplete && Boolean(amount) && hasAmount;
    const hasHighSlippage = slippageBps > 5_000;

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
            hasAmount &&
            quote.amountOutMin !== undefined &&
            !quote.error &&
            !quote.isLoading &&
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
        if (!hasAmount) return "Enter an amount";
        if (hasInsufficientBalance) return "Insufficient balance";
        if (quote.error) return "Route unavailable";
        if (quote.isLoading) return "Fetching quote";
        if (needsApproval) return `Approve ${tokenIn.token?.symbol ?? "token"}`;
        return "Swap";
    }, [hasAmount, hasInsufficientBalance, isApproving, isConfirming, isConnected, isSwapPending, needsApproval, publicClient, quote.error, quote.isLoading, routeSetupComplete, tokenIn.token, tokenOut.token, tx.hash, tx.status]);

    const isActionDisabled = isConnected ? !canSubmit : !openConnectModal || isBusy;
    const routeStatusMessage = routeSetupComplete ? `Route configured: ${routeLabel}` : "Swap route is not configured";
    const inlineError = !publicClient && isConnected
        ? "Unsupported network or RPC unavailable. Switch to a supported EVM network."
        : tokenIn.error || tokenOut.error
          ? "Token is not supported or metadata could not be loaded."
          : hasHighSlippage
            ? "Slippage is very high. Review settings before swapping."
            : undefined;

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

    async function submit() {
        if (!account || !hasValidRouter || !tokenIn.token || !tokenOut.token || quote.amountIn === undefined || quote.amountIn <= 0n || quote.amountOutMin === undefined) return;
        if (!publicClient) {
            setTx({ title: "Unsupported network", status: "error", message: "Switch to a supported EVM network or check your RPC URL." });
            return;
        }

        setIsConfirming(true);
        try {
            if (needsApproval) {
                if (!tokenIn.token) return;
                setTx({ title: "Approve pending", status: "pending", message: `Approving ${tokenIn.token.symbol}` });
                const hash = await approve(tokenIn.token.address, routerAddress as Address, quote.amountIn);
                setTx({ title: "Approve submitted", status: "pending", hash, message: "Waiting for on-chain confirmation" });
                const receipt = await publicClient.waitForTransactionReceipt({ hash });
                if (receipt.status !== "success") throw new Error("Approval transaction reverted");
                tokenIn.refetch();
                setTx({ title: "Approve confirmed", status: "success", hash, message: `${tokenIn.token.symbol} allowance updated. You can swap now.` });
                return;
            }

            const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60);
            const path = quote.path ?? [tokenIn.token.address, tokenOut.token.address];
            setTx({ title: "Swap pending", status: "pending", message: "Confirm the transaction in your wallet" });
            const hash = await writeContractAsync({
                address: routerAddress as Address,
                abi: routerAbi,
                functionName: "swapExactTokensForTokens",
                args: [quote.amountIn, quote.amountOutMin, path, account, deadline],
            });
            setTx({ title: "Swap submitted", status: "pending", hash, message: "Waiting for on-chain confirmation" });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status !== "success") throw new Error("Swap transaction reverted");
            tokenIn.refetch();
            tokenOut.refetch();
            setTx({ title: "Swap confirmed", status: "success", hash, message: "Balances updated." });
        } catch (caught) {
            setTx({
                title: needsApproval ? "Approve failed" : "Swap failed",
                status: "error",
                message: normalizeTransactionError(caught, needsApproval ? "Approval failed. Try again from your wallet." : "Swap failed. Check route, liquidity, and wallet status."),
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
        void submit();
    }

    return (
        <>
            <section className="min-w-0 w-[min(100%,440px)] max-w-full rounded-[1.5rem] border border-white/10 bg-[#101624] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.35)]" aria-label="Swap tokens">
                <div className="mb-4 flex min-w-0 items-center justify-between gap-4">
                    <div>
                        <div className="inline-flex rounded-full bg-white/[0.06] p-1 text-sm font-black text-slate-400">
                            <span className="rounded-full bg-white px-4 py-1.5 text-slate-950">Swap</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">{networkLabel}</p>
                    </div>

                    <button
                        type="button"
                        aria-label="Open swap settings"
                        onClick={() => setIsSettingsOpen(true)}
                        className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-lg text-slate-200 transition hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                    >
                        ⚙
                    </button>
                </div>

                <div className="grid min-w-0 max-w-full gap-1">
                    <TokenAmountPanel
                        label="You pay"
                        amount={amount}
                        token={tokenIn.token}
                        balance={tokenIn.balance}
                        showMax
                        tokenTone="pay"
                        onAmountChange={setAmount}
                        onMax={setMaxAmount}
                        onTokenClick={() => setTokenDialog("pay")}
                    />

                    <SwapDirectionButton disabled={quote.isLoading || isBusy} onClick={switchTokens} />

                    <TokenAmountPanel
                        label="You receive"
                        amount={outputValue}
                        token={tokenOut.token}
                        balance={tokenOut.balance}
                        readOnly
                        isLoading={quote.isLoading}
                        tokenTone="receive"
                        onTokenClick={() => setTokenDialog("receive")}
                    />
                </div>

                <div className="mt-3 min-w-0 max-w-full rounded-[1.25rem] border border-white/[0.08] bg-white/[0.035] p-3">
                    <div className="flex min-w-0 items-center justify-between gap-3">
                        <p className="min-w-0 truncate text-sm text-slate-300" aria-live="polite">
                            {routeStatusMessage}
                        </p>
                        <button
                            type="button"
                            onClick={() => setIsSettingsOpen(true)}
                            className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-black text-slate-100 transition hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                        >
                            {routeSetupComplete ? "Settings" : "Configure route"}
                        </button>
                    </div>
                </div>

                {inlineError ? (
                    <p role="alert" className="mt-3 rounded-[1.25rem] border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                        {inlineError}
                    </p>
                ) : null}

                <div className="mt-3 min-w-0 max-w-full">
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
                    />
                </div>

                <div className="mt-4 min-w-0 max-w-full">
                    <SwapActionButton label={actionLabel} disabled={isActionDisabled} loading={isBusy || quote.isLoading} onClick={handlePrimaryAction} />
                </div>
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
                onChange={updateTokenOut}
                onClose={() => setTokenDialog(null)}
            />

            <TransactionToast tx={tx} />
        </>
    );
}
