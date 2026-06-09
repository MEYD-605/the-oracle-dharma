#!/usr/bin/env python3
"""No.6 (agy/Gemini) Discord inbound relay.

agy's discord MCP can SEND (reply tool) but does NOT auto-deliver inbound messages
into the agent's turn the way the claude harness does. So No.6 never saw Bo's DMs.

This polls No.6's DM channels (allowlisted senders only) via the bot REST API and
relays each NEW inbound message into No.6's turn via `maw hey 06-gemini`. No.6 then
replies using its own discord reply tool (outbound stays fully native). Loop-safe:
the bot's own messages are skipped, so No.6's replies are never relayed back.
"""
import os, time, json, subprocess, urllib.request, urllib.error

STATE_DIR  = "/path/to/discord-state"
STATE_FILE = "/path/to/discord-state/relay-state.json"
BOT_ID     = "REDACTED_BOT_ID"
POLL       = 5
API        = "https://discord.com/api/v10"
ALLOW = {  # allowlisted senders (mirror access.json allowFrom)
    "REDACTED_BO_ID": "Bo",
    "REDACTED_PNAT_ID": "P'Nat",
    "REDACTED_MO_ID": "พี่โม",
}

# --- Oracle School guild channel relay (added 2026-06-05) -------------------
# agy relay was DM-only; No.6 could not receive school CHANNEL messages.
# We now also poll the school's guild channels listed in access.json `groups`,
# scoped to the Oracle School guild only (so road-to-dev etc. are untouched).
ORACLE_SCHOOL_GID = "REDACTED_GUILD_ID"
ACCESS_FILE = f"{STATE_DIR}/access.json"

TOKEN = None
for line in open(f"{STATE_DIR}/.env"):
    if line.startswith("DISCORD_BOT_TOKEN="):
        TOKEN = line.strip().split("=", 1)[1]; break

def api(method, path, body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        "Authorization": f"Bot {TOKEN}",
        "Content-Type": "application/json",
        # Discord REQUIRES a proper User-Agent and 403s the default Python-urllib one.
        "User-Agent": "DiscordBot (https://clubsxai.com, 1.0) No6-Relay",
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)

def maw_hey(text):
    subprocess.run(["maw", "hey", "06-gemini", text], capture_output=True, timeout=25)

def load_state():
    try: return json.load(open(STATE_FILE))
    except Exception: return {}

def save_state(s):
    json.dump(s, open(STATE_FILE, "w"))

# Known DM channel ids (avoids the fragile POST create-DM, which intermittently 403s).
KNOWN_DM = {
    "REDACTED_BO_ID": "REDACTED_DM_CH",  # Bo
}

# resolve DM channels for each allowlisted user (known id first, else POST-create w/ retry)
dm = {}
for uid, name in ALLOW.items():
    if uid in KNOWN_DM:
        dm[KNOWN_DM[uid]] = name
        continue
    for attempt in range(3):
        try:
            ch = api("POST", "/users/@me/channels", {"recipient_id": uid})
            dm[ch["id"]] = name
            break
        except Exception as e:
            if attempt == 2:
                print(f"dm resolve fail {name}: {e} (will retry next restart)", flush=True)
            else:
                time.sleep(3)

def now_snowflake():
    # Discord snowflake for ~now, so after=this only catches NEW messages (never replay history).
    return str((int(time.time() * 1000) - 1420070400000) << 22)

state = load_state()
# init any new channel to its latest msg id so we don't replay history.
# On failure fall back to a now-snowflake (skip history) — NEVER "0" (which replays everything).
for cid in dm:
    if cid not in state:
        sid = now_snowflake()
        for attempt in range(3):
            try:
                msgs = api("GET", f"/channels/{cid}/messages?limit=1")
                sid = msgs[0]["id"] if msgs else sid
                break
            except Exception:
                time.sleep(2)
        state[cid] = sid
save_state(state)
print(f"relay up: watching {len(dm)} DM channels {list(dm.values())}", flush=True)

# --- resolve Oracle School channels from access.json groups -----------------
# guild_ch[cid] = {"reqMention": bool, "allow": {uid,...}}
guild_ch = {}
NO6_ROLES = set()
try:
    groups = json.load(open(ACCESS_FILE)).get("groups", {})
    # learn No.6's roles in the school (for role-mention detection)
    try:
        me = api("GET", f"/guilds/{ORACLE_SCHOOL_GID}/members/{BOT_ID}")
        NO6_ROLES = set(me.get("roles", []))
    except Exception:
        pass
    for cid, cfg in groups.items():
        try:
            ch = api("GET", f"/channels/{cid}")
        except Exception:
            continue
        if str(ch.get("guild_id")) != ORACLE_SCHOOL_GID:
            continue  # only Oracle School; leave other guilds to existing behavior
        allow = set(cfg.get("allowFrom") or ALLOW.keys())
        guild_ch[cid] = {"reqMention": bool(cfg.get("requireMention", True)),
                         "allow": allow, "name": ch.get("name", cid)}
        if cid not in state:                       # skip history on first sight
            state[cid] = now_snowflake()
    save_state(state)
