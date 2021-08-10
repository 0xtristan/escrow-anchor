const anchor = require("@project-serum/anchor");
const { TOKEN_PROGRAM_ID, Token } = require("@solana/spl-token");
const assert = require("assert");
const BufferLayout = require("buffer-layout");

describe("escrow-anchor", () => {
  // Network and wallet context from anchor config
  //   const options = {
  //     commitment: "processed",
  //     preflightCommitment: "processed",
  //     skipPreflight: false,
  //   };
  const provider = anchor.Provider.env();
  //   const provider = anchor.Provider.local(null, options);

  // Configure the client to use the local cluster.
  anchor.setProvider(provider);

  const program = anchor.workspace.EscrowAnchor;

  let mintX = null;
  let mintY = null;
  let aliceTokenAccountX = null;
  let aliceTokenAccountY = null;
  let bobTokenAccountX = null;
  let bobTokenAccountY = null;

  const aliceInitialBalanceX = 1000;
  const aliceInitialBalanceY = 0;
  const bobInitialBalanceX = 0;
  const bobInitialBalanceY = 500;

  const aliceEscrowedAmountX = 5;
  const aliceExpectedAmountY = 10;

  // const escrow = anchor.web3.Keypair.generate();
  const alice = anchor.web3.Keypair.generate();
  const bob = anchor.web3.Keypair.generate();
  const mintAuthority = anchor.web3.Keypair.generate();

  let [escrowPda, escrowBump] = [null, null];
  let [escrowStatePda, escrowStateBump] = [null, null];
  let [escrowTokenPda, escrowTokenBump] = [null, null];

  it("Initialize testing state", async () => {
    // Airdropping SOL to Alice. Need synchronous confirmation so that funds lands before
    // moving on in the program.
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(alice.publicKey, 10000000000)
      // "confirmed"
    );

    // Create token mints for X and Y tokens from spl-token-program
    mintX = await Token.createMint(
      provider.connection,
      provider.wallet.payer,
      mintAuthority.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );

    mintY = await Token.createMint(
      provider.connection,
      provider.wallet.payer,
      mintAuthority.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );

    // Create associatedTokenAccounts for Alice and Bob's X and Y tokens
    aliceTokenAccountX = await mintX.createAssociatedTokenAccount(
      alice.publicKey
    );
    aliceTokenAccountY = await mintY.createAssociatedTokenAccount(
      alice.publicKey
    );
    bobTokenAccountX = await mintX.createAssociatedTokenAccount(bob.publicKey);
    bobTokenAccountY = await mintY.createAssociatedTokenAccount(bob.publicKey);

    // Mint starting X balance to Alice
    await mintX.mintTo(
      aliceTokenAccountX,
      mintAuthority.publicKey,
      [mintAuthority],
      aliceInitialBalanceX
    );

    // Mint starting Y balance to Bob
    await mintY.mintTo(
      bobTokenAccountY,
      mintAuthority.publicKey,
      [mintAuthority],
      bobInitialBalanceY
    );

    // Get balances from token program
    let _aliceATokenAccountX = await mintX.getAccountInfo(aliceTokenAccountX);
    let _bobATokenAccountY = await mintY.getAccountInfo(bobTokenAccountY);

    assert.ok(_aliceATokenAccountX.amount.toNumber() == aliceInitialBalanceX);
    assert.ok(_bobATokenAccountY.amount.toNumber() == bobInitialBalanceY);
  });

  it("Initialize escrow", async () => {
    // PDAs for escrow program, escrow state and token accounts
    [escrowPda, escrowBump] =
    await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(anchor.utils.bytes.utf8.encode("escrow"))],
      program.programId
    );

    [escrowStatePda, escrowStateBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(anchor.utils.bytes.utf8.encode("escrow-state")),
          alice.publicKey.toBuffer(),
          mintX.publicKey.toBuffer(),
        ],
        program.programId
      );

    [escrowTokenPda, escrowTokenBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(anchor.utils.bytes.utf8.encode("escrow-token"))],
        program.programId
      );

    // Init the escrow token account
    await program.rpc.initializeEscrow(
      escrowBump,
      escrowStateBump,
      escrowTokenBump,
      new anchor.BN(aliceEscrowedAmountX),
      new anchor.BN(aliceExpectedAmountY),
      {
        accounts: {
          initializer: alice.publicKey,
          initializerTokenAccountSend: aliceTokenAccountX,
          initializerTokenAccountReceive: aliceTokenAccountY,
          escrowAccount: escrowPda,
          escrowStateAccount: escrowStatePda,
          escrowTokenAccount: escrowTokenPda,
          tokenMint: mintX.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [alice],
      }
    );
    
    const escrowAccount = await provider.connection.getAccountInfo(escrowPda);
    const escrowStateAccount = await program.account.escrow.fetch(
      escrowStatePda
    );
    const escrowTokenAccount = await mintX.getAccountInfo(escrowTokenPda);

    assert.ok(escrowStateAccount.isInitialized);
    assert.ok(escrowStateAccount.initializer.equals(alice.publicKey));
    assert.ok(
      escrowStateAccount.initializerTokenAccountReceive.equals(
        aliceTokenAccountY
      )
    );
    assert.ok(escrowStateAccount.escrowTokenAccount.equals(escrowTokenPda));
    assert.ok(
      escrowStateAccount.initializerAmount.toNumber() === aliceEscrowedAmountX
    );
    assert.ok(
      escrowStateAccount.takerAmount.toNumber() === aliceExpectedAmountY
    );

    assert.ok(escrowTokenAccount.address.equals(escrowTokenPda));
    assert.ok(escrowTokenAccount.mint.equals(mintX.publicKey));
    assert.ok(escrowTokenAccount.amount.toNumber() === aliceEscrowedAmountX);
  });

  it("Take escrow", async () => {
    // Init the escrow token account
    const BobEscrowedAmountY = aliceExpectedAmountY;
    const BobExpectedAmountX = aliceEscrowedAmountX;
    await program.rpc.takeEscrow(
      new anchor.BN(BobExpectedAmountX),
      new anchor.BN(BobEscrowedAmountY),
      {
        accounts: {
          taker: bob.publicKey,
          takerTokenAccountSend: bobTokenAccountY,
          takerTokenAccountReceive: bobTokenAccountX,
          initializer: alice.publicKey,
          initializerTokenAccountReceive: aliceTokenAccountY,
          escrowAccount: escrowPda,
          escrowStateAccount: escrowStatePda,
          escrowTokenAccount: escrowTokenPda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [bob],
      }
    );

    let _aliceTokenAccountX = await mintX.getAccountInfo(aliceTokenAccountX);
    let _aliceTokenAccountY = await mintY.getAccountInfo(aliceTokenAccountY);
    let _bobTokenAccountX = await mintX.getAccountInfo(bobTokenAccountX);
    let _bobTokenAccountY = await mintY.getAccountInfo(bobTokenAccountY);

    // const escrowTokenAccount = await mintX.getAccountInfo(escrowTokenPda);
    // console.log(escrowTokenAccount);
    assert.ok(
      _aliceTokenAccountX.amount.toNumber() ===
        aliceInitialBalanceX - aliceEscrowedAmountX
    );
    assert.ok(
      _aliceTokenAccountY.amount.toNumber() ===
        aliceInitialBalanceY + aliceExpectedAmountY
    );
    assert.ok(
      _bobTokenAccountX.amount.toNumber() ===
        bobInitialBalanceX + aliceEscrowedAmountX
    );
    assert.ok(
      _bobTokenAccountY.amount.toNumber() ===
        bobInitialBalanceY - aliceExpectedAmountY
    );

    // Todo: check PDA state acct closed
  });
});
