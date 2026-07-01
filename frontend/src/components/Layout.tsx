import { useRef, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import { ActivityDrawer } from "./ActivityDrawer";
import { Navbar } from "./Navbar";
import { useTransactionHistory } from "../hooks/useTransactionHistory";

export type TradeOutletContext = ReturnType<typeof useTransactionHistory>;

export function Layout() {
    const history = useTransactionHistory();
    const [activityOpen, setActivityOpen] = useState(false);
    const activityButtonRef = useRef<HTMLButtonElement>(null);
    const links = [
        { to: "/swap", label: "Swap" },
        { to: "/liquidity", label: "Liquidity" },
        { to: "/pools", label: "Pools" },
    ];

    return (
        <div className="min-h-screen overflow-x-hidden text-primary">
            <Navbar
                activityOpen={activityOpen}
                activityButtonRef={activityButtonRef}
                onActivityClick={() => setActivityOpen(true)}
            />
            <main className="app-main">
                <Outlet context={history} />
            </main>
            <ActivityDrawer
                open={activityOpen}
                entries={history.entries}
                isLoading={history.isLoading}
                error={history.error}
                onRetry={history.refetch}
                onClose={() => setActivityOpen(false)}
                returnFocusRef={activityButtonRef}
            />
            <nav className="fixed bottom-3 left-3 right-3 z-40 grid grid-cols-3 rounded-lg border border-white/10 bg-card/90 p-1 shadow-2xl backdrop-blur-xl sm:hidden" aria-label="Mobile navigation">
                {links.map((link) => (
                    <NavLink
                        key={link.to}
                        to={link.to}
                        className={({ isActive }) =>
                            `rounded-md px-3 py-3 text-center text-sm font-black transition ${isActive ? "bg-white/[0.1] text-primary" : "text-muted hover:text-secondary"}`
                        }
                    >
                        {link.label}
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}
