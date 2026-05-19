# Claude Code Hooks Implementation Design Spec

## Status Quo

The `ai-claude-code` package currently implements **2 of 28** Claude Code hook events:

| Hook | Type | Purpose |
|------|------|---------|
| `PreToolUse` | command | Backs up files before Write/Edit/MultiEdit |
| `Stop` | command | Cleans up session backup directory |

Both are hardcoded in `ClaudeCodeServiceImpl.ensureClaudeSettings()` and written to `.claude/settings.local.json`. There is no generic hook infrastructure, no UI for hook management, and no support for `http`, `mcp_tool`, `prompt`, or `agent` hook handler types.

---

## Architecture Overview

### Proposed Design

```
┌─────────────────────────────────────────────────────────┐
│  Browser (Frontend)                                      │
│  ┌─────────────────┐  ┌──────────────────────────────┐  │
│  │ Hook Config UI  │  │ Hook Status/Notification UI  │  │
│  └────────┬────────┘  └──────────────┬───────────────┘  │
│           │                           │                  │
│  ┌────────▼───────────────────────────▼───────────────┐  │
│  │         ClaudeCodeHookFrontendService              │  │
│  └────────────────────────┬──────────────────────────┘  │
└───────────────────────────┼──────────────────────────────┘
                            │ RPC
┌───────────────────────────┼──────────────────────────────┐
│  Node (Backend)           │                              │
│  ┌────────────────────────▼──────────────────────────┐   │
│  │          ClaudeCodeHookService                    │   │
│  │  ┌──────────────┐ ┌────────────────────────────┐ │   │
│  │  │ HookRegistry │ │ HookSettingsManager        │ │   │
│  │  │ (in-memory)  │ │ (reads/writes settings.json)│ │   │
│  │  └──────┬───────┘ └────────────────────────────┘ │   │
│  │         │                                         │   │
│  │  ┌──────▼──────────────────────────────────────┐  │   │
│  │  │         HookExecutor                        │  │   │
│  │  │  ┌─────────┐ ┌──────┐ ┌────────┐ ┌──────┐ │  │   │
│  │  │  │ Command │ │ HTTP │ │MCP Tool│ │Prompt│ │  │   │
│  │  │  │ Runner  │ │Runner│ │ Runner │ │Runner│ │  │   │
│  │  │  └─────────┘ └──────┘ └────────┘ └──────┘ │  │   │
│  │  └────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Hooks run via Claude Code CLI natively** — The Claude Agent SDK already executes hooks defined in `settings.json`. Theia's role is to *configure* hooks and *react* to hook-related events, not to re-implement the hook execution engine.

2. **Theia-managed hooks vs. user hooks** — Theia installs its own hooks (file backup, session cleanup, IDE integration) alongside user-defined hooks. Both coexist in settings files.

3. **Hook configuration is declarative** — Hooks are JSON in settings files. Theia provides a UI to manage them and a programmatic API for extensions to register hooks.

4. **Contribution point for extensions** — A `ClaudeCodeHookContribution` interface allows other Theia packages to register hooks without modifying `ai-claude-code` directly.

---

## Hook Events — Prioritized Implementation Plan

### Priority 1: Critical for IDE Integration (Implement First)

These hooks enable core Theia IDE features that differentiate it from CLI usage.

| Hook Event | Rationale | Theia Use Case |
|------------|-----------|----------------|
| **`PreToolUse`** | ✅ Already implemented (file backup). Extend to support user-defined hooks and `if` conditions. | File backup, lint-before-write, block dangerous commands |
| **`PostToolUse`** | React to completed tool calls. Essential for IDE state sync. | Auto-refresh editors after Write/Edit, trigger diagnostics, update file tree |
| **`Stop`** | ✅ Already implemented (cleanup). Extend for user hooks. | Session cleanup, summary notifications, auto-commit |
| **`Notification`** | Surface Claude Code notifications in Theia's notification system. | Permission prompts, idle alerts, auth events shown as Theia notifications |
| **`SessionStart`** | Initialize IDE state when a Claude session begins. | Set up workspace context, load project-specific settings, show session indicator |
| **`SessionEnd`** | Clean up IDE state when session terminates. | Clear session indicators, persist session metadata, cleanup temp files |

### Priority 2: Enhanced Developer Experience (Implement Second)

These hooks improve the workflow but aren't blocking for basic functionality.

| Hook Event | Rationale | Theia Use Case |
|------------|-----------|----------------|
| **`UserPromptSubmit`** | Intercept/transform prompts before they reach Claude. | Add workspace context, enforce prompt templates, log prompts |
| **`PostToolUseFailure`** | React to failed tool calls. | Show error diagnostics, suggest fixes, auto-retry logic |
| **`PermissionRequest`** | Programmatic permission handling. | Auto-approve safe operations, custom approval UI, policy enforcement |
| **`PostToolBatch`** | React after a batch of parallel tool calls. | Batch refresh editors, run tests after multiple file changes |
| **`InstructionsLoaded`** | Know when CLAUDE.md files are loaded. | Show loaded instructions in UI, validate instruction files |
| **`ConfigChange`** | React to config changes during session. | Hot-reload preferences, notify user of config drift |

### Priority 3: Advanced Workflows (Implement Third)

These hooks support advanced/enterprise use cases.

| Hook Event | Rationale | Theia Use Case |
|------------|-----------|----------------|
| **`Setup`** | One-time initialization in CI/scripts. | Pre-configure workspace, install dependencies |
| **`SubagentStart`** / **`SubagentStop`** | Track subagent lifecycle. | Show subagent activity in UI, resource monitoring |
| **`TaskCreated`** / **`TaskCompleted`** | Track task lifecycle. | Task progress UI, time tracking, audit logging |
| **`TeammateIdle`** | Agent team coordination. | Show team status, auto-assign work |
| **`PermissionDenied`** | React to denied permissions. | Log denials, suggest permission changes, retry with different approach |
| **`StopFailure`** | Handle API errors gracefully. | Show user-friendly error messages, auto-retry on rate limits |

### Priority 4: Specialized/Niche (Implement Last)

These hooks serve narrow use cases or are less relevant in an IDE context.

| Hook Event | Rationale | Theia Use Case |
|------------|-----------|----------------|
| **`UserPromptExpansion`** | Slash command expansion. | Custom slash commands, macro expansion |
| **`CwdChanged`** | Working directory changes. | Update terminal cwd, refresh file tree root |
| **`FileChanged`** | Watch specific files. | Auto-reload configs, trigger builds on file changes |
| **`WorktreeCreate`** / **`WorktreeRemove`** | Git worktree management. | Multi-branch UI, worktree lifecycle |
| **`PreCompact`** / **`PostCompact`** | Context compaction. | Save/restore state around compaction, notify user |
| **`Elicitation`** / **`ElicitationResult`** | MCP server user input. | Custom elicitation UI in Theia |

---

## Implementation Details

### Phase 1: Hook Infrastructure

**New files:**
- `src/common/claude-code-hook-types.ts` — Hook event types, handler types, matcher types
- `src/node/claude-code-hook-service.ts` — Hook registration, settings management, execution
- `src/node/claude-code-hook-contribution.ts` — Extension point interface
- `src/browser/claude-code-hook-preferences.ts` — UI preferences for hook configuration

**Changes to existing files:**
- `claude-code-service-impl.ts` — Refactor `ensureClaudeSettings` to use `ClaudeCodeHookService`
- `claude-code-preferences.ts` — Add hook-related preferences

#### Hook Types (claude-code-hook-types.ts)

```typescript
export type HookEvent =
    | 'SessionStart' | 'Setup' | 'InstructionsLoaded'
    | 'UserPromptSubmit' | 'UserPromptExpansion'
    | 'PreToolUse' | 'PermissionRequest' | 'PermissionDenied'
    | 'PostToolUse' | 'PostToolUseFailure' | 'PostToolBatch'
    | 'Notification' | 'SubagentStart' | 'SubagentStop'
    | 'TaskCreated' | 'TaskCompleted'
    | 'Stop' | 'StopFailure' | 'TeammateIdle'
    | 'ConfigChange' | 'CwdChanged' | 'FileChanged'
    | 'WorktreeCreate' | 'WorktreeRemove'
    | 'PreCompact' | 'PostCompact'
    | 'Elicitation' | 'ElicitationResult'
    | 'SessionEnd';

