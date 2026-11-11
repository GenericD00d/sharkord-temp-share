import {
  ChannelPermission,
  FileSaveType,
  Permission,
  PluginSlot,
  type PluginContext,
  type UnloadPluginContext,
} from "@sharkord/plugin-sdk";
import { randomBytes } from "crypto";
import fs from "fs";
import fsp from "fs/promises";
import type { ServerResponse } from "http";
import path from "path";
import { Transform } from "stream";
import { pipeline } from "stream/promises";
import {
  canDownload,
  CHUNK_BYTES,
  cleanName,
  formatSize,
  isExpired,
  isStale,
  isTicketValid,
  isUsedUp,
  MB,
  parseRange,
  RESUME_WINDOW_MS,
  usedBytes,
} from "../rules";
import type { TPlugin, TShare, TShareCard } from "../types";

let sweepTimer: ReturnType<typeof setInterval> | undefined;

const esc = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => `&#${c.charCodeAt(0)};`,
  );

const sendJson = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const toCard = ({
  token,
  name,
  size,
  expiresAt,
  downloadsLeft,
  uploaderId,
}: TShare): TShareCard => ({
  token,
  name,
  size,
  expiresAt,
  downloadsLeft,
  uploaderId,
});

const isInt = (value: unknown, min: number, max: number) =>
  Number.isInteger(value) && (value as number) >= min && (value as number) <= max;

