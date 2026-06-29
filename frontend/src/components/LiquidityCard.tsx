import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useState } from "react";
import { type Address, formatUnits, isAddress, parseUnits } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { routerAbi } from "../abis";
import { useApproval } from "../hooks/useApproval";
import { useDeploymentConfig } from "../hooks/useDeploymentConfig";
import { useLiquidityPair } from "../hooks/useLiquidityPair";
import { useToken } from "../hooks/useToken";
import { useTokenList } from "../hooks/useTokenList";
import { normalizeTransactionError } from "../lib/errors";
import { compactAddress, formatTokenAmount } from "../lib/format";
import {
    DEFAULT_DEADLINE_MINUTES,
    DEFAULT_ROUTER_ADDRESS,
    DEFAULT_SLIPPAGE_BPS,
    DEFAULT_TOKEN_IN_ADDRESS,
    DEFAULT_TOKEN_OUT_ADDRESS,
    STORAGE_KEYS,
    applySlippage,
    loadStorage,
    persist,
    sanitizeDeadlineMinutes,
    sanitizeSlippageBps,
} from "../lib/tradeConfig";
import type { TokenInfo, TransactionState } from "../types";
import { SwapActionButton } from "./swap/SwapActionButton";
import { SwapSettingsDialog } from "./swap/SwapSettingsDialog";
import { TokenAmountPanel } from "./swap/TokenAmountPanel";
import { TokenSelectorDialog } from "./swap/TokenSelectorDialog";
import { TransactionToast } from "./TransactionToast";

type LiquidityMode = "add" | "remove";
type LastEditedAmount = "tokenA" | "tokenB" | null;

function parseTokenAmount(value: string, decimals: number) {
    if (!value.trim()) return undefined;

    try {
        const parsed = parseUnits(value, decimals);
        return parsed > 0n ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function tokenPairLabel(tokenA?: TokenInfo, tokenB?: TokenInfo) {
    if (!tokenA || !tokenB) return "Token pair";
    return `${tokenA.symbol} / ${tokenB.symbol}`;
}

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
            <dt className="text-slate-500">{label}</dt>
            <dd className="min-w-0 truncate text-right font-bold text-slate-200">{value}</dd>
        </div>
    );
}

function minBigInt(left: bigint, right: bigint) {
    return left < right ? left : right;
}

function sqrtBigInt(value: bigint) {
    if (value < 2n) return value;

    let x0 = value / 2n;
    let x1 = (x0 + value / x0) / 2n;

    while (x1 < x0) {
        x0 = x1;
        x1 = (x0 + value / x0) / 2n;
    }

    return x0;
}

function formatPercentBps(value?: bigint) {
    if (value === undefined) return "-";
    const whole = value / 100n;
    const fraction = (value % 100n).toString().padStart(2, "0").replace(/0+$/, "");
    return fraction ? `${whole}.${fraction}%` : `${whole}%`;
}

function quoteLiquidityAmount(input?: bigint, reserveIn?: bigint, reserveOut?: bigint) {
    if (!input || !reserveIn || !reserveOut || reserveIn === 0n) return undefined;
    return (input * reserveOut) / reserveIn;
}

type LiquidityCardProps = {
    defaultMode?: LiquidityMode;
};

