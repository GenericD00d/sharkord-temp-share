# Temp Share (Sharkord plugin)

Share big files with a link that dies after N hours or N downloads.

- 📦 button in the chat composer: pick a file, lifetime and max downloads. Uploads go in 50 MB chunks (safe behind Cloudflare/nginx limits) and retry on failure.
- The plugin posts a card in the channel with Download / Copy link / Delete and a live "downloads left" count.
- The copied link opens a small page with a Download button. Only the button press counts as a download, so link previews and scanners don't use any up.
- Pressing Download uses one download and hands the browser a private link that supports pausing and resuming (HTTP range requests) for 6 hours, so a dropped or resumed download doesn't cost another use.
- Normal chat attachments over the **Redirect attachments over (MB)** size (default 25, 0 = off) are refused with a message pointing people to the 📦 button.

## Keeping storage under control

- **Storage limit** setting (default 20 GB): uploads are refused once shared files would exceed it. Uploads still in progress count at their full size.
- Files are deleted when they expire, are deleted by the uploader, or when the chat message is deleted. A file that runs out of downloads is kept until the last download's 6-hour resume window closes (or the file expires, whichever is first), then deleted.
- Admins (`MANAGE_STORAGE`) get a **Shared files** tab in the plugin settings showing usage and a Delete button for every file.
- Abandoned uploads are cleaned up after 1 hour with no progress. Files on disk that the plugin no longer tracks are removed every minute.

Files live in the plugin's `dataPath/files`. Uninstalling the plugin removes them.

## Settings

| Setting | Default |
|---|---|
| Total storage limit (MB) | 20480 |
| Redirect attachments over (MB) | 25 |
| Max file size (MB) | 4096 |
| Max lifetime (hours) | 168 |
| Max downloads per file | 100 |

## Build

```bash
bun run setup      # clones the Sharkord SDK + builder into .repos and links them
cp .env.example .env   # set SHARKORD_PLUGINS_PATH
bun run build
bun test src       # rules tests
```

If you're behind a reverse proxy, make sure it allows request bodies of at least 50 MB (nginx: `client_max_body_size 60m;`).

## License

MIT, see [LICENSE](LICENSE).
