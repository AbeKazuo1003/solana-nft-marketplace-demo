import * as anchor from "@project-serum/anchor";
import { Program, Provider } from "@project-serum/anchor";
import { NftMarketplace } from "../target/types/nft_marketplace";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";

const utils = require("./utils");
import * as fs from "fs";
import * as assert from "assert";
import { config } from "chai";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.NftMarketplace as Program<NftMarketplace>;
const KEY_PATH =
  "/home/alex/blockchain/cgc-solana-contracts/nft_marketplace/tests/keys/";

const CONFIG_PDA_SEED = "config";
const TOKEN_CONFIG_PDA_SEED = "token_config";
const NFT_VAULT_PDA_SEED = "nft_vault";
const TOKEN_VAULT_PDA_SEED = "token_vault";
const SELL_PDA_SEED = "sell";
const OFFER_PDA_SEED = "offer";

describe("nft_marketplace", () => {
  const sol_mode: boolean = false;
  const close_sell_mode: boolean = false;
  const buy_mode: boolean = false;
  const offer_cancel_mode = false;

  let nftMintObject: Token;
  let nftMintPubKey: anchor.web3.PublicKey;

  let usdcMintKeyPair: anchor.web3.Keypair;
  let usdcMintObject: Token;
  let usdcMintPubkey: anchor.web3.PublicKey;

  let user_A: anchor.web3.Keypair;
  let user_A_NFTWallet: anchor.web3.PublicKey;
  let user_A_usdcWallet: anchor.web3.PublicKey;

  let user_B: anchor.web3.Keypair;
  let user_B_NFTWallet: anchor.web3.PublicKey;
  let user_B_usdcWallet: anchor.web3.PublicKey;

  // the program's config account
  let config: anchor.web3.PublicKey;
  let config_bump: number;

  // the program's token config account
  let solana_token_config: anchor.web3.PublicKey;
  let solana_token_config_bump: number;

  let usdc_token_config: anchor.web3.PublicKey;
  let usdc_token_config_bump: number;

  let solana_vault: anchor.web3.PublicKey;
  let solana_vault_bump: number;

  let usdc_vault: anchor.web3.PublicKey;
  let usdc_vault_bump: number;

  let nft_vault: anchor.web3.PublicKey;
  let nft_vault_bump: number;

  let trade_fee_rate: anchor.BN = new anchor.BN(10); // 0%

  let token_type = 1;
  let token_mint: anchor.web3.PublicKey;

  let sell_pda: anchor.web3.PublicKey;
  let sell_pda_bump: number;

  let offer_pda: anchor.web3.PublicKey;
  let offer_pda_bump: number;

  it("1. Prepare Tokens", async () => {
    let usdcKeyPairFile = fs.readFileSync(KEY_PATH + "usdc.json", "utf-8");
    let usdcKeyPairData = JSON.parse(usdcKeyPairFile);
    usdcMintKeyPair = anchor.web3.Keypair.fromSecretKey(
      new Uint8Array(usdcKeyPairData)
    );
    usdcMintObject = await utils.createMint(
      usdcMintKeyPair,
      provider,
      provider.wallet.publicKey,
      null,
      9,
      TOKEN_PROGRAM_ID
    );
    usdcMintPubkey = usdcMintObject.publicKey;
  });

  it("2. Prepare User", async () => {
    // Load User_A
    let userAPairFile = fs.readFileSync(KEY_PATH + "user_A.json", "utf-8");
    let userAPairData = JSON.parse(userAPairFile);
    user_A = anchor.web3.Keypair.fromSecretKey(new Uint8Array(userAPairData));

    // Airdrop 10 SOL to User A
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        user_A.publicKey,
        10_000_000_000
      ),
      "confirmed"
    );

    // Load User_B
    let userBPairFile = fs.readFileSync(KEY_PATH + "user_B.json", "utf-8");
    let userBPairData = JSON.parse(userBPairFile);
    user_B = anchor.web3.Keypair.fromSecretKey(new Uint8Array(userBPairData));

    // Airdrop 10 SOL to User B
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        user_B.publicKey,
        10_000_000_000
      ),
      "confirmed"
    );

    // Create NFT Token for test
    let mintKeyNFT = anchor.web3.Keypair.generate();
    nftMintObject = await utils.createMint(
      mintKeyNFT,
      provider,
      provider.wallet.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );
    nftMintPubKey = nftMintObject.publicKey;

    // Create NFT Account for User_A and User_B
    user_A_NFTWallet = await nftMintObject.createAssociatedTokenAccount(
      user_A.publicKey
    );

    user_B_NFTWallet = await nftMintObject.createAssociatedTokenAccount(
      user_B.publicKey
    );

    // Create USDC Account for User_A and User_B
    user_A_usdcWallet = await usdcMintObject.createAssociatedTokenAccount(
      user_A.publicKey
    );
    user_B_usdcWallet = await usdcMintObject.createAssociatedTokenAccount(
      user_B.publicKey
    );

    // Mint NFT to User_A
    await utils.mintToAccount(provider, nftMintPubKey, user_A_NFTWallet, 1);

    // Mint USDC to user_B
    await utils.mintToAccount(
      provider,
      usdcMintPubkey,
      user_B_usdcWallet,
      1000_000_000_000
    ); // 1000 USDC

    console.log("User_A: ", user_A.publicKey.toString());
    console.log("User_B: ", user_B.publicKey.toString());
    console.log(
      "User_A SOL: ",
      await provider.connection.getBalance(user_A.publicKey)
    );
    console.log(
      "User_B SOL: ",
      await provider.connection.getBalance(user_B.publicKey)
    );

    assert.strictEqual(
      await utils.getTokenBalance(provider, user_A_NFTWallet),
      1
    );
    assert.strictEqual(
      await utils.getTokenBalance(provider, user_B_NFTWallet),
      0
    );
    assert.strictEqual(
      await utils.getTokenBalance(provider, user_B_usdcWallet),
      1000_000_000_000
    );
  });

  it("3. Setup", async () => {
    [config, config_bump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from(CONFIG_PDA_SEED)],
      program.programId
    );
    await program.methods
      .setup(config_bump, trade_fee_rate)
      .accounts({
        owner: provider.wallet.publicKey,
        config: config,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      // @ts-ignore
      .signers([provider.wallet.payer])
      .rpc();

    const config_fetch = await program.account.config.fetch(config);
    console.log("Trade Fee: ", config_fetch.tradeFeeRate.toString());
  });
  if (sol_mode) {
    it("4. Set Token Config(Solana)", async () => {
      [solana_token_config, solana_token_config_bump] =
        await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from(TOKEN_CONFIG_PDA_SEED), Buffer.from([token_type])],
          program.programId
        );
      [solana_vault, solana_vault_bump] =
        await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from(TOKEN_VAULT_PDA_SEED), Buffer.from([token_type])],
          program.programId
        );
      token_mint = new anchor.web3.PublicKey(
        "So11111111111111111111111111111111111111112"
      );
      await program.methods
        .tokenSetup(token_type, solana_token_config_bump)
        .accounts({
          owner: provider.wallet.publicKey,
          config: config,
          tokenConfig: solana_token_config,
          tokenMint: token_mint,
          tokenVault: solana_vault,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        // @ts-ignore
        .signers([provider.wallet.payer])
        .rpc();
      const token_config_fetch = await program.account.tokenConfig.fetch(
        solana_token_config
      );
      console.log("Token Mint: ", token_config_fetch.tokenMint.toString());
      console.log("Token Vault: ", token_config_fetch.tokenVault.toString());
    });

    it("5. Start Sell(Solana)", async () => {
      const sell_price = new anchor.BN(1_000_000_000); // 1 SOL
      [sell_pda, sell_pda_bump] =
        await anchor.web3.PublicKey.findProgramAddress(
          [
            Buffer.from(SELL_PDA_SEED),
            user_A.publicKey.toBuffer(),
            nftMintPubKey.toBuffer(),
          ],
          program.programId
        );
      [nft_vault, nft_vault_bump] =
        await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from(NFT_VAULT_PDA_SEED), nftMintPubKey.toBuffer()],
          program.programId
        );
      await program.methods
        .startSell(token_type, sell_price)
        .accounts({
          user: user_A.publicKey,
          config: config,
          tokenConfig: solana_token_config,
          nftMint: nftMintPubKey,
          nftVault: nft_vault,
          tokenMint: token_mint,
          userTokenVault: user_A.publicKey,
          userNftVault: user_A_NFTWallet,
          sell: sell_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([user_A])
        .rpc();
      const sell_fetch = await program.account.sell.fetch(sell_pda);
      console.log("Sell ID: ", sell_fetch.id.toString());
      console.log("Sell Price: ", sell_fetch.price.toString());
      assert.strictEqual(
        await utils.getTokenBalance(provider, user_A_NFTWallet),
        0
      );
      assert.strictEqual(await utils.getTokenBalance(provider, nft_vault), 1);
    });

    it("6. Update Sell(Solana)", async () => {
      const update_price = new anchor.BN(2_000_000_000); // 2 SOL
      await program.methods
        .updateSell(token_type, update_price)
        .accounts({
          user: user_A.publicKey,
          config: config,
          tokenConfig: solana_token_config,
          nftMint: nftMintPubKey,
          sell: sell_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([user_A])
        .rpc();
      const sell_fetch = await program.account.sell.fetch(sell_pda);
      console.log("Sell ID: ", sell_fetch.id.toString());
      console.log("Sell Price: ", sell_fetch.price.toString());
    });
    if (close_sell_mode) {
      it("7. Close Sell(Solana)", async () => {
        await program.methods
          .closeSell(token_type)
          .accounts({
            user: user_A.publicKey,
            config: config,
            tokenConfig: solana_token_config,
            nftMint: nftMintPubKey,
            nftVault: nft_vault,
            userNftVault: user_A_NFTWallet,
            sell: sell_pda,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([user_A])
          .rpc();
        assert.strictEqual(
          await utils.getTokenBalance(provider, user_A_NFTWallet),
          1
        );
      });
    } else {
      if (buy_mode) {
        it("8. Buy (Solana)", async () => {
          await program.methods
            .buy(token_type)
            .accounts({
              buyer: user_B.publicKey,
              seller: user_A.publicKey,
              config: config,
              tokenConfig: solana_token_config,
              nftMint: nftMintPubKey,
              nftVault: nft_vault,
              buyerNftVault: user_B_NFTWallet,
              tokenMint: token_mint,
              tokenVault: solana_vault,
              buyerTokenWallet: user_B.publicKey,
              sellerTokenWallet: user_A.publicKey,
              sell: sell_pda,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .signers([user_B])
            .rpc();
          assert.strictEqual(
            await utils.getTokenBalance(provider, user_A_NFTWallet),
            0
          );
          assert.strictEqual(
            await utils.getTokenBalance(provider, user_B_NFTWallet),
            1
          );
          const fetch_token_config = await program.account.tokenConfig.fetch(
            solana_token_config
          );
          console.log("Service Fee: ", fetch_token_config.fee.toString());
          console.log(
            "User_A SOL: ",
            await provider.connection.getBalance(user_A.publicKey)
          );
        });
      } else {
        it("8. Apply Offer (Solana)", async () => {
          const sell = await program.account.sell.fetch(sell_pda);
          const offer_price = new anchor.BN(500_000_000); // 0.5 SOL
          [offer_pda, offer_pda_bump] =
            await anchor.web3.PublicKey.findProgramAddress(
              [
                Buffer.from(OFFER_PDA_SEED),
                user_B.publicKey.toBuffer(),
                nftMintPubKey.toBuffer(),
                Buffer.from(sell.id.toString()),
              ],
              program.programId
            );
          console.log(
            "User_B SOL: ",
            await provider.connection.getBalance(user_B.publicKey)
          );
          await program.methods
            .applyOffer(token_type, sell.id, offer_price)
            .accounts({
              buyer: user_B.publicKey,
              config: config,
              tokenConfig: solana_token_config,
              nftMint: nftMintPubKey,
              tokenMint: token_mint,
              tokenVault: solana_vault,
              buyerTokenWallet: user_B.publicKey,
              sell: sell_pda,
              offer: offer_pda,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .signers([user_B])
            .rpc();

          const fetch_offer = await program.account.offer.fetch(offer_pda);
          console.log("Offer ID: ", fetch_offer.id.toString());
          console.log("Offer Price: ", fetch_offer.offerPrice.toString());
          console.log(
            "User_B SOL: ",
            await provider.connection.getBalance(user_B.publicKey)
          );
        });
        if (offer_cancel_mode) {
          it("9. Cancel Offer (Solana)", async () => {
            const sell = await program.account.sell.fetch(sell_pda);
            await program.methods
              .cancelOffer(token_type, sell.id)
              .accounts({
                buyer: user_B.publicKey,
                config: config,
                tokenConfig: solana_token_config,
                nftMint: nftMintPubKey,
                tokenMint: token_mint,
                tokenVault: solana_vault,
                buyerTokenWallet: user_B.publicKey,
                sell: sell_pda,
                offer: offer_pda,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
              })
              .signers([user_B])
              .rpc();
            console.log(
              "User_B SOL: ",
              await provider.connection.getBalance(user_B.publicKey)
            );
          });
        } else {
          it("9. Accept Offer (Solana)", async () => {
            const sell = await program.account.sell.fetch(sell_pda);
            await program.methods
              .acceptOffer(token_type, sell.id)
              .accounts({
                seller: user_A.publicKey,
                buyer: user_B.publicKey,
                config: config,
                tokenConfig: solana_token_config,
                nftMint: nftMintPubKey,
                nftVault: nft_vault,
                buyerNftVault: user_B_NFTWallet,
                tokenMint: token_mint,
                tokenVault: solana_vault,
                sellerTokenWallet: user_A.publicKey,
                sell: sell_pda,
                offer: offer_pda,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
              })
              .signers([user_A])
              .rpc();
            console.log(
              "User_A SOL: ",
              await provider.connection.getBalance(user_A.publicKey)
            );
            console.log(
              "Solana Vault SOL: ",
              await provider.connection.getBalance(solana_vault)
            );
            assert.strictEqual(
              await utils.getTokenBalance(provider, user_B_NFTWallet),
              1
            );
          });
        }
      }
    }
  } else {
    it("4. Set Token Config(USDC)", async () => {
      [usdc_token_config, usdc_token_config_bump] =
        await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from(TOKEN_CONFIG_PDA_SEED), Buffer.from([token_type])],
          program.programId
        );
      [usdc_vault, usdc_vault_bump] =
        await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from(TOKEN_VAULT_PDA_SEED), Buffer.from([token_type])],
          program.programId
        );
      token_mint = usdcMintPubkey;
      await program.methods
        .initTokenAccount(token_type)
        .accounts({
          owner: provider.wallet.publicKey,
          config: config,
          tokenMint: token_mint,
          tokenVault: usdc_vault,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        // @ts-ignore
        .signers([provider.wallet.payer])
        .rpc();

      await program.methods
        .tokenSetup(token_type, usdc_vault_bump)
        .accounts({
          owner: provider.wallet.publicKey,
          config: config,
          tokenConfig: usdc_token_config,
          tokenMint: token_mint,
          tokenVault: usdc_vault,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        // @ts-ignore
        .signers([provider.wallet.payer])
        .rpc();
      const token_config_fetch = await program.account.tokenConfig.fetch(
        usdc_token_config
      );
      console.log("Token Mint: ", token_config_fetch.tokenMint.toString());
      console.log("Token Vault: ", token_config_fetch.tokenVault.toString());
      console.log(
        "Usdc Token Vault Lamports: ",
        await provider.connection.getBalance(usdc_vault)
      );
    });
    it("5. Start Sell(USDC)", async () => {
      const sell_price = new anchor.BN(1_000_000_000); // 1 USDC
      [sell_pda, sell_pda_bump] =
        await anchor.web3.PublicKey.findProgramAddress(
          [
            Buffer.from(SELL_PDA_SEED),
            user_A.publicKey.toBuffer(),
            nftMintPubKey.toBuffer(),
          ],
          program.programId
        );
      [nft_vault, nft_vault_bump] =
        await anchor.web3.PublicKey.findProgramAddress(
          [Buffer.from(NFT_VAULT_PDA_SEED), nftMintPubKey.toBuffer()],
          program.programId
        );
      try {
        await program.methods
          .startSell(token_type, sell_price)
          .accounts({
            user: user_A.publicKey,
            config: config,
            tokenConfig: usdc_token_config,
            nftMint: nftMintPubKey,
            nftVault: nft_vault,
            tokenMint: token_mint,
            userTokenVault: user_A_usdcWallet,
            userNftVault: user_A_NFTWallet,
            sell: sell_pda,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([user_A])
          .rpc();
      } catch (e) {
        console.log(e);
      }
      const sell_fetch = await program.account.sell.fetch(sell_pda);
      console.log("Sell ID: ", sell_fetch.id.toString());
      console.log("Sell Price: ", sell_fetch.price.toString());
      assert.strictEqual(
        await utils.getTokenBalance(provider, user_A_NFTWallet),
        0
      );
      assert.strictEqual(await utils.getTokenBalance(provider, nft_vault), 1);
    });
    it("6. Update Sell (USDC)", async () => {
      const update_price = new anchor.BN(2_000_000_000); // 2 USDC
      await program.methods
        .updateSell(token_type, update_price)
        .accounts({
          user: user_A.publicKey,
          config: config,
          tokenConfig: usdc_token_config,
          nftMint: nftMintPubKey,
          sell: sell_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .signers([user_A])
        .rpc();
      const sell_fetch = await program.account.sell.fetch(sell_pda);
      console.log("Sell ID: ", sell_fetch.id.toString());
      console.log("Sell Price: ", sell_fetch.price.toString());
    });
    if (close_sell_mode) {
      it("7. Close Sell(USDC)", async () => {
        await program.methods
          .closeSell(token_type)
          .accounts({
            user: user_A.publicKey,
            config: config,
            tokenConfig: usdc_token_config,
            nftMint: nftMintPubKey,
            nftVault: nft_vault,
            userNftVault: user_A_NFTWallet,
            sell: sell_pda,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([user_A])
          .rpc();
        assert.strictEqual(
          await utils.getTokenBalance(provider, user_A_NFTWallet),
          1
        );
      });
    } else {
      if (buy_mode) {
        it("8. Buy (USDC)", async () => {
          await program.methods
            .buy(token_type)
            .accounts({
              buyer: user_B.publicKey,
              seller: user_A.publicKey,
              config: config,
              tokenConfig: usdc_token_config,
              nftMint: nftMintPubKey,
              nftVault: nft_vault,
              buyerNftVault: user_B_NFTWallet,
              tokenMint: token_mint,
              tokenVault: usdc_vault,
              buyerTokenWallet: user_B_usdcWallet,
              sellerTokenWallet: user_A_usdcWallet,
              sell: sell_pda,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .signers([user_B])
            .rpc();
          assert.strictEqual(
            await utils.getTokenBalance(provider, user_A_NFTWallet),
            0
          );
          assert.strictEqual(
            await utils.getTokenBalance(provider, user_B_NFTWallet),
            1
          );
          const fetch_token_config = await program.account.tokenConfig.fetch(
            usdc_token_config
          );
          console.log("Service Fee: ", fetch_token_config.fee.toString());
          console.log(
            "User A USDC Balance: ",
            await utils.getTokenBalance(provider, user_A_usdcWallet)
          );
          console.log(
            "User B USDC Balance: ",
            await utils.getTokenBalance(provider, user_B_usdcWallet)
          );
        });
      } else {
        it("8. Apply Offer (USDC)", async () => {
          const sell = await program.account.sell.fetch(sell_pda);
          const offer_price = new anchor.BN(10_000_000_000); // 10 USDC
          [offer_pda, offer_pda_bump] =
            await anchor.web3.PublicKey.findProgramAddress(
              [
                Buffer.from(OFFER_PDA_SEED),
                user_B.publicKey.toBuffer(),
                nftMintPubKey.toBuffer(),
                Buffer.from(sell.id.toString()),
              ],
              program.programId
            );
          console.log(
            "User B USDC Balance: ",
            await utils.getTokenBalance(provider, user_B_usdcWallet)
          );
          await program.methods
            .applyOffer(token_type, sell.id, offer_price)
            .accounts({
              buyer: user_B.publicKey,
              config: config,
              tokenConfig: usdc_token_config,
              nftMint: nftMintPubKey,
              tokenMint: token_mint,
              tokenVault: usdc_vault,
              buyerTokenWallet: user_B_usdcWallet,
              sell: sell_pda,
              offer: offer_pda,
              systemProgram: anchor.web3.SystemProgram.programId,
              tokenProgram: TOKEN_PROGRAM_ID,
              rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            })
            .signers([user_B])
            .rpc();

          const fetch_offer = await program.account.offer.fetch(offer_pda);
          console.log("Offer ID: ", fetch_offer.id.toString());
          console.log("Offer Price: ", fetch_offer.offerPrice.toString());
          console.log(
            "User B USDC Balance: ",
            await utils.getTokenBalance(provider, user_B_usdcWallet)
          );
        });
        if (offer_cancel_mode) {
          it("9. Cancel Offer (USDC)", async () => {
            const sell = await program.account.sell.fetch(sell_pda);
            await program.methods
              .cancelOffer(token_type, sell.id)
              .accounts({
                buyer: user_B.publicKey,
                config: config,
                tokenConfig: usdc_token_config,
                nftMint: nftMintPubKey,
                tokenMint: token_mint,
                tokenVault: usdc_vault,
                buyerTokenWallet: user_B_usdcWallet,
                sell: sell_pda,
                offer: offer_pda,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
              })
              .signers([user_B])
              .rpc();
            console.log(
              "User B USDC Balance: ",
              await utils.getTokenBalance(provider, user_B_usdcWallet)
            );
          });
        } else {
          it("9. Accept Offer (USDC)", async () => {
            const sell = await program.account.sell.fetch(sell_pda);
            await program.methods
              .acceptOffer(token_type, sell.id)
              .accounts({
                seller: user_A.publicKey,
                buyer: user_B.publicKey,
                config: config,
                tokenConfig: usdc_token_config,
                nftMint: nftMintPubKey,
                nftVault: nft_vault,
                buyerNftVault: user_B_NFTWallet,
                tokenMint: token_mint,
                tokenVault: usdc_vault,
                sellerTokenWallet: user_A_usdcWallet,
                sell: sell_pda,
                offer: offer_pda,
                systemProgram: anchor.web3.SystemProgram.programId,
                tokenProgram: TOKEN_PROGRAM_ID,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
              })
              .signers([user_A])
              .rpc();
            console.log(
              "User_A USDC: ",
              await provider.connection.getBalance(user_A_usdcWallet)
            );
            console.log(
              "USDC Vault Balance: ",
              await provider.connection.getBalance(usdc_vault)
            );
            assert.strictEqual(
              await utils.getTokenBalance(provider, user_B_NFTWallet),
              1
            );
          });
        }
      }
    }
  }
});
