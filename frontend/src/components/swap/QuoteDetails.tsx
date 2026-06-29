import type { TokenInfo } from "../../types";
import { formatTokenAmount } from "../../lib/format";

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
};

function DetailRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <dt className="text-slate-500">{label}</dt>
            <dd className="min-w-0 truncate text-right text-slate-200">{value}</dd>
        </div>
    );
}

export function QuoteDetails(props: QuoteDetailsProps) {
    if (!props.show) return null;

    if (props.isLoading) {
        return (
            <div role="status" aria-live="polite" className="rounded-[1.25rem] border border-white/[0.08] bg-black/20 p-4 text-sm text-slate-300">
                Fetching quote...
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

    if (!props.rate || props.amountOutMin === undefined || !props.tokenIn || !props.tokenOut) return null;

    return (
        <dl className="grid gap-2 rounded-[1.25rem] border border-white/[0.08] bg-black/20 p-4 text-sm">
            <DetailRow label="Rate" value={`1 ${props.tokenIn.symbol} = ${props.rate} ${props.tokenOut.symbol}`} />
            <DetailRow label="Price impact" value={props.priceImpact ?? "Best route"} />
            <DetailRow label="Minimum received" value={`${formatTokenAmount(props.amountOutMin, props.tokenOut.decimals)} ${props.tokenOut.symbol}`} />
            <DetailRow label="Estimated gas" value="Wallet estimate" />
            <DetailRow label="Route" value={props.routeLabel} />
        </dl>
    );
}
