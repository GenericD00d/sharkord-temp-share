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

## Open items

- **A per-member share of the storage limit**, so one member can't hold all of it. See SECURITY.md.
- **Bidi and invisible characters in names** aren't removed yet. See SECURITY.md.

## Bug log

No bugs recorded yet.
