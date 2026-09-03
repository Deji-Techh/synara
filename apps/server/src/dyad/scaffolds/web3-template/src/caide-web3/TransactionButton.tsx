import { useAccount, useSendTransaction } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { useState, type ReactNode } from "react";
import { parseEther } from "viem";
import { LoaderCircle, Send } from "lucide-react";

interface TransactionButtonProps {
  evmTo?: `0x${string}`;
  evmAmount?: string;
  solanaTo?: string;
  solanaAmount?: number;
  children?: ReactNode;
}

export function TransactionButton({
  evmTo,
  evmAmount,
  solanaTo,
  solanaAmount,
  children,
}: TransactionButtonProps) {
  const wagmiAccount = useAccount();
  const solanaWallet = useWallet();
  const { connection } = useConnection();

  const { sendTransactionAsync } = useSendTransaction();
  const [status, setStatus] = useState<
    "idle" | "pending" | "success" | "error"
  >("idle");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    setStatus("pending");
    setError(null);
    setTxHash(null);

    try {
      if (wagmiAccount.address && evmTo && evmAmount) {
        const hash = await sendTransactionAsync({
          to: evmTo,
          value: parseEther(evmAmount),
        });
        setTxHash(hash);
        setStatus("success");
      } else if (solanaWallet.publicKey && solanaTo && solanaAmount) {
        const tx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: solanaWallet.publicKey,
            toPubkey: new PublicKey(solanaTo),
            lamports: solanaAmount * LAMPORTS_PER_SOL,
          }),
        );
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.feePayer = solanaWallet.publicKey;
        const signed = await solanaWallet.sendTransaction(tx, connection);
        setTxHash(signed);
        setStatus("success");
      } else {
        setError("No wallet connected or missing recipient details");
        setStatus("error");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setStatus("error");
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleSend}
        disabled={status === "pending"}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {status === "pending" ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {children ?? "Send Transaction"}
      </button>
      {txHash && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">
          Tx: {txHash.slice(0, 10)}...{txHash.slice(-6)}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
