/**
 * Shared types for maw sombo plugin
 * ห้ามใช้ any/unknown — ประกาศ type ครบทุกตัว (P'Nat directive)
 */

export interface DiscordConfig {
  token: string;
  stateDir: string;
  accessFile: string;
}

export interface ChannelConfig {
  requireMention: boolean;
  allowFrom: string[];
}

export interface AccessJson {
  dmPolicy: string;
  allowFrom: string[];
  groups: Record<string, ChannelConfig>;
}

export interface DiscordMessage {
  id: string;
  channel_id: string;
  content: string;
  author: {
    id: string;
    username: string;
  };
  attachments: DiscordAttachment[];
  message_reference?: {
    message_id: string;
  };
}

export interface DiscordAttachment {
  id: string;
  filename: string;
  url: string;
  size: number;
}

export interface DiscordSendOptions {
  chatId: string;
  text: string;
  replyTo?: string;
  files?: string[];
}

export interface DiscordReactOptions {
  chatId: string;
  messageId: string;
  emoji: string;
}

export interface DiscordFetchOptions {
  chatId: string;
  limit: number;
}

export interface GitDayStats {
  date: string;
  commits: number;
  filesChanged: number;
  insertions: number;
  deletions: number;
  contributors: number;
}

export interface PluginLogger {
  (message: string): void;
}

export interface PluginApi {
  command(name: string, handler: (log: PluginLogger, args: string[]) => Promise<void>): void;
}
