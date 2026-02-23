use anchor_lang::AccountDeserialize;
use anyhow::{anyhow, Context, Result};
use borsh::BorshSerialize;
use clap::{Parser, Subcommand, ValueEnum};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use solana_client::rpc_client::RpcClient;
use solana_client::rpc_config::{RpcAccountInfoConfig, RpcProgramAccountsConfig};
use solana_client::rpc_filter::{Memcmp, RpcFilterType};
use solana_sdk::commitment_config::CommitmentConfig;
use solana_sdk::instruction::{AccountMeta, Instruction};
use solana_sdk::pubkey::Pubkey;
use solana_sdk::signature::{read_keypair_file, Keypair, Signer};
use solana_sdk::system_program;
use solana_sdk::sysvar;
use solana_sdk::transaction::Transaction;
use spl_associated_token_account::get_associated_token_address_with_program_id;
use spl_token_2022::extension::StateWithExtensions;
use spl_token_2022::state::Account as TokenAccount2022;
use stablecoin_core::constants::{
    ROLE_BLACKLISTER, ROLE_BURNER, ROLE_FREEZER, ROLE_MASTER_AUTHORITY, ROLE_MINTER, ROLE_PAUSER,
    ROLE_SEIZER,
};
use stablecoin_core::state::{BlacklistEntry, RoleAccount, StablecoinConfig};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::str::FromStr;

#[derive(Parser)]
#[command(name = "sss-token", version, about = "Solana Stablecoin Standard CLI")]
struct Cli {
    #[arg(long)]
    cluster: Option<String>,

    #[arg(long)]
    keypair: Option<String>,

    #[arg(long, value_enum, default_value = "text")]
    output: OutputFormat,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Clone, Copy, ValueEnum, PartialEq, Eq)]
enum OutputFormat {
    Text,
    Json,
}

#[derive(Subcommand)]
enum Commands {
    Init(InitArgs),
    Mint(MintArgs),
    Burn(BurnArgs),
    Freeze(AddressArgs),
    Thaw(AddressArgs),
    Pause(MintOnlyArgs),
    Unpause(MintOnlyArgs),
    Blacklist(BlacklistArgs),
    Seize(SeizeArgs),
    Minters(MintersArgs),
    Status(MintOnlyArgs),
    Supply(MintOnlyArgs),
    Holders(HoldersArgs),
    AuditLog(AuditLogArgs),
}

#[derive(Parser)]
struct InitArgs {
    #[arg(long)]
    preset: Option<String>,

    #[arg(long)]
    config: Option<String>,

    #[arg(long)]
    name: Option<String>,

    #[arg(long)]
    symbol: Option<String>,

    #[arg(long, default_value_t = 6)]
    decimals: u8,

    #[arg(long)]
    uri: Option<String>,
}

#[derive(Parser)]
struct MintArgs {
    recipient: String,
    amount: String,

    #[arg(long)]
    mint: Option<String>,
}

#[derive(Parser)]
struct BurnArgs {
    amount: String,

    #[arg(long)]
    mint: Option<String>,
}

#[derive(Parser)]
struct AddressArgs {
    address: String,

    #[arg(long)]
    mint: Option<String>,
}

#[derive(Parser)]
struct BlacklistArgs {
    #[command(subcommand)]
    command: BlacklistCmd,
}

#[derive(Subcommand)]
enum BlacklistCmd {
    Add(BlacklistAddArgs),
    Remove(AddressArgs),
    Check(AddressArgs),
}

#[derive(Parser)]
struct BlacklistAddArgs {
    address: String,

    #[arg(long)]
    reason: String,

    #[arg(long)]
    mint: Option<String>,
}

#[derive(Parser)]
struct SeizeArgs {
    address: String,

    #[arg(long)]
    to: String,

    #[arg(long)]
    mint: Option<String>,
}

#[derive(Parser)]
struct MintersArgs {
    #[command(subcommand)]
    command: MintersCmd,
}

#[derive(Subcommand)]
enum MintersCmd {
    List(MintOnlyArgs),
    Add(MinterAddArgs),
    Remove(AddressArgs),
}

#[derive(Parser)]
struct MinterAddArgs {
    address: String,

    #[arg(long)]
    quota: String,

    #[arg(long)]
    mint: Option<String>,
}

#[derive(Parser)]
struct MintOnlyArgs {
    #[arg(long)]
    mint: Option<String>,
}

#[derive(Parser)]
struct HoldersArgs {
    #[arg(long)]
    min_balance: Option<String>,

    #[arg(long)]
    mint: Option<String>,
}

#[derive(Parser)]
struct AuditLogArgs {
    #[arg(long)]
    action: Option<String>,

    #[arg(long)]
    from: Option<String>,

    #[arg(long)]
    to: Option<String>,

    #[arg(long)]
    mint: Option<String>,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    run(cli)
}

fn run(cli: Cli) -> Result<()> {
    let solana_config = load_solana_cli_config().ok();

    match &cli.command {
        Commands::Init(args) => {
            let config_file = args
                .config
                .as_ref()
                .map(|path| load_sss_config(path))
                .transpose()?;
            let network_override = config_file.as_ref().and_then(|cfg| cfg.network.as_ref());
            let ctx = build_context(&cli, solana_config.as_ref(), network_override)?;
            handle_init(&ctx, args, config_file.as_ref())
        }
        Commands::Mint(args) => {
            let ctx = build_context(&cli, solana_config.as_ref(), None)?;
            handle_mint(&ctx, args)
        }
        Commands::Burn(args) => {
            let ctx = build_context(&cli, solana_config.as_ref(), None)?;
            handle_burn(&ctx, args)
        }
        Commands::Freeze(args) => {
            let ctx = build_context(&cli, solana_config.as_ref(), None)?;
            handle_freeze(&ctx, args)
        }
        Commands::Thaw(args) => {
            let ctx = build_context(&cli, solana_config.as_ref(), None)?;
            handle_thaw(&ctx, args)
        }
        Commands::Pause(args) => {
            let ctx = build_context(&cli, solana_config.as_ref(), None)?;
            handle_pause(&ctx, args)
        }
        Commands::Unpause(args) => {
            let ctx = build_context(&cli, solana_config.as_ref(), None)?;
            handle_unpause(&ctx, args)
        }
        Commands::Blacklist(args) => {
            let ctx = build_context(&cli, solana_config.as_ref(), None)?;
            handle_blacklist(&ctx, &args.command)
        }
        Commands::Seize(args) => {
            let ctx = build_context(&cli, solana_config.as_ref(), None)?;
            handle_seize(&ctx, args)
        }
        Commands::Minters(args) => {
            let ctx = build_context(&cli, solana_config.as_ref(), None)?;
            handle_minters(&ctx, &args.command)
        }
        Commands::Status(args) => {
            let ctx = build_context(&cli, solana_config.as_ref(), None)?;
            handle_status(&ctx, args)
        }
        Commands::Supply(args) => {
            let ctx = build_context(&cli, solana_config.as_ref(), None)?;
            handle_supply(&ctx, args)
        }
        Commands::Holders(args) => {
            let ctx = build_context(&cli, solana_config.as_ref(), None)?;
            handle_holders(&ctx, args)
        }
        Commands::AuditLog(args) => {
            let ctx = build_context(&cli, solana_config.as_ref(), None)?;
            handle_audit_log(&ctx, args)
        }
    }
}

#[derive(Debug, Clone)]
struct ClusterInfo {
    url: String,
    label: Option<String>,
}

#[derive(Clone, Copy)]
struct AppContext<'a> {
    client: &'a RpcClient,
    payer: &'a Keypair,
    output: OutputFormat,
    cluster: &'a ClusterInfo,
    commitment: CommitmentConfig,
}

