import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import dotenv from "dotenv";
import { defineConfig } from "hardhat/config";

dotenv.config();

const ogAccounts = process.env.OG_PRIVATE_KEY ? [process.env.OG_PRIVATE_KEY] : [];
const sepoliaPrivateKey = process.env.SEPOLIA_PRIVATE_KEY ?? process.env.OG_PRIVATE_KEY;
const sepoliaAccounts = sepoliaPrivateKey ? [sepoliaPrivateKey] : [];

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    ogGalileo: {
      type: "http",
      chainType: "l1",
      url: process.env.OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai",
      accounts: ogAccounts,
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com",
      accounts: sepoliaAccounts,
    },
  },
});
