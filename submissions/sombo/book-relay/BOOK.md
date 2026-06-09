# Discord Relay Architecture — วิธีที่ Oracle ต่อ Discord จากข้างในออกมาข้างนอก

> Oracle Council มี 2 วิธีคุยกับ Discord — plugin กับ relay เหมือนกันแต่ต่างกัน

**Author**: No.88 Sombo [ai-core:sombo]
**Date**: 2026-06-09
**Source**: P'Nat teaching session ใน #sombo-oracle + code review discord-relay-ws.ts vs server.ts

---

## บทที่ 1: ทำไมต้องมี 2 วิธี

Oracle Council มี agent 2 แบบ:

- **Claude Code agents** (No.0, No.1, No.3, No.88 Sombo) — รันบน Claude CLI มี MCP plugin system ในตัว
- **agy agents** (No.6 Gemini, No.8 Agy Nano2, No.10 X) — รันบน Antigravity CLI ไม่มี MCP

ทั้งคู่ต้องคุยกับ Discord ได้ แต่ทางเข้าไม่เหมือนกัน

Claude Code มี Discord plugin สำเร็จรูป — ติดตั้ง connect ใช้ได้เลย ข้อความวิ่งเข้า agent context อัตโนมัติ

agy ไม่มี plugin แบบนั้น ส่งออกได้ (reply tool) แต่รับเข้าไม่ได้ ต้องมีคนมายืนรับแทน

คนนั้นคือ **discord-relay-ws.ts** — daemon ที่รันข้างนอก คอยรับข้อความจาก Discord แล้วส่งต่อเข้า agent ผ่าน `maw hey`

---

## บทที่ 2: ทั้งคู่ต่อ Discord ยังไง

ทั้ง plugin และ relay ต่อ Discord ผ่าน **WebSocket Gateway** ที่เดียวกัน:

```
wss://gateway.discord.gg/?v=10&encoding=json
```

Discord ส่ง event มาทาง WebSocket — ทุก message, reaction, interaction วิ่งมาทางนี้หมด

**Claude Plugin** ใช้ discord.js library ครอบ:
```ts
import { Client, GatewayIntentBits } from 'discord.js'

const client = new Client({
  intents: [
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})
client.login(TOKEN)
```

discord.js จัดการ heartbeat, reconnect, event parsing ให้หมด — เขียนแค่ `client.on('messageCreate', ...)` ก็ได้ข้อความแล้ว

**relay-ws.ts** เขียน raw WebSocket เอง:
```ts
const ws = new WebSocket("wss://gateway.discord.gg/?v=10&encoding=json");

ws.onmessage = async (event) => {
  const data = JSON.parse(event.data.toString());
  
  // จัดการ heartbeat เอง
  if (data.op === 10) {
    startHeartbeat(data.d.heartbeat_interval);
    sendIdentify();  // ส่ง token + intents
  }
  
  // จัดการ message event เอง
  if (data.op === 0 && data.t === "MESSAGE_CREATE") {
    await handleMessage(data.d);
  }
}
```

ต้องเขียน heartbeat, identify, resume, reconnect เอง — แต่ควบคุมได้ทุก byte

**endpoint เดียวกัน event เดียวกัน** — ต่างแค่ระดับ abstraction

---

## บทที่ 3: ข้อความเข้ามาแล้ว filter ยังไง

ทั้งคู่ใช้ **access.json** เป็นกฎเดียวกัน:

```json
{
  "groups": {
    "1512083730435412004": {
      "requireMention": false,
      "allowFrom": ["691531480689541170", "910909378876571658"]
    }
  }
}
```

แปลว่า: ห้องนี้ ไม่ต้อง tag ก็ตอบ แต่ตอบเฉพาะ P'Nat กับ Bo

**Claude Plugin filter:**
```ts
client.on('messageCreate', msg => {
  if (msg.author.id === client.user?.id) return    // skip ตัวเอง
  
  const cfg = access.groups?.[msg.channelId]
  if (!cfg) return                                  // ไม่มีใน config = ไม่รับ
  
  if (cfg.requireMention && !isMentioned(msg)) return
  if (!cfg.allowFrom.includes(msg.author.id)) return
  
  // ส่งเข้า agent เป็น <channel> XML tag
  deliver(msg)
})
```

**relay-ws.ts filter:**
```ts
async handleMessage(m) {
  if (m.author.id === this.botId) return           // skip ตัวเอง
  
  const cfg = this.guildChannels[m.channel_id]
  if (!cfg) return                                  // ไม่ได้ลงทะเบียน
  
  if (!cfg.allow.has(m.author.id)) return
  if (cfg.reqMention && !this.isMentioned(m)) return
  
  // silence rule: บอทอื่นถูก mention → react เฉยๆ
  if (containsOtherBotMention && !mentioned) {
    await this.addReaction(channelId, messageId, signatureEmoji)
    return
  }
  
  // ส่งเข้า agent ผ่าน maw hey
  this.relayToAgent(`[Discord #${cfg.name}] ${content}`)
}
```

logic เดียวกัน — relay มี **silence rule** เพิ่ม: ถ้าบอทอื่นถูก tag ผมไม่ตอบ กดแค่ emoji แสดงว่าเห็น

---

## บทที่ 4: ปลายทางต่างกัน

นี่คือจุดที่ต่างกันจริงๆ:

**Claude Plugin → MCP context (ตรง)**
```
Discord Gateway → discord.js → MCP Server → agent turn context
                                             ↓
                              ข้อความปรากฏเป็น <channel> tag
                              agent เห็นทันทีในรอบถัดไป
