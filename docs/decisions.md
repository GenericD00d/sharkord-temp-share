# Decisions

Why Temp Share is the way it is, oldest first.

## 2026-11-11: Only the button press spends a download

**Why:** chat apps and scanners fetch links to preview them. If a GET spent a download, a file
limited to one download could be used up before anyone pressed anything.

**Consequences:** `/d/<token>` is a page with a button; the POST spends one use and issues a ticket,
and `/f/<token>/<ticket>` serves the file. A ticket lasts 6 hours, so a dropped download resumes
without spending another.

## 2026-11-11: Shares live in memory

**Why:** a download is counted with no await between the check and the spend, so two presses at once
can't both use the last one.

**Consequences:** the plugin's storage holds a copy only to survive restarts, and every change goes
through memory first.

## 2026-11-11: Unfinished uploads count at their full size

**Why:** several uploads in parallel could otherwise each fit under the storage limit, and together
overshoot it.

**Consequences:** an abandoned upload holds its space until it goes stale, an hour without progress.

## 2026-11-11: Chunks of 50 MB

**Why:** under Cloudflare's 100 MB request cap, and small enough to retry cheaply.

**Consequences:** a reverse proxy in front needs to allow request bodies of at least 50 MB.

## 2026-11-13: Follow the Shiver standard, and keep the plugin id

**Why:** the four Shiver repos share one maintainer, and agents do most of the writing, so they keep
the same files, checks and security baseline ([standards.md](standards.md)). The repo was renamed to
`shiver-temp-share` to match the others.

**Consequences:** the plugin id stays `temp-share`, because Sharkord keys a plugin's stored data by
its id, and the release asset names stay `temp-share-<version>.tar.gz`.

## 2026-11-13: A per-member limit as well as the total

**Why:** with only a total, one member could fill it, or hold it with uploads they never finish.

**Consequences:** `memberLimitMb` (default 5 GB) and `maxPendingUploads` (default 3), checked in `start`. Setting the member limit to 0 leaves only the total.

## Bug log

### One member could hold the whole storage limit (fixed)

Unfinished uploads count at their full size, so a member could reserve the total and keep it with a trickle of data. Fixed with a per-member limit and a cap on unfinished uploads. Found by the 2026-11-13 review.

### Direction marks in names could disguise a file's type (fixed)

`cleanName` now drops invisible and direction-changing marks, and caps names by character, so it never splits an emoji into a surrogate a header can't carry. Found by the 2026-11-13 review.

### An invalid range was refused (fixed)

A range whose last byte comes before its first is now ignored, as RFC 9110 says, instead of answered with 416. Found by the 2026-11-13 review.
