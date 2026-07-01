import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAddress } from "viem";

import { useDeploymentConfig } from "../hooks/useDeploymentConfig";
import { type PoolInfo, usePools } from "../hooks/usePools";
import { compactAddress, formatDisplayAmount, formatTokenAmount } from "../lib/format";
import { DEFAULT_ROUTER_ADDRESS, STORAGE_KEYS, loadStorage, persist } from "../lib/tradeConfig";

type PoolSortMode = "liquidity" | "userLp" | "pair";

function PoolSkeleton() {
    return (
        <div className="pool-card" aria-hidden="true">
            <div className="h-9 w-44 animate-pulse rounded bg-white/10" />
            <div className="mt-5 h-20 animate-pulse rounded-2xl bg-white/[0.06]" />
            <div className="mt-4 grid gap-3">
                <div className="h-3 animate-pulse rounded bg-white/[0.08]" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-white/[0.08]" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.08]" />
            </div>
        </div>
    );
}

function SearchIcon() {
    return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="m14.5 14.5 3 3M8.8 15.6a6.8 6.8 0 1 1 0-13.6 6.8 6.8 0 0 1 0 13.6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

function SettingsIcon() {
    return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M10 12.7a2.7 2.7 0 1 0 0-5.4 2.7 2.7 0 0 0 0 5.4Z" stroke="currentColor" strokeWidth="1.7" />
            <path d="M3.6 11.8a6.9 6.9 0 0 1 0-3.6l1.8-.4c.2-.5.4-.9.7-1.3l-.6-1.8a7 7 0 0 1 3.1-1.8l1.2 1.4h.4l1.2-1.4a7 7 0 0 1 3.1 1.8l-.6 1.8c.3.4.5.8.7 1.3l1.8.4a6.9 6.9 0 0 1 0 3.6l-1.8.4c-.2.5-.4.9-.7 1.3l.6 1.8a7 7 0 0 1-3.1 1.8l-1.2-1.4h-.4l-1.2 1.4a7 7 0 0 1-3.1-1.8l.6-1.8c-.3-.4-.5-.8-.7-1.3l-1.8-.4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
    );
}

