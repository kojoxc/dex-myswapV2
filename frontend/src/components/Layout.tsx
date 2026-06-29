import { Outlet } from "react-router-dom";

import { Navbar } from "./Navbar";

export function Layout() {
    return (
        <div className="min-h-screen overflow-x-hidden text-white">
            <Navbar />
            <main className="mx-auto flex w-full flex-col items-center">
                <Outlet />
            </main>
        </div>
    );
}
