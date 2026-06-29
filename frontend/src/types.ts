import type { Address } from "viem";

export type TokenInfo = {
    address: Address;
    name: string;
    symbol: string;
    decimals: number;
};

export type TransactionState = {
    hash?: Address | `0x${string}`;
    title: string;
    status: "idle" | "pending" | "success" | "error";
    message?: string;
};
