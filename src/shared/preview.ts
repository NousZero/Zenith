// Addresses for Zenith's local preview scheme, which serves project files to the preview frame.

export const PREVIEW_SCHEME = "zenith-file";

// zenith-file://preview/<project path, URI-encoded>/<relative path>
export function previewUrl(projectPath: string, relativePath: string): string {
  const parts = relativePath.split(/[\\/]/).filter(Boolean).map(encodeURIComponent).join("/");
  return `${PREVIEW_SCHEME}://preview/${encodeURIComponent(projectPath)}/${parts}`;
}

export function parsePreviewUrl(url: string): { projectPath: string; relativePath: string } {
  const { pathname } = new URL(url);
  const [project, ...rest] = pathname.replace(/^\//, "").split("/");
  return {
    projectPath: decodeURIComponent(project ?? ""),
    relativePath: rest.map(decodeURIComponent).join("/"),
  };
}
