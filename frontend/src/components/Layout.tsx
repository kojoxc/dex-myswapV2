import { NavLink, Outlet } from "react-router-dom";

import { Navbar } from "./Navbar";

export function Layout() {
    const links = [
        { to: "/swap", label: "Swap" },
        { to: "/liquidity", label: "Liquidity" },
        { to: "/pools", label: "Pools" },
    ];

    return (
        <div className="min-h-screen overflow-x-hidden text-white">
            <Navbar />
            <main className="mx-auto flex w-full flex-col items-center pb-20 sm:pb-0">
                <Outlet />
            </main>
            <nav className="fixed bottom-3 left-3 right-3 z-40 grid grid-cols-3 rounded-3xl border border-white/10 bg-[#101624]/90 p-1 shadow-2xl backdrop-blur-xl sm:hidden" aria-label="Mobile navigation">
                {links.map((link) => (
                    <NavLink
                        key={link.to}
                        to={link.to}
                        className={({ isActive }) =>
                            `rounded-2xl px-3 py-3 text-center text-sm font-black transition ${isActive ? "bg-white text-slate-950" : "text-slate-300 hover:text-white"}`
                        }
                    >
                        {link.label}
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}
