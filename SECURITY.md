# Security

## Reporting a problem

**Please do not open a public issue for a security problem.** Use GitHub's private reporting
instead: **Security → Advisories → Report a vulnerability** on
[this repository](https://github.com/GenericD00d/shiver-temp-share/security/advisories/new).
That opens a thread only you and the maintainer can see.

If that is not available to you for any reason, open an ordinary issue saying only that you have
something to report and asking for a way to send it, with no details in the issue itself.

Expect a first reply within a week. This is one person's side project.

## What this project handles

The server half runs inside the Sharkord server process, as that server's own user. It stores the
files members share, in the plugin's `dataPath/files`, and serves them to anyone holding a link
until the link runs out. A link is the only thing standing between a file and whoever has it, by
design.

**No independent security audit has been done.** Its internal reviews are listed under
[Review history](#review-history).

## Trust boundaries

What the plugin does not trust, where it comes in, and what stands in its way. The rules that
enforce each line, and their tests, are in [AGENTS.md](AGENTS.md#rules-that-must-not-break).

| Untrusted | Where it comes in | What guards it |
|---|---|---|
| Anyone on the internet | `/d/<token>` and `/f/<token>/<ticket>` | 144-bit tokens and 96-bit tickets; files served only as `attachment`, `application/octet-stream` and `nosniff`; the page escapes the name under a CSP that allows nothing but its own form |
| Members uploading | The `start` action and `/chunk/<token>` | `UPLOAD_FILES` and the right to post in the channel; only the uploader's chunks, in order, capped; size, lifetime and download limits; the total storage limit, a per-member limit, and a cap on each member's unfinished uploads |
| File names members give | The card, the page and the download's name | Control characters, slashes and quotes replaced; invisible and direction-changing marks dropped; capped by character; escaped in HTML; encoded in the header |
| Members deleting | The `delete` action | The uploader, or `MANAGE_STORAGE` |
| Range requests | `/f/*` | Clamped to the file |

## In scope

- **Reading a file without its link**, or after its link ran out.
- **Spending fewer downloads than a file allows**, or more than one per press.
- **Turning a shared file into script** on the Sharkord server's origin.
- **Writing outside the plugin's `files` folder**, or reading outside it.
- **Deleting or listing other members' shares** without `MANAGE_STORAGE`.

## Out of scope

- **Someone sharing a link on.** Whoever holds a link can use it, until it runs out.
- **What members choose to share.** Moderation is Sharkord's.
- **Sharkord's own vulnerabilities.** Report those to Sharkord.

## Design decisions worth knowing

- **Files are only ever downloads.** Nothing is served inline, so a shared HTML file can't run on
  the Sharkord server's origin.
- **Only the button press counts.** A GET shows a page and spends nothing, so link previews and
  scanners don't use up downloads.
- **Unfinished uploads count at their full size**, so uploads in parallel can't overshoot the
  storage limit.
- **Shares live in memory**, so a download is spent before anything can interleave.
- **Each member has a share of the storage limit**, and a cap on unfinished uploads, so one member
  can't fill the total or hold it with uploads they never finish.
- **Names lose invisible and direction-changing marks**, so a file's type reads as it is.

## Review history

| Date | Review | Fixed in | What it found |
|---|---|---|---|
| 2026-11-13 | Review of the four Shiver repos, internal and LLM-assisted | This branch | No per-member quota, so one member could hold the whole storage limit; bidi characters in names could disguise a file's type; invalid ranges answered 416 instead of being ignored |