export type HookHandlerType = 'command' | 'http' | 'mcp_tool' | 'prompt' | 'agent';

export interface HookHandler {
    type: HookHandlerType;
    if?: string;
    timeout?: number;
    statusMessage?: string;
    once?: boolean;
}

export interface CommandHookHandler extends HookHandler {
    type: 'command';
    command: string;
    args?: string[];
    async?: boolean;
    asyncRewake?: boolean;
}

export interface HttpHookHandler extends HookHandler {
    type: 'http';
    url: string;
    headers?: Record<string, string>;
    allowedEnvVars?: string[];
}

export interface McpToolHookHandler extends HookHandler {
    type: 'mcp_tool';
    server: string;
    tool: string;
    input?: Record<string, string>;
}

export interface MatcherGroup {
    matcher?: string;
    hooks: HookHandler[];
}

export interface HookConfig {
    hooks: Partial<Record<HookEvent, MatcherGroup[]>>;
}
```

#### Hook Contribution Point (claude-code-hook-contribution.ts)

```typescript
export const ClaudeCodeHookContribution = Symbol('ClaudeCodeHookContribution');

export interface ClaudeCodeHookContribution {
    /**
     * Register hooks that should be installed for Claude Code sessions.
     * Called when a session starts or when hooks are reconfigured.
     */
    registerHooks(): HookRegistration[];
}

