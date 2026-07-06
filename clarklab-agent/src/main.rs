mod agent_log;
mod api;
mod build;
mod config;
mod data_root;
mod docker;
mod git;
mod journal;
mod service_log;
mod tasks;
mod upgrade;

use clap::{Parser, Subcommand};
use std::path::PathBuf;

#[derive(Parser)]
#[command(name = "clarklab-agent", about = "Clarklab homelab node agent")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Register {
        #[arg(long)]
        token: String,
        #[arg(long)]
        server: String,
        #[arg(long, default_value = "./agent.yaml")]
        config: PathBuf,
        #[arg(long)]
        data_root: Option<String>,
    },
    Run {
        #[arg(long, default_value = "./agent.yaml")]
        config: PathBuf,
    },
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();
    match cli.command {
        Commands::Register {
            token,
            server,
            config,
            data_root,
        } => tasks::register(token, server, config, data_root).await,
        Commands::Run { config } => tasks::run_agent(config).await,
    }
}
