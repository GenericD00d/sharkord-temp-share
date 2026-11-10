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
import manifest from "../../manifest.json";
import { formatSize, formatTimeLeft } from "../rules";
import type { TPlugin, TShareCard, TShareListItem } from "../types";

const PLUGIN_ID = manifest.id;
const callAction = createCallAction<TPlugin>();
const linkPath = (token: string) => `/plugins/${PLUGIN_ID}/d/${token}`;

const buttonStyle: CSSProperties = {
  padding: "6px 12px",
  borderRadius: "var(--radius)",
  background: "var(--primary)",
  color: "var(--primary-foreground)",
  cursor: "pointer",
};
const subtleButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "transparent",
  color: "var(--foreground)",
  border: "1px solid var(--border)",
};
const inputStyle: CSSProperties = {
  width: 70,
  padding: "4px 8px",
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--foreground)",
};
const panelStyle: CSSProperties = {
  position: "absolute",
  bottom: "calc(100% + 8px)",
  right: 0,
  zIndex: 50,
  display: "grid",
  gap: 10,
  width: 280,
  padding: 12,
  borderRadius: "var(--radius)",
  border: "1px solid var(--border)",
  background: "var(--popover, var(--background))",
  color: "var(--foreground)",
  boxShadow: "0 8px 24px rgba(0,0,0,.25)",
};
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

  const toggle = useCallback(() => setOpen((value) => !value), []);
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
    <div style={{ position: "relative" }}>
      <button type="button" title="Share a large file temporarily" onClick={toggle}>
        📦
      </button>

      {open && (
        <div style={panelStyle}>
          <strong>Temporary file share</strong>
          <input type="file" onChange={onFile} disabled={busy} />
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            Expires after
            <input style={inputStyle} type="number" min={1} value={hours} onChange={onHours} disabled={busy} />
            hours
          </label>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            Max
            <input style={inputStyle} type="number" min={1} value={downloads} onChange={onDownloads} disabled={busy} />
            downloads
          </label>
          {busy && <progress value={progress} max={1} style={{ width: "100%" }} />}
          {error && <span style={{ color: "var(--destructive)", fontSize: 13 }}>{error}</span>}
          <button type="button" style={buttonStyle} onClick={onShare} disabled={!file || busy}>
            {busy ? `Uploading ${Math.round((progress ?? 0) * 100)}%` : "Share"}
          </button>
        </div>
      )}
    </div>
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
          <button type="submit" style={buttonStyle}>
            Download
          </button>
        </form>
      )}
      <button type="button" style={subtleButtonStyle} onClick={onCopy}>
        {copied ? "Copied" : "Copy link"}
      </button>
      {share.uploaderId === ownUserId && (
        <button type="button" style={subtleButtonStyle} onClick={onDelete}>
          Delete
        </button>
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
        <button type="button" style={subtleButtonStyle} onClick={onClick}>
          Delete
        </button>
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
