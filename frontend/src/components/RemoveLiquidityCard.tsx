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
import { SwapSettingsDialog } from "./swap/SwapSettingsDialog";
import { TransactionDetails, type TransactionDetailRow } from "./swap/TransactionDetails";
import { TransactionToast } from "./TransactionToast";

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

type RemoveLiquidityCardProps = {
    onAddHistoryEntry?: (entry: HistoryEntry) => void;
};

export function RemoveLiquidityCard({ onAddHistoryEntry: extAddHistoryEntry }: RemoveLiquidityCardProps) {
    const { address: account, isConnected } = useAccount();
    const { openConnectModal } = useConnectModal();
    const publicClient = usePublicClient();
    const chainId = useChainId();
    const { approve, isApproving } = useApproval();
    const { writeContractAsync, isPending: isWritePending } = useWriteContract();

    const [routerAddress, setRouterAddress] = useState(() => loadStorage(STORAGE_KEYS.router, DEFAULT_ROUTER_ADDRESS));
    const [tokenAAddress, setTokenAAddress] = useState(() => loadStorage(STORAGE_KEYS.tokenIn, DEFAULT_TOKEN_IN_ADDRESS));
    const [tokenBAddress, setTokenBAddress] = useState(() => loadStorage(STORAGE_KEYS.tokenOut, DEFAULT_TOKEN_OUT_ADDRESS));
    const [lpAmount, setLpAmount] = useState("");
    const [isLpAmountFocused, setIsLpAmountFocused] = useState(false);
    const [slippageBps, setSlippageBps] = useState(() => sanitizeSlippageBps(Number(loadStorage(STORAGE_KEYS.slippageBps, String(DEFAULT_SLIPPAGE_BPS)))));
    const [deadlineMinutes, setDeadlineMinutes] = useState(() => sanitizeDeadlineMinutes(Number(loadStorage(STORAGE_KEYS.deadlineMinutes, String(DEFAULT_DEADLINE_MINUTES)))));
    const [tx, setTx] = useState<TransactionState>({ title: "", status: "idle" });
    const [isConfirming, setIsConfirming] = useState(false);
    const internalHistory = useTransactionHistory();
    const addHistoryEntry = extAddHistoryEntry ?? internalHistory.addEntry;
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [advancedOpen, setAdvancedOpen] = useState(false);
    const [selectedRemovePair, setSelectedRemovePair] = useState<Address>();

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

    const isBusy = isApproving || isWritePending || isConfirming;

    useEffect(() => {
        if (!chainId || deployment.isLoading) return;
        const isNative = (addr: string) => isNativeAddress(addr);
        const hasToken = (addr: string) => isNative(addr) || (tokenList.tokens ?? []).some(
            (t) => t.address && t.address.toLowerCase() === addr.toLowerCase(),
        );

        if (tokenAAddress && !hasToken(tokenAAddress)) updateTokenA("");
        if (tokenBAddress && !hasToken(tokenBAddress)) updateTokenB("");
    }, [chainId, deployment.isLoading, tokenList.tokens, tokenAAddress, tokenBAddress]);

    useEffect(() => {
        if (!deployment.deployment) return;

        if (!loadStorage(STORAGE_KEYS.router) && deployment.deployment.router) updateRouter(deployment.deployment.router);
        if (!loadStorage(STORAGE_KEYS.tokenIn) && deployment.deployment.tokens[0]?.address) updateTokenA(deployment.deployment.tokens[0].address);
        if (!loadStorage(STORAGE_KEYS.tokenOut) && deployment.deployment.tokens[1]?.address) updateTokenB(deployment.deployment.tokens[1].address);
    }, [deployment.deployment]);

    useEffect(() => {
        if (removePositions.length !== 1 || selectedRemovePair) return;
        const [position] = removePositions;
        setSelectedRemovePair(position.pairAddress);
        updateTokenA(position.tokenA.address);
        updateTokenB(position.tokenB.address);
    }, [removePositions, selectedRemovePair]);

    useEffect(() => {
        if (selectedRemovePair || removePositions.length === 0) return;

        const currentPosition = removePositions.find(
            (position) =>
                (position.tokenA.address.toLowerCase() === tokenAAddress.toLowerCase() && position.tokenB.address.toLowerCase() === tokenBAddress.toLowerCase()) ||
                (position.tokenA.address.toLowerCase() === tokenBAddress.toLowerCase() && position.tokenB.address.toLowerCase() === tokenAAddress.toLowerCase()),
        );

        if (currentPosition) setSelectedRemovePair(currentPosition.pairAddress);
    }, [removePositions, selectedRemovePair, tokenAAddress, tokenBAddress]);

    const lpAmountValue = parseTokenAmount(lpAmount, 18);
    const pairLabel = tokenPairLabel(tokenA.token, tokenB.token);
    const lpTokenLabel = pairLabel === "Token pair" ? "LP" : `${pairLabel} LP`;
    const hasHighSlippage = slippageBps > 5_000;
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

    const removeAmountShare = lpAmountValue && lpToken.balance && lpToken.balance > 0n ? formatPercentBps((lpAmountValue * 10_000n) / lpToken.balance) : "0%";
    const displayLpAmount = isLpAmountFocused ? lpAmount : formatDisplayAmount(lpAmount, 6);
    const lpInputClass = lpAmountClass(displayLpAmount || "0");

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
        if (isWritePending) return "Removing liquidity...";
        if (isApproving || isConfirming) return "Confirming...";
        if (!isConnected) return "Connect Wallet";
        if (!publicClient) return "Route unavailable";
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
    }, [hasInsufficientLpBalance, isApproving, isConfirming, isConnected, isWritePending, lpAmountValue, needsLpApproval, pair.error, pair.isLoading, pair.pairAddress, pools.isLoading, publicClient, removePositions.length, routeSetupComplete, selectedPosition, tx.hash, tx.status]);

    const isActionDisabled = isConnected ? !canRemove : !openConnectModal || isBusy;

    const liquidityInlineError = !hasNativePairWeth
        ? "Native ETH liquidity requires a configured WETH address for this network."
        : tokenAIsNative && tokenBIsNative
          ? "Select one native token side and one ERC20 token side."
          : pair.error
            ? "Pool data could not be loaded. Check router, tokens, and network."
            : hasHighSlippage
              ? "Slippage is very high. Review settings before continuing."
              : undefined;

    const pairAddressLabel = pair.isLoading ? "Finding pool..." : pair.pairAddress ? compactAddress(pair.pairAddress) : "Pool not found";

    const liquidityDetailsRows: TransactionDetailRow[] = [
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

        if (!canRemove) return;
        void submitRemove();
    }

    return (
        <>
            <section className="surface-card trade-card" aria-label="Remove liquidity">
                <div className="mb-5 flex min-w-0 items-start justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="font-black tracking-tight text-primary">Remove Liquidity</h1>
                        <p className="mt-0.5 text-sm text-secondary">Remove liquidity</p>
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

                <section className="liquidity-positions" aria-label="Liquidity positions">
                    <div className="section-kicker">Your positions</div>
                    {pools.isLoading ? (
                        <div className="remove-empty-state">Loading wallet positions...</div>
                    ) : removePositions.length === 0 ? (
                        <div className="remove-empty-state">
                            <p className="font-bold text-secondary">No LP positions found for this wallet.</p>
                            <p>Standard liquidity removal starts from an existing LP position.</p>
                            <div className="remove-empty-actions">
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
                    id="remove-liquidity-details"
                    summaryLabel="Withdrawal estimate"
                    summaryValue={pairLabel}
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

            <TransactionToast tx={tx} />
        </>
    );
}
