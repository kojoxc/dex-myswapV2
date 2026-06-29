import { HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { LiquidityPage } from "./pages/LiquidityPage";
import { PoolsPage } from "./pages/PoolsPage";
import { SwapPage } from "./pages/SwapPage";

export function App() {
    return (
        <HashRouter>
            <Routes>
                <Route element={<Layout />}>
                    <Route index element={<Navigate to="/swap" replace />} />
                    <Route path="/swap" element={<SwapPage />} />
                    <Route path="/liquidity" element={<LiquidityPage />} />
                    <Route path="/pools" element={<PoolsPage />} />
                </Route>
            </Routes>
        </HashRouter>
    );
}
