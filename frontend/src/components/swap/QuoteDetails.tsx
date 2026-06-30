import type { RouteInfo, SwapQuoteMode } from "../../hooks/useSwapQuote";
import type { TokenInfo } from "../../types";
import { formatTokenAmount } from "../../lib/format";
import { Skeleton } from "../Skeleton";

type QuoteDetailsProps = {
    show: boolean;
    isLoading: boolean;
    error?: string;
    rate?: string;
    priceImpact?: string;
    amountOutMin?: bigint;
    amountInMax?: bigint;
    quoteMode: SwapQuoteMode;
    tokenIn?: TokenInfo;
    tokenOut?: TokenInfo;
    routeLabel: string;
    routes?: RouteInfo[];
    selectedRouteIndex: number;
    onRouteChange: (index: number) => void;
    isStale?: boolean;
    updatedAt?: number;
    onRefresh: () => void;
};

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">{label}</dt>
            <dd className="min-w-0 truncate text-right text-slate-200">{value}</dd>
        </div>
    );
}

function RoutePill({ route, selected, onClick }: { route: RouteInfo; selected: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-full px-2.5 py-1 text-xs font-bold transition ${
                selected ? "bg-pink-500/20 text-pink-100" : "bg-white/[0.06] text-slate-400 hover:text-slate-200"
            }`}
        >
            {route.label}
        </button>
    );
}

export function QuoteDetails(props: QuoteDetailsProps) {
    if (!props.show) return null;

    if (props.isLoading) {
        return (
            <div role="status" aria-live="polite" className="grid gap-3 rounded-[1.25rem] border border-white/[0.08] bg-black/20 p-4">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-36" />
            </div>
        );
    }

    if (props.error) {
        return (
            <div role="alert" className="rounded-[1.25rem] border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-100">
                Quote failed. Check liquidity, router, token path, or RPC status.
            </div>
        );
    }

    const slippageAmount = props.quoteMode === "exactOut" ? props.amountInMax : props.amountOutMin;
    if (!props.rate || slippageAmount === undefined || !props.tokenIn || !props.tokenOut) return null;

    const slippageLabel = props.quoteMode === "exactOut" ? "Maximum paid" : "Minimum received";
    const slippageToken = props.quoteMode === "exactOut" ? props.tokenIn : props.tokenOut;

    return (
        <div className="grid gap-2 rounded-[1.25rem] border border-white/[0.08] bg-black/20 p-4 text-sm">
            {props.isStale ? (
                <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-300/20 bg-amber-300/10 p-3 text-amber-100">
                    <span>Quote may be stale. Refresh before swapping.</span>
                    <button type="button" onClick={props.onRefresh} className="rounded-full bg-amber-200 px-3 py-1 text-xs font-black text-slate-950 transition hover:bg-amber-100">
                        Refresh
                    </button>
                </div>
            ) : null}
            <dl className="grid gap-2">
                <DetailRow label="Rate" value={`1 ${props.tokenIn.symbol} = ${props.rate} ${props.tokenOut.symbol}`} />
                <DetailRow label="Price impact" value={props.priceImpact ?? "Best route"} />
                <DetailRow label={slippageLabel} value={`${formatTokenAmount(slippageAmount, slippageToken.decimals)} ${slippageToken.symbol}`} />
                <DetailRow label="Estimated gas" value="Wallet estimate" />
                {props.updatedAt ? <DetailRow label="Updated" value={new Date(props.updatedAt).toLocaleTimeString()} /> : null}
                {props.routes && props.routes.length > 1 ? (
                    <div className="flex items-center justify-between gap-4">
                        <dt className="text-slate-500">Route</dt>
                        <dd className="flex flex-wrap justify-end gap-1">
                            {props.routes.map((route, index) => (
                                <RoutePill key={route.label} route={route} selected={index === props.selectedRouteIndex} onClick={() => props.onRouteChange(index)} />
                            ))}
                        </dd>
                    </div>
                ) : (
                    <DetailRow label="Route" value={props.routeLabel} />
                )}
            </dl>
        </div>
    );
}
