// Unified diff for showing proposed file changes. Line-based LCS with a size cap.

const CONTEXT_LINES = 3;
// ponytail: O(n·m) LCS; above this many cell comparisons the diff shows the whole file replaced.
const MAX_CELLS = 4_000_000;

type Op = { kind: " " | "-" | "+"; line: string };

function lines(text: string): string[] {
  if (text === "") return [];
  const split = text.split("\n");
  if (split.at(-1) === "") split.pop();
  return split;
}

function diffOps(before: string[], after: string[]): Op[] {
  // Trim the common prefix and suffix so the table covers only the changed middle.
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1] === after[endAfter - 1]) {
    endBefore--;
    endAfter--;
  }
  const a = before.slice(start, endBefore);
  const b = after.slice(start, endAfter);
  const middle: Op[] = [];
  if (a.length * b.length > MAX_CELLS) {
    middle.push(...a.map((line) => ({ kind: "-" as const, line })));
    middle.push(...b.map((line) => ({ kind: "+" as const, line })));
  } else {
    // table[i * width + j] = length of the longest common subsequence of a[i:] and b[j:].
    const width = b.length + 1;
    const table = new Uint32Array((a.length + 1) * width);
    const cell = (i: number, j: number) => table[i * width + j] ?? 0;
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        table[i * width + j] =
          a[i] === b[j] ? cell(i + 1, j + 1) + 1 : Math.max(cell(i + 1, j), cell(i, j + 1));
      }
    }
    let i = 0;
    let j = 0;
    while (i < a.length || j < b.length) {
      const left = a[i];
      const right = b[j];
      if (left !== undefined && right !== undefined && left === right) {
        middle.push({ kind: " ", line: left });
        i++;
        j++;
      } else if (right !== undefined && (left === undefined || cell(i, j + 1) > cell(i + 1, j))) {
        middle.push({ kind: "+", line: right });
        j++;
      } else {
        middle.push({ kind: "-", line: left ?? "" });
        i++;
      }
    }
  }
  return [
    ...before.slice(0, start).map((line) => ({ kind: " " as const, line })),
    ...middle,
    ...before.slice(endBefore).map((line) => ({ kind: " " as const, line })),
  ];
}

export function unifiedDiff(before: string, after: string, path: string): string {
  const ops = diffOps(lines(before), lines(after));
  if (!ops.some((op) => op.kind !== " ")) return "";
  const output = [`--- ${path}`, `+++ ${path}`];
  let index = 0;
  while (index < ops.length) {
    if (ops[index]?.kind === " ") {
      index++;
      continue;
    }
    // Grow a hunk until it reaches a run of unchanged lines longer than twice the context.
    const hunkStart = Math.max(0, index - CONTEXT_LINES);
    let end = index;
    while (end < ops.length) {
      let run = 0;
      while (end + run < ops.length && ops[end + run]?.kind === " ") run++;
      if (end + run >= ops.length || run > CONTEXT_LINES * 2) {
        end = Math.min(ops.length, end + Math.min(run, CONTEXT_LINES));
        break;
      }
      end += run + 1;
    }
    const hunk = ops.slice(hunkStart, end);
    const oldStart = ops.slice(0, hunkStart).filter((op) => op.kind !== "+").length + 1;
    const newStart = ops.slice(0, hunkStart).filter((op) => op.kind !== "-").length + 1;
    const oldCount = hunk.filter((op) => op.kind !== "+").length;
    const newCount = hunk.filter((op) => op.kind !== "-").length;
    output.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    output.push(...hunk.map((op) => `${op.kind}${op.line}`));
    index = end;
  }
  return output.join("\n");
}
