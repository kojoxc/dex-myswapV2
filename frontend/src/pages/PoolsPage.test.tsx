import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PoolInfo } from "../hooks/usePools";
import type { TokenInfo } from "../types";
import { PoolsPage } from "./PoolsPage";

const ROUTER = "0x0000000000000000000000000000000000001000" as Address;
const PAIR = "0x0000000000000000000000000000000000002000" as Address;
const TOKEN_A = "0x0000000000000000000000000000000000003000" as Address;
const TOKEN_B = "0x0000000000000000000000000000000000004000" as Address;

const tokenA: TokenInfo = { address: TOKEN_A, name: "Token A", symbol: "TKNA", decimals: 18 };
const tokenB: TokenInfo = { address: TOKEN_B, name: "Token B", symbol: "TKNB", decimals: 18 };

const pool: PoolInfo = {
    pairAddress: PAIR,
    tokenA,
    tokenB,
    reserveA: 10n * 10n ** 18n,
    reserveB: 20n * 10n ** 18n,
    totalSupply: 14n * 10n ** 18n,
    userLpBalance: 1n * 10n ** 18n,
};

const mock = vi.hoisted(() => ({
    pools: [] as PoolInfo[],
    isLoading: false,
    error: undefined as string | undefined,
}));

vi.mock("../hooks/useDeploymentConfig", () => ({
    useDeploymentConfig: () => ({ deployment: undefined, isLoading: false }),
}));

vi.mock("../hooks/usePools", () => ({
    usePools: () => ({ pools: mock.pools, isLoading: mock.isLoading, error: mock.error, refetch: vi.fn() }),
}));

function renderPage() {
    localStorage.setItem("myswap:v2:router", ROUTER);
    return render(
        <MemoryRouter>
            <PoolsPage />
        </MemoryRouter>,
    );
}

beforeEach(() => {
    localStorage.clear();
    mock.pools = [];
    mock.isLoading = false;
    mock.error = undefined;
});

describe("PoolsPage", () => {
    it("shows an empty state when no pools exist", () => {
        renderPage();

        expect(screen.getByText("No pools found")).toBeInTheDocument();
    });

    it("renders pool reserves and actions", () => {
        mock.pools = [pool];
        renderPage();

        expect(screen.getByText("TKNA / TKNB")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Swap" })).toBeInTheDocument();
        expect(screen.getByText("Your LP")).toBeInTheDocument();
    });

    it("stores selected pool tokens for quick actions", async () => {
        const user = userEvent.setup();
        mock.pools = [pool];
        renderPage();

        await user.click(screen.getByRole("button", { name: "Add" }));

        expect(localStorage.getItem("myswap:v2:tokenIn")).toBe(TOKEN_A);
        expect(localStorage.getItem("myswap:v2:tokenOut")).toBe(TOKEN_B);
    });
});
