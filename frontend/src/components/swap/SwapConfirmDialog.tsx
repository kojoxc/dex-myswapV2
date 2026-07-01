import { useEffect, useRef } from "react";

type SwapConfirmDialogProps = {
    open: boolean;
    sellAmount: string;
    sellSymbol: string;
    buyAmount: string;
    buySymbol: string;
    priceImpact: string;
    minimumReceived: string;
    route: string;
    slippage: string;
    onConfirm: () => void;
    onClose: () => void;
};

const FOCUSABLE_SELECTOR = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

export function SwapConfirmDialog(props: SwapConfirmDialogProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const previousActiveElement = useRef<Element | null>(null);

    useEffect(() => {
        if (props.open) {
            previousActiveElement.current = document.activeElement;
            const panel = panelRef.current;
            if (panel) {
                const focusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
                if (focusable) focusable.focus();
            }
        } else {
            if (previousActiveElement.current instanceof HTMLElement) {
                previousActiveElement.current.focus();
            }
        }
    }, [props.open]);

    useEffect(() => {
        if (!props.open) return;

        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === "Escape") {
                e.stopPropagation();
                props.onClose();
                return;
            }

            if (e.key !== "Tab" || !panelRef.current) return;
            const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
            if (focusable.length === 0) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (e.shiftKey) {
                if (document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                }
            } else {
                if (document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [props.open, props.onClose]);

    if (!props.open) return null;

    return (
        <div
            className="token-dialog-backdrop"
            onClick={(e) => { if (e.target === e.currentTarget) props.onClose(); }}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm swap"
        >
            <div className="token-dialog" style={{ maxWidth: 420 }} ref={panelRef}>
                <div className="token-dialog-header">
                    <div>
                        <h2>Confirm swap</h2>
                        <p>Review the details before submitting.</p>
                    </div>
                    <button type="button" onClick={props.onClose} className="token-dialog-close" aria-label="Cancel">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="grid gap-4 p-5 pt-0">
                    <div className="rounded-xl surface-input p-4">
                        <span className="text-xs font-medium text-secondary">You sell</span>
                        <p className="mt-1 text-xl font-bold text-primary">{props.sellAmount} {props.sellSymbol}</p>
                    </div>

                    <div className="flex justify-center text-secondary">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
                            <path d="M7 17 17 7M7 7h10v10" />
                        </svg>
                    </div>

                    <div className="rounded-xl surface-input p-4">
                        <span className="text-xs font-medium text-secondary">You receive</span>
                        <p className="mt-1 text-xl font-bold text-primary">{props.buyAmount} {props.buySymbol}</p>
                    </div>

                    <div className="rounded-xl surface-elevated p-3 grid gap-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-secondary">Price impact</span>
                            <span className="text-primary font-medium">{props.priceImpact}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-secondary">Minimum received</span>
                            <span className="text-primary font-medium">{props.minimumReceived}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-secondary">Route</span>
                            <span className="text-primary font-medium text-right max-w-[200px] truncate">{props.route}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-secondary">Slippage</span>
                            <span className="text-primary font-medium">{props.slippage}</span>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={props.onConfirm}
                        className="primary-action flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 via-fuchsia-500 to-blue-500 px-5 font-black text-white shadow-glow transition duration-150 hover:scale-[1.01]"
                    >
                        Confirm swap
                    </button>
                </div>
            </div>
        </div>
    );
}
