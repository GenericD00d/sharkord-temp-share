import type { TShare } from "./types";

const MB = 1024 * 1024;
// under cloudflare's 100 MB request cap, and small enough to retry cheaply
const CHUNK_BYTES = 50 * MB;
// an upload with no chunk for this long is abandoned and its space freed
const STALE_UPLOAD_MS = 60 * 60 * 1000;

// how long a started download can be resumed without spending another use
const RESUME_WINDOW_MS = 6 * 60 * 60 * 1000;

const isExpired = (share: TShare, now: number) =>
  share.ready && now >= share.expiresAt;

const hasLiveTicket = (share: TShare, now: number) =>
  Object.values(share.tickets).some((expiry) => expiry > now);

// out of uses and nobody is still resuming, so the file can go
const isUsedUp = (share: TShare, now: number) =>
  share.ready && share.downloadsLeft <= 0 && !hasLiveTicket(share, now);

const isTicketValid = (share: TShare, ticket: string, now: number) =>
  share.ready && !isExpired(share, now) && (share.tickets[ticket] ?? 0) > now;

/**
 * a single `bytes=a-b` range clamped to the file, `undefined` for no or
 * unsupported (multi) ranges so the caller sends the whole file, `null` when
 * the range cannot be satisfied
 */
const parseRange = (header: string | undefined, size: number) => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? "");

  if (!match || (!match[1] && !match[2])) return undefined;

  let start: number;
  let end: number;

  if (!match[1]) {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }

  if (start > end || start >= size) return null;

  return { start, end };
};

const isStale = (share: TShare, now: number) =>
  !share.ready && now - share.updatedAt > STALE_UPLOAD_MS;

const canDownload = (share: TShare, now: number) =>
  share.ready && !isExpired(share, now) && share.downloadsLeft > 0;

// pending uploads count at their full size, so parallel uploads cannot overshoot
const usedBytes = (shares: Iterable<TShare>) => {
  let total = 0;

  for (const share of shares) total += share.size;

  return total;
};

// the name only ever reaches a header and html, never the filesystem
const cleanName = (name: string) =>
  name.replace(/[\x00-\x1f\\/"]/g, "_").trim().slice(0, 200);

const formatSize = (bytes: number) => {
  if (bytes >= 1024 * MB) return `${(bytes / 1024 / MB).toFixed(1)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;

  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

const formatTimeLeft = (expiresAt: number, now: number) => {
  const minutes = Math.max(0, Math.round((expiresAt - now) / 60000));

  if (minutes >= 48 * 60) return `${Math.round(minutes / 1440)} days`;
  if (minutes >= 60) return `${Math.round(minutes / 60)} hours`;

  return `${minutes} min`;
};

export {
  canDownload,
  CHUNK_BYTES,
  cleanName,
  formatSize,
  formatTimeLeft,
  isExpired,
  isStale,
  isTicketValid,
  isUsedUp,
  MB,
  parseRange,
  RESUME_WINDOW_MS,
  usedBytes,
};
