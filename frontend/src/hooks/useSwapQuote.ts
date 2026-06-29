import { useEffect, useMemo, useState } from "react";
import { type Address, formatUnits, isAddress, parseUnits } from "viem";
import { usePublicClient } from "wagmi";

import { routerAbi } from "../abis";
import type { TokenInfo } from "../types";

type UseSwapQuoteResult = {
    amountIn?: bigint;
    amountOut?: bigint;
    amountOutMin?: bigint;
    rate?: string;
    isLoading: boolean;
    error?: string;
};

export function useSwapQuote(args: {
    routerAddress: string;
    tokenIn?: TokenInfo;
    tokenOut?: TokenInfo;
    amount: string;
    slippageBps: number;
}): UseSwapQuoteResult {
    const publicClient = usePublicClient();
    const [amountOut, setAmountOut] = useState<bigint>();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string>();

    const amountIn = useMemo(() => {
        if (!args.tokenIn || !args.amount || Number(args.amount) <= 0) return undefined;
        try {
            return parseUnits(args.amount, args.tokenIn.decimals);
        } catch {
            return undefined;
        }
    }, [args.amount, args.tokenIn]);

    useEffect(() => {
        let cancelled = false;

        async function loadQuote() {
            setAmountOut(undefined);
            setError(undefined);

            if (!publicClient || !isAddress(args.routerAddress) || !args.tokenIn || !args.tokenOut || !amountIn || amountIn <= 0n) {
                setIsLoading(false);
                return;
            }

            setIsLoading(true);

            try {
                const amounts = await publicClient.readContract({
                    address: args.routerAddress as Address,
                    abi: routerAbi,
                    functionName: "getAmountsOut",
                    args: [amountIn, [args.tokenIn.address, args.tokenOut.address]],
                });

                if (!cancelled) setAmountOut(amounts[amounts.length - 1]);
            } catch (caught) {
                if (!cancelled) setError(caught instanceof Error ? caught.message : "Unable to quote swap");
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        }

        loadQuote();

        return () => {
            cancelled = true;
        };
    }, [amountIn, args.routerAddress, args.tokenIn, args.tokenOut, publicClient]);

    const slippageBps = Number.isFinite(args.slippageBps) ? Math.min(9_900, Math.max(0, Math.round(args.slippageBps))) : 50;
    const amountOutMin = amountOut === undefined ? undefined : (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;
    const rate = amountOut && amountIn && args.tokenIn && args.tokenOut
        ? (Number(formatUnits(amountOut, args.tokenOut.decimals)) / Number(formatUnits(amountIn, args.tokenIn.decimals))).toLocaleString(undefined, {
              maximumFractionDigits: 8,
          })
        : undefined;

    return { amountIn, amountOut, amountOutMin, rate, isLoading, error };
}