fn build_context(
    cli: &Cli,
    solana_config: Option<&SolanaCliConfig>,
    network_override: Option<&NetworkConfig>,
) -> Result<OwnedContext> {
    let cluster_value = if let Some(value) = cli.cluster.as_deref() {
        value.to_string()
    } else if let Some(value) = network_override.and_then(|cfg| cfg.cluster.as_deref()) {
        value.to_string()
    } else if let Some(config) = solana_config {
        config.json_rpc_url.clone()
    } else {
        "devnet".to_string()
    };

    let cluster = resolve_cluster(&cluster_value)?;

    let keypair_value = if let Some(value) = cli.keypair.as_deref() {
        value.to_string()
    } else if let Some(value) = network_override.and_then(|cfg| cfg.keypair_path.as_deref()) {
        value.to_string()
    } else if let Some(config) = solana_config {
        config.keypair_path.clone()
    } else {
        return Err(anyhow!(
            "Missing keypair path. Use --keypair or Solana CLI config."
        ));
    };

    let commitment_value =
        if let Some(value) = network_override.and_then(|cfg| cfg.commitment.as_deref()) {
            Some(value.to_string())
        } else if let Some(config) = solana_config.and_then(|cfg| cfg.commitment.clone()) {
            Some(config)
        } else {
            None
        };

    let commitment = parse_commitment(commitment_value.as_deref());

    let keypair_path = expand_tilde(&keypair_value);
    let payer = read_keypair_file(&keypair_path)
        .map_err(|err| anyhow!("Failed to read keypair: {}", err))?;

    let client = RpcClient::new_with_commitment(cluster.url.clone(), commitment);

    Ok(OwnedContext {
        client,
        payer,
        output: cli.output.clone(),
        cluster,
        commitment,
    })
}

struct OwnedContext {
    client: RpcClient,
    payer: Keypair,
    output: OutputFormat,
    cluster: ClusterInfo,
    commitment: CommitmentConfig,
}

impl OwnedContext {
    fn as_ref(&self) -> AppContext<'_> {
        AppContext {
            client: &self.client,
            payer: &self.payer,
            output: self.output.clone(),
            cluster: &self.cluster,
            commitment: self.commitment,
        }
    }
}

fn handle_init(ctx: &OwnedContext, args: &InitArgs, config: Option<&SssConfig>) -> Result<()> {
    let preset = args.preset.as_deref().map(|value| value.to_lowercase());
    let has_config = args.config.is_some();
    if preset.is_some() && has_config {
        return Err(anyhow!("--preset and --config are mutually exclusive"));
    }

    let (token, extensions, roles) = if let Some(config) = config {
        (
            config.token.clone(),
            config.extensions.clone().unwrap_or_default(),
            config.roles.clone().unwrap_or_default(),
        )
    } else {
        let preset = preset.ok_or_else(|| anyhow!("Missing --preset or --config"))?;
        let name = args
            .name
            .clone()
            .ok_or_else(|| anyhow!("--name is required when using --preset"))?;
        let symbol = args
            .symbol
            .clone()
            .ok_or_else(|| anyhow!("--symbol is required when using --preset"))?;
        let token = TokenConfig {
            name,
            symbol,
            decimals: Some(args.decimals),
            uri: args.uri.clone(),
        };
        let extensions = match preset.as_str() {
            "sss-1" => ExtensionsConfig::from_preset(false),
            "sss-2" => ExtensionsConfig::from_preset(true),
            _ => return Err(anyhow!("Invalid preset: {}", preset)),
        };
        (token, extensions, RolesConfig::default())
    };

    let decimals = token.decimals.unwrap_or(6);
    let uri = token.uri.unwrap_or_default();

    let enable_transfer_hook = extensions.transfer_hook.unwrap_or(false);
    let enable_permanent_delegate = extensions.permanent_delegate.unwrap_or(false);
    let default_account_frozen = extensions.default_account_frozen.unwrap_or(false);

    if extensions.confidential_transfer.unwrap_or(false) {
        return Err(anyhow!("Confidential transfer is not supported"));
    }

    let ctx_ref = ctx.as_ref();
    let mint_keypair = Keypair::new();
    let program_id = stablecoin_core::ID;
    let (config_pda, _) = find_config_pda(&mint_keypair.pubkey(), &program_id);
    let (role_pda, _) = find_role_pda(&config_pda, &ctx_ref.payer.pubkey(), &program_id);

    let transfer_hook_program = if enable_transfer_hook {
        Some(transfer_hook::ID)
    } else {
        None
    };
    let extra_metas =
        transfer_hook_program.map(|id| find_extra_account_metas_pda(&mint_keypair.pubkey(), &id).0);

    let initialize_ix = build_initialize_instruction(InitializeParams {
        authority: ctx_ref.payer.pubkey(),
        mint: mint_keypair.pubkey(),
        name: token.name,
        symbol: token.symbol,
        uri,
        decimals,
        enable_permanent_delegate,
        enable_transfer_hook,
        default_account_frozen,
        transfer_hook_program,
        config_pda,
        role_pda,
        extra_metas,
    })?;

    let signature = send_transaction(ctx_ref, vec![initialize_ix], vec![&mint_keypair])?;

    let role_map = build_role_assignments(&roles)?;
    if !role_map.is_empty() {
        let mut instructions = Vec::new();
        for (target, assignment) in role_map {
            instructions.push(build_update_roles_instruction(UpdateRolesParams {
                authority: ctx_ref.payer.pubkey(),
                config_pda,
                target,
                roles: assignment.roles,
                mint_quota: assignment.mint_quota,
            })?);
        }
        let _ = send_transaction(ctx_ref, instructions, vec![])?;
    }

    let preset_label = if enable_transfer_hook {
        "SSS-2"
    } else {
        "SSS-1"
    };
    let explorer = explorer_url(&signature, ctx_ref.cluster);

    if ctx_ref.output == OutputFormat::Json {
        let output = InitOutput {
            mint: mint_keypair.pubkey().to_string(),
            config: config_pda.to_string(),
            preset: preset_label.to_string(),
            signature: signature.clone(),
            explorer,
        };
        print_json(&output)
    } else {
        println!("Stablecoin initialized");
        println!("Mint:     {}", mint_keypair.pubkey());
        println!("Config:   {}", config_pda);
        println!("Preset:   {}", preset_label);
        println!("Tx:       {}", signature);
        if let Some(url) = explorer {
            println!("Explorer: {}", url);
        }
        Ok(())
    }
}

fn handle_mint(ctx: &OwnedContext, args: &MintArgs) -> Result<()> {
    let ctx_ref = ctx.as_ref();
    let mint = resolve_mint(&args.mint)?;
    let config_pda = find_config_pda(&mint, &stablecoin_core::ID).0;
    let config = fetch_config(ctx_ref, &config_pda)?;
    let amount = parse_amount(&args.amount, config.decimals)?;
    let recipient = parse_pubkey(&args.recipient)?;
    let recipient_ata =
        get_associated_token_address_with_program_id(&recipient, &mint, &spl_token_2022::id());
    let mint_ix = build_mint_instruction(MintParams {
        minter: ctx_ref.payer.pubkey(),
        mint,
        recipient,
        recipient_ata,
        amount,
    })?;
    let signature = send_transaction(ctx_ref, vec![mint_ix], vec![])?;
    let supply = ctx_ref.client.get_token_supply(&mint)?;
    let explorer = explorer_url(&signature, ctx_ref.cluster);
    if ctx_ref.output == OutputFormat::Json {
        let output = MintOutput {
            signature: signature.clone(),
            explorer,
            new_supply: supply.amount,
        };
        print_json(&output)
    } else {
        println!(
            "Minted {} tokens to {}",
            format_amount(amount, config.decimals),
            recipient
        );
        println!("New supply: {}", supply.amount);
        println!("Tx: {}", signature);
        if let Some(url) = explorer {
            println!("Explorer: {}", url);
        }
        Ok(())
    }
}

