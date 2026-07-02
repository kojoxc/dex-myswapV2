import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useState } from "react";
import { type Address, formatUnits, isAddress, parseUnits } from "viem";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";

import { factoryAbi, routerAbi } from "../abis";
import { useApproval } from "../hooks/useApproval";
import { useDeploymentConfig } from "../hooks/useDeploymentConfig";
import { useLiquidityPair } from "../hooks/useLiquidityPair";
import { useToken } from "../hooks/useToken";
import { useTokenList } from "../hooks/useTokenList";
import { useTransactionHistory, type HistoryEntry } from "../hooks/useTransactionHistory";
import { normalizeTransactionError } from "../lib/errors";
import { compactAddress, formatDisplayAmount, formatPercentBps, formatTokenAmount } from "../lib/format";
import { getWethAddress, isNativeAddress } from "../lib/tokenRegistry";
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
import { SwapSettingsDialog } from "./swap/SwapSettingsDialog";
import { TokenAmountPanel } from "./swap/TokenAmountPanel";
import { TokenSelectorDialog } from "./swap/TokenSelectorDialog";
import { TransactionDetails, type TransactionDetailRow } from "./swap/TransactionDetails";
import { TransactionToast } from "./TransactionToast";

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

function quoteLiquidityAmount(input?: bigint, reserveIn?: bigint, reserveOut?: bigint) {
    if (!input || !reserveIn || !reserveOut || reserveIn === 0n) return undefined;
    return (input * reserveOut) / reserveIn;
}

type AddLiquidityCardProps = {
    onAddHistoryEntry?: (entry: HistoryEntry) => void;
};

