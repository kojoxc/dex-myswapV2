import type { ReactNode } from "react";

type TradePageShellProps = {
    children: ReactNode;
};

export function TradePageShell({ children }: TradePageShellProps) {
    return (
        <div className="trade-page">
            {children}
        </div>
    );
}
