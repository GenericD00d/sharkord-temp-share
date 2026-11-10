import { expect, test } from "bun:test";
import {
  canDownload,
  cleanName,
  isExpired,
  isStale,
  isTicketValid,
  isUsedUp,
  parseRange,
  usedBytes,
} from "./rules";
import type { TShare } from "./types";

const share = (over: Partial<TShare> = {}): TShare => ({
  token: "t",
  name: "a.zip",
  size: 100,
  received: 100,
  ready: true,
  uploaderId: 1,
  channelId: 1,
  hours: 1,
  downloadsLeft: 2,
  tickets: {},
  expiresAt: 1000,
  updatedAt: 0,
  ...over,
});

test("download allowed only while ready, unexpired and with uses left", () => {
  expect(canDownload(share(), 999)).toBe(true);
  expect(canDownload(share(), 1000)).toBe(false);
  expect(canDownload(share({ downloadsLeft: 0 }), 0)).toBe(false);
  expect(canDownload(share({ ready: false }), 0)).toBe(false);
});

test("pending uploads never expire but go stale", () => {
  expect(isExpired(share({ ready: false, expiresAt: 0 }), 5000)).toBe(false);
  expect(isStale(share({ ready: false, updatedAt: 0 }), 60 * 60 * 1000 + 1)).toBe(true);
  expect(isStale(share({ ready: true, updatedAt: 0 }), 1e12)).toBe(false);
});

test("quota counts pending uploads at full size", () => {
  expect(usedBytes([share({ size: 10 }), share({ size: 5, received: 0, ready: false })])).toBe(15);
});

test("a used up share waits for live resume tickets before going", () => {
  expect(isUsedUp(share({ downloadsLeft: 0, tickets: { a: 500 } }), 100)).toBe(false);
  expect(isUsedUp(share({ downloadsLeft: 0, tickets: { a: 500 } }), 600)).toBe(true);
  expect(isUsedUp(share({ downloadsLeft: 1 }), 600)).toBe(false);
});

test("tickets are valid until their own expiry or the share's", () => {
  const s = share({ tickets: { a: 500 } });

  expect(isTicketValid(s, "a", 499)).toBe(true);
  expect(isTicketValid(s, "a", 500)).toBe(false);
  expect(isTicketValid(s, "b", 0)).toBe(false);
  expect(isTicketValid(share({ tickets: { a: 5000 } }), "a", 1000)).toBe(false);
});

test("ranges", () => {
  expect(parseRange(undefined, 100)).toBeUndefined();
  expect(parseRange("bytes=10-", 100)).toEqual({ start: 10, end: 99 });
  expect(parseRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
  expect(parseRange("bytes=50-500", 100)).toEqual({ start: 50, end: 99 });
  expect(parseRange("bytes=-20", 100)).toEqual({ start: 80, end: 99 });
  expect(parseRange("bytes=100-", 100)).toBeNull();
  expect(parseRange("bytes=0-1,5-6", 100)).toBeUndefined();
});

test("names cannot carry header or path tricks", () => {
  expect(cleanName('../evil"\r\nX: 1.txt')).toBe('.._evil___X: 1.txt');
  expect(cleanName("   ")).toBe("");
});
