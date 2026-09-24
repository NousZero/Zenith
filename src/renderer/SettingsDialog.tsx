import { Bot, Drama, ShieldCheck, SlidersHorizontal } from "lucide-react";

import type { LibraryItem } from "../shared/library";
import type { ConnectionStatus, PersonaFile } from "../shared/types";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./components/ui/dialog";
import type { ExtraId } from "./extras";
import { LibraryBrowser, type LibraryDraft } from "./LibraryDialog";
import { cn } from "./lib/utils";
import {
  AppearanceSection,
  AuditSection,
  ConnectionsSection,
  ErrorLogSection,
  ExtrasSection,
  McpSection,
  PermissionsSection,
  PersonaFileEditor,
  ProvidersSection,
  SandboxSection,
} from "./SettingsSections";
import { RolePage } from "./Workbench";

const SETTINGS_TABS = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "assistants", label: "Assistants", icon: Bot },
  { id: "agent-behaviour", label: "Agent behaviour", icon: Drama },
  { id: "safety", label: "Safety", icon: ShieldCheck },
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

// The library and editor sections gathered under the Agent behaviour tab.
// Each is a long list with its own editor, so they get a sub-nav rather
// than stacking on one page.
const AGENT_BEHAVIOUR_SECTIONS = [
  { id: "soul", label: "Soul" },
  { id: "role", label: "Role" },
  { id: "agents", label: "Agents" },
  { id: "skills", label: "Skills" },
  { id: "commands", label: "Commands" },
] as const;
export type AgentBehaviourSection = (typeof AGENT_BEHAVIOUR_SECTIONS)[number]["id"];

const SETTINGS_DESCRIPTIONS: Record<SettingsTab, string> = {
  general: "How Zenith looks, plus features outside the core loop.",
  assistants: "AI tools on this computer and API providers with their own address and key.",
  "agent-behaviour":
    "Who every model is, the personality it follows, and the agents, skills, and commands it can use.",
  safety: "How much agents may do on their own, the tools they can reach, and what they did.",
};
const AGENT_SECTION_DESCRIPTIONS: Record<AgentBehaviourSection, string> = {
  soul: "Who every model is and what it knows about you, sent as the system prompt.",
  role: "The personality this session follows, added after the soul and profile.",
  agents: "Instructions and tool lists a pane can follow. Choose one from the pane's menu.",
  skills: "Instructions you run with /name in the composer.",
  commands: "Prompt templates you run with /name; $ARGUMENTS is replaced with what you type.",
};
const LIBRARY_KINDS: Partial<Record<AgentBehaviourSection, LibraryItem["kind"]>> = {
  agents: "agent",
  skills: "skill",
  commands: "command",
};

const narrow = (children: React.ReactNode) => (
  <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-5">{children}</div>
);