const onLoad = async (ctx: PluginContext<TPlugin>) => {
  const settings = await ctx.settings.register([
    {
      key: "shareChannelId",
      name: "File sharing channel",
      description:
        "Only show the share button in this channel, to keep other chat bars uncluttered. Leave empty for every channel.",
      type: "channel",
      defaultValue: 0,
    },
    {
      key: "storageLimitMb",
      name: "Total storage limit (MB)",
      description:
        "New uploads are refused once shared files would go over this. Files in progress count at their full size.",
      type: "number",
      defaultValue: 20480,
    },
    {
      key: "oversizedMb",
      name: "Redirect attachments over (MB)",
      description:
        "Normal chat attachments bigger than this are refused with a hint to use the Shiver Temp Share button. 0 turns it off.",
      type: "number",
      defaultValue: 25,
    },
    {
      key: "maxFileMb",
      name: "Max file size (MB)",
      type: "number",
      defaultValue: 4096,
    },
    {
      key: "maxHours",
      name: "Max lifetime (hours)",
      type: "number",
      defaultValue: 168,
    },
    {
      key: "maxDownloads",
      name: "Max downloads per file",
      type: "number",
      defaultValue: 100,
    },
  ] as const);

  const dir = path.join(ctx.dataPath, "files");
  const filePath = (token: string) => path.join(dir, token);

  await fsp.mkdir(dir, { recursive: true });

  // memory is the source of truth so concurrent downloads cannot double spend
  // a count; storage is only there to survive restarts
  const shares = new Map<string, TShare>();
  const uploading = new Set<string>();

  for (let after: string | undefined; ; ) {
    const page = await ctx.storage.list({ prefix: "share:", after, limit: 100 });

    for (const { value } of page) {
      const share = value as TShare;

      shares.set(share.token, share);
    }

    const last = page[page.length - 1];

    if (page.length < 100 || !last) break;

    after = last.key;
  }

  const save = async (share: TShare) => {
    shares.set(share.token, share);
    await ctx.storage.set(`share:${share.token}`, share);
  };

  const refreshCard = async (share: TShare) => {
    if (!share.messageId) return;

    await ctx.messages
      .setComponents(share.messageId, [{ name: "share", props: toCard(share) }])
      .catch((error) => ctx.logger.error("card update failed", error));
  };

  const remove = async (token: string, reason: string, editMessage = true) => {
    const share = shares.get(token);

    if (!share) return;

    shares.delete(token);
    await ctx.storage.delete(`share:${token}`);
    // a failed delete (file still open on windows) is retried by the orphan sweep
    await fsp
      .rm(filePath(token), { force: true })
      .catch((error) => ctx.logger.error(`could not delete ${token}`, error));

    ctx.logger.log(`removed ${share.name} (${formatSize(share.size)}): ${reason}`);

    if (!editMessage || !share.messageId) return;

    try {
      await ctx.messages.setComponents(share.messageId, null);
      await ctx.messages.edit(
        share.messageId,
        `<p>🗑️ <strong>${esc(share.name)}</strong> is no longer available (${esc(reason)}).</p>`,
        { previews: false },
      );
    } catch (error) {
      ctx.logger.error("could not update the share message", error);
    }
  };

  const sweep = async () => {
    const now = Date.now();

    for (const share of [...shares.values()]) {
      if (isExpired(share, now)) await remove(share.token, "expired");
      else if (isUsedUp(share, now)) await remove(share.token, "download limit reached");
      else if (isStale(share, now)) await remove(share.token, "upload abandoned", false);
      else {
        const live = Object.entries(share.tickets).filter(([, expiry]) => expiry > now);

        if (live.length !== Object.keys(share.tickets).length) {
          share.tickets = Object.fromEntries(live);
          await save(share);
        }
      }
    }

    for (const name of await fsp.readdir(dir)) {
      if (!shares.has(name)) await fsp.rm(filePath(name), { force: true }).catch(() => {});
    }
  };

  await sweep();
  sweepTimer = setInterval(() => {
    sweep().catch((error) => ctx.logger.error("sweep failed", error));
  }, 60_000);

  ctx.ui.enable({ [PluginSlot.CHAT_ACTIONS]: Permission.UPLOAD_FILES });

  ctx.hooks.onBeforeFileSave(async ({ size, type }) => {
    const oversizedMb = settings.get("oversizedMb");

    if (type !== FileSaveType.MESSAGE || oversizedMb <= 0 || size <= oversizedMb * MB) return;

    const shareChannelId = settings.get("shareChannelId");
    const channel = shareChannelId ? await ctx.channels.get(shareChannelId) : undefined;
    const where = channel ? ` in #${channel.name}` : " next to the message box";

    return {
      reject: `Attachments over ${oversizedMb} MB are not allowed. Use the Shiver Temp Share button${where} to share it with an expiring link.`,
    };
  });

  ctx.actions.register({
    name: "config",
    executes: async () => ({ shareChannelId: settings.get("shareChannelId") }),
  });

  // move the button in every open client as soon as an admin changes the channel
  ctx.events.on("setting:set", ({ key }) => {
    if (key === "shareChannelId") ctx.push.toAll({ shareChannelId: settings.get("shareChannelId") });
  });

  ctx.actions.register({
    name: "start",
    requires: Permission.UPLOAD_FILES,
    executes: async (invoker, payload) => {
      const name = cleanName(String(payload.name ?? ""));
      const { channelId, size, hours, downloads } = payload;

      const shareChannelId = settings.get("shareChannelId");

      if (shareChannelId && channelId !== shareChannelId) {
        throw new Error("Files can only be shared in the file sharing channel.");
      }
      if (!name) throw new Error("The file needs a name.");
      if (!isInt(size, 1, settings.get("maxFileMb") * MB)) {
        throw new Error(`Files can be at most ${settings.get("maxFileMb")} MB.`);
      }
      if (!isInt(hours, 1, settings.get("maxHours"))) {
        throw new Error(`Lifetime must be 1 to ${settings.get("maxHours")} hours.`);
      }
      if (!isInt(downloads, 1, settings.get("maxDownloads"))) {
        throw new Error(`Downloads must be 1 to ${settings.get("maxDownloads")}.`);
      }

      const [canView, canSend] = await Promise.all([
        ctx.permissions.userCanInChannel(invoker.userId, channelId, ChannelPermission.VIEW_CHANNEL),
        ctx.permissions.userCanInChannel(invoker.userId, channelId, ChannelPermission.SEND_MESSAGES),
      ]);

      if (!canView || !canSend) throw new Error("You cannot post in this channel.");

      const limit = settings.get("storageLimitMb") * MB;
      const used = usedBytes(shares.values());

      if (used + size > limit) {
        throw new Error(
          `Not enough shared storage left (${formatSize(Math.max(0, limit - used))} free). Delete old shares or ask an admin.`,
        );
      }

      const token = randomBytes(18).toString("base64url");
      const now = Date.now();

      await save({
        token,
        name,
        size,
        received: 0,
        ready: false,
        uploaderId: invoker.userId,
        channelId,
        hours,
        downloadsLeft: downloads,
        tickets: {},
        expiresAt: 0,
        updatedAt: now,
      });
      await fsp.writeFile(filePath(token), "");

      return { token, chunkBytes: CHUNK_BYTES };
    },
  });

  ctx.actions.register({
    name: "delete",
    executes: async (invoker, { token }) => {
      const share = shares.get(token);

      if (!share) return;

      if (
        share.uploaderId !== invoker.userId &&
        !(await ctx.permissions.userCan(invoker.userId, Permission.MANAGE_STORAGE))
      ) {
        throw new Error("Only the uploader or an admin can delete this file.");
      }

      await remove(token, "deleted");
    },
  });

  ctx.actions.register({
    name: "list",
    requires: Permission.MANAGE_STORAGE,
    executes: async () => ({
      usedBytes: usedBytes(shares.values()),
      limitBytes: settings.get("storageLimitMb") * MB,
      shares: [...shares.values()].map((share) => ({
        ...toCard(share),
        channelId: share.channelId,
        ready: share.ready,
      })),
    }),
  });

  // deleting the chat message deletes the file with it
  ctx.events.on("message:deleted", async ({ messageId }) => {
    for (const share of shares.values()) {
      if (share.messageId === messageId) await remove(share.token, "message deleted", false);
    }
  });

  ctx.http.post(
    "/chunk/*",
    async (req, res, { userId }) => {
      const url = new URL(req.url ?? "", "http://local");
      const token = url.pathname.split("/").pop() ?? "";
      const offset = Number(url.searchParams.get("offset"));
      const share = shares.get(token);

      if (!share || share.ready || share.uploaderId !== userId) {
        req.resume();

        return sendJson(res, 404, { error: "Upload not found." });
      }

      if (uploading.has(token) || offset !== share.received) {
        req.resume();

        return sendJson(res, 409, { error: "Out of order chunk.", received: share.received });
      }

      uploading.add(token);

      const limit = Math.min(CHUNK_BYTES, share.size - share.received);
      let count = 0;
      const cap = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          count += chunk.length;
          callback(count > limit ? new Error("Chunk too large.") : null, chunk);
        },
      });

      try {
        // r+ at the offset lets a retried chunk overwrite a half written one
        await pipeline(req, cap, fs.createWriteStream(filePath(token), { flags: "r+", start: offset }));
      } catch (error) {
        return sendJson(res, 400, { error: String(error), received: share.received });
      } finally {
        uploading.delete(token);
      }

      // the share may have been deleted while this chunk was in flight
      if (!shares.has(token)) return sendJson(res, 404, { error: "Upload was deleted." });

      share.received += count;
      share.updatedAt = Date.now();

      if (share.received === share.size) {
        share.ready = true;
        share.expiresAt = Date.now() + share.hours * 3600_000;

        try {
          const { messageId } = await ctx.messages.send(
            share.channelId,
            `<p>📦 <strong>${esc(share.name)}</strong> (${formatSize(share.size)})</p>`,
            { previews: false, components: [{ name: "share", props: toCard(share) }] },
          );

          share.messageId = messageId;
        } catch (error) {
          ctx.logger.error("could not post the share", error);
          await remove(token, "could not post", false);

          return sendJson(res, 500, { error: "Upload finished but the message could not be posted." });
        }
      }

      await save(share);
      sendJson(res, 200, { received: share.received, done: share.ready });
    },
    { auth: true },
  );

  const notFound = (res: ServerResponse) => {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("This link has expired or does not exist.");
  };

  // a GET only shows a page, so link previews and scanners never use up a download
  ctx.http.get("/d/*", (req, res) => {
    const token = new URL(req.url ?? "", "http://local").pathname.split("/").pop() ?? "";
    const share = shares.get(token);

    if (!share || !canDownload(share, Date.now())) return notFound(res);

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'",
    });
    res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>${esc(share.name)}</title>
