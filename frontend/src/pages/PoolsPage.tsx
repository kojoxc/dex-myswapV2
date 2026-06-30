import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAddress } from "viem";

import { useDeploymentConfig } from "../hooks/useDeploymentConfig";
import { type PoolInfo, usePools } from "../hooks/usePools";
import { compactAddress, formatTokenAmount } from "../lib/format";
import { DEFAULT_ROUTER_ADDRESS, STORAGE_KEYS, loadStorage, persist } from "../lib/tradeConfig";

type PoolSortMode = "liquidity" | "userLp" | "pair";

function PoolSkeleton() {
    return (
        <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.035] p-4">
            <div className="h-5 w-40 animate-pulse rounded-full bg-white/10" />
            <div className="mt-4 grid gap-2">
                <div className="h-4 animate-pulse rounded-full bg-white/[0.08]" />
                <div className="h-4 w-2/3 animate-pulse rounded-full bg-white/[0.08]" />
            </div>
        </div>
    );
}

function PoolCard({ pool, onAction }: { pool: PoolInfo; onAction: (pool: PoolInfo, action: "swap" | "add" | "remove") => void }) {
    const pairLabel = `${pool.tokenA.symbol} / ${pool.tokenB.symbol}`;

    return (
        <article className="rounded-[1.35rem] border border-white/10 bg-[#101624] p-4 shadow-[0_18px_60px_rgba(0,0,0,0.28)]">
            <div className="flex min-w-0 items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-blue-500 text-xs font-black text-white">
                            {pool.tokenA.symbol.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="-ml-4 grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-blue-500 to-cyan-400 text-xs font-black text-white ring-4 ring-[#101624]">
                            {pool.tokenB.symbol.slice(0, 2).toUpperCase()}
                        </span>
                        <h2 className="truncate text-lg font-black text-white">{pairLabel}</h2>
                    </div>
                    <p className="mt-2 truncate text-xs text-slate-500">Pair {compactAddress(pool.pairAddress)}</p>
                </div>
                <span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-xs font-black text-emerald-100">Active</span>
            </div>

            <dl className="mt-5 grid gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.035] p-3 text-sm">
                <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Reserve {pool.tokenA.symbol}</dt>
                    <dd className="truncate text-right font-bold text-slate-200">{formatTokenAmount(pool.reserveA, pool.tokenA.decimals)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Reserve {pool.tokenB.symbol}</dt>
                    <dd className="truncate text-right font-bold text-slate-200">{formatTokenAmount(pool.reserveB, pool.tokenB.decimals)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Total LP</dt>
                    <dd className="truncate text-right font-bold text-slate-200">{formatTokenAmount(pool.totalSupply, 18)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-slate-500">Your LP</dt>
                    <dd className="truncate text-right font-bold text-slate-200">{formatTokenAmount(pool.userLpBalance, 18)}</dd>
                </div>
            </dl>

            <div className="mt-4 grid grid-cols-3 gap-2">
                <button type="button" onClick={() => onAction(pool, "swap")} className="rounded-2xl bg-white px-3 py-2 text-sm font-black text-slate-950 transition hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300">
                    Swap
                </button>
                <button type="button" onClick={() => onAction(pool, "add")} className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-black text-slate-100 transition hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300">
                    Add
                </button>
                <button type="button" onClick={() => onAction(pool, "remove")} className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-black text-slate-100 transition hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300">
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
        <div className="min-h-[calc(100vh-5rem)] w-full px-4 py-8 sm:min-h-[calc(100vh-5.5rem)] sm:px-6">
            <section className="mx-auto w-full max-w-6xl">
                <div className="flex flex-col gap-4 rounded-[1.75rem] border border-white/10 bg-[#101624]/80 p-5 shadow-[0_22px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <p className="text-sm font-black uppercase tracking-[0.22em] text-pink-200">Pool explorer</p>
                        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Discover liquidity pools</h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Pools are read directly from the configured router factory. Select a pool to swap, add, or remove liquidity.</p>
                    </div>
                    <label className="grid min-w-0 gap-2 text-sm font-bold text-slate-300 sm:w-[22rem]">
                        Router address
                        <input
                            value={routerAddress}
                            onChange={(event) => handleRouterChange(event.target.value)}
                            placeholder="0x router contract"
                            spellCheck={false}
                            aria-invalid={Boolean(routerAddress) && !hasValidRouter}
                            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-pink-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                        />
                    </label>
                </div>

                <div className="mt-4 grid gap-3 rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-4 sm:grid-cols-[1fr_14rem]">
                    <label className="grid gap-2 text-sm font-bold text-slate-300">
                        Search pools
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder="Symbol, token address, or pair address"
                            spellCheck={false}
                            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-pink-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                        />
                    </label>
                    <label className="grid gap-2 text-sm font-bold text-slate-300">
                        Sort by
                        <select
                            value={sortMode}
                            onChange={(event) => setSortMode(event.target.value as PoolSortMode)}
                            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none focus:border-pink-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                        >
                            <option value="liquidity">Total LP</option>
                            <option value="userLp">Your LP</option>
                            <option value="pair">Pair name</option>
                        </select>
                    </label>
                </div>

                {!hasValidRouter ? (
                    <div className="mt-5 rounded-[1.35rem] border border-dashed border-white/10 bg-white/[0.035] p-6 text-center text-slate-400">
                        Configure a router address to discover pools.
                    </div>
                ) : pools.error ? (
                    <div role="alert" className="mt-5 rounded-[1.35rem] border border-red-300/20 bg-red-300/10 p-6 text-red-100">
                        Pool discovery failed. Check the router address and network.
                    </div>
                ) : pools.isLoading || deployment.isLoading ? (
                    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <PoolSkeleton />
                        <PoolSkeleton />
                        <PoolSkeleton />
                    </div>
                ) : pools.pools.length === 0 ? (
                    <div className="mt-5 rounded-[1.35rem] border border-dashed border-white/10 bg-white/[0.035] p-6 text-center">
                        <p className="font-black text-white">No pools found</p>
                        <p className="mt-2 text-sm text-slate-400">Create the first pair from the Liquidity page.</p>
                    </div>
                ) : filteredPools.length === 0 ? (
                    <div className="mt-5 rounded-[1.35rem] border border-dashed border-white/10 bg-white/[0.035] p-6 text-center">
                        <p className="font-black text-white">No matching pools</p>
                        <p className="mt-2 text-sm text-slate-400">Try a different token symbol, token address, or pair address.</p>
                    </div>
                ) : (
                    <>
                        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {filteredPools.map((pool) => (
                                <PoolCard key={pool.pairAddress} pool={pool} onAction={handleAction} />
                            ))}
                        </div>
                        {canLoadMore ? (
                            <div className="mt-5 flex justify-center">
                                <button
                                    type="button"
                                    onClick={() => setPairLimit((value) => value + 50)}
                                    className="rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-black text-slate-100 transition hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                                >
                                    Load more pools ({pools.pools.length}/{pools.totalPairs})
                                </button>
                            </div>
                        ) : null}
                    </>
                )}
            </section>
        </div>
    );
}
