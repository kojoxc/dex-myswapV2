import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { type Address, formatUnits, isAddress, parseUnits } from "viem";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";

import { routerAbi } from "../abis";
import { useApproval } from "../hooks/useApproval";
import { useDeploymentConfig } from "../hooks/useDeploymentConfig";
import { useLiquidityPair } from "../hooks/useLiquidityPair";
import { type PoolInfo, usePools } from "../hooks/usePools";
import { useToken } from "../hooks/useToken";
import { useTokenList } from "../hooks/useTokenList";
import { useTransactionHistory, type HistoryEntry } from "../hooks/useTransactionHistory";
import { sanitizeAmountInput } from "../lib/amountInput";
import { normalizeTransactionError } from "../lib/errors";
import { compactAddress, formatDisplayAmount, formatTokenAmount } from "../lib/format";
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
import { SwapDirectionButton } from "./swap/SwapDirectionButton";
import { SwapHistory } from "./SwapHistory";
import { SwapSettingsDialog } from "./swap/SwapSettingsDialog";
import { TokenAmountPanel } from "./swap/TokenAmountPanel";
import { TokenSelectorDialog } from "./swap/TokenSelectorDialog";
import { TransactionDetails, type TransactionDetailRow } from "./swap/TransactionDetails";
import { TransactionToast } from "./TransactionToast";

type LastEditedAmount = "tokenA" | "tokenB" | null;
type LiquidityMode = "add" | "remove";

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

function positionUnderlying(pool: PoolInfo, lpAmount?: bigint) {
    if (!lpAmount || pool.totalSupply === 0n) return { amountA: undefined, amountB: undefined };
    return {
        amountA: (lpAmount * pool.reserveA) / pool.totalSupply,
        amountB: (lpAmount * pool.reserveB) / pool.totalSupply,
    };
}

function formatPositionShare(lpBalance?: bigint, totalSupply?: bigint) {
    if (!lpBalance || !totalSupply || totalSupply === 0n) return "-";
    return formatPercentBps((lpBalance * 10_000n) / totalSupply);
}

function lpAmountClass(displayAmount: string) {
    const length = displayAmount.length;
    if (length > 14) return "lp-amount-input amount-long";
    if (length > 10) return "lp-amount-input amount-medium";
    return "lp-amount-input";
}

type LiquidityCardProps = {
    defaultMode?: LiquidityMode;
    historyEntries?: HistoryEntry[];
    onAddHistoryEntry?: (entry: HistoryEntry) => void;
};

