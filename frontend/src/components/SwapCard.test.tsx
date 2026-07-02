import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Address } from "viem";
import { describe, expect, it, beforeEach, vi } from "vitest";

import type { TokenInfo } from "../types";
import { SwapCard } from "./SwapCard";
import { SwapPage } from "../pages/SwapPage";

const ROUTER = "0x0000000000000000000000000000000000001000" as Address;
const TOKEN_A = "0x0000000000000000000000000000000000002000" as Address;
const TOKEN_B = "0x0000000000000000000000000000000000003000" as Address;
const TOKEN_C = "0x0000000000000000000000000000000000004000" as Address;
const ACCOUNT = "0x0000000000000000000000000000000000005000" as Address;
const WETH = "0x0000000000000000000000000000000000006000" as Address;
const NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as Address;
const HASH = "0x0000000000000000000000000000000000000000000000000000000000009999" as `0x${string}`;
const QUOTE_UPDATED_AT = Date.now();

type MockTokenResult = {
    token?: TokenInfo;
    balance?: bigint;
    allowance?: bigint;
    isLoading: boolean;
    error?: string;
    refetch: ReturnType<typeof vi.fn>;
};

type QuoteMode = "empty" | "normal" | "loading" | "error";

type MockState = {
    isConnected: boolean;
    publicClient?: {
        waitForTransactionReceipt: ReturnType<typeof vi.fn>;
    };
    openConnectModal: ReturnType<typeof vi.fn>;
    approve: ReturnType<typeof vi.fn>;
    writeContractAsync: ReturnType<typeof vi.fn>;
    isApproving: boolean;
    isSwapPending: boolean;
    tokenResults: Record<string, MockTokenResult>;
    quoteMode: QuoteMode;
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
    if (!value || Number(value) <= 0) return undefined;
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
        isPending: mock.state.isSwapPending,
    }),
}));

vi.mock("../hooks/useDeploymentConfig", () => ({
    useDeploymentConfig: () => ({ deployment: mock.state.deployment, isLoading: false }),
}));

vi.mock("../hooks/useLiquidityPair", () => ({
    useLiquidityPair: () => ({ isLoading: false, refetch: vi.fn() }),
}));

vi.mock("../hooks/useTokenList", () => ({
    useTokenList: () => ({
        tokens: [
            { type: "erc20", chainId: 31337, address: TOKEN_A, name: "Token A", symbol: "TKA", decimals: 18 },
            { type: "erc20", chainId: 31337, address: TOKEN_B, name: "Token B", symbol: "TKB", decimals: 18 },
            { type: "erc20", chainId: 31337, address: TOKEN_C, name: "Token C", symbol: "TKC", decimals: 18 },
        ],
        isLoading: false,
    }),
}));

vi.mock("../hooks/useApproval", () => ({
    useApproval: () => ({ approve: mock.state.approve, isApproving: mock.state.isApproving }),
}));

vi.mock("../hooks/useTransactionHistory", () => ({
    useTransactionHistory: () => ({ entries: [], addEntry: vi.fn(), isLoading: false, refetch: vi.fn() }),
}));

vi.mock("../hooks/useToken", () => ({
    useToken: (tokenAddress: string) =>
        mock.state.tokenResults[tokenAddress.toLowerCase()] ?? {
            isLoading: false,
            refetch: vi.fn(),
        },
}));

vi.mock("../hooks/useSwapQuote", () => ({
    useSwapQuote: (args: { tokenIn?: TokenInfo; tokenOut?: TokenInfo; amount: string; slippageBps: number }) => {
        const baseQuote = { routes: [], selectedRouteIndex: 0, setSelectedRouteIndex: vi.fn(), refetch: vi.fn(), updatedAt: QUOTE_UPDATED_AT };
        const parsedAmount = args.tokenIn ? parseAmount(args.amount, args.tokenIn.decimals) : undefined;
        if (!args.tokenIn || !args.tokenOut || !parsedAmount) return { ...baseQuote, updatedAt: undefined, isLoading: false };
        if (mock.state.quoteMode === "loading") return { ...baseQuote, updatedAt: undefined, amountIn: parsedAmount, isLoading: true };
        if (mock.state.quoteMode === "error") return { ...baseQuote, updatedAt: undefined, amountIn: parsedAmount, isLoading: false, error: "No route" };
        if (mock.state.quoteMode === "empty") return { ...baseQuote, updatedAt: undefined, isLoading: false };

        const slippageBps = BigInt(Math.min(9_900, Math.max(0, Math.round(args.slippageBps))));
        const amountIn = parsedAmount;
        const amountOut = amountIn * 2n;
        const amountOutMin = (amountOut * (10_000n - slippageBps)) / 10_000n;
        return { ...baseQuote, amountIn, amountOut, amountOutMin, rate: "2", isLoading: false };
    },
}));

