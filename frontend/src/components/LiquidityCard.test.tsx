import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { Address } from "viem";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TokenInfo } from "../types";
import { LiquidityPage } from "../pages/LiquidityPage";
import { LiquidityCard } from "./LiquidityCard";

const ROUTER = "0x0000000000000000000000000000000000001000" as Address;
const TOKEN_A = "0x0000000000000000000000000000000000002000" as Address;
const TOKEN_B = "0x0000000000000000000000000000000000003000" as Address;
const PAIR = "0x0000000000000000000000000000000000004000" as Address;
const ACCOUNT = "0x0000000000000000000000000000000000005000" as Address;
const WETH = "0x0000000000000000000000000000000000006000" as Address;
const NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address;
const HASH = "0x0000000000000000000000000000000000000000000000000000000000009999" as `0x${string}`;

type MockTokenResult = {
    token?: TokenInfo;
    balance?: bigint;
    allowance?: bigint;
    isLoading: boolean;
    error?: string;
    refetch: ReturnType<typeof vi.fn>;
};

type MockPairResult = {
    factoryAddress?: Address;
    pairAddress?: Address;
    reserveA?: bigint;
    reserveB?: bigint;
    totalSupply?: bigint;
    isLoading: boolean;
    error?: string;
    refetch: ReturnType<typeof vi.fn>;
};

type MockState = {
    isConnected: boolean;
    publicClient?: {
        waitForTransactionReceipt: ReturnType<typeof vi.fn>;
    };
    openConnectModal: ReturnType<typeof vi.fn>;
    approve: ReturnType<typeof vi.fn>;
    writeContractAsync: ReturnType<typeof vi.fn>;
    isApproving: boolean;
    isWritePending: boolean;
    tokenResults: Record<string, MockTokenResult>;
    pairResult: MockPairResult;
    deployment?: {
        chainId: number;
        router?: Address;
        weth?: Address;
        tokens: { address: Address; symbol?: string; name?: string }[];
    };
};

const mock = vi.hoisted(() => ({
    state: undefined as unknown as MockState,
}));

function parseAmount(value: string, decimals: number) {
    const [whole = "0", fraction = ""] = value.split(".");
    const paddedFraction = fraction.padEnd(decimals, "0").slice(0, decimals);
    return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(paddedFraction || "0");
}

vi.mock("@rainbow-me/rainbowkit", () => ({
    useConnectModal: () => ({ openConnectModal: mock.state.openConnectModal }),
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({
        address: mock.state.isConnected ? ACCOUNT : undefined,
        chain: { name: "Anvil Localhost" },
        isConnected: mock.state.isConnected,
    }),
    usePublicClient: () => mock.state.publicClient,
    useChainId: () => 31337,
    useWriteContract: () => ({
        writeContractAsync: mock.state.writeContractAsync,
        isPending: mock.state.isWritePending,
    }),
}));

vi.mock("../hooks/useDeploymentConfig", () => ({
    useDeploymentConfig: () => ({ deployment: mock.state.deployment, isLoading: false }),
}));

vi.mock("../hooks/useTokenList", () => ({
    useTokenList: () => ({
        tokens: [
            { type: "erc20", chainId: 31337, address: TOKEN_A, name: "Token A", symbol: "TKNA", decimals: 18 },
            { type: "erc20", chainId: 31337, address: TOKEN_B, name: "Token B", symbol: "TKNB", decimals: 18 },
        ],
        isLoading: false,
    }),
}));

vi.mock("../hooks/useApproval", () => ({
    useApproval: () => ({ approve: mock.state.approve, isApproving: mock.state.isApproving }),
}));

vi.mock("../hooks/useTransactionHistory", () => ({
    useTransactionHistory: () => ({ entries: [], addEntry: vi.fn(), clearHistory: vi.fn() }),
}));

vi.mock("../hooks/useLiquidityPair", () => ({
    useLiquidityPair: () => mock.state.pairResult,
}));