// Settings is a sheet over the workspace, so a conversation stays where it was while you change
// something. Its tabs run down a sidebar, as in System Settings, because the pages are wide.
export function SettingsDialog(props: {
  open: boolean;
  onOpenChange(open: boolean): void;
  tab: SettingsTab;
  onTabChange(tab: SettingsTab): void;
  section: AgentBehaviourSection;
  onSectionChange(section: AgentBehaviourSection): void;
  extras: Record<ExtraId, boolean>;
  onToggleExtra(id: ExtraId, enabled: boolean): void;
  onOpenBots(): void;
  onOpenSchedule(): void;
  onOpenInsights(): void;
  onProvidersChanged(): void;
  connections: ConnectionStatus[];
  refreshingConnections: boolean;
  onRefreshConnections(): void;
  persona: Record<PersonaFile, string>;
  onSavePersona(file: PersonaFile, text: string): Promise<void>;
  personalityId: string;
  onPersonalityChange(id: string): void;
  onPermissionsChanged(): void;
  library: LibraryItem[];
  // A skill drafted from a conversation; the number remounts the editor.
  skillDraft: { draft: LibraryDraft; version: number } | null;
  onLibraryChanged(): void;
}) {
  const { tab, section, skillDraft } = props;
  const libraryKind = tab === "agent-behaviour" ? LIBRARY_KINDS[section] : undefined;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="h-[min(760px,88vh)] max-h-none w-[min(1000px,calc(100vw-48px))] flex-row gap-0 overflow-hidden p-0">
        <div className="flex w-52 shrink-0 flex-col gap-3 border-r border-border bg-background/40 px-2.5 py-4">
          <DialogTitle className="px-2.5">Settings</DialogTitle>
          <div
            role="tablist"
            aria-label="Settings sections"
            aria-orientation="vertical"
            className="flex flex-col gap-0.5"
          >
            {SETTINGS_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => props.onTabChange(item.id)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  tab === item.id
                    ? "bg-accent font-medium text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                <item.icon className="size-4" aria-hidden />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-col gap-1 border-b border-border py-4 pl-5 pr-14">
            <h2 className="font-serif text-lg font-semibold tracking-tight text-foreground">
              {SETTINGS_TABS.find((item) => item.id === tab)?.label}
            </h2>
            <DialogDescription>
              {tab === "agent-behaviour"
                ? AGENT_SECTION_DESCRIPTIONS[section]
                : SETTINGS_DESCRIPTIONS[tab]}
            </DialogDescription>
            {tab === "agent-behaviour" && (
              <div
                role="tablist"
                aria-label="Agent behaviour sections"
                className="flex flex-wrap gap-1 pt-2"
              >
                {AGENT_BEHAVIOUR_SECTIONS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={section === item.id}
                    onClick={() => props.onSectionChange(item.id)}
                    className={cn(
                      "shrink-0 cursor-pointer rounded-full border px-2.5 py-1 text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      section === item.id
                        ? "border-primary/60 bg-primary/[0.06] text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {libraryKind ? (
            <div className="flex min-h-0 flex-1 flex-col p-5">
              <LibraryBrowser
                key={`${libraryKind}:${libraryKind === "skill" ? (skillDraft?.version ?? 0) : 0}`}
                kind={libraryKind}
                items={props.library}
                onChanged={props.onLibraryChanged}
                {...(libraryKind === "skill" && skillDraft
                  ? { initialDraft: skillDraft.draft }
                  : {})}
              />
            </div>
          ) : (
            <div role="tabpanel" className="min-h-0 flex-1 overflow-y-auto">
              {tab === "general" &&
                narrow(
                  <>
                    <AppearanceSection />
                    <ExtrasSection
                      extras={props.extras}
                      onToggle={props.onToggleExtra}
                      onOpenBots={props.onOpenBots}
                      onOpenSchedule={props.onOpenSchedule}
                      onOpenInsights={props.onOpenInsights}
                    />
                  </>,
                )}
              {tab === "assistants" &&
                narrow(
                  <>
                    <ProvidersSection onChanged={props.onProvidersChanged} />
                    <ConnectionsSection
                      connections={props.connections}
                      refreshing={props.refreshingConnections}
                      onRefresh={props.onRefreshConnections}
                    />
                  </>,
                )}
              {tab === "agent-behaviour" &&
                section === "soul" &&
                narrow(
                  <>
                    <PersonaFileEditor
                      file="SOUL.md"
                      title="Soul"
                      description="Sent first to every conversation, before your profile, the session role, and memory."
                      placeholder="e.g. You are a direct senior engineer. Match answer length to the question."
                      text={props.persona["SOUL.md"]}
                      onSave={props.onSavePersona}
                    />
                    <PersonaFileEditor
                      file="USER.md"
                      title="About you"
                      description="What every model should know about you: role, preferences, projects. Agents can add to it with your approval."
                      placeholder="e.g. I'm a TypeScript developer on macOS. I prefer short answers with code."
                      text={props.persona["USER.md"]}
                      onSave={props.onSavePersona}
                    />
                  </>,
                )}
              {tab === "agent-behaviour" && section === "role" && (
                <RolePage
                  personalityId={props.personalityId}
                  onChange={props.onPersonalityChange}
                />
              )}
              {tab === "safety" &&
                narrow(
                  <>
                    <PermissionsSection onChanged={props.onPermissionsChanged} />
                    <SandboxSection />
                    <McpSection />
                    <AuditSection />
                    <ErrorLogSection />
                  </>,
                )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