const tokenA: TokenInfo = { address: TOKEN_A, name: "Token A", symbol: "TKA", decimals: 18 };
const tokenB: TokenInfo = { address: TOKEN_B, name: "Token B", symbol: "TKB", decimals: 18 };
const tokenC: TokenInfo = { address: TOKEN_C, name: "Token C", symbol: "TKC", decimals: 18 };
const wethToken: TokenInfo = { address: WETH, name: "Wrapped Ether", symbol: "WETH", decimals: 18 };
const nativeEth: TokenInfo = { address: NATIVE_ETH, name: "Ethereum", symbol: "ETH", decimals: 18 };

function units(value: string) {
    return parseAmount(value, 18) ?? 0n;
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
        isSwapPending: false,
        quoteMode: "normal",
        tokenResults: {
            [TOKEN_A.toLowerCase()]: tokenResult(tokenA),
            [TOKEN_B.toLowerCase()]: tokenResult(tokenB),
            [TOKEN_C.toLowerCase()]: tokenResult(tokenC),
            [WETH.toLowerCase()]: tokenResult(wethToken),
            [NATIVE_ETH.toLowerCase()]: tokenResult(nativeEth, { allowance: undefined }),
        },
        ...overrides,
    };
}

function configureRoute() {
    localStorage.setItem("myswap:v2:router", ROUTER);
    localStorage.setItem("myswap:v2:tokenIn", TOKEN_A);
    localStorage.setItem("myswap:v2:tokenOut", TOKEN_B);
}

function renderConfigured(overrides: Partial<MockState> = {}) {
    configureRoute();
    mock.state = createState(overrides);
    return render(<SwapCard />);
}

beforeEach(() => {
    localStorage.clear();
    mock.state = createState();
});