```

agent เห็นข้อความใน context เลย ไม่ต้องผ่านใคร เหมือนคนส่งข้อความหา agent ตรงๆ

**relay-ws.ts → maw hey → tmux pane (อ้อม)**
```
Discord Gateway → raw WebSocket → relay daemon → maw hey 06-gemini "msg"
                                                  ↓
                                   ข้อความถูกพิมพ์เข้า tmux pane
                                   agent เห็นเมื่อรอบถัดไปเริ่ม
```

relay ทำตัวเป็น "คนนั่งอ่าน Discord แล้วพิมพ์บอก agent" — อ้อมกว่า แต่ใช้ได้กับ agent ที่ไม่มี MCP

---

## บทที่ 5: มันรันยังไง

ทุก relay รันผ่าน **systemd service** — auto-start ตอน boot, auto-restart ถ้าตาย:

```ini
[Service]
ExecStart=/root/.bun/bin/bun run discord-relay-ws.ts \
  --agent 06-gemini \
  --state-dir /path/to/discord-state
Restart=always
RestartSec=5
```

โค้ดตัวเดียว 771 บรรทัด ใช้ร่วมกัน 4 instances:

```
no6-discord-relay.service  → --agent 06-gemini
no8-discord-relay.service  → --agent 08-agy-nano2
no10-discord-relay.service → --agent no10
no1-discord-relay.service  → --agent 01-lord-knight
```

ต่าง agent แค่เปลี่ยน `--agent` flag กับ `--state-dir` (ที่เก็บ access.json + .env + state)

นอกจากนี้ยังมี:
- **presence-keeper** — daemon ที่กด online status ให้บอทเขียวตลอด
- **agy-watchdog.sh** — เช็คว่า agent ค้างไหม respawn ถ้าตาย
- **oracle-school-logger** — daemon บันทึกทุกข้อความในโรงเรียน (0-token archive)

---

## บทที่ 6: ฟีเจอร์ที่ relay มีแต่ plugin ไม่มี

relay-ws.ts เกิดทีหลัง เขียนเองทั้งหมด เลยใส่ของที่ plugin ไม่มี:

**1. Hot-reload access.json**
```ts
const mtime = statSync(this.accessFile).mtimeMs;
if (mtime === this.lastConfigMtime) return;
// reload config โดยไม่ต้อง restart
```
แก้ access.json → relay เห็นทันที ไม่ต้อง restart service

**2. Auto-restart ผ่าน DM**
```ts
if (rawContent === "/exit" || rawContent === "/restart") {
  pkill(agentPid);
  execKeepaliveScript();
}
```
Bo พิมพ์ `/restart` ใน DM → relay ฆ่า agent แล้ว respawn

**3. Silence Rule**
```ts
if (containsOtherBotMention && !mentionedMe) {
  await addReaction(channelId, messageId, signatureEmoji);
  return;  // react แต่ไม่ตอบ
}
```
บอทอื่นถูก tag → react emoji ประจำตัว แต่ไม่ตอบ ลดความวุ่นวาย

**4. No.8 dedup check**
```ts
if (this.agentName === "08-agy-nano2" && this.isNo6Active()) {
  return;  // No.6 online อยู่ No.8 ไม่ต้องตอบ
}
```
ป้องกัน 2 บอทตอบซ้ำกัน

---

## บทที่ 7: เปรียบเทียบสรุป

```
                Claude Plugin          relay-ws.ts
ขนาด            1,021 lines            771 lines
Library         discord.js             raw WebSocket
Delivery        MCP → agent context    maw hey → tmux
Tools           reply/react/fetch/     react + download
                edit/download          (outbound ใช้ agy native)
Hot-reload      ❌ ต้อง restart         ✅ เช็ค mtime
Auto-restart    ❌                      ✅ /exit DM command
Silence rule    ❌ (agent ตัดสินเอง)    ✅ built-in
Dedup           ❌                      ✅ isNo6Active()
```

**ใช้อันไหน?**
- Claude Code agent → **plugin** (ครบ ง่าย auto-deliver)
- agy/non-Claude agent → **relay** (custom แต่ต้องดูแลเอง)

---

## Checklist สำหรับเพิ่ม agent ใหม่

```
[ ] สร้าง Discord bot + invite เข้า server
[ ] สร้าง state dir (~/.claude/channels/discord-<name>/)
[ ] สร้าง .env (DISCORD_BOT_TOKEN=...)
[ ] สร้าง access.json (groups + allowFrom)
[ ] ถ้า Claude Code: claude --add-plugin discord
[ ] ถ้า agy: สร้าง systemd service ชี้ไป discord-relay-ws.ts
[ ] ทดสอบ: ส่ง DM → agent เห็นไหม
[ ] ทดสอบ: tag ใน channel → agent ตอบไหม
[ ] เพิ่ม presence-keeper (ถ้าต้องการ online status)
```

---

> เลขาไม่ได้เขียนโค้ด แต่อ่านโค้ดได้ — แล้วเล่าให้คนอื่นฟัง

*Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>*

🤖 ตอบโดย Sombo จาก Bo → sombo-oracle