vi.mock("../hooks/useToken", () => ({
    useToken: (tokenAddress: string) =>
        mock.state.tokenResults[tokenAddress.toLowerCase()] ?? {
            isLoading: false,
            refetch: vi.fn(),
        },
}));

const tokenA: TokenInfo = { address: TOKEN_A, name: "Token A", symbol: "TKNA", decimals: 18 };
const tokenB: TokenInfo = { address: TOKEN_B, name: "Token B", symbol: "TKNB", decimals: 18 };
const lpToken: TokenInfo = { address: PAIR, name: "Uniswap V2", symbol: "UNI-V2", decimals: 18 };
const nativeEth: TokenInfo = { address: NATIVE_ETH, name: "Ethereum", symbol: "ETH", decimals: 18 };

function units(value: string) {
    return parseAmount(value, 18);
}

function tokenResult(token: TokenInfo, overrides: Partial<MockTokenResult> = {}): MockTokenResult {
    return {
        token,
        balance: units("10"),
        allowance: units("10"),
        isLoading: false,
        refetch: vi.fn(),
        ...overrides,
    };
}

function createState(overrides: Partial<MockState> = {}): MockState {
    return {
        isConnected: true,
        publicClient: {
            waitForTransactionReceipt: vi.fn().mockResolvedValue({ status: "success" }),
        },
        openConnectModal: vi.fn(),
        approve: vi.fn().mockResolvedValue(HASH),
        writeContractAsync: vi.fn().mockResolvedValue(HASH),
        isApproving: false,
        isWritePending: false,
        tokenResults: {
            [TOKEN_A.toLowerCase()]: tokenResult(tokenA),
            [TOKEN_B.toLowerCase()]: tokenResult(tokenB),
            [PAIR.toLowerCase()]: tokenResult(lpToken),
            [NATIVE_ETH.toLowerCase()]: tokenResult(nativeEth, { allowance: undefined }),
        },
        pairResult: {
            pairAddress: PAIR,
            reserveA: units("10"),
            reserveB: units("20"),
            totalSupply: units("10"),
            isLoading: false,
            refetch: vi.fn(),
        },
        ...overrides,
    };
}

function configurePool() {
    localStorage.setItem("myswap:v2:router", ROUTER);
    localStorage.setItem("myswap:v2:tokenIn", TOKEN_A);
    localStorage.setItem("myswap:v2:tokenOut", TOKEN_B);
}

function renderConfigured(overrides: Partial<MockState> = {}) {
    configurePool();
    mock.state = createState(overrides);
    return render(<LiquidityCard />);
}

beforeEach(() => {
    localStorage.clear();
    mock.state = createState();
});