fn handle_burn(ctx: &OwnedContext, args: &BurnArgs) -> Result<()> {
    let ctx_ref = ctx.as_ref();
    let mint = resolve_mint(&args.mint)?;
    let config_pda = find_config_pda(&mint, &stablecoin_core::ID).0;
    let config = fetch_config(ctx_ref, &config_pda)?;
    let amount = parse_amount(&args.amount, config.decimals)?;
    let burner = ctx_ref.payer.pubkey();
    let burner_ata =
        get_associated_token_address_with_program_id(&burner, &mint, &spl_token_2022::id());
    let burn_ix = build_burn_instruction(BurnParams {
        burner,
        mint,
        burner_ata,
        amount,
    })?;
    let signature = send_transaction(ctx_ref, vec![burn_ix], vec![])?;
    let supply = ctx_ref.client.get_token_supply(&mint)?;
    let explorer = explorer_url(&signature, ctx_ref.cluster);
    if ctx_ref.output == OutputFormat::Json {
        let output = BurnOutput {
            signature: signature.clone(),
            explorer,
            new_supply: supply.amount,
        };
        print_json(&output)
    } else {
        println!(
            "Burned {} tokens from {}",
            format_amount(amount, config.decimals),
            burner
        );
        println!("New supply: {}", supply.amount);
        println!("Tx: {}", signature);
        if let Some(url) = explorer {
            println!("Explorer: {}", url);
        }
        Ok(())
    }
}

fn handle_freeze(ctx: &OwnedContext, args: &AddressArgs) -> Result<()> {
    let ctx_ref = ctx.as_ref();
    let mint = resolve_mint(&args.mint)?;
    let target = parse_pubkey(&args.address)?;
    let config_pda = find_config_pda(&mint, &stablecoin_core::ID).0;
    let freeze_ix = build_freeze_instruction(FreezeParams {
        freezer: ctx_ref.payer.pubkey(),
        mint,
        target_ata: target,
    })?;
    let signature = send_transaction(ctx_ref, vec![freeze_ix], vec![])?;
    let explorer = explorer_url(&signature, ctx_ref.cluster);
    if ctx_ref.output == OutputFormat::Json {
        let output = SimpleOutput {
            signature: signature.clone(),
            explorer,
        };
        print_json(&output)
    } else {
        println!("Frozen token account: {}", target);
        println!("Config: {}", config_pda);
        println!("Tx: {}", signature);
        if let Some(url) = explorer {
            println!("Explorer: {}", url);
        }
        Ok(())
    }
}

fn handle_thaw(ctx: &OwnedContext, args: &AddressArgs) -> Result<()> {
    let ctx_ref = ctx.as_ref();
    let mint = resolve_mint(&args.mint)?;
    let target = parse_pubkey(&args.address)?;
    let config_pda = find_config_pda(&mint, &stablecoin_core::ID).0;
    let thaw_ix = build_thaw_instruction(FreezeParams {
        freezer: ctx_ref.payer.pubkey(),
        mint,
        target_ata: target,
    })?;
    let signature = send_transaction(ctx_ref, vec![thaw_ix], vec![])?;
    let explorer = explorer_url(&signature, ctx_ref.cluster);
    if ctx_ref.output == OutputFormat::Json {
        let output = SimpleOutput {
            signature: signature.clone(),
            explorer,
        };
        print_json(&output)
    } else {
        println!("Thawed token account: {}", target);
        println!("Config: {}", config_pda);
        println!("Tx: {}", signature);
        if let Some(url) = explorer {
            println!("Explorer: {}", url);
        }
        Ok(())
    }
}

fn handle_pause(ctx: &OwnedContext, args: &MintOnlyArgs) -> Result<()> {
    let ctx_ref = ctx.as_ref();
    let mint = resolve_mint(&args.mint)?;
    let config_pda = find_config_pda(&mint, &stablecoin_core::ID).0;
    let pause_ix = build_pause_instruction(PauseParams {
        pauser: ctx_ref.payer.pubkey(),
        config_pda,
        unpause: false,
    })?;
    let signature = send_transaction(ctx_ref, vec![pause_ix], vec![])?;
    let explorer = explorer_url(&signature, ctx_ref.cluster);
    if ctx_ref.output == OutputFormat::Json {
        let output = SimpleOutput {
            signature: signature.clone(),
            explorer,
        };
        print_json(&output)
    } else {
        println!("System paused");
        println!("Config: {}", config_pda);
        println!("Tx: {}", signature);
        if let Some(url) = explorer {
            println!("Explorer: {}", url);
        }
        Ok(())
    }
}

fn handle_unpause(ctx: &OwnedContext, args: &MintOnlyArgs) -> Result<()> {
    let ctx_ref = ctx.as_ref();
    let mint = resolve_mint(&args.mint)?;
    let config_pda = find_config_pda(&mint, &stablecoin_core::ID).0;
    let unpause_ix = build_pause_instruction(PauseParams {
        pauser: ctx_ref.payer.pubkey(),
        config_pda,
        unpause: true,
    })?;
    let signature = send_transaction(ctx_ref, vec![unpause_ix], vec![])?;
    let explorer = explorer_url(&signature, ctx_ref.cluster);
    if ctx_ref.output == OutputFormat::Json {
        let output = SimpleOutput {
            signature: signature.clone(),
            explorer,
        };
        print_json(&output)
    } else {
        println!("System unpaused");
        println!("Config: {}", config_pda);
        println!("Tx: {}", signature);
        if let Some(url) = explorer {
            println!("Explorer: {}", url);
        }
        Ok(())
    }
}

fn handle_blacklist(ctx: &OwnedContext, cmd: &BlacklistCmd) -> Result<()> {
    let ctx_ref = ctx.as_ref();
    match cmd {
        BlacklistCmd::Add(args) => {
            let mint = resolve_mint(&args.mint)?;
            let config_pda = find_config_pda(&mint, &stablecoin_core::ID).0;
            let config = fetch_config(ctx_ref, &config_pda)?;
            if !config.features.transfer_hook {
                return Err(anyhow!("Transfer hook not enabled for this stablecoin"));
            }
            let wallet = parse_pubkey(&args.address)?;
            let add_ix = build_add_to_blacklist_instruction(AddToBlacklistParams {
                blacklister: ctx_ref.payer.pubkey(),
                config_pda,
                wallet,
                reason: args.reason.clone(),
            })?;
            let signature = send_transaction(ctx_ref, vec![add_ix], vec![])?;
            let explorer = explorer_url(&signature, ctx_ref.cluster);
            if ctx_ref.output == OutputFormat::Json {
                let output = SimpleOutput {
                    signature: signature.clone(),
                    explorer,
                };
                print_json(&output)
            } else {
                println!("Blacklisted: {}", wallet);
                println!("Tx: {}", signature);
                if let Some(url) = explorer {
                    println!("Explorer: {}", url);
                }
                Ok(())
            }
        }
        BlacklistCmd::Remove(args) => {
            let mint = resolve_mint(&args.mint)?;
            let config_pda = find_config_pda(&mint, &stablecoin_core::ID).0;
            let config = fetch_config(ctx_ref, &config_pda)?;
            if !config.features.transfer_hook {
                return Err(anyhow!("Transfer hook not enabled for this stablecoin"));
            }
            let wallet = parse_pubkey(&args.address)?;
            let blacklist_entry = find_blacklist_pda(&config_pda, &wallet, &stablecoin_core::ID).0;
            let remove_ix = build_remove_from_blacklist_instruction(RemoveFromBlacklistParams {
                blacklister: ctx_ref.payer.pubkey(),
                config_pda,
                blacklist_entry,
            })?;
            let signature = send_transaction(ctx_ref, vec![remove_ix], vec![])?;
            let explorer = explorer_url(&signature, ctx_ref.cluster);
            if ctx_ref.output == OutputFormat::Json {
                let output = SimpleOutput {
                    signature: signature.clone(),
                    explorer,
                };
                print_json(&output)
            } else {
                println!("Removed from blacklist: {}", wallet);
                println!("Tx: {}", signature);
                if let Some(url) = explorer {
                    println!("Explorer: {}", url);
                }
                Ok(())
            }
        }
        BlacklistCmd::Check(args) => {
            let mint = resolve_mint(&args.mint)?;
            let config_pda = find_config_pda(&mint, &stablecoin_core::ID).0;
            let wallet = parse_pubkey(&args.address)?;
            let blacklist_entry = find_blacklist_pda(&config_pda, &wallet, &stablecoin_core::ID).0;
            let status = fetch_blacklist_entry(ctx_ref, &blacklist_entry)?;
            if ctx_ref.output == OutputFormat::Json {
                let output = BlacklistStatusOutput {
                    wallet: wallet.to_string(),
                    is_active: status
                        .as_ref()
                        .map(|entry| entry.is_active)
                        .unwrap_or(false),
                    reason: status.as_ref().map(|entry| entry.reason.clone()),
                };
                print_json(&output)
            } else {
                match status {
                    Some(entry) if entry.is_active => {
                        println!("Blacklisted: {}", wallet);
                        println!("Reason: {}", entry.reason);
                    }
                    _ => println!("Not blacklisted: {}", wallet),
                }
                Ok(())
            }
        }
    }
}

