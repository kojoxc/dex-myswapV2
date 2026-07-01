import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { type Address, isAddress } from "viem";
import { usePublicClient } from "wagmi";

import { erc20Abi } from "../../abis";
import { filterTokens, NATIVE_ETH_ADDRESS } from "../../lib/tokenRegistry";
import type { SupportedToken } from "../../lib/tokenRegistry";
import { compactAddress } from "../../lib/format";
import type { TokenInfo } from "../../types";
import { Skeleton } from "../Skeleton";

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

function SearchIcon() {
    return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="m14.5 14.5 3 3M8.8 15.6a6.8 6.8 0 1 1 0-13.6 6.8 6.8 0 0 1 0 13.6Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

function XIcon() {
    return (
        <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
    );
}

function getSourceLabel(token: SupportedToken) {
    if (token.type === "native") return "Native";
    if (token.source === "deployment") return "Token";
    if (token.source === "external") return "Token";
    if (token.source === "custom") return "Custom";
    return "Token";
}

function tokenAddress(token: SupportedToken) {
    return token.type === "native" ? NATIVE_ETH_ADDRESS : token.address;
}

function tokenKey(token: SupportedToken) {
    return `${token.symbol}-${token.address ?? "native"}`;
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
    const dialogRef = useRef<HTMLElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const previousFocusRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (props.open) {
            setSearch("");
            setManualStatus("idle");
            previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
            window.setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [props.open]);

    useEffect(() => {
        if (!props.open) return;

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault();
                props.onClose();
                previousFocusRef.current?.focus();
                return;
            }

            if (event.key !== "Tab" || !dialogRef.current) return;

            const focusable = Array.from(
                dialogRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'),
            ).filter((element) => !element.hasAttribute("aria-hidden"));

            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [props.open, props.onClose]);

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

    function closeDialog() {
        props.onClose();
        window.setTimeout(() => previousFocusRef.current?.focus(), 0);
    }

    function handleTokenSelect(token: SupportedToken) {
        if (token.type === "native") {
            props.onChange("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE");
        } else if (token.address) {
            props.onChange(token.address);
        }
        closeDialog();
    }

    function handleCurrentTokenSelect() {
        if (!props.token || !props.isValidAddress) return;
        closeDialog();
    }

    function handleBackdropMouseDown(event: MouseEvent<HTMLDivElement>) {
        if (event.target === event.currentTarget) closeDialog();
    }

    const quickTokens = useMemo(
        () => filterTokens(props.tokens ?? [], "")
            .filter((token) => {
                const address = tokenAddress(token)?.toLowerCase();
                return address && address !== props.excludeAddress?.toLowerCase();
            })
            .slice(0, 6),
        [props.tokens, props.excludeAddress],
    );

    const showManualToken = isManualEntry && (manualStatus === "supported" || isManualSupported) && props.token && props.isValidAddress;

    function renderTokenRow(listedToken: SupportedToken) {
        const address = tokenAddress(listedToken);
        const selected = address?.toLowerCase() === props.value.toLowerCase();
        const addressLabel = listedToken.type === "erc20" && listedToken.address ? compactAddress(listedToken.address) : undefined;

        return (
            <button
                key={tokenKey(listedToken)}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => handleTokenSelect(listedToken)}
                className="token-row"
            >
                <span className={`token-row-icon grid place-items-center bg-gradient-to-br ${tokenAvatarTone(listedToken.symbol)} text-xs font-black text-white`}>
                    {tokenInitials(listedToken)}
                </span>
                <span className="token-row-main">
                    <span className="token-row-title">
                        <span className="token-row-symbol">{listedToken.symbol}</span>
                    </span>
                    <span className="token-row-name">{listedToken.name}</span>
                    {addressLabel ? <span className="token-row-address">{addressLabel}</span> : null}
                </span>
                <span className="token-badge">{getSourceLabel(listedToken)}</span>
            </button>
        );
    }

    if (!props.open) return null;

    return (
        <div className="token-dialog-backdrop" role="presentation" onMouseDown={handleBackdropMouseDown}>
            <section
                ref={dialogRef}
                className="token-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="token-dialog-title"
                aria-describedby="token-dialog-description"
            >
                <header className="token-dialog-header">
                    <div>
                        <h2 id="token-dialog-title">Select a token</h2>
                        <p id="token-dialog-description">Search by symbol, name, or contract address.</p>
                    </div>
                    <button type="button" className="token-dialog-close" aria-label="Close token selector" onClick={closeDialog}>
                        <XIcon />
                    </button>
                </header>

                <div className="token-search-wrap">
                    <SearchIcon />
                    <input
                        ref={inputRef}
                        type="search"
                        value={search}
                        onChange={(event) => handleSearchChange(event.target.value)}
                        placeholder="Search token or address"
                        aria-label="Search token or address"
                        spellCheck={false}
                    />
                </div>

                {quickTokens.length > 0 ? (
                    <div className="token-quick-list" aria-label="Quick token list">
                        {quickTokens.map((token) => (
                            <button key={tokenKey(token)} type="button" className="token-quick-chip" onClick={() => handleTokenSelect(token)}>
                                <span className={`token-icon grid place-items-center bg-gradient-to-br ${tokenAvatarTone(token.symbol)} text-[0.6rem] font-black text-white`}>
                                    {tokenInitials(token)}
                                </span>
                                {token.symbol}
                            </button>
                        ))}
                    </div>
                ) : null}

                <div className="token-list-header">
                    <span>Available tokens</span>
                    <span>{listedTokens.length + (showManualToken ? 1 : 0)}</span>
                </div>

                <div className="token-list" role="listbox" aria-label="Available tokens">
                    {showManualToken ? (
                        <button type="button" role="option" aria-selected className="token-row" onClick={handleCurrentTokenSelect}>
                            <span className={`token-row-icon grid place-items-center bg-gradient-to-br ${tokenAvatarTone(props.token?.symbol)} text-xs font-black text-white`}>
                                {tokenInitials(props.token)}
                            </span>
                            <span className="token-row-main">
                                <span className="token-row-title">
                                    <span className="token-row-symbol">{props.token?.symbol}</span>
                                </span>
                                <span className="token-row-name">{props.token?.name}</span>
                                <span className="token-row-address">{compactAddress(props.token?.address)}</span>
                            </span>
                            <span className="token-badge">Custom</span>
                        </button>
                    ) : null}

                    {listedTokens.map(renderTokenRow)}

                    {props.tokenListLoading ? (
                        <div className="token-list-loading" role="status">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    ) : null}

                    {manualStatus === "checking" ? <p className="token-empty-state">Checking token contract...</p> : null}

                    {isManualEntry && !showManualToken && manualStatus !== "checking" ? (
                        <div className="token-empty-state" role="status">
                            <strong>Token not found on this network.</strong>
                            <span>Paste a supported ERC-20 contract address for the active network.</span>
                        </div>
                    ) : null}

                    {!isManualEntry && listedTokens.length === 0 && !props.tokenListLoading ? (
                        <div className="token-empty-state" role="status">
                            <strong>No tokens found</strong>
                            <span>Try another symbol or contract address.</span>
                        </div>
                    ) : null}

                    {props.error ? (
                        <p role="alert" className="token-error-state">
                            Token is not supported or the RPC could not load its metadata.
                        </p>
                    ) : null}
                </div>
            </section>
        </div>
    );
}