describe("LiquidityCard", () => {
    it("renders wallet disconnected state and opens wallet modal", async () => {
        const user = userEvent.setup();
        renderConfigured({ isConnected: false });

        const button = screen.getByRole("button", { name: "Connect Wallet" });
        expect(button).toBeEnabled();

        await user.click(button);
        expect(mock.state.openConnectModal).toHaveBeenCalledTimes(1);
    });

    it("submits add liquidity when token allowances are sufficient", async () => {
        const user = userEvent.setup();
        renderConfigured();

        await user.type(screen.getByLabelText("Token A"), "1");
        await waitFor(() => expect(screen.getByLabelText("Token B")).toHaveValue("2"));
        await user.click(screen.getByRole("button", { name: "Add liquidity" }));

        await waitFor(() => expect(mock.state.writeContractAsync).toHaveBeenCalledTimes(1));
        expect(mock.state.writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({ functionName: "addLiquidity" }));
    });

    it("submits native ETH add liquidity with addLiquidityETH", async () => {
        const user = userEvent.setup();
        localStorage.setItem("myswap:v2:router", ROUTER);
        localStorage.setItem("myswap:v2:tokenIn", NATIVE_ETH);
        localStorage.setItem("myswap:v2:tokenOut", TOKEN_B);
        mock.state = createState({ deployment: { chainId: 31337, router: ROUTER, weth: WETH, tokens: [] } });

        render(<LiquidityCard />);

        await user.type(screen.getByLabelText("Token A"), "1");
        await waitFor(() => expect(screen.getByLabelText("Token B")).toHaveValue("2"));
        await user.click(screen.getByRole("button", { name: "Add liquidity" }));

        await waitFor(() => expect(mock.state.writeContractAsync).toHaveBeenCalledTimes(1));
        const request = mock.state.writeContractAsync.mock.calls[0][0];
        expect(request).toEqual(expect.objectContaining({ functionName: "addLiquidityETH", value: units("1") }));
        expect(request.args[0]).toBe(TOKEN_B);
    });

    it("submits token approval before adding liquidity", async () => {
        const user = userEvent.setup();
        renderConfigured({
            tokenResults: {
                [TOKEN_A.toLowerCase()]: tokenResult(tokenA, { allowance: 0n }),
                [TOKEN_B.toLowerCase()]: tokenResult(tokenB),
                [PAIR.toLowerCase()]: tokenResult(lpToken),
            },
        });

        await user.type(screen.getByLabelText("Token A"), "1");
        await waitFor(() => expect(screen.getByLabelText("Token B")).toHaveValue("2"));
        await user.click(screen.getByRole("button", { name: "Approve TKNA" }));

        await waitFor(() => expect(mock.state.approve).toHaveBeenCalledTimes(1));
        expect(mock.state.writeContractAsync).not.toHaveBeenCalled();
    });

    it("submits remove liquidity for an existing pool", async () => {
        const user = userEvent.setup();
        renderConfigured();

        await user.click(screen.getByRole("button", { name: "Remove" }));
        await user.type(screen.getByLabelText("LP tokens"), "1");
        await user.click(screen.getByRole("button", { name: "Remove liquidity" }));

        await waitFor(() => expect(mock.state.writeContractAsync).toHaveBeenCalledTimes(1));
        expect(mock.state.writeContractAsync).toHaveBeenCalledWith(expect.objectContaining({ functionName: "removeLiquidity" }));
    });

    it("filters non-numeric LP amount characters", async () => {
        const user = userEvent.setup();
        renderConfigured();

        await user.click(screen.getByRole("button", { name: "Remove" }));
        const input = screen.getByLabelText("LP tokens");
        await user.type(input, "1x.2.3e");

        expect(input).toHaveValue("1.23");
    });

    it("submits native ETH remove liquidity with removeLiquidityETH", async () => {
        const user = userEvent.setup();
        localStorage.setItem("myswap:v2:router", ROUTER);
        localStorage.setItem("myswap:v2:tokenIn", NATIVE_ETH);
        localStorage.setItem("myswap:v2:tokenOut", TOKEN_B);
        mock.state = createState({ deployment: { chainId: 31337, router: ROUTER, weth: WETH, tokens: [] } });

        render(<LiquidityCard defaultMode="remove" />);

        await user.type(screen.getByLabelText("LP tokens"), "1");
        await user.click(screen.getByRole("button", { name: "Remove liquidity" }));

        await waitFor(() => expect(mock.state.writeContractAsync).toHaveBeenCalledTimes(1));
        const request = mock.state.writeContractAsync.mock.calls[0][0];
        expect(request).toEqual(expect.objectContaining({ functionName: "removeLiquidityETH" }));
        expect(request.args[0]).toBe(TOKEN_B);
    });

    it("disables remove liquidity when the pool does not exist", async () => {
        const user = userEvent.setup();
        renderConfigured({
            pairResult: {
                isLoading: false,
                refetch: vi.fn(),
            },
        });

        await user.click(screen.getByRole("button", { name: "Remove" }));

        expect(screen.getByRole("button", { name: "Pool not found" })).toBeDisabled();
    });

    it("keeps liquidity page focused without marketing hero", () => {
        configurePool();
        mock.state = createState();
        window.innerWidth = 320;

        render(
            <MemoryRouter>
                <LiquidityPage />
            </MemoryRouter>,
        );

        expect(screen.getByLabelText("Manage liquidity")).toBeInTheDocument();
        expect(screen.queryByText("Clean EVM token swaps.")).not.toBeInTheDocument();
    });
});