export function LiquidityCard({ defaultMode = "add" }: LiquidityCardProps) {
    const { address: account, chain, isConnected } = useAccount();
    const { openConnectModal } = useConnectModal();
    const publicClient = usePublicClient();
    const { approve, isApproving } = useApproval();
    const { writeContractAsync, isPending: isWritePending } = useWriteContract();

    const [mode, setMode] = useState<LiquidityMode>(defaultMode);
    const [routerAddress, setRouterAddress] = useState(() => loadStorage(STORAGE_KEYS.router, DEFAULT_ROUTER_ADDRESS));
    const [tokenAAddress, setTokenAAddress] = useState(() => loadStorage(STORAGE_KEYS.tokenIn, DEFAULT_TOKEN_IN_ADDRESS));
    const [tokenBAddress, setTokenBAddress] = useState(() => loadStorage(STORAGE_KEYS.tokenOut, DEFAULT_TOKEN_OUT_ADDRESS));
    const [amountA, setAmountA] = useState("");
    const [amountB, setAmountB] = useState("");
    const [lastEditedAmount, setLastEditedAmount] = useState<LastEditedAmount>(null);
    const [lpAmount, setLpAmount] = useState("");
    const [slippageBps, setSlippageBps] = useState(() => sanitizeSlippageBps(Number(loadStorage(STORAGE_KEYS.slippageBps, String(DEFAULT_SLIPPAGE_BPS)))));
    const [deadlineMinutes, setDeadlineMinutes] = useState(() => sanitizeDeadlineMinutes(Number(loadStorage(STORAGE_KEYS.deadlineMinutes, String(DEFAULT_DEADLINE_MINUTES)))));
    const [tx, setTx] = useState<TransactionState>({ title: "", status: "idle" });
    const [isConfirming, setIsConfirming] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [tokenDialog, setTokenDialog] = useState<"tokenA" | "tokenB" | null>(null);

    const deployment = useDeploymentConfig();
    const tokenList = useTokenList({ deployment: deployment.deployment, extraAddresses: [tokenAAddress, tokenBAddress] });

    const tokenA = useToken(tokenAAddress, routerAddress);
    const tokenB = useToken(tokenBAddress, routerAddress);
    const pair = useLiquidityPair({ routerAddress, tokenA: tokenA.token, tokenB: tokenB.token });
    const lpToken = useToken(pair.pairAddress ?? "", routerAddress);

    const hasValidRouter = isAddress(routerAddress);
    const hasValidTokenAAddress = isAddress(tokenAAddress);
    const hasValidTokenBAddress = isAddress(tokenBAddress);
    const routeSetupComplete = Boolean(hasValidRouter && hasValidTokenAAddress && hasValidTokenBAddress && tokenA.token && tokenB.token);
    const networkLabel = chain?.name ?? "EVM";
    const isBusy = isApproving || isWritePending || isConfirming;

    const amountAValue = tokenA.token ? parseTokenAmount(amountA, tokenA.token.decimals) : undefined;
    const amountBValue = tokenB.token ? parseTokenAmount(amountB, tokenB.token.decimals) : undefined;
    const lpAmountValue = parseTokenAmount(lpAmount, 18);

    const hasAddAmounts = amountAValue !== undefined && amountBValue !== undefined;
    const hasInsufficientTokenA = Boolean(amountAValue !== undefined && tokenA.balance !== undefined && tokenA.balance < amountAValue);
    const hasInsufficientTokenB = Boolean(amountBValue !== undefined && tokenB.balance !== undefined && tokenB.balance < amountBValue);
    const hasInsufficientAddBalance = hasInsufficientTokenA || hasInsufficientTokenB;
    const needsTokenAApproval = Boolean(amountAValue !== undefined && tokenA.allowance !== undefined && tokenA.allowance < amountAValue);
    const needsTokenBApproval = Boolean(amountBValue !== undefined && tokenB.allowance !== undefined && tokenB.allowance < amountBValue);

    const expectedTokenA = useMemo(() => {
        if (!lpAmountValue || !pair.reserveA || !pair.totalSupply || pair.totalSupply === 0n) return undefined;
        return (lpAmountValue * pair.reserveA) / pair.totalSupply;
    }, [lpAmountValue, pair.reserveA, pair.totalSupply]);

    const expectedTokenB = useMemo(() => {
        if (!lpAmountValue || !pair.reserveB || !pair.totalSupply || pair.totalSupply === 0n) return undefined;
        return (lpAmountValue * pair.reserveB) / pair.totalSupply;
    }, [lpAmountValue, pair.reserveB, pair.totalSupply]);

    const hasInsufficientLpBalance = Boolean(lpAmountValue !== undefined && lpToken.balance !== undefined && lpToken.balance < lpAmountValue);
    const needsLpApproval = Boolean(lpAmountValue !== undefined && lpToken.allowance !== undefined && lpToken.allowance < lpAmountValue);
    const pairLabel = tokenPairLabel(tokenA.token, tokenB.token);
    const hasHighSlippage = slippageBps > 5_000;
    const hasExistingPool = Boolean(pair.pairAddress && pair.reserveA !== undefined && pair.reserveB !== undefined && pair.totalSupply !== undefined && pair.totalSupply > 0n);

    useEffect(() => {
        if (!tokenA.token || !tokenB.token || !hasExistingPool) return;

        if (lastEditedAmount === "tokenA") {
            const nextAmountB = quoteLiquidityAmount(amountAValue, pair.reserveA, pair.reserveB);
            const nextValue = nextAmountB === undefined ? "" : formatUnits(nextAmountB, tokenB.token.decimals);
            if (amountB !== nextValue) setAmountB(nextValue);
        }

        if (lastEditedAmount === "tokenB") {
            const nextAmountA = quoteLiquidityAmount(amountBValue, pair.reserveB, pair.reserveA);
            const nextValue = nextAmountA === undefined ? "" : formatUnits(nextAmountA, tokenA.token.decimals);
            if (amountA !== nextValue) setAmountA(nextValue);
        }
    }, [amountA, amountAValue, amountB, amountBValue, hasExistingPool, lastEditedAmount, pair.reserveA, pair.reserveB, tokenA.token, tokenB.token]);

    useEffect(() => {
        if (!deployment.deployment) return;

        if (!loadStorage(STORAGE_KEYS.router) && deployment.deployment.router) updateRouter(deployment.deployment.router);
        if (!loadStorage(STORAGE_KEYS.tokenIn) && deployment.deployment.tokens[0]?.address) updateTokenA(deployment.deployment.tokens[0].address);
        if (!loadStorage(STORAGE_KEYS.tokenOut) && deployment.deployment.tokens[1]?.address) updateTokenB(deployment.deployment.tokens[1].address);
    }, [deployment.deployment]);

    const canAdd = Boolean(
        isConnected &&
            publicClient &&
            routeSetupComplete &&
            amountAValue !== undefined &&
            amountBValue !== undefined &&
            !hasInsufficientAddBalance &&
            !isBusy,
    );

    const canRemove = Boolean(
        isConnected &&
            publicClient &&
            routeSetupComplete &&
            pair.pairAddress &&
            lpAmountValue !== undefined &&
            !hasInsufficientLpBalance &&
            !pair.error &&
            !pair.isLoading &&
            !isBusy,
    );

    const actionLabel = useMemo(() => {
        if (tx.status === "pending" && tx.hash) return "Transaction submitted";
        if (isWritePending) return mode === "add" ? "Adding liquidity..." : "Removing liquidity...";
        if (isApproving || isConfirming) return "Confirming...";
        if (!isConnected) return "Connect Wallet";
        if (!publicClient) return "Route unavailable";
        if (!routeSetupComplete) return "Configure pool";

        if (mode === "add") {
            if (!hasAddAmounts) return "Enter token amounts";
            if (hasInsufficientAddBalance) return "Insufficient balance";
            if (needsTokenAApproval && tokenA.token) return `Approve ${tokenA.token.symbol}`;
            if (needsTokenBApproval && tokenB.token) return `Approve ${tokenB.token.symbol}`;
            return "Add liquidity";
        }

        if (pair.isLoading) return "Finding pool";
        if (pair.error) return "Pool unavailable";
        if (!pair.pairAddress) return "Pool not found";
        if (!lpAmountValue) return "Enter LP amount";
        if (hasInsufficientLpBalance) return "Insufficient LP balance";
        if (needsLpApproval) return "Approve LP";
        return "Remove liquidity";
    }, [hasAddAmounts, hasInsufficientAddBalance, hasInsufficientLpBalance, isApproving, isConfirming, isConnected, isWritePending, lpAmountValue, mode, needsLpApproval, needsTokenAApproval, needsTokenBApproval, pair.error, pair.isLoading, pair.pairAddress, publicClient, routeSetupComplete, tokenA.token, tokenB.token, tx.hash, tx.status]);

    const isActionDisabled = isConnected ? (mode === "add" ? !canAdd : !canRemove) : !openConnectModal || isBusy;
    const estimatedLp = useMemo(() => {
        if (amountAValue === undefined || amountBValue === undefined) return undefined;

        if (hasExistingPool && pair.reserveA && pair.reserveB && pair.totalSupply) {
            return minBigInt((amountAValue * pair.totalSupply) / pair.reserveA, (amountBValue * pair.totalSupply) / pair.reserveB);
        }

        const initialLiquidity = sqrtBigInt(amountAValue * amountBValue);
        return initialLiquidity > 1_000n ? initialLiquidity - 1_000n : 0n;
    }, [amountAValue, amountBValue, hasExistingPool, pair.reserveA, pair.reserveB, pair.totalSupply]);
    const poolShareBps = useMemo(() => {
        if (!estimatedLp || estimatedLp === 0n) return undefined;
        const totalSupplyAfter = (pair.totalSupply ?? 0n) + estimatedLp;
        if (totalSupplyAfter === 0n) return undefined;
        return (estimatedLp * 10_000n) / totalSupplyAfter;
    }, [estimatedLp, pair.totalSupply]);
    const depositRatio = amountAValue && amountBValue && tokenA.token && tokenB.token
        ? `1 ${tokenA.token.symbol} = ${formatTokenAmount((amountBValue * 10n ** BigInt(tokenA.token.decimals)) / amountAValue, tokenB.token.decimals, 6)} ${tokenB.token.symbol}`
        : "-";

    function updateRouter(value: string) {
        setRouterAddress(value);
        persist(STORAGE_KEYS.router, value);
    }

    function updateTokenA(value: string) {
        setTokenAAddress(value);
        persist(STORAGE_KEYS.tokenIn, value);
    }

    function updateTokenB(value: string) {
        setTokenBAddress(value);
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

    function setMaxTokenA() {
        if (!tokenA.balance || !tokenA.token) return;
        setLastEditedAmount("tokenA");
        setAmountA(formatUnits(tokenA.balance, tokenA.token.decimals));
    }

    function setMaxTokenB() {
        if (!tokenB.balance || !tokenB.token) return;
        setLastEditedAmount("tokenB");
        setAmountB(formatUnits(tokenB.balance, tokenB.token.decimals));
    }

    function setLpPercent(percentBps: bigint) {
        if (!lpToken.balance) return;
        setLpAmount(formatUnits((lpToken.balance * percentBps) / 10_000n, 18));
    }

    function handleAmountAChange(value: string) {
        setLastEditedAmount("tokenA");
        setAmountA(value);
    }

    function handleAmountBChange(value: string) {
        setLastEditedAmount("tokenB");
        setAmountB(value);
    }

    async function submitAdd() {
        if (!account || !publicClient || !hasValidRouter || !tokenA.token || !tokenB.token || amountAValue === undefined || amountBValue === undefined) return;

        setIsConfirming(true);
        try {
            if (needsTokenAApproval) {
                setTx({ title: "Approve pending", status: "pending", message: `Approving ${tokenA.token.symbol}` });
                const hash = await approve(tokenA.token.address, routerAddress as Address, amountAValue);
                setTx({ title: "Approve submitted", status: "pending", hash, message: "Waiting for on-chain confirmation" });
                const receipt = await publicClient.waitForTransactionReceipt({ hash });
                if (receipt.status !== "success") throw new Error("Approval transaction reverted");
                tokenA.refetch();
                setTx({ title: "Approve confirmed", status: "success", hash, message: `${tokenA.token.symbol} allowance updated. Add liquidity again.` });
                return;
            }

            if (needsTokenBApproval) {
                setTx({ title: "Approve pending", status: "pending", message: `Approving ${tokenB.token.symbol}` });
                const hash = await approve(tokenB.token.address, routerAddress as Address, amountBValue);
                setTx({ title: "Approve submitted", status: "pending", hash, message: "Waiting for on-chain confirmation" });
                const receipt = await publicClient.waitForTransactionReceipt({ hash });
                if (receipt.status !== "success") throw new Error("Approval transaction reverted");
                tokenB.refetch();
                setTx({ title: "Approve confirmed", status: "success", hash, message: `${tokenB.token.symbol} allowance updated. Add liquidity again.` });
                return;
            }

            const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60);
            setTx({ title: "Add liquidity pending", status: "pending", message: "Confirm the transaction in your wallet" });
            const hash = await writeContractAsync({
                address: routerAddress as Address,
                abi: routerAbi,
                functionName: "addLiquidity",
                args: [tokenA.token.address, tokenB.token.address, amountAValue, amountBValue, applySlippage(amountAValue, slippageBps), applySlippage(amountBValue, slippageBps), account, deadline],
            });
            setTx({ title: "Add liquidity submitted", status: "pending", hash, message: "Waiting for on-chain confirmation" });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status !== "success") throw new Error("Add liquidity transaction reverted");
            tokenA.refetch();
            tokenB.refetch();
            pair.refetch();
            lpToken.refetch();
            setTx({ title: "Liquidity added", status: "success", hash, message: `${pairLabel} pool position updated.` });
        } catch (caught) {
            setTx({ title: "Add liquidity failed", status: "error", message: normalizeTransactionError(caught, "Add liquidity failed. Check token balances, approvals, and pool ratio.") });
        } finally {
            setIsConfirming(false);
        }
    }

    async function submitRemove() {
        if (!account || !publicClient || !hasValidRouter || !tokenA.token || !tokenB.token || !pair.pairAddress || lpAmountValue === undefined) return;

        const minTokenA = expectedTokenA === undefined ? 0n : applySlippage(expectedTokenA, slippageBps);
        const minTokenB = expectedTokenB === undefined ? 0n : applySlippage(expectedTokenB, slippageBps);

        setIsConfirming(true);
        try {
            if (needsLpApproval) {
                setTx({ title: "Approve pending", status: "pending", message: "Approving LP tokens" });
                const hash = await approve(pair.pairAddress, routerAddress as Address, lpAmountValue);
                setTx({ title: "Approve submitted", status: "pending", hash, message: "Waiting for on-chain confirmation" });
                const receipt = await publicClient.waitForTransactionReceipt({ hash });
                if (receipt.status !== "success") throw new Error("Approval transaction reverted");
                lpToken.refetch();
                setTx({ title: "Approve confirmed", status: "success", hash, message: "LP allowance updated. Remove liquidity again." });
                return;
            }

            const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60);
            setTx({ title: "Remove liquidity pending", status: "pending", message: "Confirm the transaction in your wallet" });
            const hash = await writeContractAsync({
                address: routerAddress as Address,
                abi: routerAbi,
                functionName: "removeLiquidity",
                args: [tokenA.token.address, tokenB.token.address, lpAmountValue, minTokenA, minTokenB, account, deadline],
            });
            setTx({ title: "Remove liquidity submitted", status: "pending", hash, message: "Waiting for on-chain confirmation" });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status !== "success") throw new Error("Remove liquidity transaction reverted");
            tokenA.refetch();
            tokenB.refetch();
            pair.refetch();
            lpToken.refetch();
            setTx({ title: "Liquidity removed", status: "success", hash, message: `${pairLabel} pool position updated.` });
        } catch (caught) {
            setTx({ title: "Remove liquidity failed", status: "error", message: normalizeTransactionError(caught, "Remove liquidity failed. Check LP balance, approval, and pool state.") });
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

        if (mode === "add") {
            if (!canAdd) return;
            void submitAdd();
            return;
        }

        if (!canRemove) return;
        void submitRemove();
    }

    return (
        <>
            <section className="min-w-0 w-[min(100%,440px)] max-w-full rounded-[1.5rem] border border-white/10 bg-[#101624] p-5 shadow-[0_22px_70px_rgba(0,0,0,0.35)]" aria-label="Manage liquidity">
                <div className="mb-4 flex min-w-0 items-center justify-between gap-4">
                    <div>
                        <div className="inline-flex rounded-full bg-white/[0.06] p-1 text-sm font-black text-slate-400">
                            <button
                                type="button"
                                onClick={() => setMode("add")}
                                className={`rounded-full px-4 py-1.5 transition ${mode === "add" ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"}`}
                            >
                                Add
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode("remove")}
                                className={`rounded-full px-4 py-1.5 transition ${mode === "remove" ? "bg-white text-slate-950" : "text-slate-400 hover:text-white"}`}
                            >
                                Remove
                            </button>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">{networkLabel}</p>
                    </div>

                    <button
                        type="button"
                        aria-label="Open liquidity settings"
                        onClick={() => setIsSettingsOpen(true)}
                        className="grid h-10 w-10 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-lg text-slate-200 transition hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                    >
                        ⚙
                    </button>
                </div>

                {mode === "add" ? (
                    <div className="grid min-w-0 max-w-full gap-1">
                        <TokenAmountPanel
                            label="Token A"
                            amount={amountA}
                            token={tokenA.token}
                            balance={tokenA.balance}
                            showMax
                            tokenTone="pay"
                            onAmountChange={handleAmountAChange}
                            onMax={setMaxTokenA}
                            onTokenClick={() => setTokenDialog("tokenA")}
                        />
                        <TokenAmountPanel
                            label="Token B"
                            amount={amountB}
                            token={tokenB.token}
                            balance={tokenB.balance}
                            showMax
                            tokenTone="receive"
                            onAmountChange={handleAmountBChange}
                            onMax={setMaxTokenB}
                            onTokenClick={() => setTokenDialog("tokenB")}
                        />
                        {hasExistingPool ? (
                            <p className="px-2 pt-2 text-xs text-slate-500">Amounts auto-follow the current reserve ratio. Edit either side to recalculate the other.</p>
                        ) : null}
                    </div>
                ) : (
                    <section className="min-w-0 w-full max-w-full rounded-[1.25rem] bg-[#151b29] p-4 shadow-inner" aria-label="LP amount panel">
                        <div className="flex min-w-0 items-start justify-between gap-3">
                            <div className="min-w-0">
                                <label htmlFor="lp-amount" className="text-sm font-bold text-slate-300">
                                    LP tokens
                                </label>
                                <p className="mt-1 truncate text-xs text-slate-500">Balance: {formatTokenAmount(lpToken.balance, 18)} UNI-V2</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                                {[
                                    { label: "25%", percent: 2_500n },
                                    { label: "50%", percent: 5_000n },
                                    { label: "75%", percent: 7_500n },
                                    { label: "MAX", percent: 10_000n },
                                ].map(({ label, percent }) => (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() => setLpPercent(percent)}
                                        className="rounded-full bg-pink-500/15 px-2.5 py-1 text-xs font-black text-pink-100 transition hover:bg-pink-500/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="mt-4 flex min-w-0 w-full max-w-full items-center gap-2">
                            <input
                                id="lp-amount"
                                value={lpAmount}
                                type="text"
                                inputMode="decimal"
                                onChange={(event) => setLpAmount(event.target.value)}
                                placeholder="0"
                                aria-label="LP tokens"
                                className="min-w-0 w-0 flex-1 bg-transparent text-4xl font-black leading-none tracking-tight text-white outline-none placeholder:text-slate-700 sm:text-5xl"
                            />
                            <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.07] px-3 py-2 text-sm font-black text-white">UNI-V2</span>
                        </div>
                    </section>
                )}

                <div className="mt-3 min-w-0 max-w-full rounded-[1.25rem] border border-white/[0.08] bg-white/[0.035] p-3">
                    <dl className="grid gap-2">
                        <DetailRow label="Pool" value={pairLabel} />
                        <DetailRow label="Pair" value={pair.isLoading ? "Finding pool..." : pair.pairAddress ? compactAddress(pair.pairAddress) : mode === "add" ? "Will be created" : "Not found"} />
                        {mode === "add" ? (
                            <>
                                <DetailRow label="Deposit ratio" value={depositRatio} />
                                <DetailRow label="Estimated LP" value={formatTokenAmount(estimatedLp, 18)} />
                                <DetailRow label="Pool share" value={formatPercentBps(poolShareBps)} />
                                <DetailRow label="Slippage" value={`${slippageBps / 100}%`} />
                            </>
                        ) : (
                            <>
                                <DetailRow label="Receive A" value={`${formatTokenAmount(expectedTokenA, tokenA.token?.decimals ?? 18)} ${tokenA.token?.symbol ?? ""}`} />
                                <DetailRow label="Receive B" value={`${formatTokenAmount(expectedTokenB, tokenB.token?.decimals ?? 18)} ${tokenB.token?.symbol ?? ""}`} />
                            </>
                        )}
                    </dl>

                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-white/[0.08] pt-3">
                        <p className="min-w-0 truncate text-sm text-slate-300" aria-live="polite">
                            {routeSetupComplete ? `${pairLabel} configured` : "Liquidity route is not configured"}
                        </p>
                        <button
                            type="button"
                            onClick={() => setIsSettingsOpen(true)}
                            className="shrink-0 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-black text-slate-100 transition hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                        >
                            {routeSetupComplete ? "Settings" : "Configure"}
                        </button>
                    </div>
                </div>

                {pair.error || hasHighSlippage ? (
                    <p role="alert" className="mt-3 rounded-[1.25rem] border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                        {pair.error ? "Pool data could not be loaded. Check router, tokens, and network." : "Slippage is very high. Review settings before continuing."}
                    </p>
                ) : null}

                <div className="mt-4 min-w-0 max-w-full">
                    <SwapActionButton label={actionLabel} disabled={isActionDisabled} loading={isBusy || pair.isLoading} onClick={handlePrimaryAction} />
                </div>
            </section>

            <SwapSettingsDialog
                open={isSettingsOpen}
                title="Liquidity settings"
                routeTitle="Pool configuration"
                tokenInLabel="Token A address"
                tokenOutLabel="Token B address"
                routerAddress={routerAddress}
                tokenInAddress={tokenAAddress}
                tokenOutAddress={tokenBAddress}
                slippageBps={slippageBps}
                deadlineMinutes={deadlineMinutes}
                hasValidRouter={hasValidRouter}
                hasValidTokenInAddress={hasValidTokenAAddress}
                hasValidTokenOutAddress={hasValidTokenBAddress}
                onClose={() => setIsSettingsOpen(false)}
                onRouterChange={updateRouter}
                onTokenInChange={updateTokenA}
                onTokenOutChange={updateTokenB}
                onSlippageChange={updateSlippage}
                onDeadlineChange={updateDeadline}
            />

            <TokenSelectorDialog
                open={tokenDialog === "tokenA"}
                title="Select token A"
                value={tokenAAddress}
                token={tokenA.token}
                isValidAddress={hasValidTokenAAddress}
                isLoading={tokenA.isLoading}
                error={tokenA.error}
                tokens={tokenList.tokens}
                tokenListLoading={tokenList.isLoading || deployment.isLoading}
                onChange={updateTokenA}
                onClose={() => setTokenDialog(null)}
            />

            <TokenSelectorDialog
                open={tokenDialog === "tokenB"}
                title="Select token B"
                value={tokenBAddress}
                token={tokenB.token}
                isValidAddress={hasValidTokenBAddress}
                isLoading={tokenB.isLoading}
                error={tokenB.error}
                tokens={tokenList.tokens}
                tokenListLoading={tokenList.isLoading || deployment.isLoading}
                onChange={updateTokenB}
                onClose={() => setTokenDialog(null)}
            />

            <TransactionToast tx={tx} />
        </>
    );
}