function PoolCard({ pool, onAction }: { pool: PoolInfo; onAction: (pool: PoolInfo, action: "swap" | "add" | "remove") => void }) {
    const pairLabel = `${pool.tokenA.symbol} / ${pool.tokenB.symbol}`;
    const totalLiquidity = formatDisplayAmount(formatTokenAmount(pool.reserveA + pool.reserveB, 18, 8), 4);
    const reserveA = formatDisplayAmount(formatTokenAmount(pool.reserveA, pool.tokenA.decimals, 8), 4);
    const reserveB = formatDisplayAmount(formatTokenAmount(pool.reserveB, pool.tokenB.decimals, 8), 4);
    const userLp = formatDisplayAmount(formatTokenAmount(pool.userLpBalance, 18, 8), 4);

    return (
        <article
            className="pool-card"
            onClick={() => onAction(pool, "swap")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAction(pool, "swap"); } }}
        >
            <header className="pool-card-header">
                <div className="pool-pair">
                    <div className="pool-token-icons" aria-hidden="true">
                        <span className="grid place-items-center bg-gradient-to-br from-pink-500 to-blue-500 text-xs font-black text-white">
                            {pool.tokenA.symbol.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="grid place-items-center bg-gradient-to-br from-blue-500 to-cyan-400 text-xs font-black text-white">
                            {pool.tokenB.symbol.slice(0, 2).toUpperCase()}
                        </span>
                    </div>
                    <div className="min-w-0">
                        <h2>{pairLabel}</h2>
                        <a href={`#${pool.pairAddress}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>{compactAddress(pool.pairAddress)}</a>
                    </div>
                </div>
                <span className="pool-status">Active</span>
            </header>

            <div className="pool-primary-metric">
                <span>Total liquidity</span>
                <strong>{totalLiquidity}</strong>
            </div>

            <dl className="pool-metrics">
                <div>
                    <dt>Reserve {pool.tokenA.symbol}</dt>
                    <dd>{reserveA}</dd>
                </div>
                <div>
                    <dt>Reserve {pool.tokenB.symbol}</dt>
                    <dd>{reserveB}</dd>
                </div>
                <div>
                    <dt>Your LP</dt>
                    <dd>{userLp}</dd>
                </div>
            </dl>

            <div className="pool-card-actions">
                <button type="button" onClick={(e) => { e.stopPropagation(); onAction(pool, "add"); }} className="pool-primary-action">
                    Add liquidity
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); onAction(pool, "remove"); }} className="pool-secondary-action">
                    Remove
                </button>
            </div>
        </article>
    );
}

export function PoolsPage() {
    const navigate = useNavigate();
    const deployment = useDeploymentConfig();
    const [routerAddress, setRouterAddress] = useState(() => loadStorage(STORAGE_KEYS.router, DEFAULT_ROUTER_ADDRESS));
    const [search, setSearch] = useState("");
    const [sortMode, setSortMode] = useState<PoolSortMode>("liquidity");
    const [pairLimit, setPairLimit] = useState(50);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const pools = usePools(routerAddress, pairLimit);

    useEffect(() => {
        if (!loadStorage(STORAGE_KEYS.router) && deployment.deployment?.router) {
            setRouterAddress(deployment.deployment.router);
            persist(STORAGE_KEYS.router, deployment.deployment.router);
        }
    }, [deployment.deployment]);

    function handleRouterChange(value: string) {
        setRouterAddress(value);
        setPairLimit(50);
        persist(STORAGE_KEYS.router, value);
    }

    function handleAction(pool: PoolInfo, action: "swap" | "add" | "remove") {
        persist(STORAGE_KEYS.tokenIn, pool.tokenA.address);
        persist(STORAGE_KEYS.tokenOut, pool.tokenB.address);
        navigate(action === "swap" ? "/swap" : `/liquidity?mode=${action}`);
    }

    const hasValidRouter = isAddress(routerAddress);
    const filteredPools = useMemo(() => {
        const query = search.trim().toLowerCase();
        const nextPools = query
            ? pools.pools.filter((pool) => {
                  const pairLabel = `${pool.tokenA.symbol} / ${pool.tokenB.symbol}`.toLowerCase();
                  return (
                      pairLabel.includes(query) ||
                      pool.pairAddress.toLowerCase() === query ||
                      pool.tokenA.address.toLowerCase() === query ||
                      pool.tokenB.address.toLowerCase() === query ||
                      pool.tokenA.name.toLowerCase().includes(query) ||
                      pool.tokenB.name.toLowerCase().includes(query)
                  );
              })
            : [...pools.pools];

        nextPools.sort((left, right) => {
            if (sortMode === "pair") return `${left.tokenA.symbol}/${left.tokenB.symbol}`.localeCompare(`${right.tokenA.symbol}/${right.tokenB.symbol}`);
            if (sortMode === "userLp") return Number((right.userLpBalance ?? 0n) - (left.userLpBalance ?? 0n));
            return Number(right.totalSupply - left.totalSupply);
        });

        return nextPools;
    }, [pools.pools, search, sortMode]);
    const canLoadMore = hasValidRouter && !pools.isLoading && !pools.error && pools.totalPairs > pairLimit;

    return (
        <div className="w-full px-4 py-8 sm:px-6">
            <section className="mx-auto w-full max-w-6xl">
                <div className="pools-heading">
                    <div>
                        <h1>Pools</h1>
                        <p>Discover liquidity pools and manage your positions.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setSettingsOpen((v) => !v)}
                        className="router-settings-button"
                    >
                        <SettingsIcon />
                        <span>{settingsOpen ? "Hide settings" : "Router settings"}</span>
                    </button>
                </div>

                {settingsOpen ? (
                    <div className="mt-4 rounded-lg surface-elevated p-4">
                        <label className="grid gap-2 text-sm font-bold text-secondary">
                            Router address
                            <input
                                value={routerAddress}
                                onChange={(event) => handleRouterChange(event.target.value)}
                                placeholder="0x router contract"
                                spellCheck={false}
                                aria-invalid={Boolean(routerAddress) && !hasValidRouter}
                                className="rounded-lg surface-input px-4 py-3 text-sm text-primary outline-none placeholder:text-slate-600 focus:border-pink-300 focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-pink-300"
                            />
                        </label>
                    </div>
                ) : null}

                <div className="pool-toolbar">
                    <div className="pool-search-wrap">
                        <SearchIcon />
                        <span className="sr-only">Search pools</span>
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Search by symbol, token, or pair address"
                            aria-label="Search pools"
                            spellCheck={false}
                            className="pool-search-input"
                        />
                    </div>
                    <div className="pool-sort-wrap">
                        <label htmlFor="pool-sort" className="sr-only">Sort by</label>
                        <span className="pool-sort-prefix">Sort by</span>
                        <select
                            id="pool-sort"
                            value={sortMode}
                            onChange={(event) => setSortMode(event.target.value as PoolSortMode)}
                            className="pool-sort-select"
                        >
                            <option value="liquidity">Total LP</option>
                            <option value="userLp">Your LP</option>
                            <option value="pair">Pair name</option>
                        </select>
                        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="select-chevron">
                            <path d="M5 7.5 10 12.5l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                </div>

                {!hasValidRouter ? (
                    <div className="mt-6 rounded-lg border border-dashed border-white/10 surface-elevated p-8 text-center text-muted">
                        <p className="font-black text-secondary">Configure a router address</p>
                        <p className="mt-1 text-sm">Open Router settings above to discover pools.</p>
                    </div>
                ) : pools.error ? (
                    <div role="alert" className="pool-state-card is-error">
                        <p>Pool discovery failed</p>
                        <span>Check the router address and network.</span>
                        <button type="button" onClick={pools.refetch}>Retry</button>
                    </div>
                ) : pools.isLoading || deployment.isLoading ? (
                    <div className="pool-grid">
                        <PoolSkeleton />
                        <PoolSkeleton />
                        <PoolSkeleton />
                    </div>
                ) : pools.pools.length === 0 ? (
                    <div className="pool-state-card">
                        <p>No pools found</p>
                        <span>Try another symbol, token, or pair address.</span>
                    </div>
                ) : filteredPools.length === 0 ? (
                    <div className="pool-state-card">
                        <p>No pools found</p>
                        <span>Try another symbol, token, or pair address.</span>
                    </div>
                ) : (
                    <>
                        <div className="pool-grid">
                            {filteredPools.map((pool) => (
                                <PoolCard key={pool.pairAddress} pool={pool} onAction={handleAction} />
                            ))}
                        </div>
                        {canLoadMore ? (
                            <div className="mt-6 flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => setPairLimit((value) => value + 50)}
                                    className="rounded-lg surface-elevated px-5 py-3 text-sm font-black text-secondary transition duration-150 hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                                >
                                    Load more ({pools.pools.length}/{pools.totalPairs})
                                </button>
                            </div>
                        ) : null}
                    </>
                )}
            </section>
        </div>
    );
}
