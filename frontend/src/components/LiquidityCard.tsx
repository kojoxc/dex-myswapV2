import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useState } from "react";
import { type Address, formatUnits, isAddress, parseUnits } from "viem";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";

import { routerAbi } from "../abis";
import { useApproval } from "../hooks/useApproval";
import { useDeploymentConfig } from "../hooks/useDeploymentConfig";
import { useLiquidityPair } from "../hooks/useLiquidityPair";
import { useToken } from "../hooks/useToken";
import { useTokenList } from "../hooks/useTokenList";
import { useTransactionHistory } from "../hooks/useTransactionHistory";
import { sanitizeAmountInput } from "../lib/amountInput";
import { normalizeTransactionError } from "../lib/errors";
import { compactAddress, formatTokenAmount } from "../lib/format";
import { getWethAddress, isNativeAddress, NATIVE_ETH_ADDRESS } from "../lib/tokenRegistry";
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
import { SwapHistory } from "./SwapHistory";
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
    const { entries: historyEntries, addEntry: addHistoryEntry, clearHistory } = useTransactionHistory();
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [tokenDialog, setTokenDialog] = useState<"tokenA" | "tokenB" | null>(null);
    const [removeByTokenAmount, setRemoveByTokenAmount] = useState(false);
    const [removeAmountA, setRemoveAmountA] = useState("");
    const [removeAmountB, setRemoveAmountB] = useState("");
    const [lastEditedRemove, setLastEditedRemove] = useState<"removeA" | "removeB" | null>(null);

    const chainId = useChainId();
    const deployment = useDeploymentConfig();
    const tokenList = useTokenList({ deployment: deployment.deployment });
    const wethAddress = deployment.deployment?.weth ?? getWethAddress(chainId);

    const tokenA = useToken(tokenAAddress, routerAddress);
    const tokenB = useToken(tokenBAddress, routerAddress);
    const pair = useLiquidityPair({ routerAddress, tokenA: tokenA.token, tokenB: tokenB.token, wethAddress });
    const lpToken = useToken(pair.pairAddress ?? "", routerAddress);

    const hasValidRouter = isAddress(routerAddress);
    const tokenAIsNative = isNativeAddress(tokenAAddress);
    const tokenBIsNative = isNativeAddress(tokenBAddress);
    const hasValidTokenAAddress = isAddress(tokenAAddress) || tokenAIsNative;
    const hasValidTokenBAddress = isAddress(tokenBAddress) || tokenBIsNative;
    const hasNativePairWeth = !(tokenAIsNative || tokenBIsNative) || Boolean(wethAddress);
    const hasOneNativeSide = tokenAIsNative !== tokenBIsNative;
    const routeSetupComplete = Boolean(hasValidRouter && hasValidTokenAAddress && hasValidTokenBAddress && hasNativePairWeth && !(tokenAIsNative && tokenBIsNative) && tokenA.token && tokenB.token);

    // Clear selected tokens when chain changes and token is not supported
    useEffect(() => {
        if (!chainId || deployment.isLoading) return;
        const isNative = (addr: string) => isNativeAddress(addr);
        const hasToken = (addr: string) => isNative(addr) || (tokenList.tokens ?? []).some(
            (t) => t.address && t.address.toLowerCase() === addr.toLowerCase(),
        );

        if (tokenAAddress && !hasToken(tokenAAddress)) {
            updateTokenA("");
        }
        if (tokenBAddress && !hasToken(tokenBAddress)) {
            updateTokenB("");
        }
    }, [chainId, deployment.isLoading, tokenList.tokens, tokenAAddress, tokenBAddress]);
    const networkLabel = chain?.name ?? "EVM";
    const isBusy = isApproving || isWritePending || isConfirming;

    const amountAValue = tokenA.token ? parseTokenAmount(amountA, tokenA.token.decimals) : undefined;
    const amountBValue = tokenB.token ? parseTokenAmount(amountB, tokenB.token.decimals) : undefined;
    const lpAmountValue = parseTokenAmount(lpAmount, 18);

    const hasAddAmounts = amountAValue !== undefined && amountBValue !== undefined;
    const hasInsufficientTokenA = Boolean(amountAValue !== undefined && tokenA.balance !== undefined && tokenA.balance < amountAValue);
    const hasInsufficientTokenB = Boolean(amountBValue !== undefined && tokenB.balance !== undefined && tokenB.balance < amountBValue);
    const hasInsufficientAddBalance = hasInsufficientTokenA || hasInsufficientTokenB;
    const tokenAAllowanceFailed = tokenA.error && amountAValue !== undefined;
    const tokenBAllowanceFailed = tokenB.error && amountBValue !== undefined;
    const needsTokenAApproval = Boolean(amountAValue !== undefined && tokenA.allowance !== undefined && tokenA.allowance < amountAValue);
    const needsTokenBApproval = Boolean(amountBValue !== undefined && tokenB.allowance !== undefined && tokenB.allowance < amountBValue);

    const pairLabel = tokenPairLabel(tokenA.token, tokenB.token);
    const hasHighSlippage = slippageBps > 5_000;
    const hasExistingPool = Boolean(pair.pairAddress && pair.reserveA !== undefined && pair.reserveB !== undefined && pair.totalSupply !== undefined && pair.totalSupply > 0n);

    const removeAmountAValue = tokenA.token ? parseTokenAmount(removeAmountA, tokenA.token.decimals) : undefined;
    const removeAmountBValue = tokenB.token ? parseTokenAmount(removeAmountB, tokenB.token.decimals) : undefined;

    const computedLpFromRemoveA = removeAmountAValue && pair.totalSupply && pair.reserveA && pair.reserveA > 0n
        ? (removeAmountAValue * pair.totalSupply) / pair.reserveA
        : undefined;
    const computedLpFromRemoveB = removeAmountBValue && pair.totalSupply && pair.reserveB && pair.reserveB > 0n
        ? (removeAmountBValue * pair.totalSupply) / pair.reserveB
        : undefined;

    const effectiveLpValue = removeByTokenAmount
        ? (lastEditedRemove === "removeA" ? computedLpFromRemoveA : computedLpFromRemoveB)
        : lpAmountValue;

    const expectedTokenA = useMemo(() => {
        if (!effectiveLpValue || !pair.reserveA || !pair.totalSupply || pair.totalSupply === 0n) return undefined;
        return (effectiveLpValue * pair.reserveA) / pair.totalSupply;
    }, [effectiveLpValue, pair.reserveA, pair.totalSupply]);

    const expectedTokenB = useMemo(() => {
        if (!effectiveLpValue || !pair.reserveB || !pair.totalSupply || pair.totalSupply === 0n) return undefined;
        return (effectiveLpValue * pair.reserveB) / pair.totalSupply;
    }, [effectiveLpValue, pair.reserveB, pair.totalSupply]);

    // Auto-calculate the other token amount in remove-by-token mode
    useEffect(() => {
        if (!tokenA.token || !tokenB.token || !hasExistingPool || !removeByTokenAmount) return;
        const rA = pair.reserveA;
        const rB = pair.reserveB;
        if (rA === undefined || rB === undefined) return;

        if (lastEditedRemove === "removeA" && removeAmountAValue && rA > 0n) {
            const nextB = (removeAmountAValue * rB) / rA;
            const nextValue = formatUnits(nextB, tokenB.token.decimals);
            if (removeAmountB !== nextValue) setRemoveAmountB(nextValue);
        }

        if (lastEditedRemove === "removeB" && removeAmountBValue && rB > 0n) {
            const nextA = (removeAmountBValue * rA) / rB;
            const nextValue = formatUnits(nextA, tokenA.token.decimals);
            if (removeAmountA !== nextValue) setRemoveAmountA(nextValue);
        }
    }, [lastEditedRemove, removeAmountAValue, removeAmountBValue, hasExistingPool, pair.reserveA, pair.reserveB, tokenA.token, tokenB.token, removeByTokenAmount, removeAmountA, removeAmountB]);

    const hasInsufficientLpBalance = Boolean(effectiveLpValue !== undefined && lpToken.balance !== undefined && lpToken.balance < effectiveLpValue);
    const needsLpApproval = Boolean(effectiveLpValue !== undefined && lpToken.allowance !== undefined && lpToken.allowance < effectiveLpValue);

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
            !tokenAAllowanceFailed &&
            !tokenBAllowanceFailed &&
            !isBusy,
    );

    const canRemove = Boolean(
        isConnected &&
            publicClient &&
            routeSetupComplete &&
            pair.pairAddress &&
            effectiveLpValue !== undefined &&
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
        if (removeByTokenAmount) {
            if (!removeAmountAValue && !removeAmountBValue) return "Enter token amounts";
        } else {
            if (!lpAmountValue) return "Enter LP amount";
        }
        if (hasInsufficientLpBalance) return "Insufficient LP balance";
        if (needsLpApproval) return "Approve LP";
        return "Remove liquidity";
    }, [hasAddAmounts, hasInsufficientAddBalance, hasInsufficientLpBalance, isApproving, isConfirming, isConnected, isWritePending, lpAmountValue, mode, needsLpApproval, needsTokenAApproval, needsTokenBApproval, pair.error, pair.isLoading, pair.pairAddress, publicClient, removeAmountAValue, removeAmountBValue, removeByTokenAmount, routeSetupComplete, tokenA.token, tokenB.token, tx.hash, tx.status]);

    const isActionDisabled = isConnected ? (mode === "add" ? !canAdd : !canRemove) : !openConnectModal || isBusy;
    const liquidityInlineError = tokenAAllowanceFailed || tokenBAllowanceFailed
        ? "Token metadata could not be loaded. Check RPC connection and token addresses."
        : !hasNativePairWeth
          ? "Native ETH liquidity requires a configured WETH address for this network."
          : tokenAIsNative && tokenBIsNative
            ? "Select one native token side and one ERC20 token side."
            : pair.error
              ? "Pool data could not be loaded. Check router, tokens, and network."
              : hasHighSlippage
                ? "Slippage is very high. Review settings before continuing."
                : undefined;
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
            const hash = hasOneNativeSide
                ? await writeContractAsync({
                      address: routerAddress as Address,
                      abi: routerAbi,
                      functionName: "addLiquidityETH",
                      args: tokenAIsNative
                          ? [tokenB.token.address, amountBValue, applySlippage(amountBValue, slippageBps), applySlippage(amountAValue, slippageBps), account, deadline]
                          : [tokenA.token.address, amountAValue, applySlippage(amountAValue, slippageBps), applySlippage(amountBValue, slippageBps), account, deadline],
                      value: tokenAIsNative ? amountAValue : amountBValue,
                  })
                : await writeContractAsync({
                      address: routerAddress as Address,
                      abi: routerAbi,
                      functionName: "addLiquidity",
                      args: [tokenA.token.address, tokenB.token.address, amountAValue, amountBValue, applySlippage(amountAValue, slippageBps), applySlippage(amountBValue, slippageBps), account, deadline],
                  });
            setTx({ title: "Add liquidity submitted", status: "pending", hash, message: "Waiting for on-chain confirmation" });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status !== "success") throw new Error("Add liquidity transaction reverted");
            addHistoryEntry({ hash, type: "addLiquidity", timestamp: Date.now(), label: pairLabel });
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
        if (!account || !publicClient || !hasValidRouter || !tokenA.token || !tokenB.token || !pair.pairAddress || effectiveLpValue === undefined) return;

        const minTokenA = expectedTokenA === undefined ? 0n : applySlippage(expectedTokenA, slippageBps);
        const minTokenB = expectedTokenB === undefined ? 0n : applySlippage(expectedTokenB, slippageBps);

        setIsConfirming(true);
        try {
            if (needsLpApproval) {
                setTx({ title: "Approve pending", status: "pending", message: "Approving LP tokens" });
                const hash = await approve(pair.pairAddress, routerAddress as Address, effectiveLpValue);
                setTx({ title: "Approve submitted", status: "pending", hash, message: "Waiting for on-chain confirmation" });
                const receipt = await publicClient.waitForTransactionReceipt({ hash });
                if (receipt.status !== "success") throw new Error("Approval transaction reverted");
                lpToken.refetch();
                setTx({ title: "Approve confirmed", status: "success", hash, message: "LP allowance updated. Remove liquidity again." });
                return;
            }

            const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60);
            setTx({ title: "Remove liquidity pending", status: "pending", message: "Confirm the transaction in your wallet" });
            const hash = hasOneNativeSide
                ? await writeContractAsync({
                      address: routerAddress as Address,
                      abi: routerAbi,
                      functionName: "removeLiquidityETH",
                      args: tokenAIsNative
                          ? [tokenB.token.address, effectiveLpValue, minTokenB, minTokenA, account, deadline]
                          : [tokenA.token.address, effectiveLpValue, minTokenA, minTokenB, account, deadline],
                  })
                : await writeContractAsync({
                      address: routerAddress as Address,
                      abi: routerAbi,
                      functionName: "removeLiquidity",
                      args: [tokenA.token.address, tokenB.token.address, effectiveLpValue, minTokenA, minTokenB, account, deadline],
                  });
            setTx({ title: "Remove liquidity submitted", status: "pending", hash, message: "Waiting for on-chain confirmation" });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status !== "success") throw new Error("Remove liquidity transaction reverted");
            addHistoryEntry({ hash, type: "removeLiquidity", timestamp: Date.now(), label: pairLabel });
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

                {mode === "remove" && hasExistingPool ? (
                    <div className="mb-3 flex items-center justify-between px-1">
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
                            <input
                                type="checkbox"
                                checked={removeByTokenAmount}
                                onChange={(e) => {
                                    setRemoveByTokenAmount(e.target.checked);
                                    if (!e.target.checked) {
                                        setRemoveAmountA("");
                                        setRemoveAmountB("");
                                    }
                                }}
                                className="h-4 w-4 rounded border-white/20 bg-white/[0.06] text-pink-500 focus:ring-pink-300"
                            />
                            Remove by token amount
                        </label>
                    </div>
                ) : null}

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
                ) : removeByTokenAmount ? (
                    <div className="grid min-w-0 max-w-full gap-1">
                        <TokenAmountPanel
                            label={tokenA.token?.symbol ?? "Token A"}
                            amount={removeAmountA}
                            token={tokenA.token}
                            balance={undefined}
                            showMax={false}
                            tokenTone="pay"
                            onAmountChange={(value) => {
                                setLastEditedRemove("removeA");
                                setRemoveAmountA(value);
                            }}
                            onTokenClick={() => {}}
                        />
                        <TokenAmountPanel
                            label={tokenB.token?.symbol ?? "Token B"}
                            amount={removeAmountB}
                            token={tokenB.token}
                            balance={undefined}
                            showMax={false}
                            tokenTone="receive"
                            onAmountChange={(value) => {
                                setLastEditedRemove("removeB");
                                setRemoveAmountB(value);
                            }}
                            onTokenClick={() => {}}
                        />
                        {hasExistingPool ? (
                            <p className="px-2 pt-2 text-xs text-slate-500">Enter the amount of one token; the other will auto-calculate at the current ratio.</p>
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
                                onChange={(event) => setLpAmount(sanitizeAmountInput(event.target.value, 18))}
                                placeholder="0"
                                aria-label="LP tokens"
                                className="min-w-0 w-0 flex-1 bg-transparent text-2xl leading-none tracking-tight text-white outline-none placeholder:text-slate-700 sm:text-3xl"
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
                                {removeByTokenAmount && effectiveLpValue !== undefined ? (
                                    <DetailRow label="LP to burn" value={`${formatTokenAmount(effectiveLpValue, 18)} UNI-V2`} />
                                ) : null}
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

                {liquidityInlineError ? (
                    <p role="alert" className="mt-3 rounded-[1.25rem] border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                        {liquidityInlineError}
                    </p>
                ) : null}

                <div className="mt-4 min-w-0 max-w-full">
                    <SwapActionButton label={actionLabel} disabled={isActionDisabled} loading={isBusy || pair.isLoading} onClick={handlePrimaryAction} />
                </div>
            </section>

            <SwapSettingsDialog
                open={isSettingsOpen}
                title="Liquidity settings"
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

            <SwapHistory entries={historyEntries} onClear={clearHistory} />
        </>
    );
}