fn handle_seize(ctx: &OwnedContext, args: &SeizeArgs) -> Result<()> {
    let ctx_ref = ctx.as_ref();
    let mint = resolve_mint(&args.mint)?;
    let config_pda = find_config_pda(&mint, &stablecoin_core::ID).0;
    let config = fetch_config(ctx_ref, &config_pda)?;
    if !config.features.permanent_delegate {
        return Err(anyhow!(
            "Permanent delegate not enabled for this stablecoin"
        ));
    }
    let target_ata = parse_pubkey(&args.address)?;
    let treasury_ata = parse_pubkey(&args.to)?;
    let target_account = fetch_token_account(ctx_ref, &target_ata)?;
    if target_account.mint != mint {
        return Err(anyhow!("Target token account mint does not match"));
    }
    let blacklist_entry =
        find_blacklist_pda(&config_pda, &target_account.owner, &stablecoin_core::ID).0;
    let seize_ix = build_seize_instruction(SeizeParams {
        seizer: ctx_ref.payer.pubkey(),
        config_pda,
        mint,
        target_ata,
        treasury_ata,
        blacklist_entry,
    })?;
    let signature = send_transaction(ctx_ref, vec![seize_ix], vec![])?;
    let explorer = explorer_url(&signature, ctx_ref.cluster);
    if ctx_ref.output == OutputFormat::Json {
        let output = SimpleOutput {
            signature: signature.clone(),
            explorer,
        };
        print_json(&output)
    } else {
        println!("Seized tokens from {}", target_ata);
        println!("Tx: {}", signature);
        if let Some(url) = explorer {
            println!("Explorer: {}", url);
        }
        Ok(())
    }
}

fn handle_minters(ctx: &OwnedContext, cmd: &MintersCmd) -> Result<()> {
    let ctx_ref = ctx.as_ref();
    match cmd {
        MintersCmd::List(args) => {
            let mint = resolve_mint(&args.mint)?;
            let config_pda = find_config_pda(&mint, &stablecoin_core::ID).0;
            let roles = list_role_accounts(ctx_ref, &config_pda)?;
            let mut minters = Vec::new();
            for entry in roles {
                if entry.account.roles & ROLE_MINTER != 0 {
                    minters.push(MinterInfo {
                        address: entry.account.authority.to_string(),
                        quota: entry.account.mint_quota.map(|value: u64| value.to_string()),
                    });
                }
            }
            if ctx_ref.output == OutputFormat::Json {
                let output = MintersOutput {
                    minters: minters.clone(),
                };
                print_json(&output)
            } else {
                if minters.is_empty() {
                    println!("No minters found");
                } else {
                    for minter in minters {
                        if let Some(quota) = minter.quota {
                            println!("{} (quota: {})", minter.address, quota);
                        } else {
                            println!("{}", minter.address);
                        }
                    }
                }
                Ok(())
            }
        }
        MintersCmd::Add(args) => {
            let mint = resolve_mint(&args.mint)?;
            let config_pda = find_config_pda(&mint, &stablecoin_core::ID).0;
            let target = parse_pubkey(&args.address)?;
            let existing = fetch_role_account(
                ctx_ref,
                &find_role_pda(&config_pda, &target, &stablecoin_core::ID).0,
            )?;
            let existing_roles = existing.map(|entry| entry.roles).unwrap_or(0);
            let roles = existing_roles | ROLE_MINTER;
            let quota = parse_amount(&args.quota, 0)?;
            let ix = build_update_roles_instruction(UpdateRolesParams {
                authority: ctx_ref.payer.pubkey(),
                config_pda,
                target,
                roles,
                mint_quota: Some(quota),
            })?;
            let signature = send_transaction(ctx_ref, vec![ix], vec![])?;
            let explorer = explorer_url(&signature, ctx_ref.cluster);
            if ctx_ref.output == OutputFormat::Json {
                let output = SimpleOutput {
                    signature: signature.clone(),
                    explorer,
                };
                print_json(&output)
            } else {
                println!("Added minter: {}", target);
                println!("Tx: {}", signature);
                if let Some(url) = explorer {
                    println!("Explorer: {}", url);
                }
                Ok(())
            }
        }
        MintersCmd::Remove(args) => {
            let mint = resolve_mint(&args.mint)?;
            let config_pda = find_config_pda(&mint, &stablecoin_core::ID).0;
            let target = parse_pubkey(&args.address)?;
            let existing = fetch_role_account(
                ctx_ref,
                &find_role_pda(&config_pda, &target, &stablecoin_core::ID).0,
            )?
            .ok_or_else(|| anyhow!("Role account not found"))?;
            let roles = existing.roles & !ROLE_MINTER;
            let ix = build_update_roles_instruction(UpdateRolesParams {
                authority: ctx_ref.payer.pubkey(),
                config_pda,
                target,
                roles,
                mint_quota: None,
            })?;
            let signature = send_transaction(ctx_ref, vec![ix], vec![])?;
            let explorer = explorer_url(&signature, ctx_ref.cluster);
            if ctx_ref.output == OutputFormat::Json {
                let output = SimpleOutput {
                    signature: signature.clone(),
                    explorer,
                };
                print_json(&output)
            } else {
                println!("Removed minter: {}", target);
                println!("Tx: {}", signature);
                if let Some(url) = explorer {
                    println!("Explorer: {}", url);
                }
                Ok(())
            }
        }
    }
}

fn handle_status(ctx: &OwnedContext, args: &MintOnlyArgs) -> Result<()> {
    let ctx_ref = ctx.as_ref();
    let mint = resolve_mint(&args.mint)?;
    let config_pda = find_config_pda(&mint, &stablecoin_core::ID).0;
    let config = fetch_config(ctx_ref, &config_pda)?;
    let supply = ctx_ref.client.get_token_supply(&mint)?;
    let roles = list_role_accounts(ctx_ref, &config_pda)?;
    let blacklist = list_blacklist_entries(ctx_ref, &config_pda)?;
    let preset = if config.features.transfer_hook {
        "SSS-2"
    } else {
        "SSS-1"
    };
    if ctx_ref.output == OutputFormat::Json {
        let output = StatusOutput {
            mint: mint.to_string(),
            preset: preset.to_string(),
            is_paused: config.is_paused,
            supply: supply.amount,
            total_minted: config.total_minted.to_string(),
            total_burned: config.total_burned.to_string(),
            features: FeatureOutput {
                permanent_delegate: config.features.permanent_delegate,
                transfer_hook: config.features.transfer_hook,
                confidential: config.features.confidential,
                default_frozen: config.features.default_frozen,
            },
            role_counts: RoleCounts {
                masters: count_role(&roles, ROLE_MASTER_AUTHORITY),
                minters: count_role(&roles, ROLE_MINTER),
                burners: count_role(&roles, ROLE_BURNER),
                freezers: count_role(&roles, ROLE_FREEZER),
                pausers: count_role(&roles, ROLE_PAUSER),
                blacklisters: count_role(&roles, ROLE_BLACKLISTER),
                seizers: count_role(&roles, ROLE_SEIZER),
            },
            blacklisted: blacklist
                .iter()
                .filter(|entry| entry.account.is_active)
                .count(),
        };
        print_json(&output)
    } else {
        println!("Stablecoin status");
        println!("Mint: {}", mint);
        println!("Preset: {}", preset);
        println!(
            "Status: {}",
            if config.is_paused { "Paused" } else { "Active" }
        );
        println!(
            "Supply: {}",
            format_amount(supply.amount.parse::<u64>()?, config.decimals)
        );
        println!("Total minted: {}", config.total_minted);
        println!("Total burned: {}", config.total_burned);
        println!("Features:");
        println!(
            "  Permanent delegate: {}",
            config.features.permanent_delegate
        );
        println!("  Transfer hook: {}", config.features.transfer_hook);
        println!("  Confidential: {}", config.features.confidential);
        println!("  Default frozen: {}", config.features.default_frozen);
        println!("Roles:");
        println!("  Masters: {}", count_role(&roles, ROLE_MASTER_AUTHORITY));
        println!("  Minters: {}", count_role(&roles, ROLE_MINTER));
        println!("  Burners: {}", count_role(&roles, ROLE_BURNER));
        println!("  Freezers: {}", count_role(&roles, ROLE_FREEZER));
        println!("  Pausers: {}", count_role(&roles, ROLE_PAUSER));
        println!("  Blacklisters: {}", count_role(&roles, ROLE_BLACKLISTER));
        println!("  Seizers: {}", count_role(&roles, ROLE_SEIZER));
        println!(
            "Blacklisted: {}",
            blacklist
                .iter()
                .filter(|entry| entry.account.is_active)
                .count()
        );
        Ok(())
    }
}