export function LiquidityCard({ defaultMode = "add", historyEntries: extHistoryEntries, onAddHistoryEntry: extAddHistoryEntry }: LiquidityCardProps) {
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
    const [isLpAmountFocused, setIsLpAmountFocused] = useState(false);
    const [slippageBps, setSlippageBps] = useState(() => sanitizeSlippageBps(Number(loadStorage(STORAGE_KEYS.slippageBps, String(DEFAULT_SLIPPAGE_BPS)))));
    const [deadlineMinutes, setDeadlineMinutes] = useState(() => sanitizeDeadlineMinutes(Number(loadStorage(STORAGE_KEYS.deadlineMinutes, String(DEFAULT_DEADLINE_MINUTES)))));
    const [tx, setTx] = useState<TransactionState>({ title: "", status: "idle" });
    const [isConfirming, setIsConfirming] = useState(false);
    const internalHistory = useTransactionHistory();
    const historyEntries = extHistoryEntries ?? internalHistory.entries;
    const addHistoryEntry = extAddHistoryEntry ?? internalHistory.addEntry;
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [tokenDialog, setTokenDialog] = useState<"tokenA" | "tokenB" | null>(null);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [selectedRemovePair, setSelectedRemovePair] = useState<Address>();

    const chainId = useChainId();
    const deployment = useDeploymentConfig();
    const tokenList = useTokenList({ deployment: deployment.deployment });
    const wethAddress = deployment.deployment?.weth ?? getWethAddress(chainId);

    const tokenA = useToken(tokenAAddress, routerAddress);
    const tokenB = useToken(tokenBAddress, routerAddress);
    const pair = useLiquidityPair({ routerAddress, tokenA: tokenA.token, tokenB: tokenB.token, wethAddress });
    const lpToken = useToken(pair.pairAddress ?? "", routerAddress);
    const pools = usePools(routerAddress, 50);
    const removePositions = useMemo(
        () => pools.pools.filter((pool) => (pool.userLpBalance ?? 0n) > 0n),
        [pools.pools],
    );
    const selectedPosition = useMemo(
        () => removePositions.find((pool) => pool.pairAddress.toLowerCase() === selectedRemovePair?.toLowerCase()),
        [removePositions, selectedRemovePair],
    );

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
    const lpTokenLabel = pairLabel === "Token pair" ? "LP" : `${pairLabel} LP`;
    const hasHighSlippage = slippageBps > 5_000;
    const hasExistingPool = Boolean(pair.pairAddress && pair.reserveA !== undefined && pair.reserveB !== undefined && pair.totalSupply !== undefined && pair.totalSupply > 0n);
    const hasInsufficientLpBalance = Boolean(lpAmountValue !== undefined && lpToken.balance !== undefined && lpToken.balance < lpAmountValue);
    const needsLpApproval = Boolean(lpAmountValue !== undefined && lpToken.allowance !== undefined && lpToken.allowance < lpAmountValue);

    const expectedTokenA = useMemo(() => {
        if (!lpAmountValue || !pair.reserveA || !pair.totalSupply || pair.totalSupply === 0n) return undefined;
        return (lpAmountValue * pair.reserveA) / pair.totalSupply;
    }, [lpAmountValue, pair.reserveA, pair.totalSupply]);

    const expectedTokenB = useMemo(() => {
        if (!lpAmountValue || !pair.reserveB || !pair.totalSupply || pair.totalSupply === 0n) return undefined;
        return (lpAmountValue * pair.reserveB) / pair.totalSupply;
    }, [lpAmountValue, pair.reserveB, pair.totalSupply]);

    const selectedPositionUnderlying = selectedPosition ? positionUnderlying(selectedPosition, selectedPosition.userLpBalance) : { amountA: undefined, amountB: undefined };
    const removeAmountShare = lpAmountValue && lpToken.balance && lpToken.balance > 0n ? formatPercentBps((lpAmountValue * 10_000n) / lpToken.balance) : "0%";
    const displayLpAmount = isLpAmountFocused ? lpAmount : formatDisplayAmount(lpAmount, 6);
    const lpInputClass = lpAmountClass(displayLpAmount || "0");

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

    useEffect(() => {
        if (mode !== "remove" || removePositions.length !== 1 || selectedRemovePair) return;
        const [position] = removePositions;
        setSelectedRemovePair(position.pairAddress);
        updateTokenA(position.tokenA.address);
        updateTokenB(position.tokenB.address);
    }, [mode, removePositions, selectedRemovePair]);

    useEffect(() => {
        if (mode !== "remove" || selectedRemovePair || removePositions.length === 0) return;

        const currentPosition = removePositions.find(
            (position) =>
                (position.tokenA.address.toLowerCase() === tokenAAddress.toLowerCase() && position.tokenB.address.toLowerCase() === tokenBAddress.toLowerCase()) ||
                (position.tokenA.address.toLowerCase() === tokenBAddress.toLowerCase() && position.tokenB.address.toLowerCase() === tokenAAddress.toLowerCase()),
        );

        if (currentPosition) setSelectedRemovePair(currentPosition.pairAddress);
    }, [mode, removePositions, selectedRemovePair, tokenAAddress, tokenBAddress]);

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
            selectedPosition &&
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
        if (mode === "remove") {
            if (pools.isLoading) return "Loading positions";
            if (removePositions.length === 0) return "No LP positions";
            if (!selectedPosition) return "Select position";
            if (!routeSetupComplete) return "Configure pool";
            if (pair.isLoading) return "Finding pool";
            if (pair.error) return "Pool unavailable";
            if (!pair.pairAddress) return "Pool not found";
            if (!lpAmountValue) return "Enter LP amount";
            if (hasInsufficientLpBalance) return "Insufficient LP balance";
            if (needsLpApproval) return "Approve LP";
            return "Remove liquidity";
        }

        if (!routeSetupComplete) return "Configure pool";
        if (!hasAddAmounts) return "Enter token amounts";
        if (hasInsufficientAddBalance) return "Insufficient balance";
        if (needsTokenAApproval && tokenA.token) return `Approve ${tokenA.token.symbol}`;
        if (needsTokenBApproval && tokenB.token) return `Approve ${tokenB.token.symbol}`;
        return "Add liquidity";
    }, [hasAddAmounts, hasInsufficientAddBalance, hasInsufficientLpBalance, isApproving, isConfirming, isConnected, isWritePending, lpAmountValue, mode, needsLpApproval, needsTokenAApproval, needsTokenBApproval, pair.error, pair.isLoading, pair.pairAddress, pools.isLoading, publicClient, removePositions.length, routeSetupComplete, selectedPosition, tokenA.token, tokenB.token, tx.hash, tx.status]);

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
        ? `1 ${tokenA.token.symbol} = ${formatDisplayAmount(formatTokenAmount((amountBValue * 10n ** BigInt(tokenA.token.decimals)) / amountAValue, tokenB.token.decimals, 6), 6)} ${tokenB.token.symbol}`
        : "-";
    const pairAddressLabel = pair.isLoading ? "Finding pool..." : pair.pairAddress ? compactAddress(pair.pairAddress) : "Will be created";
    const liquidityDetailsRows: TransactionDetailRow[] = mode === "add"
        ? [
              { label: "Deposit ratio", value: depositRatio },
              { label: "Estimated LP", value: formatDisplayAmount(formatTokenAmount(estimatedLp, 18), 4) },
              { label: "Pool share", value: formatPercentBps(poolShareBps) },
              { label: "Slippage", value: `${slippageBps / 100}%` },
              { label: "Deadline", value: `${deadlineMinutes} min` },
              { label: "Pool", value: pairLabel },
              { label: "Pair", value: pairAddressLabel },
          ]
        : [
              { label: "Receive A", value: `${formatDisplayAmount(formatTokenAmount(expectedTokenA, tokenA.token?.decimals ?? 18))} ${tokenA.token?.symbol ?? ""}` },
              { label: "Receive B", value: `${formatDisplayAmount(formatTokenAmount(expectedTokenB, tokenB.token?.decimals ?? 18))} ${tokenB.token?.symbol ?? ""}` },
              { label: "Slippage", value: `${slippageBps / 100}%` },
              { label: "Deadline", value: `${deadlineMinutes} min` },
              { label: "Pool", value: pairLabel },
              { label: "Pair", value: pairAddressLabel },
          ];

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

    function selectRemovePosition(position: PoolInfo) {
        setSelectedRemovePair(position.pairAddress);
        updateTokenA(position.tokenA.address);
        updateTokenB(position.tokenB.address);
        setLpAmount("");
    }

    function setLpPercent(percentBps: bigint) {
        if (!lpToken.balance) return;
        setLpAmount(formatUnits((lpToken.balance * percentBps) / 10_000n, 18));
    }

    function isLpPercentActive(percentBps: bigint) {
        if (!lpToken.balance || lpAmountValue === undefined) return false;
        return lpAmountValue === (lpToken.balance * percentBps) / 10_000n;
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

    function handleAmountAChange(value: string) {
        setLastEditedAmount("tokenA");
        setAmountA(value);
    }

    function handleAmountBChange(value: string) {
        setLastEditedAmount("tokenB");
        setAmountB(value);
    }

    function switchLiquidityTokens() {
        const nextTokenA = tokenBAddress;
        const nextTokenB = tokenAAddress;
        setTokenAAddress(nextTokenA);
        setTokenBAddress(nextTokenB);
        persist(STORAGE_KEYS.tokenIn, nextTokenA);
        persist(STORAGE_KEYS.tokenOut, nextTokenB);
        setAmountA(amountB);
        setAmountB(amountA);
        setLastEditedAmount((value) => (value === "tokenA" ? "tokenB" : value === "tokenB" ? "tokenA" : null));
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
            addHistoryEntry({
                hash,
                type: "addLiquidity",
                timestamp: Date.now(),
                label: pairLabel,
                pairLabel,
                amountLabel: `${formatDisplayAmount(amountA)} ${tokenA.token.symbol} + ${formatDisplayAmount(amountB)} ${tokenB.token.symbol}`,
                status: "confirmed",
                blockNumber: receipt.blockNumber.toString(),
                transactionIndex: receipt.transactionIndex,
            });
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
            const hash = hasOneNativeSide
                ? await writeContractAsync({
                      address: routerAddress as Address,
                      abi: routerAbi,
                      functionName: "removeLiquidityETH",
                      args: tokenAIsNative
                          ? [tokenB.token.address, lpAmountValue, minTokenB, minTokenA, account, deadline]
                          : [tokenA.token.address, lpAmountValue, minTokenA, minTokenB, account, deadline],
                  })
                : await writeContractAsync({
                      address: routerAddress as Address,
                      abi: routerAbi,
                      functionName: "removeLiquidity",
                      args: [tokenA.token.address, tokenB.token.address, lpAmountValue, minTokenA, minTokenB, account, deadline],
                  });
            setTx({ title: "Remove liquidity submitted", status: "pending", hash, message: "Waiting for on-chain confirmation" });
            const receipt = await publicClient.waitForTransactionReceipt({ hash });
            if (receipt.status !== "success") throw new Error("Remove liquidity transaction reverted");
            addHistoryEntry({
                hash,
                type: "removeLiquidity",
                timestamp: Date.now(),
                label: pairLabel,
                pairLabel,
                amountLabel: `Received ${formatDisplayAmount(formatTokenAmount(expectedTokenA, tokenA.token.decimals))} ${tokenA.token.symbol} + ${formatDisplayAmount(formatTokenAmount(expectedTokenB, tokenB.token.decimals))} ${tokenB.token.symbol}`,
                status: "confirmed",
                blockNumber: receipt.blockNumber.toString(),
                transactionIndex: receipt.transactionIndex,
            });
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

        if (mode === "remove") {
            if (!canRemove) return;
            void submitRemove();
            return;
        }

        if (!canAdd) return;
        void submitAdd();
    }

    return (
        <>
            <section className="surface-card trade-card" aria-label="Manage liquidity">
                <div className="liquidity-header">
                    <div className="liquidity-heading-row">
                        <div className="min-w-0">
                            <h1>Liquidity</h1>
                            <p>{mode === "add" ? "Provide" : "Remove"} liquidity for {pairLabel}</p>
                        </div>
                        <button
                            type="button"
                            aria-label="Open liquidity settings"
                            onClick={() => setIsSettingsOpen(true)}
                            className="liquidity-settings-button"
                        >
                            <span aria-hidden="true">⚙</span>
                        </button>
                    </div>

                    <div className="liquidity-mode-tabs" role="tablist" aria-label="Liquidity mode">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={mode === "add"}
                            className={mode === "add" ? "is-active" : ""}
                            onClick={() => setMode("add")}
                        >
                            Add
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={mode === "remove"}
                            className={mode === "remove" ? "is-active" : ""}
                            onClick={() => setMode("remove")}
                        >
                            Remove
                        </button>
                    </div>
                </div>

                {mode === "add" ? (
                    <div className="grid min-w-0 max-w-full gap-3">
                        <div className="token-panels min-w-0 max-w-full">
                            <TokenAmountPanel
                                label="Sell"
                                amount={amountA}
                                token={tokenA.token}
                                balance={tokenA.balance}
                                showMax
                                tokenTone="pay"
                                onAmountChange={handleAmountAChange}
                                onMax={setMaxTokenA}
                                onSelectToken={() => setTokenDialog("tokenA")}
                            />

                            <SwapDirectionButton disabled={isBusy} onClick={switchLiquidityTokens} />

                            <TokenAmountPanel
                                label="Buy"
                                amount={amountB}
                                token={tokenB.token}
                                balance={tokenB.balance}
                                showMax
                                tokenTone="receive"
                                onAmountChange={handleAmountBChange}
                                onMax={setMaxTokenB}
                                onSelectToken={() => setTokenDialog("tokenB")}
                            />
                        </div>
                        <p className="px-2 pt-2 text-xs text-muted">Amounts follow the current pool ratio. Editing one amount recalculates the other.</p>
                    </div>
                ) : (
                    <div className="remove-liquidity-flow">
                        <section className="liquidity-positions" aria-label="Liquidity positions">
                            <div className="section-kicker">Your positions</div>
                            {pools.isLoading ? (
                                <div className="remove-empty-state">Loading wallet positions...</div>
                            ) : removePositions.length === 0 ? (
                                <div className="remove-empty-state">
                                    <p className="font-bold text-secondary">No LP positions found for this wallet.</p>
                                    <p>Standard liquidity removal starts from an existing LP position.</p>
                                    <div className="remove-empty-actions">
                                        <button type="button" onClick={() => setMode("add")}>Add liquidity</button>
                                        <Link to="/pools">View pools</Link>
                                    </div>
                                </div>
                            ) : (
                                <div className="position-list">
                                    {removePositions.map((position) => {
                                        const isSelected = selectedRemovePair?.toLowerCase() === position.pairAddress.toLowerCase();
                                        const underlying = positionUnderlying(position, position.userLpBalance);
                                        const positionLabel = `${position.tokenA.symbol} / ${position.tokenB.symbol}`;

                                        return (
                                            <button
                                                key={position.pairAddress}
                                                type="button"
                                                className={`position-card${isSelected ? " is-selected" : ""}`}
                                                onClick={() => selectRemovePosition(position)}
                                                aria-pressed={isSelected}
                                            >
                                                <span className="position-card-head">
                                                    <span className="position-token-stack" aria-hidden="true">
                                                        <span>{position.tokenA.symbol.slice(0, 2).toUpperCase()}</span>
                                                        <span>{position.tokenB.symbol.slice(0, 2).toUpperCase()}</span>
                                                    </span>
                                                    <span className="position-title">
                                                        <strong>{positionLabel}</strong>
                                                        <small>{compactAddress(position.pairAddress)}</small>
                                                    </span>
                                                </span>
                                                <span className="position-metrics">
                                                    <span><small>LP balance</small><strong>{formatDisplayAmount(formatTokenAmount(position.userLpBalance, 18))}</strong></span>
                                                    <span><small>Pool share</small><strong>{formatPositionShare(position.userLpBalance, position.totalSupply)}</strong></span>
                                                    <span><small>Underlying</small><strong>{formatDisplayAmount(formatTokenAmount(underlying.amountA, position.tokenA.decimals))} {position.tokenA.symbol} + {formatDisplayAmount(formatTokenAmount(underlying.amountB, position.tokenB.decimals))} {position.tokenB.symbol}</strong></span>
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {selectedPosition ? (
                            <>
                                <div className="lp-input-panel" aria-label="LP amount panel">
                                    <div className="lp-input-header">
                                        <div className="min-w-0">
                                            <label htmlFor="lp-amount" className="lp-input-label">LP amount</label>
                                            <span className="lp-input-balance">Balance: {formatDisplayAmount(formatTokenAmount(lpToken.balance, 18), 6)} {lpTokenLabel}</span>
                                        </div>
                                        <span className="remove-percentage">Removing {removeAmountShare}</span>
                                    </div>
                                    <div className="lp-input-main">
                                        <input
                                            id="lp-amount"
                                            value={displayLpAmount}
                                            type="text"
                                            inputMode="decimal"
                                            autoComplete="off"
                                            onChange={(event) => setLpAmount(sanitizeAmountInput(event.target.value, 18))}
                                            onFocus={() => setIsLpAmountFocused(true)}
                                            onBlur={() => setIsLpAmountFocused(false)}
                                            placeholder="0"
                                            aria-label="LP amount to remove"
                                            className={lpInputClass}
                                        />
                                        <span className="lp-token-badge">LP</span>
                                    </div>
                                    <div className="lp-percentage-actions" aria-label="LP amount shortcuts">
                                        <button type="button" className={isLpPercentActive(2_500n) ? "is-active" : ""} onClick={() => setLpPercent(2_500n)}>25%</button>
                                        <button type="button" className={isLpPercentActive(5_000n) ? "is-active" : ""} onClick={() => setLpPercent(5_000n)}>50%</button>
                                        <button type="button" className={isLpPercentActive(7_500n) ? "is-active" : ""} onClick={() => setLpPercent(7_500n)}>75%</button>
                                        <button type="button" className={isLpPercentActive(10_000n) ? "is-active" : ""} onClick={() => setLpPercent(10_000n)}>Max</button>
                                    </div>
                                </div>

                                <section className="withdrawal-estimate" aria-label="Withdrawal estimate">
                                    <div>
                                        <span>Receive as</span>
                                        <strong>Receive both tokens</strong>
                                    </div>
                                    <p>Standard liquidity removal returns both pool assets proportionally. This router does not expose token-only withdrawal or zap-out methods.</p>
                                    <div className="withdrawal-outputs">
                                        <span><small>Receive {tokenA.token?.symbol ?? "Token A"}</small><strong>{formatDisplayAmount(formatTokenAmount(expectedTokenA, tokenA.token?.decimals ?? 18))}</strong></span>
                                        <span><small>Receive {tokenB.token?.symbol ?? "Token B"}</small><strong>{formatDisplayAmount(formatTokenAmount(expectedTokenB, tokenB.token?.decimals ?? 18))}</strong></span>
                                    </div>
                                </section>
                            </>
                        ) : null}
                    </div>
                )}

                {!routeSetupComplete ? (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg surface-elevated p-3">
                        <p className="min-w-0 truncate text-xs text-muted" aria-live="polite">
                            Liquidity route is not configured
                        </p>
                        <button
                            type="button"
                            onClick={() => setIsSettingsOpen(true)}
                            className="shrink-0 rounded-lg surface-elevated px-3 py-1.5 text-xs font-black text-secondary transition duration-150 hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                        >
                            Configure
                        </button>
                    </div>
                ) : null}

                {liquidityInlineError ? (
                    <p role="alert" className="mt-3 rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100">
                        {liquidityInlineError}
                    </p>
                ) : null}

                <SwapActionButton label={actionLabel} disabled={isActionDisabled} loading={isBusy || pair.isLoading} onClick={handlePrimaryAction} />

                <TransactionDetails
                    id="liquidity-transaction-details"
                    summaryLabel={mode === "add" ? "Pool ratio" : "Withdrawal estimate"}
                    summaryValue={mode === "add" ? depositRatio : pairLabel}
                    rows={liquidityDetailsRows}
                    open={advancedOpen}
                    onToggle={() => setAdvancedOpen((v) => !v)}
                    ariaLabel="Toggle liquidity details"
                />
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

            {!extHistoryEntries ? <SwapHistory entries={historyEntries} /> : null}
        </>
    );
}