export interface HookRegistration {
    event: HookEvent;
    matcher?: string;
    handler: HookHandler;
    /** Where to write: 'local' (default) or 'project' */
    scope?: 'local' | 'project';
}
```

#### Hook Service (claude-code-hook-service.ts)

```typescript
export const ClaudeCodeHookService = Symbol('ClaudeCodeHookService');

export interface ClaudeCodeHookService {
    /** Collect all hook contributions and write to settings */
    installHooks(cwd: string): Promise<void>;

    /** Remove Theia-managed hooks from settings */
    uninstallHooks(cwd: string): Promise<void>;

    /** Get current hook configuration for a project */
    getHookConfig(cwd: string): Promise<HookConfig>;

    /** Add a user-defined hook */
    addUserHook(cwd: string, event: HookEvent, group: MatcherGroup): Promise<void>;

    /** Remove a user-defined hook */
    removeUserHook(cwd: string, event: HookEvent, matcher: string): Promise<void>;
}
```

### Phase 2: Priority 1 Hooks — IDE Integration

#### PostToolUse: Editor Refresh

```typescript
// Registered by ClaudeCodeEditToolService
{
    event: 'PostToolUse',
    matcher: 'Write|Edit|MultiEdit',
    handler: {
        type: 'command',
        command: 'node ${CLAUDE_PROJECT_DIR}/.claude/hooks/theia-refresh-editors.js'
    }
}
```

The hook script writes a JSON file listing changed paths. The frontend service polls or watches this file to trigger editor refreshes. Alternatively, use an HTTP hook pointing to a Theia-local endpoint.

#### Notification: Theia Notification Bridge

```typescript
{
    event: 'Notification',
    matcher: '',  // all notifications
    handler: {
        type: 'http',
        url: 'http://localhost:${THEIA_HOOK_PORT}/hooks/notification'
    }
}
```

Theia starts a lightweight HTTP server on a random port for hook callbacks. This avoids file-based IPC and enables real-time notification forwarding.

### Phase 3: Hook Callback Server

For hooks that need to communicate back to Theia (Notification, PostToolUse editor refresh, etc.), implement a local HTTP server:

```typescript
@injectable()
export class ClaudeCodeHookCallbackServer {
    private server: http.Server;
    private port: number;

    @postConstruct()
    async start(): Promise<void> {
        this.server = http.createServer(this.handleRequest.bind(this));
        this.port = await getAvailablePort();
        this.server.listen(this.port, '127.0.0.1');
    }