describe("SwapCard", () => {
    it("renders wallet disconnected state and opens wallet modal", async () => {
        const user = userEvent.setup();
        renderConfigured({ isConnected: false });

        const button = screen.getByRole("button", { name: "Connect Wallet" });
        expect(button).toBeEnabled();

        await user.click(button);
        expect(mock.state.openConnectModal).toHaveBeenCalledTimes(1);
    });

    it("updates pay amount", async () => {
        const user = userEvent.setup();
        renderConfigured();

        const input = screen.getByLabelText("Sell");
        await user.type(input, "1.25");

        expect(input).toHaveValue("1.25");
    });

    it("filters non-numeric pay amount characters", async () => {
        const user = userEvent.setup();
        renderConfigured();

        const input = screen.getByLabelText("Sell");
        await user.type(input, "1a2..3e-4");

        expect(input).toHaveValue("12.34");
    });

    it("selects a token through token selector dialog", async () => {
        const user = userEvent.setup();
        renderConfigured();

        await user.click(screen.getByRole("button", { name: "Select Sell token" }));
        const dialog = screen.getByRole("dialog", { name: "Select a token" });
        const input = within(dialog).getByLabelText("Search token or address");

        await user.clear(input);
        await user.type(input, TOKEN_C);
        await user.click(within(dialog).getByRole("option", { name: /TKC/ }));

        expect(screen.getByRole("button", { name: "Select Sell token" })).toHaveTextContent("TKC");
    });

    it("switches pay and receive token direction", async () => {
        const user = userEvent.setup();
        renderConfigured();

        await user.click(screen.getByRole("button", { name: "Switch tokens" }));

        expect(screen.getByRole("button", { name: "Select Sell token" })).toHaveTextContent("TKB");
        expect(screen.getByRole("button", { name: "Select Buy token" })).toHaveTextContent("TKA");
    });

    it("shows insufficient balance state", async () => {
        const user = userEvent.setup();
        renderConfigured({
            tokenResults: {
                [TOKEN_A.toLowerCase()]: tokenResult(tokenA, { balance: units("0.5") }),
                [TOKEN_B.toLowerCase()]: tokenResult(tokenB),
                [TOKEN_C.toLowerCase()]: tokenResult(tokenC),
            },
        });

        await user.type(screen.getByLabelText("Sell"), "1");

        expect(screen.getByRole("button", { name: "Insufficient balance" })).toBeDisabled();
    });

    it("shows missing route state and opens route settings", async () => {
        const user = userEvent.setup();
        localStorage.setItem("myswap:v2:router", "0x0000");
        mock.state = createState();
        render(<SwapCard />);

        expect(screen.getByText("Swap route is not configured")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Route unavailable" })).toBeDisabled();

        await user.click(screen.getByRole("button", { name: "Configure route" }));
        expect(screen.getByRole("dialog", { name: "Swap settings" })).toBeInTheDocument();
        expect(screen.getByLabelText("Router address")).toBeInTheDocument();
    });

    it("shows quote loading state", async () => {
        const user = userEvent.setup();
        renderConfigured({ quoteMode: "loading" });

        await user.type(screen.getByLabelText("Sell"), "1");

        expect(screen.getByRole("status")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Fetching quote" })).toBeDisabled();
    });

    it("shows quote error state", async () => {
        const user = userEvent.setup();
        renderConfigured({ quoteMode: "error" });

        await user.type(screen.getByLabelText("Sell"), "1");

        expect(screen.getByRole("alert")).toHaveTextContent("Quote failed");
        expect(screen.getByRole("button", { name: "Route unavailable" })).toBeDisabled();
    });

    it("submits approval when allowance is insufficient", async () => {
        const user = userEvent.setup();
        renderConfigured({
            tokenResults: {
                [TOKEN_A.toLowerCase()]: tokenResult(tokenA, { allowance: 0n }),
                [TOKEN_B.toLowerCase()]: tokenResult(tokenB),
                [TOKEN_C.toLowerCase()]: tokenResult(tokenC),
            },
        });

        await user.type(screen.getByLabelText("Sell"), "1");
        await user.click(screen.getByRole("button", { name: "Approve TKA" }));

        // Approval fires first, then swap auto-submits
        await waitFor(() => expect(mock.state.approve).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(mock.state.writeContractAsync).toHaveBeenCalledTimes(1));
    });

    it("submits swap when allowance is sufficient", async () => {
        const user = userEvent.setup();
        renderConfigured();

        await user.type(screen.getByLabelText("Sell"), "1");
        await user.click(screen.getByRole("button", { name: "Swap" }));
        await user.click(screen.getByRole("button", { name: "Confirm swap" }));

        await waitFor(() => expect(mock.state.writeContractAsync).toHaveBeenCalledTimes(1));
    });

    it("submits native ETH input swaps with swapExactETHForTokens", async () => {
        const user = userEvent.setup();
        localStorage.setItem("myswap:v2:router", ROUTER);
        localStorage.setItem("myswap:v2:tokenIn", NATIVE_ETH);
        localStorage.setItem("myswap:v2:tokenOut", TOKEN_B);
        mock.state = createState({ deployment: { chainId: 31337, router: ROUTER, weth: WETH, tokens: [] } });

        render(<SwapCard />);

        await user.type(screen.getByLabelText("Sell"), "1");
        await user.click(screen.getByRole("button", { name: "Swap" }));
        await user.click(screen.getByRole("button", { name: "Confirm swap" }));

        await waitFor(() => expect(mock.state.writeContractAsync).toHaveBeenCalledTimes(1));
        const request = mock.state.writeContractAsync.mock.calls[0][0];
        expect(request).toEqual(expect.objectContaining({ functionName: "swapExactETHForTokens", value: units("1") }));
        expect(request.args[1]).toEqual([WETH, TOKEN_B]);
    });

    it("submits native ETH output swaps with swapExactTokensForETH", async () => {
        const user = userEvent.setup();
        localStorage.setItem("myswap:v2:router", ROUTER);
        localStorage.setItem("myswap:v2:tokenIn", TOKEN_A);
        localStorage.setItem("myswap:v2:tokenOut", NATIVE_ETH);
        mock.state = createState({ deployment: { chainId: 31337, router: ROUTER, weth: WETH, tokens: [] } });

        render(<SwapCard />);

        await user.type(screen.getByLabelText("Sell"), "1");
        await user.click(screen.getByRole("button", { name: "Swap" }));
        await user.click(screen.getByRole("button", { name: "Confirm swap" }));

        await waitFor(() => expect(mock.state.writeContractAsync).toHaveBeenCalledTimes(1));
        const request = mock.state.writeContractAsync.mock.calls[0][0];
        expect(request).toEqual(expect.objectContaining({ functionName: "swapExactTokensForETH" }));
        expect(request.args[2]).toEqual([TOKEN_A, WETH]);
    });

    it("keeps mobile swap page focused without marketing hero", () => {
        configureRoute();
        mock.state = createState();
        window.innerWidth = 320;

        render(<SwapPage />);

        expect(screen.queryByText("Clean EVM token swaps.")).not.toBeInTheDocument();
        expect(screen.getByLabelText("Swap tokens")).toBeInTheDocument();
    });
});