fn handle_supply(ctx: &OwnedContext, args: &MintOnlyArgs) -> Result<()> {
    let ctx_ref = ctx.as_ref();
    let mint = resolve_mint(&args.mint)?;
    let supply = ctx_ref.client.get_token_supply(&mint)?;
    if ctx_ref.output == OutputFormat::Json {
        let output = SupplyOutput {
            mint: mint.to_string(),
            supply: supply.amount,
        };
        print_json(&output)
    } else {
        println!("Supply: {}", supply.amount);
        Ok(())
    }
}

fn handle_holders(ctx: &OwnedContext, args: &HoldersArgs) -> Result<()> {
    let ctx_ref = ctx.as_ref();
    let mint = resolve_mint(&args.mint)?;
    let config_pda = find_config_pda(&mint, &stablecoin_core::ID).0;
    let stablecoin_config = fetch_config(ctx_ref, &config_pda)?;
    let min_balance = match args.min_balance.as_deref() {
        Some(value) => Some(parse_amount(value, stablecoin_config.decimals)?),
        None => None,
    };

    let mut rpc_config = RpcProgramAccountsConfig::default();
    rpc_config.filters = Some(vec![RpcFilterType::Memcmp(Memcmp::new_base58_encoded(
        0,
        mint.as_ref(),
    ))]);
    rpc_config.account_config = RpcAccountInfoConfig {
        encoding: None,
        commitment: Some(ctx_ref.commitment),
        data_slice: None,
        min_context_slot: None,
    };

    let accounts = ctx_ref
        .client
        .get_program_accounts_with_config(&spl_token_2022::id(), rpc_config)?;

    let mut holders = Vec::new();
    for (pubkey, account) in accounts {
        let parsed = StateWithExtensions::<TokenAccount2022>::unpack(&account.data)
            .map_err(|err| anyhow!("Failed to decode token account: {}", err))?;
        let amount = parsed.base.amount;
        if let Some(min) = min_balance {
            if amount < min {
                continue;
            }
        }
        holders.push(HolderInfo {
            owner: parsed.base.owner.to_string(),
            token_account: pubkey.to_string(),
            amount,
        });
    }

    holders.sort_by(|a, b| b.amount.cmp(&a.amount));

    if ctx_ref.output == OutputFormat::Json {
        let output = HoldersOutput {
            holders: holders.clone(),
        };
        print_json(&output)
    } else {
        if holders.is_empty() {
            println!("No holders found");
        } else {
            for holder in holders {
                println!(
                    "{} {}",
                    holder.owner,
                    format_amount(holder.amount, stablecoin_config.decimals)
                );
            }
        }
        Ok(())
    }
}

