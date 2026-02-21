use anyhow::Result;
use clap::{Parser, Subcommand, ValueEnum};

#[derive(Parser)]
#[command(name = "sss-token", version, about = "Solana Stablecoin Standard CLI")]
struct Cli {
    #[arg(long, default_value = "devnet")]
    cluster: String,

    #[arg(long)]
    keypair: Option<String>,

    #[arg(long, value_enum, default_value = "text")]
    output: OutputFormat,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Clone, ValueEnum)]
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
    Pause,
    Unpause,
    Blacklist(BlacklistCmd),
    Seize(SeizeArgs),
    Minters(MintersCmd),
    Status,
    Supply,
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
}

#[derive(Parser)]
struct SeizeArgs {
    address: String,

    #[arg(long)]
    to: String,
}

#[derive(Subcommand)]
enum MintersCmd {
    List,
    Add(MinterAddArgs),
    Remove(AddressArgs),
}

#[derive(Parser)]
struct MinterAddArgs {
    address: String,

    #[arg(long)]
    quota: String,
}

#[derive(Parser)]
struct HoldersArgs {
    #[arg(long)]
    min_balance: Option<String>,
}

#[derive(Parser)]
struct AuditLogArgs {
    #[arg(long)]
    action: Option<String>,

    #[arg(long)]
    from: Option<String>,

    #[arg(long)]
    to: Option<String>,
}

fn main() -> Result<()> {
    let cli = Cli::parse();
    run(cli)
}

fn run(_cli: Cli) -> Result<()> {
    println!("CLI scaffolded. Implementation pending.");
    Ok(())
}
