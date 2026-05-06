import { LiteSVM, FailedTransactionMetadata } from "litesvm";
import * as anchor from "@coral-xyz/anchor";
import BN from "bn.js";
import { expect } from "chai";
import { PublicKey } from "@solana/web3.js";
import {
  AccountRole,
  address,
  generateKeyPairSigner,
  getAddressCodec,
  getProgramDerivedAddress,
  lamports,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import type { Address } from "@solana/kit";
import fs from "fs";
import path from "path";

const idl = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), "target/idl/workspace.json"), "utf8")
);
const coder = new anchor.BorshCoder(idl);

const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

async function createTokenAccount(svm: LiteSVM, payer: any, mintSigner: any, tokenAccountSigner: any, ownerAddress: string) {
  // 1. System CreateAccount for Mint
  const mintSpace = 82n;
  const mintLamports = BigInt(svm.minimumBalanceForRentExemption(mintSpace).toString());
  const mintData = Buffer.alloc(52);
  mintData.writeUInt32LE(0, 0); // CreateAccount ix
  mintData.writeBigUInt64LE(mintLamports, 4);
  mintData.writeBigUInt64LE(mintSpace, 12);
  Buffer.from(getAddressCodec().encode(address(TOKEN_PROGRAM_ID))).copy(mintData, 20);

  const createMintIx = {
    programAddress: SYSTEM_PROGRAM_ID,
    accounts: [
      { ...payer, role: AccountRole.WRITABLE_SIGNER },
      { ...mintSigner, role: AccountRole.WRITABLE_SIGNER },
    ] as any[],
    data: new Uint8Array(mintData),
  };

  // 2. Token InitializeMint
  const initMintData = Buffer.alloc(67);
  initMintData.writeUInt8(0, 0); // InitializeMint ix
  initMintData.writeUInt8(0, 1); // decimals
  Buffer.from(getAddressCodec().encode(address(ownerAddress))).copy(initMintData, 2); // mintAuthority
  initMintData.writeUInt8(0, 34); // freezeAuthorityOption

  const initMintIx = {
    programAddress: TOKEN_PROGRAM_ID,
    accounts: [
      { address: mintSigner.address, role: AccountRole.WRITABLE },
      { address: "SysvarRent111111111111111111111111111111111", role: AccountRole.READONLY },
    ],
    data: new Uint8Array(initMintData),
  };

  // 3. System CreateAccount for TokenAccount
  const accSpace = 165n;
  const accLamports = BigInt(svm.minimumBalanceForRentExemption(accSpace).toString());
  const accData = Buffer.alloc(52);
  accData.writeUInt32LE(0, 0);
  accData.writeBigUInt64LE(accLamports, 4);
  accData.writeBigUInt64LE(accSpace, 12);
  Buffer.from(getAddressCodec().encode(address(TOKEN_PROGRAM_ID))).copy(accData, 20);

  const createAccIx = {
    programAddress: SYSTEM_PROGRAM_ID,
    accounts: [
      { ...payer, role: AccountRole.WRITABLE_SIGNER },
      { ...tokenAccountSigner, role: AccountRole.WRITABLE_SIGNER },
    ] as any[],
    data: new Uint8Array(accData),
  };

  // 4. Token InitializeAccount
  const initAccData = Buffer.alloc(1);
  initAccData.writeUInt8(1, 0); // InitializeAccount ix

  const initAccIx = {
    programAddress: TOKEN_PROGRAM_ID,
    accounts: [
      { address: tokenAccountSigner.address, role: AccountRole.WRITABLE },
      { address: mintSigner.address, role: AccountRole.READONLY },
      { address: ownerAddress, role: AccountRole.READONLY },
      { address: "SysvarRent111111111111111111111111111111111", role: AccountRole.READONLY },
    ],
    data: new Uint8Array(initAccData),
  };

  // 5. Token MintTo
  const mintToData = Buffer.alloc(9);
  mintToData.writeUInt8(7, 0); // MintTo ix
  mintToData.writeBigUInt64LE(1n, 1); // amount = 1

  const mintToIx = {
    programAddress: TOKEN_PROGRAM_ID,
    accounts: [
      { address: mintSigner.address, role: AccountRole.WRITABLE },
      { address: tokenAccountSigner.address, role: AccountRole.WRITABLE },
      { ...payer, role: AccountRole.READONLY_SIGNER },
    ] as any[],
    data: new Uint8Array(mintToData),
  };

  let msg = createTransactionMessage({ version: 0 });
  msg = setTransactionMessageFeePayerSigner(payer, msg);
  msg = appendTransactionMessageInstruction(createMintIx, msg);
  msg = appendTransactionMessageInstruction(initMintIx, msg);
  msg = appendTransactionMessageInstruction(createAccIx, msg);
  msg = appendTransactionMessageInstruction(initAccIx, msg);
  msg = appendTransactionMessageInstruction(mintToIx, msg);
  
  const msgWithLifetime = svm.setTransactionMessageLifetimeUsingLatestBlockhash(msg);
  const tx = await signTransactionMessageWithSigners(msgWithLifetime, { abortSignal: undefined });
  const res = svm.sendTransaction(tx);
  if (res instanceof FailedTransactionMetadata) {
    throw new Error(res.meta().prettyLogs());
  }
}