fn handle_audit_log(ctx: &OwnedContext, _args: &AuditLogArgs) -> Result<()> {
    if ctx.output == OutputFormat::Json {
        let output = AuditLogOutput { entries: vec![] };
        print_json(&output)
    } else {
        println!("Audit log backend not configured");
        Ok(())
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
struct SssConfig {
    token: TokenConfig,
    extensions: Option<ExtensionsConfig>,
    roles: Option<RolesConfig>,
    network: Option<NetworkConfig>,
}

#[derive(Debug, Clone, Default, Deserialize)]
struct TokenConfig {
    name: String,
    symbol: String,
    decimals: Option<u8>,
    uri: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ExtensionsConfig {
    permanent_delegate: Option<bool>,
    transfer_hook: Option<bool>,
    default_account_frozen: Option<bool>,
    confidential_transfer: Option<bool>,
}

impl Default for ExtensionsConfig {
    fn default() -> Self {
        Self {
            permanent_delegate: Some(false),
            transfer_hook: Some(false),
            default_account_frozen: Some(false),
            confidential_transfer: Some(false),
        }
    }
}

impl ExtensionsConfig {
    fn from_preset(enable_transfer_hook: bool) -> Self {
        Self {
            permanent_delegate: Some(enable_transfer_hook),
            transfer_hook: Some(enable_transfer_hook),
            default_account_frozen: Some(false),
            confidential_transfer: Some(false),
        }
    }
}

#[derive(Debug, Clone, Default, Deserialize)]
struct RolesConfig {
    minters: Option<Vec<MinterConfig>>,
    freezers: Option<Vec<String>>,
    pausers: Option<Vec<String>>,
    blacklisters: Option<Vec<String>>,
    seizers: Option<Vec<String>>,
    burners: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize)]
struct MinterConfig {
    pubkey: String,
    quota: u64,
}

#[derive(Debug, Clone, Deserialize)]
struct NetworkConfig {
    cluster: Option<String>,
    keypair_path: Option<String>,
    commitment: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct SolanaCliConfig {
    json_rpc_url: String,
    keypair_path: String,
    commitment: Option<String>,
}

#[derive(Clone, Copy)]
struct RoleAssignment {
    roles: u8,
    mint_quota: Option<u64>,
}

fn build_role_assignments(config: &RolesConfig) -> Result<HashMap<Pubkey, RoleAssignment>> {
    let mut assignments = HashMap::new();

    if let Some(minters) = &config.minters {
        for entry in minters {
            let pubkey = parse_pubkey(&entry.pubkey)?;
            let assignment = assignments.entry(pubkey).or_insert(RoleAssignment {
                roles: 0,
                mint_quota: None,
            });
            assignment.roles |= ROLE_MINTER;
            assignment.mint_quota = Some(entry.quota);
        }
    }

    apply_role_list(&mut assignments, config.freezers.as_ref(), ROLE_FREEZER)?;
    apply_role_list(&mut assignments, config.pausers.as_ref(), ROLE_PAUSER)?;
    apply_role_list(
        &mut assignments,
        config.blacklisters.as_ref(),
        ROLE_BLACKLISTER,
    )?;
    apply_role_list(&mut assignments, config.seizers.as_ref(), ROLE_SEIZER)?;
    apply_role_list(&mut assignments, config.burners.as_ref(), ROLE_BURNER)?;

    Ok(assignments)
}

fn apply_role_list(
    assignments: &mut HashMap<Pubkey, RoleAssignment>,
    list: Option<&Vec<String>>,
    role: u8,
) -> Result<()> {
    if let Some(list) = list {
        for entry in list {
            let pubkey = parse_pubkey(entry)?;
            let assignment = assignments.entry(pubkey).or_insert(RoleAssignment {
                roles: 0,
                mint_quota: None,
            });
            assignment.roles |= role;
        }
    }
    Ok(())
}

fn load_sss_config(path: &str) -> Result<SssConfig> {
    let contents = fs::read_to_string(expand_tilde(path))
        .with_context(|| format!("Failed to read config: {}", path))?;
    toml::from_str(&contents).context("Failed to parse config")
}

fn load_solana_cli_config() -> Result<SolanaCliConfig> {
    let path = default_solana_config_path();
    let contents = fs::read_to_string(&path)
        .with_context(|| format!("Failed to read Solana config: {}", path.display()))?;
    serde_yaml::from_str(&contents).context("Failed to parse Solana config")
}

fn default_solana_config_path() -> PathBuf {
    let mut path = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    path.push(".config");
    path.push("solana");
    path.push("cli");
    path.push("config.yml");
    path
}

fn resolve_cluster(input: &str) -> Result<ClusterInfo> {
    let lowered = input.to_lowercase();
    let (url, label) = match lowered.as_str() {
        "devnet" => (
            "https://api.devnet.solana.com".to_string(),
            Some("devnet".to_string()),
        ),
        "testnet" => (
            "https://api.testnet.solana.com".to_string(),
            Some("testnet".to_string()),
        ),
        "mainnet" | "mainnet-beta" => (
            "https://api.mainnet-beta.solana.com".to_string(),
            Some("mainnet-beta".to_string()),
        ),
        "localnet" => (
            "http://127.0.0.1:8899".to_string(),
            Some("localnet".to_string()),
        ),
        _ => {
            if input.starts_with("http://") || input.starts_with("https://") {
                let label = if lowered.contains("devnet") {
                    Some("devnet".to_string())
                } else if lowered.contains("testnet") {
                    Some("testnet".to_string())
                } else if lowered.contains("mainnet") {
                    Some("mainnet-beta".to_string())
                } else {
                    None
                };
                (input.to_string(), label)
            } else {
                return Err(anyhow!("Unknown cluster: {}", input));
            }
        }
    };
    Ok(ClusterInfo { url, label })
}

fn parse_commitment(value: Option<&str>) -> CommitmentConfig {
    match value.unwrap_or("confirmed") {
        "processed" => CommitmentConfig::processed(),
        "finalized" => CommitmentConfig::finalized(),
        _ => CommitmentConfig::confirmed(),
    }
}

fn expand_tilde(path: &str) -> PathBuf {
    if let Some(stripped) = path.strip_prefix("~/").or_else(|| path.strip_prefix("~\\")) {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    }
    PathBuf::from(path)
}

fn parse_pubkey(value: &str) -> Result<Pubkey> {
    Pubkey::from_str(value).map_err(|_| anyhow!("Invalid pubkey: {}", value))
}

fn resolve_mint(mint: &Option<String>) -> Result<Pubkey> {
    let value = mint.as_deref().ok_or_else(|| anyhow!("Missing --mint"))?;
    parse_pubkey(value)
}

fn parse_amount(value: &str, decimals: u8) -> Result<u64> {
    let sanitized = value.replace('_', "");
    if let Some((whole, fractional)) = sanitized.split_once('.') {
        let whole_value: u64 = if whole.is_empty() { 0 } else { whole.parse()? };
        let mut fraction = fractional.to_string();
        if fraction.len() > decimals as usize {
            return Err(anyhow!("Too many decimal places"));
        }
        while fraction.len() < decimals as usize {
            fraction.push('0');
        }
        let fractional_value: u64 = if fraction.is_empty() {
            0
        } else {
            fraction.parse()?
        };
        let scale = 10u64
            .checked_pow(decimals as u32)
            .ok_or_else(|| anyhow!("Decimal overflow"))?;
        let total = whole_value
            .checked_mul(scale)
            .and_then(|value| value.checked_add(fractional_value))
            .ok_or_else(|| anyhow!("Amount overflow"))?;
        Ok(total)
    } else {
        Ok(sanitized.parse()?)
    }
}

fn format_amount(amount: u64, decimals: u8) -> String {
    if decimals == 0 {
        return amount.to_string();
    }
    let scale = 10u64.pow(decimals as u32);
    let whole = amount / scale;
    let frac = amount % scale;
    format!("{}.{:0width$}", whole, frac, width = decimals as usize)
}

fn explorer_url(signature: &str, cluster: &ClusterInfo) -> Option<String> {
    cluster.label.as_ref().map(|label| {
        format!(
            "https://explorer.solana.com/tx/{}?cluster={}",
            signature, label
        )
    })
}

fn send_transaction(
    ctx: AppContext<'_>,
    instructions: Vec<Instruction>,
    extra_signers: Vec<&Keypair>,
) -> Result<String> {
    let blockhash = ctx.client.get_latest_blockhash()?;
    let mut transaction = Transaction::new_with_payer(&instructions, Some(&ctx.payer.pubkey()));
    let mut signers: Vec<&dyn Signer> = vec![ctx.payer];
    for signer in extra_signers {
        if signer.pubkey() != ctx.payer.pubkey() {
            signers.push(signer);
        }
    }
    transaction.sign(&signers, blockhash);
    let signature = ctx.client.send_and_confirm_transaction(&transaction)?;
    Ok(signature.to_string())
}

fn fetch_config(ctx: AppContext<'_>, config_pda: &Pubkey) -> Result<StablecoinConfig> {
    let account = ctx.client.get_account(config_pda)?;
    let mut data = account.data.as_slice();
    StablecoinConfig::try_deserialize(&mut data).context("Failed to decode config")
}

fn fetch_role_account(ctx: AppContext<'_>, role_pda: &Pubkey) -> Result<Option<RoleAccount>> {
    let account = match ctx.client.get_account(role_pda) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };
    let mut data = account.data.as_slice();
    let decoded = RoleAccount::try_deserialize(&mut data).context("Failed to decode role")?;
    Ok(Some(decoded))
}

fn fetch_blacklist_entry(
    ctx: AppContext<'_>,
    entry_pda: &Pubkey,
) -> Result<Option<BlacklistEntry>> {
    let account = match ctx.client.get_account(entry_pda) {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };
    let mut data = account.data.as_slice();
    let decoded =
        BlacklistEntry::try_deserialize(&mut data).context("Failed to decode blacklist")?;
    Ok(Some(decoded))
}

fn list_role_accounts(
    ctx: AppContext<'_>,
    config_pda: &Pubkey,
) -> Result<Vec<AccountEntry<RoleAccount>>> {
    let mut config = RpcProgramAccountsConfig::default();
    config.filters = Some(vec![RpcFilterType::Memcmp(Memcmp::new_base58_encoded(
        8,
        config_pda.as_ref(),
    ))]);
    config.account_config = RpcAccountInfoConfig {
        encoding: None,
        commitment: Some(ctx.commitment),
        data_slice: None,
        min_context_slot: None,
    };

    let accounts = ctx
        .client
        .get_program_accounts_with_config(&stablecoin_core::ID, config)?;

    let mut result = Vec::new();
    for (_key, account) in accounts {
        let mut data = account.data.as_slice();
        if let Ok(decoded) = RoleAccount::try_deserialize(&mut data) {
            result.push(AccountEntry { account: decoded });
        }
    }
    Ok(result)
}

fn list_blacklist_entries(
    ctx: AppContext<'_>,
    config_pda: &Pubkey,
) -> Result<Vec<AccountEntry<BlacklistEntry>>> {
    let mut config = RpcProgramAccountsConfig::default();
    config.filters = Some(vec![RpcFilterType::Memcmp(Memcmp::new_base58_encoded(
        8,
        config_pda.as_ref(),
    ))]);
    config.account_config = RpcAccountInfoConfig {
        encoding: None,
        commitment: Some(ctx.commitment),
        data_slice: None,
        min_context_slot: None,
    };

    let accounts = ctx
        .client
        .get_program_accounts_with_config(&stablecoin_core::ID, config)?;

    let mut result = Vec::new();
    for (_key, account) in accounts {
        let mut data = account.data.as_slice();
        if let Ok(decoded) = BlacklistEntry::try_deserialize(&mut data) {
            result.push(AccountEntry { account: decoded });
        }
    }
    Ok(result)
}

fn count_role(entries: &[AccountEntry<RoleAccount>], role: u8) -> usize {
    entries
        .iter()
        .filter(|entry| entry.account.roles & role != 0)
        .count()
}

fn fetch_token_account(ctx: AppContext<'_>, address: &Pubkey) -> Result<TokenAccountInfo> {
    let account = ctx.client.get_account(address)?;
    let parsed = StateWithExtensions::<TokenAccount2022>::unpack(&account.data)
        .map_err(|err| anyhow!("Failed to decode token account: {}", err))?;
    Ok(TokenAccountInfo {
        owner: parsed.base.owner,
        mint: parsed.base.mint,
    })
}

#[derive(Clone)]
struct AccountEntry<T> {
    account: T,
}

#[derive(Clone, Copy)]
struct TokenAccountInfo {
    owner: Pubkey,
    mint: Pubkey,
}

fn find_config_pda(mint: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"stablecoin", mint.as_ref()], program_id)
}

