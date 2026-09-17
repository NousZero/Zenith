import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { SessionState } from "../shared/types";
import { DEFAULT_CLI_MODEL_ID, providerMeta } from "./providers";

function header(session: SessionState): string[] {
  const pane = session.panes[0];
  const model = pane
    ? `${providerMeta(pane.providerId).label}${pane.modelId && pane.modelId !== DEFAULT_CLI_MODEL_ID ? ` · ${pane.modelId}` : ""}`
    : "";
  return [
    `# ${session.name}`,
    "",
    `Exported from Zenith on ${new Date().toLocaleString()}${model ? ` · ${model}` : ""}`,
    ...(pane?.projectPath ? [`Project folder: \`${pane.projectPath}\``] : []),
  ];
}

// The conversation as Markdown: one heading per turn, replies kept as the model wrote them.
export function sessionToMarkdown(session: SessionState): string {
  const messages = session.panes[0]?.messages ?? [];
  const body = messages.map((message) =>
    message.role === "user"
      ? `## You\n\n${message.content}`
      : message.role === "assistant"
        ? `## Assistant\n\n${message.content}`
        : `## Note\n\n${message.content}`,
  );
  return [...header(session), "", "---", "", body.join("\n\n")].join("\n").trimEnd() + "\n";
}

const PAGE_STYLE = `
body { max-width: 760px; margin: 40px auto; padding: 0 20px; font: 15px/1.65 system-ui, sans-serif;
  color: #1c211e; background: #fbfaf7; }
h1 { font-family: Georgia, serif; font-weight: 400; }
h2 { margin-top: 2em; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; color: #8a5a14; }
pre { overflow-x: auto; padding: 12px; background: #f1eee6; border: 1px solid #e2ddd0; }
code { font: 13px ui-monospace, Menlo, monospace; }
table { border-collapse: collapse; } th, td { border: 1px solid #e2ddd0; padding: 4px 8px; }
blockquote { margin: 0; padding-left: 12px; border-left: 2px solid #e2ddd0; color: #5b5a55; }
`;

// A standalone page with no scripts and no outside requests.
export function sessionToHtml(session: SessionState): string {
  const markdown = sessionToMarkdown(session);
  const body = renderToStaticMarkup(
    createElement(ReactMarkdown, { remarkPlugins: [remarkGfm] }, markdown),
  );
  const title = session.name.replace(/[<>&"]/g, "");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><style>${PAGE_STYLE}</style></head>
<body>${body}</body></html>
`;
}
