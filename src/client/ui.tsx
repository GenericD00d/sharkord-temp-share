import {
  actions,
  createCallAction,
  useStoreSelector,
  type TPluginMessageComponentProps,
} from "@sharkord/plugin-sdk/client";
import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from "react";
import { Button, Input, Popover, PopoverContent, PopoverTrigger } from "@sharkord/ui";
import manifest from "../../manifest.json";
import { formatSize, formatTimeLeft } from "../rules";
import type { TPlugin, TShareCard, TShareListItem } from "../types";

const PLUGIN_ID = manifest.id;
const callAction = createCallAction<TPlugin>();
const linkPath = (token: string) => `/plugins/${PLUGIN_ID}/d/${token}`;

// lucide's file-clock, drawn inline to match the host's lucide icons without
// bundling the whole icon set, sized like the Shiver Media Player button
const FileClockIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="20"
    height="20"
    aria-hidden
  >
    <path d="M16 22h2a2 2 0 0 0 2-2V7l-5-5H6a2 2 0 0 0-2 2v3" />
    <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    <circle cx="8" cy="16" r="6" />
    <path d="M9.5 17.5 8 16.25V14" />
  </svg>
);
const mutedStyle: CSSProperties = { color: "var(--muted-foreground)", fontSize: 12 };

const uploadFile = async (
  file: File,
  channelId: number,
  hours: number,
  downloads: number,
  onProgress: (fraction: number) => void,
) => {
  const { token, chunkBytes } = await callAction("start", {
    channelId,
    name: file.name,
    size: file.size,
    hours,
    downloads,
  });

  try {
    let offset = 0;
    let failures = 0;

    while (offset < file.size) {
      try {
        const res = await actions.fetchPluginRoute(PLUGIN_ID, `/chunk/${token}?offset=${offset}`, {
          method: "POST",
          body: file.slice(offset, offset + chunkBytes),
        });
        const body = (await res.json()) as { received?: number; error?: string };

        // a 409 tells us where the server actually is, so resume from there
        if (typeof body.received === "number") offset = body.received;
        if (!res.ok && res.status !== 409) throw new Error(body.error ?? `HTTP ${res.status}`);
        if (res.ok) failures = 0;
      } catch (error) {
        failures += 1;

        if (failures > 3) throw error;
      }

      onProgress(offset / file.size);
    }
  } catch (error) {
    // free the reserved space rather than waiting for the stale sweep
    await callAction("delete", { token }).catch(() => {});

    throw error;
  }
};

const ShareButton = memo(({ channelId }: { channelId: number }) => {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File>();
  const [hours, setHours] = useState(24);
  const [downloads, setDownloads] = useState(5);
  const [progress, setProgress] = useState<number>();
  const [error, setError] = useState<string>();

  // keep the panel open while uploading, closing it would hide the progress
  const onOpenChange = useCallback(
    (next: boolean) => setOpen((value) => (next || progress === undefined ? next : value)),
    [progress],
  );
  const onFile = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const [picked] = event.target.files ?? [];

    setFile(picked);
    setError(undefined);
  }, []);
  const onHours = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setHours(Number(event.target.value)),
    [],
  );
  const onDownloads = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setDownloads(Number(event.target.value)),
    [],
  );

  const onShare = useCallback(async () => {
    if (!file) return;

    setError(undefined);
    setProgress(0);

    try {
      await uploadFile(file, channelId, hours, downloads, setProgress);
      setFile(undefined);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(undefined);
    }
  }, [file, channelId, hours, downloads]);

  const busy = progress !== undefined;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" aria-label="Share a large file" title="Share a large file temporarily">
          <FileClockIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="grid gap-3">
        <strong>Temporary file share</strong>
        <Input type="file" onChange={onFile} disabled={busy} />
        <label className="flex items-center gap-2 text-sm">
          Expires after
          <Input className="w-20" type="number" min={1} value={hours} onChange={onHours} disabled={busy} />
          hours
        </label>
        <label className="flex items-center gap-2 text-sm">
          Max
          <Input className="w-20" type="number" min={1} value={downloads} onChange={onDownloads} disabled={busy} />
          downloads
        </label>
        {busy && <progress value={progress} max={1} style={{ width: "100%" }} />}
        {error && <span className="text-sm text-destructive">{error}</span>}
        <Button onClick={onShare} disabled={!file || busy}>
          {busy ? `Uploading ${Math.round((progress ?? 0) * 100)}%` : "Share"}
        </Button>
      </PopoverContent>
    </Popover>
  );
});

