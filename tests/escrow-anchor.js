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
  let escrowPda = null;

  const aliceInitialBalance = 1000;
  const bobInitialBalance = 500;

  const escrow = anchor.web3.Keypair.generate();
  const alice = anchor.web3.Keypair.generate();
  const bob = anchor.web3.Keypair.generate();
  const mintAuthority = anchor.web3.Keypair.generate();

  it("Initialize testing state", async () => {
    // Airdropping tokens to Alice. Need synchronous confirmation so that funds lands before
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
      aliceInitialBalance
    );

    // Mint starting Y balance to Bob
    await mintY.mintTo(
      bobTokenAccountY,
      mintAuthority.publicKey,
      [mintAuthority],
      bobInitialBalance
    );

    // Get balances from token program
    let _aliceATokenAccountX = await mintX.getAccountInfo(aliceTokenAccountX);
    let _bobATokenAccountY = await mintY.getAccountInfo(bobTokenAccountY);

    assert.ok(_aliceATokenAccountX.amount.toNumber() == aliceInitialBalance);
    assert.ok(_bobATokenAccountY.amount.toNumber() == bobInitialBalance);
  });

  it("Initialize escrow", async () => {
    const [escrowPda, escrowBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [
          Buffer.from(anchor.utils.bytes.utf8.encode("escrow-metadata")),
          alice.publicKey.toBuffer(),
        ],
        program.programId
      );

    const [tokenPda, tokenBump] =
      await anchor.web3.PublicKey.findProgramAddress(
        [Buffer.from(anchor.utils.bytes.utf8.encode("escrow-token"))],
        program.programId
      );

    // Init the escrow token account
    const initialEscrowAmountX = 5;
    await program.rpc.initializeEscrow(
      escrowBump,
      tokenBump,
      new anchor.BN(initialEscrowAmountX),
      {
        accounts: {
          authority: alice.publicKey,
          escrowAccount: escrowPda,
          tokenxEscrowAccount: tokenPda,
          tokenxMint: mintX.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [alice],
      }
    );

    // const ESCROW_LAYOUT = BufferLayout.struct([
    //   BufferLayout.bool(),
    //   BufferLayout.blob(32),
    //   BufferLayout.blob(32),
    //   BufferLayout.u64(),
    // ]);
    // console.log(ESCROW_LAYOUT.decode(escrowAccount.data));

    const escrowAccountInfo = await provider.connection.getAccountInfo(
      escrowPda
    );
    const escrowAccount = await program.account.escrow.fetch(escrowPda);
    const tokenAccount = await mintX.getAccountInfo(tokenPda);
    console.log(escrowAccount);
    console.log(tokenAccount);
    assert.ok(escrowAccount.initializer.equals(alice.publicKey));
    assert.ok(escrowAccount.isInitialized);
    // assert.ok(escrowAccount.receive_amount.toNumber() === initialEscrowAmountX);
    // console.log(escrowAccountInfo.owner);
    // console.log(program.provider.wallet.publicKey);
    // assert.ok(
    //   escrowAccountInfo.owner.equals(program.provider.wallet.publicKey)
    // );

    assert.ok(tokenAccount.mint.equals(mintX.publicKey));
    // assert.ok(account.amount.toNumber() === 0);
  });
});
