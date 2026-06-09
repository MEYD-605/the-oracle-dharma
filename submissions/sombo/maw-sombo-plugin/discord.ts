/**
 * Discord client for maw sombo plugin
 * Outbound: reply, react, fetch — ผ่าน Discord REST API
 */

import { readFileSync, existsSync } from "fs";
import type {
  DiscordConfig,
  AccessJson,
  DiscordMessage,
  DiscordSendOptions,
  DiscordReactOptions,
  DiscordFetchOptions,
} from "./types";

const API_BASE = "https://discord.com/api/v10";

export class DiscordClient {
  private token: string;
  private config: DiscordConfig;

  constructor(config: DiscordConfig) {
    this.config = config;
    this.token = this.loadToken();
  }

  private loadToken(): string {
    const envPath = `${this.config.stateDir}/.env`;
    if (!existsSync(envPath)) {
      throw new Error(`Token file not found: ${envPath}`);
    }
    const content = readFileSync(envPath, "utf-8");
    for (const line of content.split("\n")) {
      if (line.startsWith("DISCORD_BOT_TOKEN=")) {
        return line.trim().split("=", 2)[1];
      }
    }
    throw new Error("DISCORD_BOT_TOKEN not found in .env");
  }

  private async apiRequest(method: string, path: string, body?: Record<string, unknown>): Promise<unknown> {
    const headers: Record<string, string> = {
      "Authorization": `Bot ${this.token}`,
      "User-Agent": "DiscordBot (https://clubsxai.com, 1.0) maw-sombo-plugin",
    };
    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 204) return {};
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Discord API ${res.status}: ${text}`);
    }
    return res.json();
  }

  async reply(options: DiscordSendOptions): Promise<DiscordMessage> {
    const payload: Record<string, unknown> = { content: options.text };
    if (options.replyTo) {
      payload.message_reference = { message_id: options.replyTo };
    }
    return this.apiRequest("POST", `/channels/${options.chatId}/messages`, payload) as Promise<DiscordMessage>;
  }

  async react(options: DiscordReactOptions): Promise<void> {
    const encoded = encodeURIComponent(options.emoji);
    await this.apiRequest(
      "PUT",
      `/channels/${options.chatId}/messages/${options.messageId}/reactions/${encoded}/@me`
    );
  }

  async fetchMessages(options: DiscordFetchOptions): Promise<DiscordMessage[]> {
    const limit = Math.min(options.limit, 100);
    return this.apiRequest("GET", `/channels/${options.chatId}/messages?limit=${limit}`) as Promise<DiscordMessage[]>;
  }

  loadAccess(): AccessJson {
    if (!existsSync(this.config.accessFile)) {
      return { dmPolicy: "allowlist", allowFrom: [], groups: {} };
    }
    return JSON.parse(readFileSync(this.config.accessFile, "utf-8")) as AccessJson;
  }
}