const ShareCard = memo(({ props }: TPluginMessageComponentProps) => {
  const share = props as TShareCard;
  const ownUserId = useStoreSelector((state) => state.ownUserId);
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(async () => {
    await navigator.clipboard.writeText(`${location.origin}${linkPath(share.token)}`);
    setCopied(true);
  }, [share.token]);

  const onDelete = useCallback(async () => {
    if (confirm(`Delete ${share.name} now?`)) await callAction("delete", { token: share.token });
  }, [share.token, share.name]);

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 4 }}>
      {share.downloadsLeft > 0 && (
        <form method="post" action={linkPath(share.token)} style={{ margin: 0 }}>
          <Button type="submit" size="sm">
            Download
          </Button>
        </form>
      )}
      <Button type="button" size="sm" variant="outline" onClick={onCopy}>
        {copied ? "Copied" : "Copy link"}
      </Button>
      {share.uploaderId === ownUserId && (
        <Button type="button" size="sm" variant="outline" onClick={onDelete}>
          Delete
        </Button>
      )}
      <span style={mutedStyle}>
        {share.downloadsLeft} download(s) left · expires in {formatTimeLeft(share.expiresAt, Date.now())}
      </span>
    </div>
  );
});

const AdminRow = memo(({ share, onDelete }: { share: TShareListItem; onDelete: (token: string) => void }) => {
  const onClick = useCallback(() => onDelete(share.token), [onDelete, share.token]);

  return (
    <tr>
      <td style={{ wordBreak: "break-all" }}>{share.name}</td>
      <td>{formatSize(share.size)}</td>
      <td>{share.ready ? formatTimeLeft(share.expiresAt, Date.now()) : "uploading"}</td>
      <td>{share.downloadsLeft}</td>
      <td>
        <Button type="button" size="sm" variant="outline" onClick={onClick}>
          Delete
        </Button>
      </td>
    </tr>
  );
});

const AdminTab = memo(() => {
  const [data, setData] = useState<TPlugin["actions"]["list"]["response"]>();
  const [error, setError] = useState<string>();
  const loaded = useRef(false);

  const load = useCallback(async () => {
    try {
      setData(await callAction("list", {}));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const onDelete = useCallback(
    async (token: string) => {
      await callAction("delete", { token });
      await load();
    },
    [load],
  );

  useEffect(() => {
    if (loaded.current) return;

    loaded.current = true;
    load();
  }, [load]);

  if (error) return <p style={{ padding: 16 }}>{error}</p>;
  if (!data) return <p style={{ padding: 16 }}>Loading...</p>;

  return (
    <div style={{ display: "grid", gap: 12, padding: 16, color: "var(--foreground)" }}>
      <span>
        {formatSize(data.usedBytes)} of {formatSize(data.limitBytes)} used by {data.shares.length} file(s)
      </span>
      <progress value={data.usedBytes} max={data.limitBytes} style={{ width: "100%" }} />
      <table style={{ width: "100%", textAlign: "left", fontSize: 14 }}>
        <thead>
          <tr>
            <th>File</th>
            <th>Size</th>
            <th>Expires in</th>
            <th>Downloads left</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.shares.map((share) => (
            <AdminRow key={share.token} share={share} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
    </div>
  );
});

export { AdminTab, ShareButton, ShareCard };
