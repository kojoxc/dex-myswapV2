import { type ReactNode, useEffect, useRef } from "react";

type DialogProps = {
    open: boolean;
    title: string;
    children: ReactNode;
    onClose: () => void;
};

const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "textarea:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
].join(",");

export function Dialog({ open, title, children, onClose }: DialogProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!open) return;

        const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        panelRef.current?.focus();

        function onKeyDown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                event.preventDefault();
                onCloseRef.current();
                return;
            }

            if (event.key !== "Tab" || !panelRef.current) return;

            const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(focusableSelector)).filter(
                (element) => element.offsetParent !== null || element === document.activeElement,
            );

            if (focusable.length === 0) {
                event.preventDefault();
                panelRef.current.focus();
                return;
            }

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

        document.addEventListener("keydown", onKeyDown);

        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = originalOverflow;
            previousActiveElement?.focus();
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="presentation">
            <button type="button" aria-label="Close dialog" className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} />

            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="dialog-title"
                tabIndex={-1}
                className="relative z-10 max-h-[86vh] w-full overflow-y-auto rounded-t-[1.5rem] border border-white/10 bg-[#101624] p-5 text-white shadow-[0_24px_90px_rgba(0,0,0,0.55)] outline-none sm:max-w-md sm:rounded-[1.5rem]"
            >
                <div className="mb-5 flex items-center justify-between gap-4">
                    <h2 id="dialog-title" className="text-lg font-black tracking-tight">
                        {title}
                    </h2>
                    <button
                        type="button"
                        aria-label="Close dialog"
                        onClick={onClose}
                        className="grid h-9 w-9 place-items-center rounded-full border border-white/10 bg-white/[0.06] text-slate-300 transition hover:bg-white/[0.1] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-300"
                    >
                        x
                    </button>
                </div>

                {children}
            </div>
        </div>
    );
}
