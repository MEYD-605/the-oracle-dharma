/**
 * maw sombo — Secretary plugin for Oracle Council
 *
 * Commands:
 *   maw sombo say [msg]     — say hello
 *   maw sombo status        — show oracle info
 *   maw sombo perf [repo]   — daily performance from git
 *   maw sombo track [repo]  — file lifecycle tracker
 *   maw sombo relay         — show Discord relay status
 */

import { execFileSync } from "child_process";

function gitCmd(repo: string, args: string[]): string {
  try {
    return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function shellCount(cmd: string, grepPattern: string): string {
  try {
    const out = execFileSync("bash", ["-c", `${cmd} | { grep -c '${grepPattern}' || true; }`], { encoding: "utf8" });
    return out.trim();
  } catch {
    return "0";
  }
}

export default function (api: any) {

  api.command("say", async (log: any, args: string[]) => {
    const msg = args.join(" ") || "สวัสดีครับ";
    log(`🛡️ Sombo: ${msg}`);
    log(`   เลขาส่วนตัว — คุยกับพี่ได้ทุกเรื่อง งานหนักส่งต่อให้คนเหมาะ`);
  });

  api.command("status", async (log: any) => {
    log(`🛡️ Sombo Oracle — The Secretary`);
    log(`   no:     88`);
    log(`   role:   Secretary + Bo-facing + School Responder`);
    log(`   human:  Bo (borde9902)`);
    log(`   model:  Claude Opus 4.6 (1M context)`);
    log(`   host:   AI-Core LXC 110`);
    log(`   repo:   MEYD-605/sombo-oracle`);
    log(`   born:   2026-04-20 (bud from No.1 Lord Knight)`);
  });

  api.command("perf", async (log: any, args: string[]) => {
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

      const out = gitCmd(repo, [
        "log", "--all",
        `--after=${dayStr} 00:00`, `--before=${nextStr} 00:00`,
        "--oneline"
      ]);
      const commits = out ? out.split("\n").filter(Boolean).length : 0;
      const bar = commits > 0 ? "█".repeat(Math.min(commits, 20)) : "·";
      log(`  ${dayStr}  ${String(commits).padStart(2)} commits  ${bar}`);
    }

    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    log(`🤖 sombo perf · ${new Date().toISOString()}`);
  });

  api.command("track", async (log: any, args: string[]) => {
    const repo = args[0] || ".";

    const totalCommits = gitCmd(repo, ["rev-list", "--all", "--count"]);
    const currentFiles = gitCmd(repo, ["ls-files"]).split("\n").filter(Boolean).length;
    const firstCommit = gitCmd(repo, ["log", "--all", "--reverse", "--format=%ai", "-1"]);
    const lastCommit = gitCmd(repo, ["log", "--all", "--format=%ai", "-1"]);

    const created = shellCount(
      `git -C "${repo}" log --all --diff-filter=A --name-status --pretty=format:""`,
      "^A"
    );
    const deleted = shellCount(
      `git -C "${repo}" log --all --diff-filter=D --name-status --pretty=format:""`,
      "^D"
    );

    log(`📊 Git Tracker — ${repo}`);
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    log(`  Commits      : ${totalCommits}`);
    log(`  First commit : ${firstCommit}`);
    log(`  Last commit  : ${lastCommit}`);
    log(`  Current files: ${currentFiles}`);
    log(`  ➕ Created    : ${created}`);
    log(`  🗑️ Deleted    : ${deleted}`);
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    log(`🤖 sombo track · ${new Date().toISOString()}`);
  });

  api.command("relay", async (log: any) => {
    log(`🛡️ Sombo Discord Relay Architecture`);
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    log(`  Sombo (Claude Code):`);
    log(`    Inbound  : auto-deliver via MCP plugin`);
    log(`    Outbound : reply tool direct`);
    log(``);
    log(`  agy agents (No.6/8/10):`);
    log(`    Inbound  : relay.py polls REST API`);
    log(`    Outbound : reply tool direct`);
    log(``);
    log(`  Flow: Discord → relay poll (5s) → allowFrom → maw hey`);
    log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  });
}
