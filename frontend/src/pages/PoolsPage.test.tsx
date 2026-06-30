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
const PAIR_2 = "0x0000000000000000000000000000000000002001" as Address;
const TOKEN_A = "0x0000000000000000000000000000000000003000" as Address;
const TOKEN_B = "0x0000000000000000000000000000000000004000" as Address;
const TOKEN_C = "0x0000000000000000000000000000000000005000" as Address;

const tokenA: TokenInfo = { address: TOKEN_A, name: "Token A", symbol: "TKNA", decimals: 18 };
const tokenB: TokenInfo = { address: TOKEN_B, name: "Token B", symbol: "TKNB", decimals: 18 };
const tokenC: TokenInfo = { address: TOKEN_C, name: "Token C", symbol: "TKNC", decimals: 18 };

const pool: PoolInfo = {
    pairAddress: PAIR,
    tokenA,
    tokenB,
    reserveA: 10n * 10n ** 18n,
    reserveB: 20n * 10n ** 18n,
    totalSupply: 14n * 10n ** 18n,
    userLpBalance: 1n * 10n ** 18n,
};

const secondPool: PoolInfo = {
    pairAddress: PAIR_2,
    tokenA: tokenB,
    tokenB: tokenC,
    reserveA: 5n * 10n ** 18n,
    reserveB: 15n * 10n ** 18n,
    totalSupply: 8n * 10n ** 18n,
    userLpBalance: 0n,
};

const mock = vi.hoisted(() => ({
    pools: [] as PoolInfo[],
    totalPairs: 0,
    isLoading: false,
    error: undefined as string | undefined,
}));

vi.mock("../hooks/useDeploymentConfig", () => ({
    useDeploymentConfig: () => ({ deployment: undefined, isLoading: false }),
}));

vi.mock("../hooks/usePools", () => ({
    usePools: () => ({ pools: mock.pools, totalPairs: mock.totalPairs, isLoading: mock.isLoading, error: mock.error, refetch: vi.fn() }),
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
    mock.totalPairs = 0;
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
        mock.totalPairs = 1;
        renderPage();

        expect(screen.getByText("TKNA / TKNB")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Swap" })).toBeInTheDocument();
        expect(screen.getAllByText("Your LP").length).toBeGreaterThan(0);
    });

    it("stores selected pool tokens for quick actions", async () => {
        const user = userEvent.setup();
        mock.pools = [pool];
        mock.totalPairs = 1;
        renderPage();

        await user.click(screen.getByRole("button", { name: "Add" }));

        expect(localStorage.getItem("myswap:v2:tokenIn")).toBe(TOKEN_A);
        expect(localStorage.getItem("myswap:v2:tokenOut")).toBe(TOKEN_B);
    });

    it("filters pools by token symbol", async () => {
        const user = userEvent.setup();
        mock.pools = [pool, secondPool];
        mock.totalPairs = 2;
        renderPage();

        await user.type(screen.getByLabelText("Search pools"), "TKNC");

        expect(screen.queryByText("TKNA / TKNB")).not.toBeInTheDocument();
        expect(screen.getByText("TKNB / TKNC")).toBeInTheDocument();
    });
});
