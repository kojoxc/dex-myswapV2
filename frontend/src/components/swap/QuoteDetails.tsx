import { useState } from "react";

import type { RouteInfo } from "../../hooks/useSwapQuote";
import type { TokenInfo } from "../../types";
import { formatDisplayAmount, formatTokenAmount } from "../../lib/format";
import { Skeleton } from "../Skeleton";
import { TransactionDetails, type TransactionDetailRow } from "./TransactionDetails";

type QuoteDetailsProps = {
    show: boolean;
    isLoading: boolean;
    error?: string;
    rate?: string;
    priceImpact?: string;
    amountOutMin?: bigint;
    tokenIn?: TokenInfo;
    tokenOut?: TokenInfo;
    routeLabel: string;
    routes?: RouteInfo[];
    selectedRouteIndex: number;
    onRouteChange: (index: number) => void;
    updatedAt?: number;
};

function RoutePill({ route, selected, onClick }: { route: RouteInfo; selected: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                selected ? "bg-pink-500/20 text-pink-100" : "bg-white/[0.06] text-slate-400 hover:text-slate-200"
            } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300`}
        >
            {route.label}
        </button>
    );
}

export function QuoteDetails(props: QuoteDetailsProps) {
    const [expanded, setExpanded] = useState(false);

    if (!props.show) return null;

    if (props.isLoading) {
        return (
            <div role="status" aria-live="polite" className="grid gap-2 rounded-lg surface-elevated p-3">
                <Skeleton className="h-3 w-48" />
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-3 w-44" />
                <Skeleton className="h-3 w-28" />
            </div>
        );
    }

    if (props.error) {
        return (
            <div role="alert" className="rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-100">
                Quote failed. Check liquidity, router, token path, or RPC status.
            </div>
        );
    }

    if (!props.rate || props.amountOutMin === undefined || !props.tokenIn || !props.tokenOut) return null;

    const routeValue = props.routes && props.routes.length > 1 ? (
        <span className="transaction-route-options">
            {props.routes.map((route, index) => (
                <RoutePill key={route.label} route={route} selected={index === props.selectedRouteIndex} onClick={() => props.onRouteChange(index)} />
            ))}
        </span>
    ) : props.routeLabel;
    const rows: TransactionDetailRow[] = [
        { label: "Price impact", value: props.priceImpact ?? "Best route" },
        { label: "Minimum received", value: `${formatDisplayAmount(formatTokenAmount(props.amountOutMin, props.tokenOut.decimals))} ${props.tokenOut.symbol}` },
        { label: "Estimated gas", value: "Wallet estimate" },
        { label: "Route", value: routeValue },
    ];

    if (props.updatedAt) rows.push({ label: "Updated", value: new Date(props.updatedAt).toLocaleTimeString() });

    return (
        <TransactionDetails
            id="swap-transaction-details"
            summaryLabel="Rate"
            summaryValue={`1 ${props.tokenIn.symbol} = ${formatDisplayAmount(props.rate, 8)} ${props.tokenOut.symbol}`}
            rows={rows}
            open={expanded}
            onToggle={() => setExpanded((value) => !value)}
            ariaLabel="Toggle swap transaction details"
        />
    );
}