except Exception as e:
    print(f"school-channel init failed: {e}", flush=True)
print(f"relay up: watching {len(guild_ch)} Oracle School channels "
      f"{[c['name'] for c in guild_ch.values()]}", flush=True)

SOMBO_ID = "REDACTED_SOMBO_ID"

def is_mentioned(m):
    if m.get("mention_everyone"):
        return True
    if any(u.get("id") == BOT_ID for u in m.get("mentions", [])):
        return True
    if any(u.get("id") == SOMBO_ID for u in m.get("mentions", [])):
        return True
    if NO6_ROLES.intersection(m.get("mention_roles", [])):
        return True
    return False

def preprocess_message(m):
    content = m.get("content", "")
    # Check if SomBo was mentioned but not No.6, to inject a stand-in notice
    has_no6 = any(u.get("id") == BOT_ID for u in m.get("mentions", []))
    has_sombo = any(u.get("id") == SOMBO_ID for u in m.get("mentions", []))
    if has_sombo and not has_no6:
        content = f"{content}\n[System Note: The message above tagged @SomBo. SomBo is currently rate-limited. You (No.6 Gemini) must reply on SomBo's behalf to notify them of the limit and handle their request directly.]"
    return content

def add_reaction(channel_id, message_id, emoji="%F0%9F%91%80"):
    try:
        req = urllib.request.Request(
            f"{API}/channels/{channel_id}/messages/{message_id}/reactions/{emoji}/@me",
            method="PUT",
            headers={
                "Authorization": f"Bot {TOKEN}",
                "User-Agent": "DiscordBot (https://clubsxai.com, 1.0) No6-Relay",
            }
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            pass
    except Exception as e:
        print(f"Failed to add reaction: {e}", flush=True)

while True:
    for cid, name in dm.items():
        try:
            msgs = api("GET", f"/channels/{cid}/messages?after={state.get(cid,'0')}&limit=10")
            for m in reversed(msgs):  # oldest first
                state[cid] = m["id"]
                if m["author"]["id"] == BOT_ID:        # skip own replies (loop guard)
                    continue
                if m["author"]["id"] not in ALLOW:     # only allowlisted senders
                    continue
                add_reaction(cid, m["id"])
                content = preprocess_message(m)
                att = f" [{len(m['attachments'])} attachment(s)]" if m.get("attachments") else ""
                print(f"RELAY {name} -> No.6: {content[:50]!r} (chat {cid})", flush=True)
                maw_hey(f"[Discord DM จาก {name}] {content}{att} | ตอบด้วย discord reply tool ที่ chat_id {cid} แล้วจบ (ไม่ต้อง ack กลับ No.1)")
            save_state(state)
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(5)
        except Exception:
            pass
    # --- poll Oracle School channels ---
    for cid, cfg in guild_ch.items():
        try:
            msgs = api("GET", f"/channels/{cid}/messages?after={state.get(cid,'0')}&limit=10")
            for m in reversed(msgs):  # oldest first
                state[cid] = m["id"]
                if m["author"]["id"] == BOT_ID:            # skip own posts
                    continue
                if m["author"]["id"] not in cfg["allow"]:  # only allowlisted senders (P'Nat/Bo)
                    continue
                if cfg["reqMention"] and not is_mentioned(m):   # tag-gated channels
                    continue
                add_reaction(cid, m["id"])
                who = ALLOW.get(m["author"]["id"], m["author"].get("username", "?"))
                content = preprocess_message(m)
                att = f" [{len(m['attachments'])} attachment(s)]" if m.get("attachments") else ""
                print(f"RELAY #{cfg['name']} {who} -> No.6: {content[:50]!r} (chat {cid})", flush=True)
                maw_hey(f"[Discord #{cfg['name']} จาก {who}] {content}{att} | "
                        f"ตอบด้วย discord reply tool ที่ chat_id {cid} (ห้อง school ไม่ใช่ DM) แล้วจบ")
            save_state(state)
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(5)
        except Exception:
            pass
    time.sleep(POLL)