export function AddLiquidityCard({ onAddHistoryEntry: extAddHistoryEntry }: AddLiquidityCardProps) {
    const { address: account, isConnected } = useAccount();
    const { openConnectModal } = useConnectModal();
    const publicClient = usePublicClient();
    const chainId = useChainId();
    const { approve, isApproving } = useApproval();
    const { writeContractAsync, isPending: isWritePending } = useWriteContract();

    const [routerAddress, setRouterAddress] = useState(() => loadStorage(STORAGE_KEYS.router, DEFAULT_ROUTER_ADDRESS));
    const [tokenAAddress, setTokenAAddress] = useState(() => loadStorage(STORAGE_KEYS.tokenIn, DEFAULT_TOKEN_IN_ADDRESS));
    const [tokenBAddress, setTokenBAddress] = useState(() => loadStorage(STORAGE_KEYS.tokenOut, DEFAULT_TOKEN_OUT_ADDRESS));
    const [amountA, setAmountA] = useState("");
    const [amountB, setAmountB] = useState("");
    const [lastEditedAmount, setLastEditedAmount] = useState<LastEditedAmount>(null);
    const [slippageBps, setSlippageBps] = useState(() => sanitizeSlippageBps(Number(loadStorage(STORAGE_KEYS.slippageBps, String(DEFAULT_SLIPPAGE_BPS)))));
    const [deadlineMinutes, setDeadlineMinutes] = useState(() => sanitizeDeadlineMinutes(Number(loadStorage(STORAGE_KEYS.deadlineMinutes, String(DEFAULT_DEADLINE_MINUTES)))));
    const [tx, setTx] = useState<TransactionState>({ title: "", status: "idle" });
    const [isConfirming, setIsConfirming] = useState(false);
    const internalHistory = useTransactionHistory();
    const addHistoryEntry = extAddHistoryEntry ?? internalHistory.addEntry;
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [tokenDialog, setTokenDialog] = useState<"tokenA" | "tokenB" | null>(null);
    const [advancedOpen, setAdvancedOpen] = useState(false);

    const deployment = useDeploymentConfig();
    const tokenList = useTokenList({ deployment: deployment.deployment });
    const wethAddress = deployment.deployment?.weth ?? getWethAddress(chainId);

    const tokenA = useToken(tokenAAddress, routerAddress);
    const tokenB = useToken(tokenBAddress, routerAddress);
    const pair = useLiquidityPair({ routerAddress, tokenA: tokenA.token, tokenB: tokenB.token, wethAddress });

    const hasValidRouter = isAddress(routerAddress);
    const tokenAIsNative = isNativeAddress(tokenAAddress);
    const tokenBIsNative = isNativeAddress(tokenBAddress);
    const hasValidTokenAAddress = isAddress(tokenAAddress) || tokenAIsNative;
    const hasValidTokenBAddress = isAddress(tokenBAddress) || tokenBIsNative;
    const hasNativePairWeth = !(tokenAIsNative || tokenBIsNative) || Boolean(wethAddress);
    const hasOneNativeSide = tokenAIsNative !== tokenBIsNative;
    const routeSetupComplete = Boolean(hasValidRouter && hasValidTokenAAddress && hasValidTokenBAddress && hasNativePairWeth && !(tokenAIsNative && tokenBIsNative) && tokenA.token && tokenB.token);

    const isBusy = isApproving || isWritePending || isConfirming;
    const hasExistingPool = Boolean(pair.pairAddress && pair.reserveA !== undefined && pair.reserveB !== undefined && pair.totalSupply !== undefined && pair.totalSupply > 0n);

    useEffect(() => {
        if (!chainId || deployment.isLoading) return;
        const isNative = (addr: string) => isNativeAddress(addr);
        const hasToken = (addr: string) => isNative(addr) || (tokenList.tokens ?? []).some(
            (t) => t.address && t.address.toLowerCase() === addr.toLowerCase(),
        );

        if (tokenAAddress && !hasToken(tokenAAddress)) updateTokenA("");
        if (tokenBAddress && !hasToken(tokenBAddress)) updateTokenB("");
    }, [chainId, deployment.isLoading, tokenList.tokens, tokenAAddress, tokenBAddress]);

    const amountAValue = tokenA.token ? parseTokenAmount(amountA, tokenA.token.decimals) : undefined;
    const amountBValue = tokenB.token ? parseTokenAmount(amountB, tokenB.token.decimals) : undefined;

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

    useEffect(() => {
        if (!deployment.deployment) return;

        if (!loadStorage(STORAGE_KEYS.router) && deployment.deployment.router) updateRouter(deployment.deployment.router);
        if (!loadStorage(STORAGE_KEYS.tokenIn) && deployment.deployment.tokens[0]?.address) updateTokenA(deployment.deployment.tokens[0].address);
        if (!loadStorage(STORAGE_KEYS.tokenOut) && deployment.deployment.tokens[1]?.address) updateTokenB(deployment.deployment.tokens[1].address);
    }, [deployment.deployment]);

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

    const actionLabel = useMemo(() => {
        if (tx.status === "pending" && tx.hash) return "Transaction submitted";
        if (isWritePending) return "Adding liquidity...";
        if (isApproving || isConfirming) return "Confirming...";
        if (!isConnected) return "Connect Wallet";
        if (!publicClient) return "Route unavailable";
        if (!routeSetupComplete) return "Configure pool";
        if (!hasAddAmounts) return "Enter token amounts";
        if (hasInsufficientAddBalance) return "Insufficient balance";
        if (needsTokenAApproval && tokenA.token) return `Approve ${tokenA.token.symbol}`;
        if (needsTokenBApproval && tokenB.token) return `Approve ${tokenB.token.symbol}`;
        return "Add liquidity";
    }, [hasAddAmounts, hasInsufficientAddBalance, isApproving, isConfirming, isConnected, isWritePending, needsTokenAApproval, needsTokenBApproval, publicClient, routeSetupComplete, tokenA.token, tokenB.token, tx.hash, tx.status]);

    const isActionDisabled = isConnected ? !canAdd : !openConnectModal || isBusy;

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

    const liquidityDetailsRows: TransactionDetailRow[] = [
        { label: "Deposit ratio", value: depositRatio },
        { label: "Estimated LP", value: formatDisplayAmount(formatTokenAmount(estimatedLp, 18), 4) },
        { label: "Pool share", value: formatPercentBps(poolShareBps) },
        { label: "Slippage", value: `${slippageBps / 100}%` },
        { label: "Deadline", value: `${deadlineMinutes} min` },
        { label: "Pool", value: pairLabel },
        { label: "Pair", value: pairAddressLabel },
    ];

    const noExistingPool = Boolean(
        routeSetupComplete &&
            tokenA.token &&
            tokenB.token &&
            pair.factoryAddress &&
            !pair.isLoading &&
            !pair.error &&
            !hasExistingPool &&
            pair.pairAddress === undefined,
    );

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

    function handleAmountAChange(value: string) {
        setLastEditedAmount("tokenA");
        setAmountA(value);
    }

    function handleAmountBChange(value: string) {
        setLastEditedAmount("tokenB");
        setAmountB(value);
    }

    function switchTokens() {
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
                if (pair.pairAddress) pair.refetch();
            }

            if (needsTokenBApproval) {
                setTx({ title: "Approve pending", status: "pending", message: `Approving ${tokenB.token.symbol}` });
                const hash = await approve(tokenB.token.address, routerAddress as Address, amountBValue);
                setTx({ title: "Approve submitted", status: "pending", hash, message: "Waiting for on-chain confirmation" });
                const receipt = await publicClient.waitForTransactionReceipt({ hash });
                if (receipt.status !== "success") throw new Error("Approval transaction reverted");
                tokenB.refetch();
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
            setTx({ title: "Liquidity added", status: "success", hash, message: `${pairLabel} pool position updated.` });
        } catch (caught) {
            setTx({ title: "Add liquidity failed", status: "error", message: normalizeTransactionError(caught, "Add liquidity failed. Check token balances, approvals, and pool ratio.") });
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

        if (!canAdd) return;
        void submitAdd();
    }

    async function handleCreatePair() {
        if (!pair.factoryAddress || !tokenA.token || !tokenB.token || !account || isBusy) return;
        setTx({ title: "Creating pair", status: "pending", message: "Confirm the transaction in your wallet" });
        try {
            const hash = await writeContractAsync({
                address: pair.factoryAddress,
                abi: factoryAbi,
                functionName: "createPair",
                args: [tokenA.token.address, tokenB.token.address],
            });
            setTx({ title: "Create pair submitted", status: "pending", hash, message: "Waiting for on-chain confirmation" });
            const receipt = await publicClient!.waitForTransactionReceipt({ hash });
            if (receipt.status !== "success") throw new Error("Create pair transaction reverted");
            setTx({ title: "Pair created", status: "success", hash, message: `${pairLabel} pool created.` });
            pair.refetch();
        } catch (caught) {
            setTx({ title: "Create pair failed", status: "error", message: normalizeTransactionError(caught, "Create pair failed.") });
        }
    }

    return (
        <>
            <section className="surface-card trade-card" aria-label="Add liquidity">
                <div className="mb-5 flex min-w-0 items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="font-black tracking-tight text-primary">Add Liquidity</h1>
                        <p className="mt-0.5 text-sm text-secondary">Provide liquidity</p>
                    </div>
                    <button
                        type="button"
                        aria-label="Open liquidity settings"
                        onClick={() => setIsSettingsOpen(true)}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg surface-elevated text-sm text-muted transition duration-150 hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                    >
                        ⚙
                    </button>
                </div>

                <div className="grid min-w-0 max-w-full gap-3">
                    <div className="token-panels min-w-0 max-w-full">
                        <TokenAmountPanel
                            label="Token A"
                            amount={amountA}
                            token={tokenA.token}
                            balance={tokenA.balance}
                            showMax
                            tokenTone="pay"
                            onAmountChange={handleAmountAChange}
                            onMax={setMaxTokenA}
                            onSelectToken={() => setTokenDialog("tokenA")}
                        />

                        <SwapDirectionButton disabled={isBusy} onClick={switchTokens} />

                        <TokenAmountPanel
                            label="Token B"
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

                {noExistingPool ? (
                    <div className="mt-3 flex flex-col items-center gap-3 rounded-lg border border-pink-500/30 bg-pink-500/10 p-5">
                        <p className="text-sm font-black text-pink-100">No pool exists for this pair</p>
                        <button
                            type="button"
                            disabled={isBusy}
                            onClick={handleCreatePair}
                            className="primary-action flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 via-fuchsia-500 to-blue-500 px-6 py-2 font-black text-white shadow-glow transition duration-150 hover:scale-[1.01] disabled:cursor-not-allowed disabled:from-slate-700 disabled:via-slate-700 disabled:to-slate-700 disabled:text-slate-400 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                        >
                            Create Pair
                        </button>
                    </div>
                ) : null}

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
                    id="add-liquidity-details"
                    summaryLabel="Pool ratio"
                    summaryValue={depositRatio}
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
        </>
    );
}
