#!/usr/bin/env node

import { Command } from "commander";
import pino from "pino";
import { loadConfig } from "./config/loader.js";
import { Gateway } from "./gateway.js";
import { PairingManager } from "./auth/pairing.js";
import {
  writeFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  renameSync,
} from "node:fs";
import { resolve, join } from "node:path";

const program = new Command();

program
  .name("claude-gateway")
  .description("Gateway bridging chat platforms to Claude Code CLI")
  .version("0.1.0");

// --- start ---
program
  .command("start")
  .description("Start the gateway (foreground)")
  .option("-c, --config <path>", "Path to config file")
  .option("-v, --verbose", "Enable debug logging")
  .action(async (opts: { config?: string; verbose?: boolean }) => {
    const config = loadConfig(opts.config);
    if (opts.verbose) config.gateway.logLevel = "debug";

    const log = pino({
      level: config.gateway.logLevel,
      transport:
        config.gateway.logFormat === "pretty"
          ? { target: "pino-pretty", options: { translateTime: "HH:MM:ss" } }
          : undefined,
    });

    const dataDir = config.gateway.dataDir.replace(/^~/, process.env.HOME ?? "");
    const lockPath = join(resolve(dataDir), "gateway.lock");
    mkdirSync(resolve(dataDir), { recursive: true });

    if (existsSync(lockPath)) {
      try {
        const lockData = JSON.parse(readFileSync(lockPath, "utf-8"));
        try {
          process.kill(lockData.pid, 0);
          console.error(`Gateway already running (PID ${lockData.pid}).`);
          process.exit(1);
        } catch {
          log.warn("Removing stale lock file");
        }
      } catch {
        // ignore malformed lock file
      }
    }

    writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }),
    );

    const gateway = new Gateway(config, log);

    const shutdown = async (signal: string) => {
      log.info({ signal }, "Received signal, shutting down...");
      await gateway.stop();
      try {
        unlinkSync(lockPath);
      } catch {
        // ignore
      }
      process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    try {
      await gateway.start();
    } catch (err) {
      log.fatal({ err }, "Failed to start gateway");
      try {
        unlinkSync(lockPath);
      } catch {
        // ignore
      }
      process.exit(1);
    }
  });

// --- status ---
program
  .command("status")
  .description("Check if gateway is running")
  .action(() => {
    const dataDir = resolve(process.env.HOME ?? "~", ".claude-gateway");
    const lockPath = join(dataDir, "gateway.lock");
    if (!existsSync(lockPath)) {
      console.log("Gateway is not running.");
      return;
    }
    try {
      const lockData = JSON.parse(readFileSync(lockPath, "utf-8"));
      try {
        process.kill(lockData.pid, 0);
        console.log(
          `Gateway is running (PID ${lockData.pid}, started ${lockData.createdAt})`,
        );
      } catch {
        console.log("Gateway is not running (stale lock file).");
        unlinkSync(lockPath);
      }
    } catch {
      console.log("Gateway is not running (invalid lock file).");
    }
  });

// --- pairing ---
const pairing = program.command("pairing").description("Manage pairing requests");

pairing
  .command("list")
  .description("List pending pairing requests")
  .action(() => {
    const dataDir = resolve(process.env.HOME ?? "~", ".claude-gateway");
    const pairingPath = join(dataDir, "credentials", "telegram-pairing.json");
    if (!existsSync(pairingPath)) {
      console.log("No pending pairing requests.");
      return;
    }
    const pm = new PairingManager(pairingPath);
    const pending = pm.listPending();
    if (pending.length === 0) {
      console.log("No pending pairing requests.");
      return;
    }
    console.log("Pending pairing requests:\n");
    console.log("Code      Sender ID    Name         Channel    Requested");
    console.log("--------  -----------  -----------  ---------  ---------");
    for (const req of pending) {
      const age = formatAge(Date.now() - req.createdAt);
      console.log(
        `${req.code}  ${req.senderId.padEnd(11)}  ${req.senderName.padEnd(11)}  ${req.channelType.padEnd(9)}  ${age}`,
      );
    }
  });