    getPort(): number { return this.port; }

    private handleRequest(req: IncomingMessage, res: ServerResponse): void {
        // Route to appropriate handler based on path
        // POST /hooks/notification -> forward to frontend notification service
        // POST /hooks/post-tool-use -> trigger editor refresh
        // POST /hooks/session-start -> initialize session state
    }
}
```

---

## Hook Handler Type Support

| Handler Type | Priority | Implementation Approach |
|-------------|----------|------------------------|
| `command` | P1 | ✅ Already works. Theia generates Node.js scripts in `.claude/hooks/`. |
| `http` | P1 | Use `ClaudeCodeHookCallbackServer` for Theia-to-Claude communication. Users can point to any URL. |
| `mcp_tool` | P2 | Leverage existing `ai-mcp` package. Configure MCP server name + tool in hook config. Claude Code handles execution. |
| `prompt` | P3 | Claude Code handles execution natively. Theia just needs to write the config. |
| `agent` | P4 | Claude Code handles execution natively. Theia just needs to write the config. |

---

## Configuration UI

### Preferences (Phase 1)

Add to `ClaudeCodePreferencesSchema`:

```typescript
'ai-features.claudeCode.hooks.enabled': {
    type: 'boolean',
    default: true,
    description: 'Enable Claude Code hooks managed by Theia'
}
'ai-features.claudeCode.hooks.autoRefreshEditors': {
    type: 'boolean',
    default: true,
    description: 'Automatically refresh editors after Claude modifies files'
}
'ai-features.claudeCode.hooks.notificationsEnabled': {
    type: 'boolean',
    default: true,
    description: 'Show Claude Code notifications in Theia'
}
```

### Hook Management View (Phase 2)

A dedicated view in the AI configuration panel showing:
- Active hooks per project (read from `.claude/settings.json` and `.claude/settings.local.json`)
- Toggle Theia-managed hooks on/off
- Add/edit/remove user-defined hooks
- Hook execution log/history

---

## Migration Plan

1. **Phase 1**: Refactor existing `ensureFileBackupHook` and `ensureStopHook` into the new `ClaudeCodeHookService`. No behavior change, just architectural cleanup.
2. **Phase 2**: Add `PostToolUse` (editor refresh) and `Notification` hooks using the callback server.
3. **Phase 3**: Add `SessionStart`/`SessionEnd` hooks for session lifecycle management.
4. **Phase 4**: Expose hook configuration UI and contribution point for other extensions.

---

## Security Considerations

- **Hook callback server** binds to `127.0.0.1` only — no external access.
- **User-defined hooks** are written to `.claude/settings.local.json` (gitignored) by default.
- **Theia-managed hooks** are clearly labeled with a `// managed by Theia` comment or a `_theia_managed: true` metadata field for identification during merge/cleanup.
- **HTTP hooks** with `allowedEnvVars` — Theia should not expose sensitive env vars. Only explicitly listed variables are interpolated.
- **Command hooks** run with the same permissions as the Theia backend process. Document this clearly.

---

## Open Questions

1. **IPC mechanism**: Should Theia use HTTP callback server, Unix domain sockets, or file-based IPC for hook-to-Theia communication?
   - *Recommendation*: HTTP on localhost. It's what Claude Code's `http` hook type supports natively, avoiding custom IPC.

2. **Hook script bundling**: Should hook scripts be bundled with the Theia package or generated at runtime?
   - *Recommendation*: Generate at runtime (current approach). Allows dynamic configuration and avoids path resolution issues.

3. **Multi-root workspaces**: How to handle hooks when multiple workspace roots exist?
   - *Recommendation*: Install hooks per-root in each root's `.claude/` directory. The `ClaudeCodeHookService` accepts `cwd` to scope operations.

4. **Hook conflicts**: What happens when a user-defined hook conflicts with a Theia-managed hook on the same event+matcher?
   - *Recommendation*: Both run. Claude Code executes all matching hooks. Document that Theia hooks run alongside user hooks.
