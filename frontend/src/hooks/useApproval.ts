import { type Address } from "viem";
import { useWriteContract } from "wagmi";

import { erc20Abi } from "../abis";

export function useApproval() {
    const { writeContractAsync, isPending } = useWriteContract();

    async function approve(token: Address, spender: Address, amount: bigint) {
        return writeContractAsync({
            address: token,
            abi: erc20Abi,
            functionName: "approve",
            args: [spender, amount],
        });
    }

    return { approve, isApproving: isPending };
}
