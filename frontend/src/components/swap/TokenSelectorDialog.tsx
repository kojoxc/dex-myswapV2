import { useEffect, useMemo, useState } from "react";
import { type Address, isAddress } from "viem";
import { usePublicClient } from "wagmi";

import { erc20Abi } from "../../abis";
import { filterTokens, NATIVE_ETH_ADDRESS } from "../../lib/tokenRegistry";
import type { SupportedToken } from "../../lib/tokenRegistry";
import { compactAddress } from "../../lib/format";
import type { TokenInfo } from "../../types";
import { Skeleton } from "../Skeleton";
import { Dialog } from "./Dialog";

type TokenSelectorDialogProps = {
    open: boolean;
    title: string;
    value: string;
    token?: TokenInfo;
    isValidAddress: boolean;
    isLoading?: boolean;
    error?: string;
    tokens?: SupportedToken[];
    tokenListLoading?: boolean;
    excludeAddress?: string;
    onChange: (value: string) => void;
    onClose: () => void;
};

function tokenInitials(token?: { symbol?: string }) {
    return token?.symbol?.slice(0, 2).toUpperCase() ?? "--";
}

function tokenAvatarTone(symbol?: string) {
    const tones = [
        "from-pink-500 to-blue-500",
        "from-blue-500 to-cyan-400",
        "from-amber-400 to-orange-500",
        "from-emerald-400 to-teal-500",
        "from-violet-500 to-fuchsia-500",
    ];
    const seed = symbol?.charCodeAt(0) ?? 0;
    return tones[seed % tones.length];
}

function getTokenLabel(token: { address?: string; name: string }): string {
    if (token.address && token.address.toLowerCase() === NATIVE_ETH_ADDRESS.toLowerCase()) {
        return `${token.name} (Native)`;
    }
    return `${token.name} \u2022 ${compactAddress(token.address)}`;
}

function getListTokenLabel(token: SupportedToken): string {
    if (token.type === "native") {
        return `${token.name} (Native)`;
    }
    return `${token.name} \u2022 ${compactAddress(token.address!)}`;
}

function getSourceLabel(token: SupportedToken) {
    if (token.source === "deployment") return "Deployment";
    if (token.source === "external") return "Token list";
    if (token.source === "custom") return "Custom";
    return "Default";
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const id = window.setTimeout(() => reject(new Error("Token metadata request timed out")), ms);
        promise.then(
            (value) => {
                window.clearTimeout(id);
                resolve(value);
            },
            (error) => {
                window.clearTimeout(id);
                reject(error);
            },
        );
    });
}

type ManualStatus = "idle" | "checking" | "supported" | "unsupported" | "rpc-error";

