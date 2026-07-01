import type { ReactNode } from "react";

type TransactionDetailTone = "normal" | "warning" | "danger";

export type TransactionDetailRow = {
    label: string;
    value: ReactNode;
    tone?: TransactionDetailTone;
};

type TransactionDetailsProps = {
    id: string;
    summaryLabel: string;
    summaryValue: ReactNode;
    rows: TransactionDetailRow[];
    open: boolean;
    onToggle: () => void;
    ariaLabel?: string;
};

function ChevronIcon({ open }: { open: boolean }) {
    return (
        <svg className={open ? "is-open" : ""} viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M5 7.5 10 12.5l5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

export function TransactionDetails({ id, summaryLabel, summaryValue, rows, open, onToggle, ariaLabel = "Toggle transaction details" }: TransactionDetailsProps) {
    return (
        <section className="transaction-details">
            <button
                type="button"
                className="transaction-details-trigger"
                aria-expanded={open}
                aria-controls={id}
                aria-label={ariaLabel}
                onClick={onToggle}
            >
                <span className="transaction-rate-label">{summaryLabel}</span>
                <span className="transaction-rate-value">{summaryValue}</span>
                <ChevronIcon open={open} />
            </button>

            {open ? (
                <div id={id} className="transaction-details-list">
                    {rows.map((row) => (
                        <div className="transaction-detail-row" key={row.label}>
                            <span>{row.label}</span>
                            <strong className={row.tone ? `is-${row.tone}` : undefined}>{row.value}</strong>
                        </div>
                    ))}
                </div>
            ) : null}
        </section>
    );
}