fn find_role_pda(config: &Pubkey, authority: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"role", config.as_ref(), authority.as_ref()], program_id)
}

fn find_blacklist_pda(config: &Pubkey, wallet: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[b"blacklist", config.as_ref(), wallet.as_ref()],
        program_id,
    )
}

fn find_extra_account_metas_pda(mint: &Pubkey, hook_program: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"extra-account-metas", mint.as_ref()], hook_program)
}

fn anchor_discriminator(name: &str) -> [u8; 8] {
    let mut hasher = Sha256::new();
    hasher.update(format!("global:{}", name));
    let hash = hasher.finalize();
    let mut output = [0u8; 8];
    output.copy_from_slice(&hash[..8]);
    output
}

fn build_instruction(
    name: &str,
    data: Vec<u8>,
    accounts: Vec<AccountMeta>,
    program_id: Pubkey,
) -> Instruction {
    let mut payload = Vec::with_capacity(8 + data.len());
    payload.extend_from_slice(&anchor_discriminator(name));
    payload.extend_from_slice(&data);
    Instruction {
        program_id,
        accounts,
        data: payload,
    }
}

#[derive(BorshSerialize)]
struct InitializeArgs {
    name: String,
    symbol: String,
    uri: String,
    decimals: u8,
    enable_permanent_delegate: bool,
    enable_transfer_hook: bool,
    default_account_frozen: bool,
    transfer_hook_program: Option<Pubkey>,
}

#[derive(BorshSerialize)]
struct UpdateRolesArgs {
    target: Pubkey,
    roles: u8,
    mint_quota: Option<u64>,
}

#[derive(BorshSerialize)]
struct MintBurnArgs {
    amount: u64,
}

#[derive(BorshSerialize)]
struct AddToBlacklistArgs {
    wallet: Pubkey,
    reason: String,
}

struct InitializeParams {
    authority: Pubkey,
    mint: Pubkey,
    name: String,
    symbol: String,
    uri: String,
    decimals: u8,
    enable_permanent_delegate: bool,
    enable_transfer_hook: bool,
    default_account_frozen: bool,
    transfer_hook_program: Option<Pubkey>,
    config_pda: Pubkey,
    role_pda: Pubkey,
    extra_metas: Option<Pubkey>,
}

fn build_initialize_instruction(params: InitializeParams) -> Result<Instruction> {
    let mut accounts = vec![
        AccountMeta::new(params.authority, true),
        AccountMeta::new(params.mint, true),
        AccountMeta::new(params.config_pda, false),
        AccountMeta::new(params.role_pda, false),
    ];

    if params.enable_transfer_hook {
        let extra_metas = params
            .extra_metas
            .ok_or_else(|| anyhow!("Missing extra account metas"))?;
        let hook_program = params
            .transfer_hook_program
            .ok_or_else(|| anyhow!("Missing transfer hook program"))?;
        accounts.push(AccountMeta::new(extra_metas, false));
        accounts.push(AccountMeta::new_readonly(hook_program, false));
    }

    accounts.push(AccountMeta::new_readonly(spl_token_2022::id(), false));
    accounts.push(AccountMeta::new_readonly(system_program::id(), false));
    accounts.push(AccountMeta::new_readonly(sysvar::rent::id(), false));

    let data = InitializeArgs {
        name: params.name,
        symbol: params.symbol,
        uri: params.uri,
        decimals: params.decimals,
        enable_permanent_delegate: params.enable_permanent_delegate,
        enable_transfer_hook: params.enable_transfer_hook,
        default_account_frozen: params.default_account_frozen,
        transfer_hook_program: if params.enable_transfer_hook {
            params.transfer_hook_program
        } else {
            None
        },
    }
    .try_to_vec()?;

    Ok(build_instruction(
        "initialize",
        data,
        accounts,
        stablecoin_core::ID,
    ))
}

struct MintParams {
    minter: Pubkey,
    mint: Pubkey,
    recipient: Pubkey,
    recipient_ata: Pubkey,
    amount: u64,
}