export function TokenSelectorDialog(props: TokenSelectorDialogProps) {
    const publicClient = usePublicClient();
    const [search, setSearch] = useState("");
    const [manualStatus, setManualStatus] = useState<ManualStatus>("idle");

    useEffect(() => {
        if (props.open) {
            setSearch("");
            setManualStatus("idle");
        }
    }, [props.open]);

    const isManualEntry = isAddress(search.trim());

    const listedTokens = useMemo(() => {
        const query = search.trim();
        if (isManualEntry) return [];

        const exclude = props.excludeAddress?.toLowerCase();
        return filterTokens(props.tokens ?? [], query).filter(
            (token) => {
                if (token.type === "native") return props.value.toLowerCase() !== NATIVE_ETH_ADDRESS.toLowerCase();
                const addr = token.address?.toLowerCase();
                return addr !== props.value.toLowerCase() && addr !== exclude;
            },
        );
    }, [props.tokens, props.value, props.excludeAddress, search, isManualEntry]);

    const manualToken = useMemo(() => {
        if (!isManualEntry) return false;
        const query = search.trim().toLowerCase();
        if (props.excludeAddress?.toLowerCase() === query) return false;
        return (props.tokens ?? []).find((token) => token.type === "erc20" && token.address?.toLowerCase() === query);
    }, [props.tokens, props.excludeAddress, search, isManualEntry]);

    const isManualSupported = Boolean(manualToken);

    useEffect(() => {
        let cancelled = false;

        async function verifyManualAddress() {
            if (!isManualEntry) {
                setManualStatus("idle");
                return;
            }

            if (isManualSupported) {
                setManualStatus("supported");
                return;
            }

            if (!publicClient) {
                setManualStatus("unsupported");
                return;
            }

            setManualStatus("checking");

            try {
                const address = search.trim() as Address;
                const bytecode = await withTimeout(publicClient.getBytecode({ address }), 2_500);
                if (!bytecode || bytecode === "0x") {
                    if (!cancelled) setManualStatus("unsupported");
                    return;
                }

                await withTimeout(Promise.all([
                    publicClient.readContract({ address, abi: erc20Abi, functionName: "symbol" }),
                    publicClient.readContract({ address, abi: erc20Abi, functionName: "name" }),
                    publicClient.readContract({ address, abi: erc20Abi, functionName: "decimals" }),
                ]), 2_500);

                if (!cancelled) {
                    props.onChange(address);
                    setManualStatus("supported");
                }
            } catch {
                if (!cancelled) setManualStatus("rpc-error");
            }
        }

        verifyManualAddress();

        return () => {
            cancelled = true;
        };
    }, [isManualEntry, isManualSupported, publicClient, search]);

    function handleSearchChange(value: string) {
        setSearch(value);
        if (isAddress(value)) {
            const supported = (props.tokens ?? []).find((token) => token.type === "erc20" && token.address?.toLowerCase() === value.trim().toLowerCase());
            if (supported?.address) props.onChange(supported.address);
        }
    }

    function handleTokenSelect(token: SupportedToken) {
        if (token.type === "native") {
            props.onChange("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
        } else if (token.address) {
            props.onChange(token.address);
        }
        props.onClose();
    }

    const canDone = isManualEntry ? isManualSupported || manualStatus === "supported" : Boolean(props.value && props.isValidAddress);

    return (
        <Dialog open={props.open} title={props.title} onClose={props.onClose}>
            <div className="grid gap-4">
                <section className="rounded-2xl border border-white/10 bg-white/[0.035] p-4" aria-label="Supported tokens">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-lg font-black tracking-tight text-white">Select a token</p>
                            <p className="mt-1 text-sm text-slate-500">Select a supported token or enter a contract address.</p>
                        </div>
                        {props.tokenListLoading ? <Skeleton className="h-5 w-16 shrink-0" /> : null}
                    </div>

                    <label className="mt-4 block">
                        <span className="sr-only">Search by token or address</span>
                        <input
                            value={search}
                            onChange={(event) => handleSearchChange(event.target.value)}
                            placeholder="Search by token or address"
                            spellCheck={false}
                            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-pink-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                        />
                    </label>

                    {isManualEntry ? (
                        <div className="mt-3 rounded-2xl border border-dashed border-white/10 bg-black/10 p-3">
                            {manualStatus === "supported" ? (
                                <p className="text-sm text-emerald-300">Token verified. Press Done to confirm.</p>
                            ) : manualStatus === "checking" ? (
                                <p className="text-sm text-slate-400">Checking token contract...</p>
                            ) : manualStatus === "rpc-error" ? (
                                <p className="text-sm text-amber-100">Could not verify this token safely. It was not added.</p>
                            ) : (
                                <p className="text-sm text-amber-100">Unsupported token. Paste a valid ERC-20 contract address for this network.</p>
                            )}
                        </div>
                    ) : null}

                    {listedTokens.length > 0 ? (
                        <div className="mt-3 grid max-h-72 overflow-y-auto pr-1">
                            {listedTokens.map((listedToken) => (
                                <button
                                    key={`${listedToken.symbol}-${listedToken.address ?? "native"}`}
                                    type="button"
                                    onClick={() => handleTokenSelect(listedToken)}
                                    className="flex min-w-0 items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                                >
                                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br ${tokenAvatarTone(listedToken.symbol)} text-xs font-black text-white`}>
                                        {tokenInitials(listedToken)}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block truncate text-sm font-black text-white">{listedToken.symbol}</span>
                                        <span className="block truncate text-xs text-slate-500">{getListTokenLabel(listedToken)}</span>
                                        <span className="mt-1 inline-flex rounded-full bg-white/[0.06] px-2 py-0.5 text-[0.65rem] font-black uppercase tracking-[0.12em] text-slate-500">{getSourceLabel(listedToken)}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    ) : !isManualEntry ? (
                        <p className="mt-3 rounded-2xl border border-dashed border-white/10 bg-black/10 p-3 text-sm text-slate-400">
                            No tokens found for this network. Paste a valid supported contract address in the search field.
                        </p>
                    ) : null}
                </section>

                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-pink-500 to-blue-500 text-sm font-black">
                            {tokenInitials(props.token)}
                        </div>
                        <div className="min-w-0">
                            <p className="font-black text-white">
                                {props.token?.symbol ?? (props.isLoading ? <Skeleton className="h-4 w-20 inline-block" /> : "Token preview")}
                            </p>
                            <p className="truncate text-sm text-slate-400">
                                {props.token
                                    ? getTokenLabel(props.token)
                                    : "Select a token from the list or paste an address."}
                            </p>
                        </div>
                    </div>

                    {props.error ? (
                        <p role="alert" className="mt-3 text-sm text-red-200">
                            Token is not supported or the RPC could not load its metadata.
                        </p>
                    ) : null}
                    {props.value && !props.isValidAddress && !isManualSupported ? (
                        <p className="mt-3 text-sm text-amber-100">Enter a valid supported token address.</p>
                    ) : null}
                </div>

                <button
                    type="button"
                    disabled={!canDone}
                    onClick={props.onClose}
                    className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                    Done
                </button>
            </div>
        </Dialog>
    );
}