function toAddressString(value: any): string {
  if (typeof value === "string") return value;
  if (value instanceof Uint8Array) return getAddressCodec().decode(value);
  if (value && typeof value.toBase58 === "function") return value.toBase58();
  if (value && typeof value.length === "number") return getAddressCodec().decode(Uint8Array.from(value));
  throw new Error("Unable to decode address");
}

describe("NFT Hater Workspace", () => {
  let svm: LiteSVM;
  let authority: any;
  let treasury: any;
  let user: any;
  let configPDA: Address;
  const programAddress = "Azj7fnmacC9NQm9MoXPBJA3rhdWNHyrr22e5FvLJei4H" as Address;

  async function sendIx(ix: any, feePayerSigner: any) {
    const msg = appendTransactionMessageInstruction(
      ix,
      setTransactionMessageFeePayerSigner(
        feePayerSigner,
        createTransactionMessage({ version: 0 })
      )
    );
    const msgWithLifetime = svm.setTransactionMessageLifetimeUsingLatestBlockhash(msg);
    const tx = await signTransactionMessageWithSigners(msgWithLifetime, { abortSignal: undefined });

    const res = svm.sendTransaction(tx);
    if (res instanceof FailedTransactionMetadata) {
      throw new Error(res.meta().prettyLogs());
    }
    return res;
  }

  async function expectFailure(ix: any, feePayerSigner: any, includes: string) {
    const msg = appendTransactionMessageInstruction(
      ix,
      setTransactionMessageFeePayerSigner(
        feePayerSigner,
        createTransactionMessage({ version: 0 })
      )
    );
    const msgWithLifetime = svm.setTransactionMessageLifetimeUsingLatestBlockhash(msg);
    const tx = await signTransactionMessageWithSigners(msgWithLifetime, { abortSignal: undefined });

    const res = svm.simulateTransaction(tx);
    expect(res).to.be.instanceOf(FailedTransactionMetadata);
    const logText = (res as FailedTransactionMetadata).meta().logs().join("\n");
    expect(logText).to.include(includes);
  }

  function fetchAccount<T>(name: string, addr: Address): T {
    const acc = svm.getAccount(addr);
    if (!acc || ("exists" in acc && !acc.exists)) {
      throw new Error(`Missing account ${name} at ${addr}`);
    }
    return coder.accounts.decode(name, Buffer.from(acc.data)) as T;
  }

  beforeEach(async () => {
    svm = new LiteSVM()
      .withSysvars()
      .withBuiltins()
      .withTransactionHistory(0n)
      .withLogBytesLimit(256n * 1024n);

    svm.addProgramFromFile(programAddress, "target/deploy/workspace.so");

    authority = await generateKeyPairSigner();
    treasury = await generateKeyPairSigner();
    user = await generateKeyPairSigner();

    svm.airdrop(authority.address, lamports(100n * 1_000_000_000n));
    svm.airdrop(treasury.address, lamports(100n * 1_000_000_000n));
    svm.airdrop(user.address, lamports(100n * 1_000_000_000n));

    const addressCodec = getAddressCodec();
    [configPDA] = await getProgramDerivedAddress({
      programAddress,
      seeds: [
        new TextEncoder().encode("config"),
        addressCodec.encode(authority.address),
      ],
    });
  });

  it("should initialize config correctly", async () => {
    const ix = {
      programAddress,
      accounts: [
        { address: configPDA, role: AccountRole.WRITABLE },
        { address: authority.address, role: AccountRole.WRITABLE_SIGNER },
        { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("initialize_config", {
        admin_treasury: new PublicKey(treasury.address),
        fee_per_burn: new BN(5_000_000), // 0.005 SOL
        premium_fee: new BN(100_000_000), // 0.1 SOL
      }),
    };

    await sendIx(ix, authority);

    const config = fetchAccount<any>("Config", configPDA);
    expect(config.is_active).to.be.true;
    expect(config.is_paused).to.be.false;
    expect(config.fee_per_burn.toNumber()).to.equal(5_000_000);
    expect(config.premium_fee.toNumber()).to.equal(100_000_000);
    expect(toAddressString(config.admin_treasury)).to.equal(treasury.address);
    expect(toAddressString(config.authority)).to.equal(authority.address);
  });

  it("should burn NFT and pay fee", async () => {
    // 1. Initialize
    const initIx = {
      programAddress,
      accounts: [
        { address: configPDA, role: AccountRole.WRITABLE },
        { address: authority.address, role: AccountRole.WRITABLE_SIGNER },
        { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("initialize_config", {
        admin_treasury: new PublicKey(treasury.address),
        fee_per_burn: new BN(5_000_000), // 0.005 SOL
        premium_fee: new BN(100_000_000), // 0.1 SOL
      }),
    };
    await sendIx(initIx, authority);

    // 2. Setup mock token
    const mintSigner = await generateKeyPairSigner();
    const tokenAccountSigner = await generateKeyPairSigner();
    
    await createTokenAccount(svm, user, mintSigner, tokenAccountSigner, user.address);

    // Initial treasury balance
    const treasuryBalanceBefore = svm.getBalance(treasury.address) || 0n;

    // 3. Burn
    const burnIx = {
      programAddress,
      accounts: [
        { address: configPDA, role: AccountRole.READONLY },
        { address: user.address, role: AccountRole.WRITABLE_SIGNER },
        { address: mintSigner.address, role: AccountRole.WRITABLE },
        { address: tokenAccountSigner.address, role: AccountRole.WRITABLE },
        { address: treasury.address, role: AccountRole.WRITABLE },
        { address: TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
        { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("burn_nft", {}),
    };

    await sendIx(burnIx, user);

    // Check Token Account has 0 balance
    const tokenAccountData = svm.getAccount(tokenAccountSigner.address);
    // Buffer read amount at offset 64
    const amount = Buffer.from(tokenAccountData!.data).readBigUInt64LE(64);
    expect(amount.toString()).to.equal("0");

    // Check treasury gained fee
    const treasuryBalanceAfter = svm.getBalance(treasury.address) || 0n;
    expect((treasuryBalanceAfter - treasuryBalanceBefore).toString()).to.equal("5000000");
  });

  it("should fail burn with wrong treasury", async () => {
    const initIx = {
      programAddress,
      accounts: [
        { address: configPDA, role: AccountRole.WRITABLE },
        { address: authority.address, role: AccountRole.WRITABLE_SIGNER },
        { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("initialize_config", {
        admin_treasury: new PublicKey(treasury.address),
        fee_per_burn: new BN(5_000_000), // 0.005 SOL
        premium_fee: new BN(100_000_000), // 0.1 SOL
      }),
    };
    await sendIx(initIx, authority);

    const mintSigner = await generateKeyPairSigner();
    const tokenAccountSigner = await generateKeyPairSigner();
    
    await createTokenAccount(svm, user, mintSigner, tokenAccountSigner, user.address);

    const wrongTreasury = await generateKeyPairSigner();

    const burnIx = {
      programAddress,
      accounts: [
        { address: configPDA, role: AccountRole.READONLY },
        { address: user.address, role: AccountRole.WRITABLE_SIGNER },
        { address: mintSigner.address, role: AccountRole.WRITABLE },
        { address: tokenAccountSigner.address, role: AccountRole.WRITABLE },
        { address: wrongTreasury.address, role: AccountRole.WRITABLE },
        { address: TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
        { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("burn_nft", {}),
    };

    await expectFailure(burnIx, user, "InvalidTreasury");
  });

  it("should pay premium fee", async () => {
    const initIx = {
      programAddress,
      accounts: [
        { address: configPDA, role: AccountRole.WRITABLE },
        { address: authority.address, role: AccountRole.WRITABLE_SIGNER },
        { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("initialize_config", {
        admin_treasury: new PublicKey(treasury.address),
        fee_per_burn: new BN(5_000_000), // 0.005 SOL
        premium_fee: new BN(100_000_000), // 0.1 SOL
      }),
    };
    await sendIx(initIx, authority);

    const treasuryBalanceBefore = svm.getBalance(treasury.address) || 0n;

    const premiumIx = {
      programAddress,
      accounts: [
        { address: configPDA, role: AccountRole.READONLY },
        { address: user.address, role: AccountRole.WRITABLE_SIGNER },
        { address: treasury.address, role: AccountRole.WRITABLE },
        { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
      ],
      data: coder.instruction.encode("pay_premium_fee", {}),
    };

    await sendIx(premiumIx, user);

    const treasuryBalanceAfter = svm.getBalance(treasury.address) || 0n;
    expect((treasuryBalanceAfter - treasuryBalanceBefore).toString()).to.equal("100000000");
  });
});