fn build_mint_instruction(params: MintParams) -> Result<Instruction> {
    let config_pda = find_config_pda(&params.mint, &stablecoin_core::ID).0;
    let role_pda = find_role_pda(&config_pda, &params.minter, &stablecoin_core::ID).0;
    let accounts = vec![
        AccountMeta::new(params.minter, true),
        AccountMeta::new(config_pda, false),
        AccountMeta::new(role_pda, false),
        AccountMeta::new_readonly(params.mint, false),
        AccountMeta::new_readonly(params.recipient, false),
        AccountMeta::new(params.recipient_ata, false),
        AccountMeta::new_readonly(spl_token_2022::id(), false),
        AccountMeta::new_readonly(spl_associated_token_account::id(), false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];
    let data = MintBurnArgs {
        amount: params.amount,
    }
    .try_to_vec()?;
    Ok(build_instruction(
        "mint",
        data,
        accounts,
        stablecoin_core::ID,
    ))
}

struct BurnParams {
    burner: Pubkey,
    mint: Pubkey,
    burner_ata: Pubkey,
    amount: u64,
}

fn build_burn_instruction(params: BurnParams) -> Result<Instruction> {
    let config_pda = find_config_pda(&params.mint, &stablecoin_core::ID).0;
    let role_pda = find_role_pda(&config_pda, &params.burner, &stablecoin_core::ID).0;
    let accounts = vec![
        AccountMeta::new(params.burner, true),
        AccountMeta::new(config_pda, false),
        AccountMeta::new(role_pda, false),
        AccountMeta::new(params.mint, false),
        AccountMeta::new(params.burner_ata, false),
        AccountMeta::new_readonly(spl_token_2022::id(), false),
    ];
    let data = MintBurnArgs {
        amount: params.amount,
    }
    .try_to_vec()?;
    Ok(build_instruction(
        "burn",
        data,
        accounts,
        stablecoin_core::ID,
    ))
}

struct FreezeParams {
    freezer: Pubkey,
    mint: Pubkey,
    target_ata: Pubkey,
}

fn build_freeze_instruction(params: FreezeParams) -> Result<Instruction> {
    let config_pda = find_config_pda(&params.mint, &stablecoin_core::ID).0;
    let role_pda = find_role_pda(&config_pda, &params.freezer, &stablecoin_core::ID).0;
    let accounts = vec![
        AccountMeta::new(params.freezer, true),
        AccountMeta::new(config_pda, false),
        AccountMeta::new(role_pda, false),
        AccountMeta::new_readonly(params.mint, false),
        AccountMeta::new(params.target_ata, false),
        AccountMeta::new_readonly(spl_token_2022::id(), false),
    ];
    Ok(build_instruction(
        "freeze_account",
        Vec::new(),
        accounts,
        stablecoin_core::ID,
    ))
}

fn build_thaw_instruction(params: FreezeParams) -> Result<Instruction> {
    let config_pda = find_config_pda(&params.mint, &stablecoin_core::ID).0;
    let role_pda = find_role_pda(&config_pda, &params.freezer, &stablecoin_core::ID).0;
    let accounts = vec![
        AccountMeta::new(params.freezer, true),
        AccountMeta::new(config_pda, false),
        AccountMeta::new(role_pda, false),
        AccountMeta::new_readonly(params.mint, false),
        AccountMeta::new(params.target_ata, false),
        AccountMeta::new_readonly(spl_token_2022::id(), false),
    ];
    Ok(build_instruction(
        "thaw_account",
        Vec::new(),
        accounts,
        stablecoin_core::ID,
    ))
}

struct PauseParams {
    pauser: Pubkey,
    config_pda: Pubkey,
    unpause: bool,
}

fn build_pause_instruction(params: PauseParams) -> Result<Instruction> {
    let role_pda = find_role_pda(&params.config_pda, &params.pauser, &stablecoin_core::ID).0;
    let accounts = vec![
        AccountMeta::new(params.pauser, true),
        AccountMeta::new(params.config_pda, false),
        AccountMeta::new(role_pda, false),
    ];
    let name = if params.unpause { "unpause" } else { "pause" };
    Ok(build_instruction(
        name,
        Vec::new(),
        accounts,
        stablecoin_core::ID,
    ))
}

struct UpdateRolesParams {
    authority: Pubkey,
    config_pda: Pubkey,
    target: Pubkey,
    roles: u8,
    mint_quota: Option<u64>,
}

fn build_update_roles_instruction(params: UpdateRolesParams) -> Result<Instruction> {
    let role_pda = find_role_pda(&params.config_pda, &params.authority, &stablecoin_core::ID).0;
    let target_role_pda = find_role_pda(&params.config_pda, &params.target, &stablecoin_core::ID).0;
    let accounts = vec![
        AccountMeta::new(params.authority, true),
        AccountMeta::new(params.config_pda, false),
        AccountMeta::new(role_pda, false),
        AccountMeta::new(target_role_pda, false),
        AccountMeta::new_readonly(params.target, false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];
    let data = UpdateRolesArgs {
        target: params.target,
        roles: params.roles,
        mint_quota: params.mint_quota,
    }
    .try_to_vec()?;
    Ok(build_instruction(
        "update_roles",
        data,
        accounts,
        stablecoin_core::ID,
    ))
}

struct AddToBlacklistParams {
    blacklister: Pubkey,
    config_pda: Pubkey,
    wallet: Pubkey,
    reason: String,
}

fn build_add_to_blacklist_instruction(params: AddToBlacklistParams) -> Result<Instruction> {
    let role_pda = find_role_pda(
        &params.config_pda,
        &params.blacklister,
        &stablecoin_core::ID,
    )
    .0;
    let blacklist_pda =
        find_blacklist_pda(&params.config_pda, &params.wallet, &stablecoin_core::ID).0;
    let accounts = vec![
        AccountMeta::new(params.blacklister, true),
        AccountMeta::new(params.config_pda, false),
        AccountMeta::new(role_pda, false),
        AccountMeta::new(blacklist_pda, false),
        AccountMeta::new_readonly(params.wallet, false),
        AccountMeta::new_readonly(system_program::id(), false),
    ];
    let data = AddToBlacklistArgs {
        wallet: params.wallet,
        reason: params.reason,
    }
    .try_to_vec()?;
    Ok(build_instruction(
        "add_to_blacklist",
        data,
        accounts,
        stablecoin_core::ID,
    ))
}

struct RemoveFromBlacklistParams {
    blacklister: Pubkey,
    config_pda: Pubkey,
    blacklist_entry: Pubkey,
}

fn build_remove_from_blacklist_instruction(
    params: RemoveFromBlacklistParams,
) -> Result<Instruction> {
    let role_pda = find_role_pda(
        &params.config_pda,
        &params.blacklister,
        &stablecoin_core::ID,
    )
    .0;
    let accounts = vec![
        AccountMeta::new(params.blacklister, true),
        AccountMeta::new(params.config_pda, false),
        AccountMeta::new(role_pda, false),
        AccountMeta::new(params.blacklist_entry, false),
    ];
    Ok(build_instruction(
        "remove_from_blacklist",
        Vec::new(),
        accounts,
        stablecoin_core::ID,
    ))
}

struct SeizeParams {
    seizer: Pubkey,
    config_pda: Pubkey,
    mint: Pubkey,
    target_ata: Pubkey,
    treasury_ata: Pubkey,
    blacklist_entry: Pubkey,
}

fn build_seize_instruction(params: SeizeParams) -> Result<Instruction> {
    let role_pda = find_role_pda(&params.config_pda, &params.seizer, &stablecoin_core::ID).0;
    let accounts = vec![
        AccountMeta::new(params.seizer, true),
        AccountMeta::new(params.config_pda, false),
        AccountMeta::new(role_pda, false),
        AccountMeta::new_readonly(params.mint, false),
        AccountMeta::new(params.target_ata, false),
        AccountMeta::new(params.treasury_ata, false),
        AccountMeta::new_readonly(params.blacklist_entry, false),
        AccountMeta::new_readonly(spl_token_2022::id(), false),
    ];
    Ok(build_instruction(
        "seize",
        Vec::new(),
        accounts,
        stablecoin_core::ID,
    ))
}

#[derive(Serialize)]
struct InitOutput {
    mint: String,
    config: String,
    preset: String,
    signature: String,
    explorer: Option<String>,
}

#[derive(Serialize)]
struct MintOutput {
    signature: String,
    explorer: Option<String>,
    new_supply: String,
}

#[derive(Serialize)]
struct BurnOutput {
    signature: String,
    explorer: Option<String>,
    new_supply: String,
}

#[derive(Serialize)]
struct SimpleOutput {
    signature: String,
    explorer: Option<String>,
}

#[derive(Serialize)]
struct BlacklistStatusOutput {
    wallet: String,
    is_active: bool,
    reason: Option<String>,
}

#[derive(Serialize)]
struct MintersOutput {
    minters: Vec<MinterInfo>,
}

#[derive(Serialize, Clone)]
struct MinterInfo {
    address: String,
    quota: Option<String>,
}

#[derive(Serialize)]
struct StatusOutput {
    mint: String,
    preset: String,
    is_paused: bool,
    supply: String,
    total_minted: String,
    total_burned: String,
    features: FeatureOutput,
    role_counts: RoleCounts,
    blacklisted: usize,
}

#[derive(Serialize)]
struct FeatureOutput {
    permanent_delegate: bool,
    transfer_hook: bool,
    confidential: bool,
    default_frozen: bool,
}

#[derive(Serialize)]
struct RoleCounts {
    masters: usize,
    minters: usize,
    burners: usize,
    freezers: usize,
    pausers: usize,
    blacklisters: usize,
    seizers: usize,
}

#[derive(Serialize)]
struct SupplyOutput {
    mint: String,
    supply: String,
}

#[derive(Serialize, Clone)]
struct HolderInfo {
    owner: String,
    token_account: String,
    amount: u64,
}

#[derive(Serialize)]
struct HoldersOutput {
    holders: Vec<HolderInfo>,
}

#[derive(Serialize)]
struct AuditLogOutput {
    entries: Vec<serde_json::Value>,
}

fn print_json<T: Serialize>(value: &T) -> Result<()> {
    println!("{}", serde_json::to_string_pretty(value)?);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{format_amount, parse_amount};

    #[test]
    fn parses_amounts_with_decimals() {
        assert_eq!(parse_amount("1", 6).unwrap(), 1);
        assert_eq!(parse_amount("1.5", 6).unwrap(), 1_500_000);
        assert_eq!(parse_amount("0.000001", 6).unwrap(), 1);
        assert_eq!(parse_amount("1_000.25", 2).unwrap(), 100_025);
    }

    #[test]
    fn formats_amounts() {
        assert_eq!(format_amount(1_500_000, 6), "1.500000");
        assert_eq!(format_amount(100, 2), "1.00");
        assert_eq!(format_amount(10, 0), "10");
    }
}
