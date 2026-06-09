/**
 * maw sombo — Secretary plugin for Oracle Council
 *
 * Commands:
 *   maw sombo say [msg]                — say hello
 *   maw sombo status                   — show oracle info
 *   maw sombo reply <chatId> <text>    — reply to Discord channel
 *   maw sombo react <chatId> <msgId> <emoji> — react to message
 *   maw sombo fetch <chatId> [limit]   — fetch recent messages
 *   maw sombo perf [repo]              — weekly performance chart
 *   maw sombo track [repo]             — file lifecycle tracker
 *   maw sombo relay                    — show relay architecture
 */

import { execFileSync } from "child_process";
import { DiscordClient } from "./discord";
import type { PluginApi, PluginLogger, GitDayStats } from "./types";

const DISCORD_STATE_DIR = process.env.DISCORD_STATE_DIR
  || `${process.env.HOME}/.claude/channels/discord-sombo`;

const discord = new DiscordClient({
  token: "",
  stateDir: DISCORD_STATE_DIR,
  accessFile: `${DISCORD_STATE_DIR}/access.json`,
});

function gitCmd(repo: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function getDayStats(repo: string, dayStr: string, nextStr: string): GitDayStats {
  const out = gitCmd(repo, [
    "log", "--all",
    `--after=${dayStr} 00:00`, `--before=${nextStr} 00:00`,
    "--oneline"
  ]);
  const commits = out ? out.split("\n").filter(Boolean).length : 0;

  return {
    date: dayStr,
    commits,
    filesChanged: 0,
    insertions: 0,
    deletions: 0,
    contributors: 0,
  };
}

export default function (api: PluginApi) {

  api.command("say", async (log: PluginLogger, args: string[]) => {
    const msg = args.join(" ") || "สวัสดีครับ";
    log(`🛡️ Sombo: ${msg}`);
    log(`   เลขาส่วนตัว — คุยกับพี่ได้ทุกเรื่อง งานหนักส่งต่อให้คนเหมาะ`);
  });

  api.command("status", async (log: PluginLogger) => {
    log(`🛡️ Sombo Oracle — The Secretary`);
    log(`   no:     88`);
    log(`   role:   Secretary + Bo-facing + School Responder`);
    log(`   human:  Bo (borde9902)`);
    log(`   model:  Claude Opus 4.6 (1M context)`);
    log(`   host:   AI-Core LXC 110`);
    log(`   repo:   MEYD-605/sombo-oracle`);
    log(`   born:   2026-04-20 (bud from No.1 Lord Knight)`);
  });

  // --- Discord outbound commands (maw plugin แทน raw REST) ---

  api.command("reply", async (log: PluginLogger, args: string[]) => {
    const chatId = args[0];
    const text = args.slice(1).join(" ");
    if (!chatId || !text) {
      log(`Usage: maw sombo reply <chatId> <text>`);
      return;
    }
    try {
      const msg = await discord.reply({ chatId, text });
      log(`✅ Sent to ${chatId}: ${msg.id}`);
    } catch (e: unknown) {
      const err = e as Error;
      log(`❌ ${err.message}`);
    }
  });

  api.command("react", async (log: PluginLogger, args: string[]) => {
    const chatId = args[0];
    const messageId = args[1];
    const emoji = args[2] || "🛡️";
    if (!chatId || !messageId) {
      log(`Usage: maw sombo react <chatId> <messageId> [emoji]`);
      return;
    }
    try {
      await discord.react({ chatId, messageId, emoji });
      log(`✅ Reacted ${emoji} on ${messageId}`);
    } catch (e: unknown) {
      const err = e as Error;
      log(`❌ ${err.message}`);
    }
  });

  api.command("fetch", async (log: PluginLogger, args: string[]) => {
    const chatId = args[0];
    const limit = parseInt(args[1] || "10", 10);
    if (!chatId) {
      log(`Usage: maw sombo fetch <chatId> [limit]`);
      return;
    }
    try {
      const msgs = await discord.fetchMessages({ chatId, limit });
      log(`📨 ${msgs.length} messages from ${chatId}:`);
      for (const m of msgs.reverse()) {
        const ts = new Date(Number((BigInt(m.id) >> 22n) + 1420070400000n)).toISOString().slice(11, 16);
        log(`  [${ts}] ${m.author.username}: ${m.content.slice(0, 80)}`);
      }
    } catch (e: unknown) {
      const err = e as Error;
      log(`❌ ${err.message}`);
    }
  });

  // --- Performance & Git tracking ---

  api.command("perf", async (log: PluginLogger, args: string[]) => {
    const repo = args[0] || ".";
    log(`📊 Oracle Performance — ${repo}`);
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const day = new Date(today);
      day.setDate(day.getDate() - i);
      const dayStr = day.toISOString().split("T")[0];
      const nextDay = new Date(day);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextStr = nextDay.toISOString().split("T")[0];

      const stats = getDayStats(repo, dayStr, nextStr);
      const bar = stats.commits > 0 ? "█".repeat(Math.min(stats.commits, 20)) : "·";
      log(`  ${dayStr}  ${String(stats.commits).padStart(2)} commits  ${bar}`);
    }
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  });

  api.command("track", async (log: PluginLogger, args: string[]) => {
    const repo = args[0] || ".";
    const totalCommits = gitCmd(repo, ["rev-list", "--all", "--count"]);
    const currentFiles = gitCmd(repo, ["ls-files"]).split("\n").filter(Boolean).length;
    const firstCommit = gitCmd(repo, ["log", "--all", "--reverse", "--format=%ai", "-1"]);
    const lastCommit = gitCmd(repo, ["log", "--all", "--format=%ai", "-1"]);

    log(`📊 Git Tracker — ${repo}`);
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    log(`  Commits      : ${totalCommits}`);
    log(`  First commit : ${firstCommit}`);
    log(`  Last commit  : ${lastCommit}`);
    log(`  Current files: ${currentFiles}`);
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  });

  api.command("relay", async (log: PluginLogger) => {
    log(`🛡️ Sombo Discord Relay Architecture`);
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    log(`  Claude Code (Sombo):`);
    log(`    Inbound  : MCP plugin auto-deliver (WebSocket)`);
    log(`    Outbound : maw sombo reply <chatId> <text>`);
    log(``);
    log(`  agy agents (No.6/8/10):`);
    log(`    Inbound  : relay-ws.ts → maw hey (WebSocket)`);
    log(`    Outbound : agy native discord reply`);
    log(``);
    log(`  Config: ~/.claude/channels/discord-<name>/`);
    log(`    .env         → DISCORD_BOT_TOKEN`);
    log(`    access.json  → allowFrom + groups + requireMention`);
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  });
}
