/**
 * Solana Explorer and marketplace URL builders.
 */

const SOLANA_EXPLORER = "https://explorer.solana.com";

/** Link to a transaction on Solana Explorer (mainnet). */
export function explorerTxUrl(signature: string): string {
  return `${SOLANA_EXPLORER}/tx/${signature}?cluster=mainnet`;
}

/** Link to an address (account / mint / program) on Solana Explorer (mainnet). */
export function explorerAddressUrl(address: string): string {
  return `${SOLANA_EXPLORER}/address/${address}?cluster=mainnet`;
}

/** Link to an item on Magic Eden. */
export function magicEdenItemUrl(mintAddress: string): string {
  return `https://magiceden.io/item-details/${mintAddress}`;
}
