import { useAccount, useBalance } from "wagmi";
import { useWallet } from "@solana/wallet-adapter-react";
import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useEffect, useState } from "react";

export function AccountBalance() {
  const wagmiAccount = useAccount();
  const solanaWallet = useWallet();
  const { connection } = useConnection();

  const { data: evmBalance } = useBalance({
    address: wagmiAccount.address,
  });

  const [solBalance, setSolBalance] = useState<number | null>(null);

  useEffect(() => {
    if (solanaWallet.publicKey) {
      connection
        .getBalance(solanaWallet.publicKey)
        .then((lamports) => setSolBalance(lamports / LAMPORTS_PER_SOL))
        .catch(() => setSolBalance(null));
    }
  }, [solanaWallet.publicKey, connection]);

  if (evmBalance) {
    return (
      <div className="text-sm">
        <span className="text-muted-foreground">Balance: </span>
        <span className="font-mono font-medium">
          {parseFloat(evmBalance.formatted).toFixed(4)} {evmBalance.symbol}
        </span>
      </div>
    );
  }

  if (solBalance !== null) {
    return (
      <div className="text-sm">
        <span className="text-muted-foreground">Balance: </span>
        <span className="font-mono font-medium">
          {solBalance.toFixed(4)} SOL
        </span>
      </div>
    );
  }

  return null;
}