pairing
  .command("approve")
  .description("Approve a pairing code")
  .argument("<code>", "Pairing code to approve")
  .option("--notify", "Send approval notification to user")
  .action((code: string) => {
    const dataDir = resolve(process.env.HOME ?? "~", ".claude-gateway");
    const pairingPath = join(dataDir, "credentials", "telegram-pairing.json");
    const allowPath = join(dataDir, "credentials", "telegram-allowFrom.json");
    const pm = new PairingManager(pairingPath);
    const result = pm.approve(code);
    if (!result) {
      console.error(`No pending request with code "${code}".`);
      process.exit(1);
    }
    let allowFrom: string[] = [];
    if (existsSync(allowPath)) {
      try {
        allowFrom = JSON.parse(readFileSync(allowPath, "utf-8")).allowFrom ?? [];
      } catch {
        // ignore malformed file
      }
    }
    if (!allowFrom.includes(result.senderId)) {
      allowFrom.push(result.senderId);
      mkdirSync(join(dataDir, "credentials"), { recursive: true });
      const tmp = allowPath + ".tmp";
      writeFileSync(tmp, JSON.stringify({ version: 1, allowFrom }, null, 2));
      renameSync(tmp, allowPath);
    }
    console.log(`Approved sender ${result.senderId}. They can now use the bot.`);
  });

// --- allow ---
const allow = program.command("allow").description("Manage allowlist");

allow
  .command("list")
  .description("List allowed users")
  .argument("[channel]", "Channel name", "telegram")
  .action((channel: string) => {
    const dataDir = resolve(process.env.HOME ?? "~", ".claude-gateway");
    const allowPath = join(dataDir, "credentials", `${channel}-allowFrom.json`);
    if (!existsSync(allowPath)) {
      console.log(`No allowlist for ${channel}.`);
      return;
    }
    const data = JSON.parse(readFileSync(allowPath, "utf-8"));
    const list: string[] = data.allowFrom ?? [];
    if (list.length === 0) {
      console.log(`Allowlist for ${channel} is empty.`);
    } else {
      console.log(`Allowed users for ${channel}:`);
      list.forEach((id: string) => console.log(`  ${id}`));
    }
  });

allow
  .command("add")
  .description("Add user to allowlist")
  .argument("<channel>", "Channel name")
  .argument("<id>", "User ID")
  .action((channel: string, id: string) => {
    const dataDir = resolve(process.env.HOME ?? "~", ".claude-gateway");
    const allowPath = join(dataDir, "credentials", `${channel}-allowFrom.json`);
    let allowFrom: string[] = [];
    if (existsSync(allowPath)) {
      try {
        allowFrom = JSON.parse(readFileSync(allowPath, "utf-8")).allowFrom ?? [];
      } catch {
        // ignore malformed file
      }
    }
    if (allowFrom.includes(id)) {
      console.log(`User ${id} is already in ${channel} allowlist.`);
      return;
    }
    allowFrom.push(id);
    mkdirSync(join(dataDir, "credentials"), { recursive: true });
    const tmp = allowPath + ".tmp";
    writeFileSync(tmp, JSON.stringify({ version: 1, allowFrom }, null, 2));
    renameSync(tmp, allowPath);
    console.log(`Added ${id} to ${channel} allowlist.`);
  });

allow
  .command("remove")
  .description("Remove user from allowlist")
  .argument("<channel>", "Channel name")
  .argument("<id>", "User ID")
  .action((channel: string, id: string) => {
    const dataDir = resolve(process.env.HOME ?? "~", ".claude-gateway");
    const allowPath = join(dataDir, "credentials", `${channel}-allowFrom.json`);
    if (!existsSync(allowPath)) {
      console.log(`No allowlist for ${channel}.`);
      return;
    }
    let allowFrom: string[] = [];
    try {
      allowFrom = JSON.parse(readFileSync(allowPath, "utf-8")).allowFrom ?? [];
    } catch {
      // ignore malformed file
    }
    const filtered = allowFrom.filter((x: string) => x !== id);
    if (filtered.length === allowFrom.length) {
      console.log(`User ${id} not found in ${channel} allowlist.`);
      return;
    }
    const tmp = allowPath + ".tmp";
    writeFileSync(tmp, JSON.stringify({ version: 1, allowFrom: filtered }, null, 2));
    renameSync(tmp, allowPath);
    console.log(`Removed ${id} from ${channel} allowlist.`);
  });

function formatAge(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

program.parse();
