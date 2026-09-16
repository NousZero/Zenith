import { Plus } from "lucide-react";
import { describe, expect, it } from "vitest";

import {
  completeCommandName,
  filterCommands,
  parseSlashCommand,
  type Command,
} from "../../src/renderer/commands";

const command = (name: string, title: string): Command => ({
  name,
  title,
  icon: Plus,
  run: () => undefined,
});

describe("slash commands", () => {
  it("parses a command name and its argument", () => {
    expect(parseSlashCommand("/title  My chat ")).toEqual({ name: "title", argument: "My chat" });
    expect(parseSlashCommand("/Retry")).toEqual({ name: "retry", argument: "" });
    expect(parseSlashCommand("/")).toEqual({ name: "", argument: "" });
    expect(parseSlashCommand("hello /retry")).toBeUndefined();
  });

  it("filters by name or title", () => {
    const commands = [command("new", "New session"), command("undo", "Undo last exchange")];
    expect(filterCommands(commands, "").map((c) => c.name)).toEqual(["new", "undo"]);
    expect(filterCommands(commands, "exch").map((c) => c.name)).toEqual(["undo"]);
    expect(filterCommands(commands, "ne").map((c) => c.name)).toEqual(["new"]);
  });

  it("ranks name prefixes first and completes names by prefix only", () => {
    const commands = [command("clear", "Clear conversation"), command("title", "Rename")];
    expect(filterCommands(commands, "ti").map((c) => c.name)).toEqual(["title", "clear"]);
    expect(completeCommandName(commands, "ti").map((c) => c.name)).toEqual(["title"]);
  });
});
