import { Check, Copy } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

function CodeBlock({ children }: { children?: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  function copy() {
    const text = preRef.current?.innerText ?? "";
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="group/code relative">
      <pre ref={preRef}>{children}</pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy code"}
        className="absolute right-1.5 top-1.5 flex size-7 cursor-pointer items-center justify-center rounded-md border border-border bg-card text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover/code:opacity-100"
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}

// Links render as text: window-security.ts blocks renderer navigation and new windows by design.
const components: Components = {
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  a: ({ children }) => (
    <span className="underline decoration-muted-foreground/60 underline-offset-2">{children}</span>
  ),
};

// In the file reader, links to other files in the project open them, and images load through
// Zenith's local preview scheme. Addresses that leave the project stay as plain text.
function headingId(children: ReactNode): string | undefined {
  const text = Array.isArray(children)
    ? children.filter((child) => typeof child === "string").join(" ")
    : typeof children === "string"
      ? children
      : "";
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || undefined
  );
}

function readerComponents(
  onOpen: (target: string) => void,
  resolve: (target: string) => string | undefined,
): Components {
  return {
    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
    h1: ({ children }) => <h1 id={headingId(children)}>{children}</h1>,
    h2: ({ children }) => <h2 id={headingId(children)}>{children}</h2>,
    h3: ({ children }) => <h3 id={headingId(children)}>{children}</h3>,
    a: ({ children, href }) => {
      const target = href && !/^[a-z]+:/i.test(href) ? href : undefined;
      if (!target) {
        return (
          <span className="underline decoration-muted-foreground/60 underline-offset-2">
            {children}
          </span>
        );
      }
      return (
        <button
          type="button"
          onClick={() => onOpen(target)}
          className="cursor-pointer text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {children}
        </button>
      );
    },
    img: ({ src, alt }) => {
      const resolved = typeof src === "string" ? resolve(src) : undefined;
      return resolved ? (
        <img src={resolved} alt={alt ?? ""} className="max-w-full" />
      ) : (
        <span className="text-xs text-muted-foreground">[{alt || "image"}]</span>
      );
    },
  };
}

export function Markdown(props: {
  content: string;
  // Set in the file reader; chat replies keep links inert.
  onOpenLink?: (target: string) => void;
  resolveImage?: (target: string) => string | undefined;
}) {
  const reader =
    props.onOpenLink && props.resolveImage
      ? readerComponents(props.onOpenLink, props.resolveImage)
      : components;
  return (
    <div className="chat-prose">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={reader}>
        {props.content}
      </ReactMarkdown>
    </div>
  );
}
