import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { LIQUIDITY_POOLS, makeSwapInstruction, createAssociatedTokenAccountIfNotExist } from "@raydium-io/raydium-sdk";
import { Jupiter } from "@jup-ag/api";
import * as dotenv from "dotenv";
dotenv.config();

// Load private key from .env
const privateKey = JSON.parse(process.env.PRIVATE_KEY as string);
const wallet = Keypair.fromSecretKey(new Uint8Array(privateKey));

// Setup Solana connection
const connection = new Connection(process.env.SOLANA_RPC as string, "confirmed");

// Tokens
const SOL_MINT = "So11111111111111111111111111111111111111112"; // SOL
const USDC_MINT = "8v8xoTVZESaVDaTFXhYYHssFzE37BWRpn7vjqEyJzKPG"; // USDC

/**
 * Get Swap Quote from Jupiter
 */
const getQuote = async (inputMint: string, outputMint: string, amount: number) => {
    const response = await fetch(
        `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}`
    );
    return await response.json();
};

/**
 * Execute Token Swap using Raydium
 */
const executeSwap = async (inputMint: string, outputMint: string, amount: number) => {
    try {
        console.log("Fetching best swap route...");
        const quote = await getQuote(inputMint, outputMint, amount);
        if (!quote || quote.outAmount === 0) {
            throw new Error("No swap route found!");
        }

        console.log(`Best Route Found: ${quote.outAmount / 10 ** 6} tokens`);

        // Load Raydium pool data
        const pool = LIQUIDITY_POOLS.find((pool) =>
            pool.marketId.equals(new PublicKey(quote.marketAddresses[0]))
        );

        if (!pool) {
            throw new Error("No matching Raydium pool found!");
        }

        console.log("Executing swap...");

        // Create associated token account if needed
        const { instructions, signers } = await createAssociatedTokenAccountIfNotExist({
            connection,
            owner: wallet.publicKey,
            payer: wallet.publicKey,
            mint: new PublicKey(outputMint),
        });

        // Generate swap instruction
        const swapInstruction = await makeSwapInstruction({
            connection,
            poolInfo: pool,
            owner: wallet.publicKey,
            inAmount: BigInt(amount),
            inTokenMint: new PublicKey(inputMint),
            outTokenMint: new PublicKey(outputMint),
            minOutAmount: BigInt(quote.outAmount * 0.98), // 2% slippage tolerance
        });

        instructions.push(swapInstruction);

        // Send transaction
        const transactionId = await sendAndConfirmTransaction(connection, swapInstruction, [wallet, ...signers]);
        console.log("Transaction Successful:", transactionId);
    } catch (error) {
        console.error("Swap Failed:", error);
    }
};

// Buy USDC with 1 SOL
executeSwap(SOL_MINT, USDC_MINT, 1_000_000_000); // 1 SOL (in lamports)

// Sell USDC for SOL (example)
setTimeout(() => {
    executeSwap(USDC_MINT, SOL_MINT, 10_000_000); // 10 USDC (assuming 6 decimals)
}, 10000);