<body style="font-family:system-ui;max-width:32rem;margin:4rem auto;padding:0 1rem">
<h1 style="font-size:1.2rem;word-break:break-all">${esc(share.name)}</h1>
<p>${formatSize(share.size)} · ${share.downloadsLeft} download(s) left · expires ${new Date(share.expiresAt).toUTCString()}</p>
<form method="post"><button style="font-size:1rem;padding:.5rem 1.5rem">Download</button></form>`);
  });

  ctx.http.post("/d/*", async (req, res) => {
    req.resume();

    const token = new URL(req.url ?? "", "http://local").pathname.split("/").pop() ?? "";
    const share = shares.get(token);

    if (!share || !canDownload(share, Date.now())) return notFound(res);

    const ticket = randomBytes(12).toString("base64url");

    share.downloadsLeft -= 1;
    share.tickets[ticket] = Math.min(share.expiresAt, Date.now() + RESUME_WINDOW_MS);
    await save(share);
    await refreshCard(share);

    // the browser follows this with a GET, which is what it can pause and resume
    res.writeHead(303, {
      Location: `/plugins/${ctx.pluginId}/f/${token}/${ticket}`,
      "Cache-Control": "no-store",
    });
    res.end();
  });

  ctx.http.get("/f/*", async (req, res) => {
    const [token = "", ticket = ""] = new URL(req.url ?? "", "http://local").pathname
      .split("/")
      .slice(-2);
    const share = shares.get(token);

    if (!share || !isTicketValid(share, ticket, Date.now())) return notFound(res);

    // the file never changes, so the token is a stable validator for resumes
    const etag = `"${token}"`;
    const ifRange = req.headers["if-range"];
    const range =
      ifRange && ifRange !== etag ? undefined : parseRange(req.headers.range, share.size);
    const headers: Record<string, string | number> = {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(share.name)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "bytes",
      ETag: etag,
    };

    if (range === null) {
      res.writeHead(416, { ...headers, "Content-Range": `bytes */${share.size}` });
      res.end();

      return;
    }

    if (range) {
      res.writeHead(206, {
        ...headers,
        "Content-Range": `bytes ${range.start}-${range.end}/${share.size}`,
        "Content-Length": range.end - range.start + 1,
      });
    } else {
      res.writeHead(200, { ...headers, "Content-Length": share.size });
    }

    await pipeline(fs.createReadStream(filePath(token), range ?? {}), res).catch(() => {});
  });

  ctx.logger.log(`${shares.size} share(s) loaded, ${formatSize(usedBytes(shares.values()))} in use`);
};

const onUnload = (ctx: UnloadPluginContext) => {
  clearInterval(sweepTimer);
  sweepTimer = undefined;
  ctx.logger.log("Temp share unloaded");
};

export { onLoad, onUnload };
