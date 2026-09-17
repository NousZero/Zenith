import { useEffect, useState } from "react";

// Stored images are loaded once per window and reused.
const cache = new Map<string, Promise<string>>();

function load(id: string): Promise<string> {
  let url = cache.get(id);
  if (!url) {
    url = window.zenith.attachments.read(id);
    cache.set(id, url);
  }
  return url;
}

export function AttachmentImage(props: { id: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    load(props.id)
      .then((value) => {
        if (!cancelled) setUrl(value);
      })
      .catch(() => {
        if (!cancelled) setUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [props.id]);
  if (url === "") {
    return <span className="text-[11px] text-muted-foreground">[image unavailable]</span>;
  }
  return url ? (
    <img src={url} alt="Attached image" className={props.className} />
  ) : (
    <span className={props.className} />
  );
}
