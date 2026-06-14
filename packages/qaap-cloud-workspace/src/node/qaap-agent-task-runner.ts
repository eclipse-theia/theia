// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Emitter, Event } from '@theia/core/lib/common/event';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import { ChildProcess, spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    isQaapAgentTaskFinished,
    type QaapAgentDescriptor,
    type QaapCreateAgentTaskQaiqModel,
    type QaapQaiqModelOption,
    type QaapAgentTask,
    type QaapAgentTaskCwdGroup,
    type QaapAgentTaskDetail,
    type QaapAgentTaskEvent,
    type QaapAgentTaskState,
    type QaapCreateAgentTaskRequest,
    type QaapAgentWarmResult,
} from '../common/qaap-agent-task';
import {
    QAAP_BUILTIN_AGENT_DEFINITIONS,
    QAAP_BUILTIN_AGENT_IDS,
    isUiHiddenVpsAgent,
    resolveQaapBuiltinAgentMentionId,
    resolveQaapCodexTemplate,
} from '@theia/qaap-mobile-shell/lib/common/qaap-builtin-agents';
import { LEGACY_OPENCLAUDE_AGENT_ID, resolveQaapAgentMentionToken } from '@theia/qaap-mobile-shell/lib/common/qaap-agent-task-client';
import {
    formatQaiqInteractionFlags,
    type QaapQaiqInteractionFlagOptions,
} from '@theia/qaap-mobile-shell/lib/common/qaap-qaiq-interaction-flags';
import type { QaapAgentApprovalPolicyId } from '@theia/qaap-mobile-shell/lib/common/qaap-sticky-composer-approval-policy';
import { agentUsesSettingsModelCatalog } from '../common/qaap-agent-native-model-catalog';
import { listNativeAgentModels } from './qaap-agent-native-models';
import { listQaiqModelsFromPreferences } from '@theia/qaap-mobile-shell/lib/common/qaap-qaiq-model-catalog';
import {
    applyAgentApprovalPolicyToCommand,
    shouldUseQaiqStdioApprovals,
} from '../common/qaap-agent-approval-flags';
import {
    QAIQ_STDIO_APPROVAL_FLAGS,
    buildQaiqControlResponseLine,
    buildQaiqStdioPromptLine,
    parseQaiqStdioEvent,
    type QaapQaiqPendingControlRequest,
} from '../common/qaap-qaiq-stdio-approvals';
import { findQaiqDevServerGuardDenial } from '../common/qaap-agent-dev-server-guard';
import {
    buildQaiqAutoDeniedToolMessage,
    buildQaiqQueuedApprovalTimeoutMessage,
    resolveQaiqControlRequestAutoAction,
} from '../common/qaap-qaiq-control-auto-response';
import {
    resolveAgentAutoApprove,
} from '../common/qaap-agent-auto-approve';
import { filterAgentProcessLogChunk } from '../common/qaap-agent-log-filter';
import { formatModelFlagsForAgent } from '../common/qaap-agent-model-flags';
import {
    applyQaapQaiqCredentialEnv,
    applyQaapQaiqModelEnv,
    bindingFromQaiqModelSelection,
    formatQaiqProviderFlags,
    normalizeQaiqModelBinding,
    resolveQaapQaiqModelBinding,
    type QaapQaiqModelBinding,
} from '../common/qaap-qaiq-model-binding';
import { resolveRequestAgentModel, resolveTaskAgentModel } from '../common/qaap-agent-task';
import { resolveEffectiveRequestAgentModel } from '../common/qaap-agent-task-model-routing';
import { appendAgentDefaultWorkflowToPrompt } from '../common/qaap-agent-default-workflow';
import { prependAgentTaskContextToPrompt, truncateProjectInfo } from '../common/qaap-agent-task-context';
import {
    countRunningTasksForCwd,
    selectNextQueuedTask,
    shouldQueueTask,
} from '../common/qaap-agent-task-repo-queue';
import { QaapAgentProcessSupervisor } from './qaap-agent-process-supervisor';
import { scheduleProcessTreeKillByPid } from './qaap-agent-process-kill';
import { resolveKillGraceMs } from '../common/qaap-agent-process-limits';
import {
    isAgentProcessAlive,
    removeRunningTaskSnapshot,
    upsertRunningTaskSnapshot,
    type QaapAgentRunningTaskSnapshotIndex,
} from '../common/qaap-agent-task-running-snapshot';
import {
    applyAntigravityModelSetting,
    isAntigravityCliCommand,
} from './qaap-antigravity-settings';
import { QaapWebPushService } from './qaap-web-push-service';

/** Built-in coding agents the runner can auto-detect on the server's PATH. */
interface AgentCandidate {
    readonly id: string;
    readonly label: string;
    /** Executable name to look up on PATH (`which <bin>`). */
    readonly bin?: string;
    /** Template applied to the user prompt; `{prompt}` is replaced with a shell-quoted value. */
    readonly template: string;
}

/** Built-in QAAP coding agent (fork of OpenClaude): https://github.com/juancristobalgd1/qaiq */
export const QAIQ_AGENT_ID = 'qaiq';

const AGENT_CANDIDATES: readonly AgentCandidate[] = QAAP_BUILTIN_AGENT_DEFINITIONS;

/**
 * Optional JSON env var for server-side agent backends beyond the built-ins. Example:
 *
 * QAAP_AGENT_COMMANDS='[
 *   {"id":"aider-gemini","label":"Aider Gemini","bin":"aider","template":"aider --yes-always --model gemini/gemini-2.5-flash --message {prompt}"},
 *   {"id":"qaiq-gemini","label":"QAIQ Gemini","bin":"qaiq","template":"qaiq --print --dangerously-skip-permissions --provider gemini --model gemini-2.5-flash {prompt}"}
 * ]'
 *
 * API keys stay in the regular provider env vars consumed by the underlying CLI
 * (for example GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, OPENAI_BASE_URL).
 */
const CUSTOM_AGENTS_ENV = 'QAAP_AGENT_COMMANDS';

/** Cap on the per-project info artifact injected into prompts, to keep the agent command bounded. */
const PROJECT_INFO_MAX_CHARS = 8000;

/** When several CLIs are on PATH, prefer BYOK/free-tier runners over subscription CLIs. */
const DEFAULT_AGENT_PREFERENCE: readonly string[] = [QAIQ_AGENT_ID, 'aider', 'codex', 'claude'];

const AGENT_ENV_PREFS: readonly { readonly env: string; readonly pref: string }[] = [
    { env: 'OPENAI_API_KEY', pref: 'ai-features.openAiOfficial.openAiApiKey' },
    { env: 'ANTHROPIC_API_KEY', pref: 'ai-features.anthropic.AnthropicApiKey' },
    { env: 'GOOGLE_API_KEY', pref: 'ai-features.google.apiKey' },
    { env: 'GEMINI_API_KEY', pref: 'ai-features.google.apiKey' },
    { env: 'OPENROUTER_API_KEY', pref: 'ai-features.openrouter.openrouterApiKey' },
    { env: 'OPENROUTER_BASE_URL', pref: 'ai-features.openrouter.openrouterBaseUrl' },
    { env: 'NVIDIA_API_KEY', pref: 'ai-features.nvidia.nvidiaApiKey' },
    { env: 'OLLAMA_HOST', pref: 'ai-features.ollama.ollamaHost' },
    { env: 'HUGGINGFACE_API_KEY', pref: 'ai-features.huggingFace.apiKey' },
];

/** Pseudo-agent that runs the prompt verbatim as a shell command. */
const SHELL_AGENT_ID = 'shell';
/** Reserved id for the QAAP_AGENT_COMMAND env-var template, when set. */
const ENV_AGENT_ID = 'env';

const STORE_DIR = path.join(os.homedir(), '.qaap', 'agent-tasks');
const INDEX_PATH = path.join(STORE_DIR, 'index.json');
/** Serialized create requests for tasks waiting in the per-repo queue. */
const QUEUE_SPAWNS_PATH = path.join(STORE_DIR, 'queue-spawns.json');
/** Live process metadata for tasks that may survive a backend restart. */
const RUNNING_SNAPSHOTS_PATH = path.join(STORE_DIR, 'running-tasks.json');
const DETACHED_LOG_POLL_MS = 2_000;
const SNAPSHOT_PERSIST_DEBOUNCE_MS = 5_000;
/** Cap returned log size so a runaway task cannot blow up the response. */
const MAX_LOG_BYTES = 512 * 1024;
/**
 * Auto-approve runs ("approve for me") queue gated shell/network tools to the approvals UI,
 * but must not hang forever if nobody is watching — deny after this grace period so the
 * agent can finish the turn with the tools it has.
 */
const QUEUED_APPROVAL_GRACE_TIMEOUT_MS = 5 * 60 * 1000;

/** Auth token file shared between the backend and the `qaap-task` helper. */
const TOKEN_PATH = path.join(os.homedir(), '.qaap', 'task-token');
/** Helper-CLI install location; agents get this dir prepended to their PATH. */
const HELPER_BIN_DIR = path.join(os.homedir(), '.qaap', 'bin');
const HELPER_BIN_PATH = path.join(HELPER_BIN_DIR, 'qaap-task');

/**
 * Source of the `qaap-task` helper script written to {@link HELPER_BIN_PATH} at startup.
 * The script POSTs `{prompt, cwd, parentId, agent?}` to the agent-tasks API using the shared
 * token, then prints the new task id and exits — fire-and-forget by design so a parent agent
 * can fan out work without blocking. Kept dependency-free (only Node built-ins).
 */
const HELPER_CLI_SOURCE = `#!/usr/bin/env node
'use strict';
const http = require('node:http');
const https = require('node:https');
const { URL } = require('node:url');

const apiUrl = process.env.QAAP_TASK_API_URL;
const token = process.env.QAAP_TASK_TOKEN;
if (!apiUrl || !token) {
    console.error('qaap-task: missing QAAP_TASK_API_URL or QAAP_TASK_TOKEN in env.');
    process.exit(2);
}

const args = process.argv.slice(2);
let agent;
const positional = [];
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--agent' && i + 1 < args.length) {
        agent = args[++i];
    } else if (arg.startsWith('--agent=')) {
        agent = arg.slice('--agent='.length);
    } else if (arg === '--help' || arg === '-h') {
        console.log('Usage: qaap-task [--agent <id>] <prompt>');
        process.exit(0);
    } else {
        positional.push(arg);
    }
}
const prompt = positional.join(' ').trim();
if (!prompt) {
    console.error('qaap-task: <prompt> is required.');
    process.exit(2);
}

const payload = JSON.stringify({
    prompt,
    cwd: process.cwd(),
    parentId: process.env.QAAP_TASK_PARENT_ID || undefined,
    agent,
    autoApprove: process.env.QAAP_TASK_AUTO_APPROVE === '1' ? true : undefined,
});
const target = new URL(apiUrl);
const transport = target.protocol === 'https:' ? https : http;
const req = transport.request({
    hostname: target.hostname,
    port: target.port || (target.protocol === 'https:' ? 443 : 80),
    path: target.pathname + (target.search || ''),
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'X-Qaap-Task-Token': token,
    },
}, res => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
                const task = JSON.parse(data);
                console.log(task.id || data);
            } catch {
                console.log(data);
            }
            process.exit(0);
        }
        console.error('qaap-task: HTTP ' + res.statusCode + ': ' + data);
        process.exit(1);
    });
});
req.on('error', err => { console.error('qaap-task: ' + err.message); process.exit(1); });
req.write(payload);
req.end();
`;

/**
 * Runs background tasks on the VPS as detached-from-tab child processes. A task keeps running
 * after the browser tab is closed or the phone is locked, because it lives in the backend
 * process — and on completion the backend itself sends a Web Push, so the user is notified
 * even with no tab open. This is the execution substrate the autonomous agent loop plugs into.
 */
@injectable()
export class QaapAgentTaskRunner {

    @inject(QaapWebPushService)
    protected readonly webPush: QaapWebPushService;

    @inject(QaapAgentProcessSupervisor)
    protected readonly processSupervisor: QaapAgentProcessSupervisor;

    @inject(PreferenceService) @optional()
    protected readonly preferenceService: PreferenceService | undefined;

    protected readonly tasks = new Map<string, QaapAgentTask>();
    protected readonly processes = new Map<string, ChildProcess>();
    /** Tasks spawned with stdin piped for manual approval mode. */
    protected readonly stdinInteractiveTasks = new Set<string>();
    /** Prompts to deliver over stdin for QAIQ stdio-approval runs (`--input-format stream-json`). */
    protected readonly stdinPrompts = new Map<string, string>();
    /** Unanswered `can_use_tool` control requests per task — the pause-and-wait approval queue. */
    protected readonly pendingQaiqControlRequests = new Map<string, QaapQaiqPendingControlRequest[]>();
    /** Grace timers (per task, per requestId) auto-denying queued approvals of auto-approve runs. */
    protected readonly queuedApprovalTimers = new Map<string, Map<string, NodeJS.Timeout>>();
    /** Tasks using QAIQ stream-json stdin — never answer with legacy `y`/`n` lines. */
    protected readonly qaiqStdioTasks = new Set<string>();
    /** Agents whose CLI was found on PATH at startup, keyed by id. */
    protected readonly detectedAgents = new Map<string, AgentCandidate>();
    /** Random token shared with spawned agents so they can call back via `qaap-task`. */
    protected helperToken = '';
    /** URL spawned agents POST sub-tasks to. Bound from the backend's listen port. */
    protected helperApiUrl = '';
    /** Best-effort `package.json#name` per cwd; lazily populated. */
    protected readonly projectNameCache = new Map<string, string>();
    /** Cached `.prompts/project-info.prompttemplate` per cwd — primed by {@link warmForCwd}. */
    protected readonly projectInfoCache = new Map<string, string | undefined>();
    /** Agent bins probed once per backend process (`qaiq --version`, etc.). */
    protected readonly probedAgentBins = new Set<string>();
    /** Create payloads for {@link QaapAgentTaskState.queued} tasks — restored from disk on startup. */
    protected readonly pendingSpawnRequests = new Map<string, QaapCreateAgentTaskRequest>();
    /** Pids re-attached after backend restart when the agent process is still alive. */
    protected readonly externalPids = new Map<string, number>();
    /** Byte offset already streamed for detached log tailers. */
    protected readonly logTailOffsets = new Map<string, number>();
    protected readonly detachedLogWatchers = new Map<string, NodeJS.Timeout>();
    protected runningSnapshots: QaapAgentRunningTaskSnapshotIndex = {};
    protected snapshotPersistTimer: NodeJS.Timeout | undefined;

    protected readonly onDidChangeTaskEmitter = new Emitter<QaapAgentTaskEvent>();
    /**
     * Fires every time a task is created, transitions state, or is cancelled. SSE endpoints and
     * cross-project UIs subscribe here to update their views without polling.
     */
    readonly onDidChangeTask: Event<QaapAgentTaskEvent> = this.onDidChangeTaskEmitter.event;

    @postConstruct()
    protected init(): void {
        this.detectAgents();
        this.ensureHelperCli();
        void this.restoreFromDisk();
    }

    /**
     * Provision the auth token and write the `qaap-task` helper script to disk so spawned
     * agents can call back into this API. Idempotent — safe to run on every startup.
     */
    protected ensureHelperCli(): void {
        try {
            fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
            this.helperToken = this.loadOrCreateToken();
            fs.mkdirSync(HELPER_BIN_DIR, { recursive: true });
            fs.writeFileSync(HELPER_BIN_PATH, HELPER_CLI_SOURCE, { mode: 0o755 });
        } catch (error) {
            console.warn('[qaap-agent-tasks] failed to install helper CLI:', error);
        }
    }

    protected loadOrCreateToken(): string {
        try {
            const existing = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
            if (existing) {
                return existing;
            }
        } catch {
            /* fall through to create */
        }
        const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
        fs.writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
        return token;
    }

    /** True when the caller presents the same helper-CLI token written at startup. */
    verifyHelperToken(presented: string | undefined): boolean {
        if (!presented || !this.helperToken) {
            return false;
        }
        // Constant-time compare to avoid token-length oracles.
        const a = Buffer.from(presented);
        const b = Buffer.from(this.helperToken);
        if (a.length !== b.length) {
            return false;
        }
        let diff = 0;
        for (let i = 0; i < a.length; i++) {
            diff |= a[i] ^ b[i];
        }
        return diff === 0;
    }

    /** Called by the backend application once the HTTP server is listening on `port`. */
    bindHelperApiUrl(port: number): void {
        this.helperApiUrl = `http://127.0.0.1:${port}/qaap/api/agent-tasks`;
    }

    /** Probe each known agent's binary on PATH once at startup. */
    protected detectAgents(): void {
        for (const candidate of AGENT_CANDIDATES) {
            if (this.isCandidateAvailable(candidate)) {
                this.detectedAgents.set(candidate.id, candidate);
            }
        }
        this.detectAntigravityAgent();
        this.detectCodexAgent();
        this.detectQaiqAgent();
        for (const candidate of this.readCustomAgents()) {
            if (this.isCandidateAvailable(candidate)) {
                this.detectedAgents.set(candidate.id, candidate);
            }
        }
        this.logDetectedAgents();
    }

    /** Startup diagnostics for VPS/Docker: confirms QAIQ is on PATH before users hit @qaiq. */
    protected logDetectedAgents(): void {
        const ids = [...this.detectedAgents.keys()];
        console.log(`[qaap-agent-tasks] detected agents: ${ids.length ? ids.join(', ') : '(none — install qaiq or set QAAP_AGENT_COMMAND)'}`);
        if (!this.detectedAgents.has(QAIQ_AGENT_ID)) {
            return;
        }
        try {
            const probe = spawnSync('qaiq', ['--version'], { encoding: 'utf8' });
            const line = (probe.stdout || probe.stderr || '').trim().split('\n')[0];
            if (line) {
                console.log(`[qaap-agent-tasks] qaiq: ${line}`);
            }
        } catch {
            /* ignore */
        }
    }

    protected isCandidateAvailable(candidate: AgentCandidate): boolean {
        return !candidate.bin || this.isOnPath(candidate.bin);
    }

    /**
     * Prefer the Google Antigravity CLI (`agy`), then community `antigravity`, then legacy `gemini`.
     */
    protected resolveAntigravityBin(): string | undefined {
        if (this.isOnPath('agy')) {
            return 'agy';
        }
        if (this.isOnPath('antigravity')) {
            return 'antigravity';
        }
        if (this.isOnPath('gemini')) {
            return 'gemini';
        }
        return undefined;
    }

    protected detectAntigravityAgent(): void {
        const bin = this.resolveAntigravityBin();
        if (!bin) {
            return;
        }
        const template = bin === 'gemini'
            ? 'gemini --approval-mode=yolo -p {prompt}'
            : `${bin} -p {prompt}`;
        this.detectedAgents.set('antigravity', {
            id: 'antigravity',
            label: 'Antigravity CLI',
            bin,
            template,
        });
    }

    /** Prefer `qaiq` on PATH; accept legacy `openclaude` binary until installs catch up. */
    protected resolveQaiqBin(): string | undefined {
        if (this.isOnPath('qaiq')) {
            return 'qaiq';
        }
        if (this.isOnPath('openclaude')) {
            return 'openclaude';
        }
        return undefined;
    }

    protected detectQaiqAgent(): void {
        const bin = this.resolveQaiqBin();
        if (!bin) {
            return;
        }
        this.detectedAgents.set(QAIQ_AGENT_ID, {
            id: QAIQ_AGENT_ID,
            label: 'QAIQ',
            bin,
            template: `${bin} --print --output-format stream-json --verbose --include-partial-messages {qaiq_flags} {prompt}`,
        });
    }

    protected detectCodexAgent(): void {
        if (!this.isOnPath('codex')) {
            return;
        }
        const help = this.readCodexHelp();
        this.detectedAgents.set('codex', {
            id: 'codex',
            label: 'Codex',
            bin: 'codex',
            template: resolveQaapCodexTemplate(help),
        });
    }

    protected readCodexHelp(): string {
        try {
            const probe = spawnSync('codex', ['--help'], { encoding: 'utf8' });
            return `${probe.stdout || ''}\n${probe.stderr || ''}`;
        } catch {
            return '';
        }
    }

    protected isQaiqRunner(agentId: string | undefined, command: string): boolean {
        if (agentId === QAIQ_AGENT_ID) {
            return true;
        }
        return /\b(qaiq|openclaude)\b/.test(command);
    }

    protected readCustomAgents(): AgentCandidate[] {
        const raw = process.env[CUSTOM_AGENTS_ENV]?.trim();
        if (!raw) {
            return [];
        }
        try {
            const parsed = JSON.parse(raw) as unknown;
            if (!Array.isArray(parsed)) {
                throw new Error(`${CUSTOM_AGENTS_ENV} must be a JSON array.`);
            }
            return parsed.flatMap((entry, index) => this.parseCustomAgent(entry, index));
        } catch (error) {
            console.warn(`[qaap-agent-tasks] ignored ${CUSTOM_AGENTS_ENV}:`, error instanceof Error ? error.message : error);
            return [];
        }
    }

    protected parseCustomAgent(entry: unknown, index: number): AgentCandidate[] {
        if (!entry || typeof entry !== 'object') {
            console.warn(`[qaap-agent-tasks] ignored ${CUSTOM_AGENTS_ENV}[${index}]: entry must be an object.`);
            return [];
        }
        const record = entry as { id?: unknown; label?: unknown; bin?: unknown; template?: unknown; command?: unknown };
        const id = typeof record.id === 'string' ? record.id.trim().toLowerCase() : '';
        const label = typeof record.label === 'string' ? record.label.trim() : '';
        const bin = typeof record.bin === 'string' ? record.bin.trim() : undefined;
        const template = typeof record.template === 'string'
            ? record.template.trim()
            : typeof record.command === 'string'
                ? record.command.trim()
                : '';
        if (
            !/^[a-z][a-z0-9-]{1,63}$/.test(id)
            || id === SHELL_AGENT_ID
            || id === ENV_AGENT_ID
            || id === QAIQ_AGENT_ID
            || AGENT_CANDIDATES.some(candidate => candidate.id === id)
        ) {
            console.warn(`[qaap-agent-tasks] ignored ${CUSTOM_AGENTS_ENV}[${index}]: invalid or reserved id "${id}".`);
            return [];
        }
        if (!template) {
            console.warn(`[qaap-agent-tasks] ignored ${CUSTOM_AGENTS_ENV}[${index}]: template is required.`);
            return [];
        }
        return [{ id, label: label || id, bin, template }];
    }

    protected isOnPath(bin: string): boolean {
        const cmd = process.platform === 'win32' ? 'where' : 'which';
        try {
            return spawnSync(cmd, [bin], { stdio: 'ignore' }).status === 0;
        } catch {
            return false;
        }
    }

    /** Reload persisted tasks; any task still marked running lost its process on backend restart. */
    protected async restoreFromDisk(): Promise<void> {
        try {
            const raw = await fsp.readFile(INDEX_PATH, 'utf8');
            const stored = JSON.parse(raw) as QaapAgentTask[];
            for (const task of stored) {
                this.tasks.set(task.id, task.state === 'running' ? { ...task, state: 'interrupted' } : task);
            }
            await this.persist();
        } catch {
            /* no prior tasks */
        }
        await this.restorePendingSpawnsFromDisk();
        this.drainAllQueues();
        await this.reattachSurvivingProcesses();
    }

    protected maxConcurrentPerRepo(): number {
        return this.processSupervisor.resolvePolicy(process.env).maxConcurrentPerRepo;
    }

    protected countRunningForCwd(cwd: string): number {
        return countRunningTasksForCwd([...this.tasks.values()], cwd);
    }

    protected async restorePendingSpawnsFromDisk(): Promise<void> {
        try {
            const raw = await fsp.readFile(QUEUE_SPAWNS_PATH, 'utf8');
            const stored = JSON.parse(raw) as Record<string, QaapCreateAgentTaskRequest>;
            for (const [taskId, request] of Object.entries(stored)) {
                if (this.tasks.get(taskId)?.state === 'queued') {
                    this.pendingSpawnRequests.set(taskId, request);
                }
            }
        } catch {
            /* no queued spawn payloads */
        }
    }

    protected async persistPendingSpawns(): Promise<void> {
        try {
            await fsp.mkdir(STORE_DIR, { recursive: true });
            const payload: Record<string, QaapCreateAgentTaskRequest> = {};
            for (const [taskId, request] of this.pendingSpawnRequests) {
                if (this.tasks.get(taskId)?.state === 'queued') {
                    payload[taskId] = request;
                }
            }
            await fsp.writeFile(QUEUE_SPAWNS_PATH, JSON.stringify(payload, undefined, 2), 'utf8');
        } catch {
            /* persistence is best-effort */
        }
    }

    /** Start queued tasks for a cwd while slots remain under the per-repo cap. */
    protected drainQueueForCwd(cwd: string): void {
        const resolved = path.resolve(cwd);
        while (this.countRunningForCwd(resolved) < this.maxConcurrentPerRepo()) {
            const next = selectNextQueuedTask([...this.tasks.values()], resolved);
            if (!next) {
                return;
            }
            const request = this.pendingSpawnRequests.get(next.id) ?? this.reconstructSpawnRequest(next);
            this.pendingSpawnRequests.delete(next.id);
            void this.persistPendingSpawns();
            const running: QaapAgentTask = { ...next, state: 'running' };
            this.tasks.set(next.id, running);
            void this.persist();
            this.onDidChangeTaskEmitter.fire({ type: 'created', task: running });
            void this.spawnProcessWhenReady(running, request);
        }
    }

    protected drainAllQueues(): void {
        const cwds = new Set<string>();
        for (const task of this.tasks.values()) {
            if (task.state === 'queued') {
                cwds.add(task.cwd);
            }
        }
        for (const cwd of cwds) {
            this.drainQueueForCwd(cwd);
        }
    }

    protected reconstructSpawnRequest(task: QaapAgentTask): QaapCreateAgentTaskRequest {
        const agentModel = resolveTaskAgentModel(task);
        return {
            cwd: task.cwd,
            title: task.title,
            command: task.command,
            prompt: task.command,
            parentId: task.parentId,
            autoApprove: task.autoApprove,
            ...(agentModel ? { agentModel, qaiqModel: agentModel } : {}),
        };
    }

    protected async loadRunningSnapshotsFromDisk(): Promise<QaapAgentRunningTaskSnapshotIndex> {
        try {
            const raw = await fsp.readFile(RUNNING_SNAPSHOTS_PATH, 'utf8');
            return JSON.parse(raw) as QaapAgentRunningTaskSnapshotIndex;
        } catch {
            return {};
        }
    }

    protected scheduleRunningSnapshotPersist(): void {
        if (this.snapshotPersistTimer) {
            return;
        }
        this.snapshotPersistTimer = setTimeout(() => {
            this.snapshotPersistTimer = undefined;
            void this.persistRunningSnapshots();
        }, SNAPSHOT_PERSIST_DEBOUNCE_MS);
    }

    protected async persistRunningSnapshots(): Promise<void> {
        try {
            await fsp.mkdir(STORE_DIR, { recursive: true });
            await fsp.writeFile(RUNNING_SNAPSHOTS_PATH, JSON.stringify(this.runningSnapshots, undefined, 2), 'utf8');
        } catch {
            /* persistence is best-effort */
        }
    }

    protected registerRunningSnapshot(task: QaapAgentTask, pid: number | undefined, logBytes = 0): void {
        if (!pid) {
            return;
        }
        this.runningSnapshots = upsertRunningTaskSnapshot(this.runningSnapshots, {
            taskId: task.id,
            pid,
            logBytes,
            updatedAt: Date.now(),
            cwd: task.cwd,
        });
        this.scheduleRunningSnapshotPersist();
    }

    protected async touchRunningSnapshotLog(taskId: string): Promise<void> {
        const snapshot = this.runningSnapshots[taskId];
        if (!snapshot) {
            return;
        }
        try {
            const stat = await fsp.stat(this.logPath(taskId));
            if (stat.size === snapshot.logBytes) {
                return;
            }
            this.runningSnapshots = upsertRunningTaskSnapshot(this.runningSnapshots, {
                ...snapshot,
                logBytes: stat.size,
                updatedAt: Date.now(),
            });
            this.scheduleRunningSnapshotPersist();
        } catch {
            /* log not created yet */
        }
    }

    protected unregisterRunningSnapshot(taskId: string): void {
        this.runningSnapshots = removeRunningTaskSnapshot(this.runningSnapshots, taskId);
        void this.persistRunningSnapshots();
    }

    protected async reattachSurvivingProcesses(): Promise<void> {
        this.runningSnapshots = await this.loadRunningSnapshotsFromDisk();
        for (const snapshot of Object.values(this.runningSnapshots)) {
            const task = this.tasks.get(snapshot.taskId);
            if (!task || task.state !== 'interrupted' || !isAgentProcessAlive(snapshot.pid)) {
                continue;
            }
            const running: QaapAgentTask = { ...task, state: 'running' };
            this.tasks.set(snapshot.taskId, running);
            this.externalPids.set(snapshot.taskId, snapshot.pid);
            this.logTailOffsets.set(snapshot.taskId, snapshot.logBytes);
            void this.persist();
            this.onDidChangeTaskEmitter.fire({ type: 'created', task: running });
            this.startDetachedLogWatch(snapshot.taskId, snapshot.pid);
        }
    }

    protected startDetachedLogWatch(taskId: string, pid: number): void {
        this.stopDetachedLogWatch(taskId);
        const stub = { pid } as ChildProcess;
        const processWatch = this.processSupervisor.startWatch(taskId, stub, {
            isStillRunning: () => this.tasks.get(taskId)?.state === 'running',
            isIdlePaused: () => false,
            onTimeout: (_reason, message) => {
                if (!this.externalPids.has(taskId)) {
                    return;
                }
                void this.failDetachedTask(taskId, pid, message);
            },
        });
        const timer = setInterval(() => {
            void this.pollDetachedLog(taskId, pid, processWatch);
        }, DETACHED_LOG_POLL_MS);
        this.detachedLogWatchers.set(taskId, timer);
    }

    protected stopDetachedLogWatch(taskId: string): void {
        const timer = this.detachedLogWatchers.get(taskId);
        if (timer) {
            clearInterval(timer);
            this.detachedLogWatchers.delete(taskId);
        }
        this.processSupervisor.release(taskId);
    }

    protected async pollDetachedLog(
        taskId: string,
        pid: number,
        processWatch: { bumpIdleTimer: () => void; release: () => void },
    ): Promise<void> {
        const task = this.tasks.get(taskId);
        if (!task || task.state !== 'running') {
            this.stopDetachedLogWatch(taskId);
            return;
        }
        if (!isAgentProcessAlive(pid)) {
            this.externalPids.delete(taskId);
            this.stopDetachedLogWatch(taskId);
            this.unregisterRunningSnapshot(taskId);
            this.finishTask(taskId, 'failed', undefined);
            return;
        }
        try {
            const logPath = this.logPath(taskId);
            const stat = await fsp.stat(logPath);
            const offset = this.logTailOffsets.get(taskId) ?? 0;
            if (stat.size <= offset) {
                return;
            }
            const length = Math.min(stat.size - offset, MAX_LOG_BYTES);
            const handle = await fsp.open(logPath, 'r');
            try {
                const { buffer, bytesRead } = await handle.read({
                    buffer: Buffer.alloc(length),
                    position: offset,
                });
                if (bytesRead > 0) {
                    this.logTailOffsets.set(taskId, offset + bytesRead);
                    processWatch.bumpIdleTimer();
                    this.fireOutput(taskId, buffer.subarray(0, bytesRead));
                    void this.touchRunningSnapshotLog(taskId);
                }
            } finally {
                await handle.close();
            }
        } catch {
            /* log not readable yet */
        }
    }

    protected async failDetachedTask(taskId: string, pid: number, message: string): Promise<void> {
        if (this.tasks.get(taskId)?.state !== 'running') {
            return;
        }
        try {
            await fsp.appendFile(this.logPath(taskId), `\n[qaap] ${message}\n`, 'utf8');
        } catch {
            /* ignore */
        }
        scheduleProcessTreeKillByPid(pid, resolveKillGraceMs(process.env));
        this.externalPids.delete(taskId);
        this.stopDetachedLogWatch(taskId);
        this.unregisterRunningSnapshot(taskId);
        this.finishTask(taskId, 'failed', undefined);
    }

    list(): QaapAgentTask[] {
        return [...this.tasks.values()].sort((a, b) => b.createdAt - a.createdAt);
    }

    /** Tasks scoped to one project (by working directory); all tasks when `cwd` is omitted. */
    listForCwd(cwd: string | undefined): QaapAgentTask[] {
        const all = this.list();
        if (!cwd) {
            return all;
        }
        const resolved = path.resolve(cwd);
        return all.filter(task => task.cwd === resolved);
    }

    /**
     * All tasks bucketed by their (already-normalized) {@link QaapAgentTask.cwd}. Groups are
     * ordered by the most recent task in each — so a project with an actively-running task floats
     * to the top of the cross-project dashboard.
     */
    listAllGroupedByCwd(): QaapAgentTaskCwdGroup[] {
        const buckets = new Map<string, QaapAgentTask[]>();
        for (const task of this.list()) {
            const bucket = buckets.get(task.cwd);
            if (bucket) {
                bucket.push(task);
            } else {
                buckets.set(task.cwd, [task]);
            }
        }
        const groups: QaapAgentTaskCwdGroup[] = [];
        for (const [cwd, tasks] of buckets) {
            groups.push({
                cwd,
                projectName: this.resolveProjectName(cwd),
                activeCount: tasks.reduce((n, task) => n + (task.state === 'running' ? 1 : 0), 0),
                tasks,
            });
        }
        // `list()` already returns newest-first, so tasks[0] is the most recent in each group.
        groups.sort((a, b) => (b.tasks[0]?.createdAt ?? 0) - (a.tasks[0]?.createdAt ?? 0));
        return groups;
    }

    /**
     * Best-effort display name for a cwd. Reads `package.json#name` once and caches it; falls
     * back to the directory basename when no package manifest is present or readable.
     */
    protected resolveProjectName(cwd: string): string {
        const cached = this.projectNameCache.get(cwd);
        if (cached !== undefined) {
            return cached;
        }
        let name = path.basename(cwd) || cwd;
        try {
            const manifest = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')) as { name?: unknown };
            if (typeof manifest.name === 'string' && manifest.name.trim()) {
                name = manifest.name.trim();
            }
        } catch {
            /* no package.json — fall back to basename */
        }
        this.projectNameCache.set(cwd, name);
        return name;
    }

    /** True when at least one coding agent is available — autodetected or env-configured. */
    isAgentConfigured(): boolean {
        return this.detectedAgents.size > 0 || !!process.env.QAAP_AGENT_COMMAND?.trim();
    }

    /** Agents the UI can offer in its picker, in priority order. */
    listAgents(): QaapAgentDescriptor[] {
        const result: QaapAgentDescriptor[] = [];
        for (const candidate of AGENT_CANDIDATES) {
            if (this.detectedAgents.has(candidate.id)) {
                result.push({ id: candidate.id, label: candidate.label, available: true });
            }
        }
        for (const [, candidate] of this.detectedAgents) {
            if (!AGENT_CANDIDATES.some(builtIn => builtIn.id === candidate.id)) {
                result.push({ id: candidate.id, label: candidate.label, available: true });
            }
        }
        if (process.env.QAAP_AGENT_COMMAND?.trim()) {
            result.push({ id: ENV_AGENT_ID, label: 'Custom (QAAP_AGENT_COMMAND)', available: true });
        }
        result.push({ id: SHELL_AGENT_ID, label: 'Shell command', available: true });
        return result.filter(agent => !isUiHiddenVpsAgent(agent.id));
    }

    /**
     * Best-effort warm-up after workspace open: cache project metadata and probe the QAIQ binary
     * so the first user message skips cold-start disk reads and Node CLI startup.
     */
    warmForCwd(cwd: string): QaapAgentWarmResult {
        const resolved = path.resolve(cwd);
        if (!fs.existsSync(resolved)) {
            throw new Error(`Workspace directory does not exist: ${resolved}`);
        }
        this.readProjectInfo(resolved);
        this.resolveProjectName(resolved);
        const qaiqProbed = this.probeAgentBinOnce(QAIQ_AGENT_ID, () => this.resolveQaiqBin());
        return {
            cwd: resolved,
            agentsReady: this.isAgentConfigured(),
            projectInfoCached: this.projectInfoCache.has(resolved),
            projectNameCached: this.projectNameCache.has(resolved),
            qaiqProbed,
        };
    }

    protected probeAgentBinOnce(agentId: string, resolveBin: () => string | undefined): boolean {
        if (this.probedAgentBins.has(agentId)) {
            return true;
        }
        const bin = resolveBin();
        if (!bin) {
            return false;
        }
        try {
            spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 8000 });
            this.probedAgentBins.add(agentId);
            return true;
        } catch {
            return false;
        }
    }

    listQaiqModels(): QaapQaiqModelOption[] {
        if (!this.preferenceService) {
            return [];
        }
        return listQaiqModelsFromPreferences(
            key => this.preferenceService!.get(key),
            key => process.env[key],
        );
    }

    /** Model options for the mobile agent picker (native CLI catalog, or Settings on the browser for Qwen). */
    listModelsForAgent(agentId: string | undefined): QaapQaiqModelOption[] {
        const normalized = this.normalizeAgentId(agentId ?? '');
        if (!normalized || agentUsesSettingsModelCatalog(normalized)) {
            return [];
        }
        return listNativeAgentModels(normalized);
    }

    /** Id picked when a create request omits one — first detected agent, env template, or shell. */
    defaultAgent(): string {
        const configured = this.normalizeAgentId(process.env.QAAP_DEFAULT_AGENT);
        if (configured && this.detectedAgents.has(configured) && !isUiHiddenVpsAgent(configured)) {
            return configured;
        }
        for (const id of DEFAULT_AGENT_PREFERENCE) {
            if (this.detectedAgents.has(id) && !isUiHiddenVpsAgent(id)) {
                return id;
            }
        }
        for (const candidate of [...this.detectedAgents.values()]) {
            if (
                !AGENT_CANDIDATES.some(builtIn => builtIn.id === candidate.id)
                && !isUiHiddenVpsAgent(candidate.id)
            ) {
                return candidate.id;
            }
        }
        if (process.env.QAAP_AGENT_COMMAND?.trim()) {
            return ENV_AGENT_ID;
        }
        return SHELL_AGENT_ID;
    }

    /** Public resolver used by conversation/mobile bridges to accept dynamic custom agent ids. */
    normalizeAgentId(token: string | undefined): string | undefined {
        const normalized = token?.trim().toLowerCase();
        if (!normalized) {
            return undefined;
        }
        const canonical = resolveQaapAgentMentionToken(normalized);
        if (canonical === LEGACY_OPENCLAUDE_AGENT_ID && this.detectedAgents.has(QAIQ_AGENT_ID)) {
            return QAIQ_AGENT_ID;
        }
        if (canonical === SHELL_AGENT_ID) {
            return SHELL_AGENT_ID;
        }
        if (canonical === ENV_AGENT_ID && process.env.QAAP_AGENT_COMMAND?.trim()) {
            return ENV_AGENT_ID;
        }
        if (this.detectedAgents.has(canonical)) {
            return canonical;
        }
        const builtin = resolveQaapBuiltinAgentMentionId(canonical);
        if (builtin && this.detectedAgents.has(builtin)) {
            return builtin;
        }
        return undefined;
    }

    async detail(id: string): Promise<QaapAgentTaskDetail | undefined> {
        const task = this.tasks.get(id);
        if (!task) {
            return undefined;
        }
        return { ...task, log: await this.readLog(id) };
    }

    /** Resolve explicit picker model or route by task kind when none was sent. */
    protected resolveAgentModelForRequest(
        request: QaapCreateAgentTaskRequest,
        prompt: string,
    ): QaapCreateAgentTaskQaiqModel | undefined {
        const explicit = resolveRequestAgentModel(request);
        if (explicit) {
            return explicit;
        }
        if (!this.preferenceService) {
            return undefined;
        }
        const agentId = this.resolveAgentId(prompt, request.agent);
        return resolveEffectiveRequestAgentModel(
            request,
            key => this.preferenceService!.get(key),
            agentId,
        );
    }

    /** Validate the request, spawn the process and start tracking the task. */
    create(request: QaapCreateAgentTaskRequest): QaapAgentTask {
        const prompt = (request.prompt ?? '').trim();
        const rawCommand = (request.command ?? '').trim();
        if (!prompt && !rawCommand) {
            throw new Error('A non-empty "command" or "prompt" is required.');
        }
        const cwd = path.resolve(request.cwd ?? '');
        if (!path.isAbsolute(cwd) || !this.isDirectory(cwd)) {
            throw new Error('A valid absolute "cwd" directory is required.');
        }
        const id = randomUUID();
        const parentId = request.parentId && this.tasks.has(request.parentId) ? request.parentId : undefined;
        const parentTask = parentId ? this.tasks.get(parentId) : undefined;
        const autoApprove = resolveAgentAutoApprove(
            request.autoApprove ?? (parentTask?.autoApprove !== false ? undefined : false),
        );
        const shouldQueue = shouldQueueTask(this.countRunningForCwd(cwd), this.maxConcurrentPerRepo());
        const task: QaapAgentTask = {
            id,
            title: (request.title ?? '').trim() || prompt || rawCommand,
            command: rawCommand || prompt,
            cwd,
            state: shouldQueue ? 'queued' : 'running',
            createdAt: Date.now(),
            parentId,
            autoApprove,
            ...(() => {
                const agentModel = this.resolveAgentModelForRequest(request, prompt || rawCommand);
                return agentModel ? { agentModel, qaiqModel: agentModel } : {};
            })(),
        };
        this.tasks.set(id, task);
        if (shouldQueue) {
            this.pendingSpawnRequests.set(id, request);
            void this.persistPendingSpawns();
        } else {
            void this.spawnProcessWhenReady(task, request);
        }
        void this.persist();
        this.onDidChangeTaskEmitter.fire({ type: 'created', task });
        return task;
    }

    /**
     * Turn a natural-language prompt into the command that runs the coding agent.
     *
     * Resolution order, given the requested {@link agentId}:
     *   1. A detected built-in agent (`claude`, `codex`, `qaiq`, `aider`) → use its template.
     *   2. `'env'` or any unknown id, when `QAAP_AGENT_COMMAND` is set → use that template.
     *   3. `'shell'`, or no agent available → run the prompt verbatim as a shell command.
     *
     * A template's `{prompt}` placeholder is replaced with a POSIX shell-quoted prompt;
     * without a placeholder the prompt is appended.
     *
     * QAIQ + interactive approvals ("request approval" preset / YOLO off) switches to the
     * SDK stdio permission flow: the prompt moves to stdin (`stdinPrompt`) and the CLI is
     * launched with {@link QAIQ_STDIO_APPROVAL_FLAGS} so permission checks pause and wait
     * for a `control_response` instead of auto-denying in headless mode.
     */
    protected buildAgentCommand(
        prompt: string,
        agentId: string | undefined,
        autoApprove: boolean,
        agentModel?: QaapCreateAgentTaskQaiqModel,
        cwd?: string,
        contextPreamble?: string,
        interactionModeId?: string,
        approvalPolicyId?: string,
        toolApprovalRules?: QaapCreateAgentTaskRequest['toolApprovalRules'],
    ): { command: string; stdinPrompt?: string } {
        const id = this.resolveAgentId(prompt, agentId);
        const runnerPrompt = this.stripLeadingAgentMention(prompt);
        if (id === SHELL_AGENT_ID) {
            return { command: runnerPrompt };
        }
        const workflowPrompt = appendAgentDefaultWorkflowToPrompt(runnerPrompt, id);
        // Inject important project context for every agent: cross-project context from the request
        // body plus the per-project info artifact read from the workspace.
        const agentPrompt = prependAgentTaskContextToPrompt(workflowPrompt, contextPreamble, cwd ? this.readProjectInfo(cwd) : undefined);
        this.assertQaiqConfigured(id);
        const detected = this.detectedAgents.get(id);
        let command: string;
        const interaction: QaapQaiqInteractionFlagOptions = {
            interactionModeId,
            approvalPolicyId: approvalPolicyId === 'approve-for-me'
                ? undefined
                : approvalPolicyId as QaapAgentApprovalPolicyId | undefined,
            autoApprove: autoApprove ? true : false,
        };
        const approvalOptions = {
            agentId: id,
            approvalPolicyId: approvalPolicyId as QaapAgentApprovalPolicyId | undefined,
            autoApprove,
            interactionModeId,
            toolApprovalRules,
        };
        const useStdioApprovals = id === QAIQ_AGENT_ID
            && !!detected
            && shouldUseQaiqStdioApprovals(approvalOptions);
        if (detected) {
            const vars = this.buildTemplateVars(id, agentModel, interaction);
            command = useStdioApprovals
                ? this.applyTemplateWithoutPrompt(detected.template, vars)
                : this.applyTemplate(detected.template, agentPrompt, vars);
        } else {
            const envTemplate = process.env.QAAP_AGENT_COMMAND?.trim();
            if (envTemplate) {
                command = this.applyTemplate(envTemplate, agentPrompt, this.buildTemplateVars(id, agentModel, interaction));
            } else {
                command = agentPrompt;
            }
        }
        command = applyAgentApprovalPolicyToCommand(command, approvalOptions);
        if (useStdioApprovals) {
            return { command: `${command} ${QAIQ_STDIO_APPROVAL_FLAGS}`, stdinPrompt: agentPrompt };
        }
        return { command };
    }

    /** Best-effort read of the workspace per-project info artifact (`.prompts/project-info.prompttemplate`). */
    protected readProjectInfo(cwd: string): string | undefined {
        const resolved = path.resolve(cwd);
        if (this.projectInfoCache.has(resolved)) {
            return this.projectInfoCache.get(resolved);
        }
        const info = this.loadProjectInfoFromDisk(resolved);
        this.projectInfoCache.set(resolved, info);
        return info;
    }

    protected loadProjectInfoFromDisk(cwd: string): string | undefined {
        try {
            const file = path.join(cwd, '.prompts', 'project-info.prompttemplate');
            const text = fs.readFileSync(file, 'utf8').trim();
            if (!text) {
                return undefined;
            }
            return truncateProjectInfo(text, PROJECT_INFO_MAX_CHARS);
        } catch {
            return undefined;
        }
    }

    protected resolveAgentId(prompt: string, agentId: string | undefined): string {
        const explicit = this.normalizeAgentId(agentId);
        if (explicit) {
            return explicit;
        }
        if (agentId?.trim()) {
            throw new Error(`Agent "${agentId.trim()}" is not available on this server.`);
        }
        const mentioned = this.extractLastAgentMention(prompt);
        if (mentioned) {
            return mentioned;
        }
        const unavailableMention = this.extractLastAgentMentionToken(prompt);
        if (unavailableMention) {
            throw new Error(`Agent "@${unavailableMention}" is not available on this server.`);
        }
        return this.defaultAgent();
    }

    /** Last recognized `@agent` token wins — avoids stale mentions earlier in a long transcript. */
    protected extractLastAgentMention(prompt: string): string | undefined {
        const regex = /@([a-z][\w-]*)/gi;
        let last: string | undefined;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(prompt)) !== null) {
            const normalized = this.normalizeMentionToken(match[1]);
            if (normalized) {
                last = normalized;
            }
        }
        return last;
    }

    protected extractLastAgentMentionToken(prompt: string): string | undefined {
        const regex = /@([a-z][\w-]*)/gi;
        let last: string | undefined;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(prompt)) !== null) {
            const token = resolveQaapAgentMentionToken(match[1]);
            if (
                token === QAIQ_AGENT_ID
                || token === SHELL_AGENT_ID
                || QAAP_BUILTIN_AGENT_IDS.has(token)
                || resolveQaapBuiltinAgentMentionId(token)
                || this.detectedAgents.has(token)
            ) {
                last = resolveQaapBuiltinAgentMentionId(token) ?? token;
            }
        }
        return last;
    }

    protected normalizeMentionToken(token: string): string | undefined {
        const normalized = token.toLowerCase();
        return this.normalizeAgentId(normalized);
    }

    protected stripLeadingAgentMention(prompt: string): string {
        const match = /^@([a-z][\w-]*)\b\s*/i.exec(prompt);
        if (match && this.normalizeMentionToken(match[1])) {
            return prompt.slice(match[0].length).trim() || prompt.trim();
        }
        return prompt.trim();
    }

    protected buildTemplateVars(
        agentId: string,
        agentModel?: QaapCreateAgentTaskQaiqModel,
        interaction?: QaapQaiqInteractionFlagOptions,
    ): Record<string, string> {
        const empty = { qaiq_flags: '', model_flags: '' };
        const qaiqInteractionFlags = agentId === QAIQ_AGENT_ID
            ? formatQaiqInteractionFlags(interaction ?? {})
            : '';
        const joinQaiqFlags = (...parts: string[]): string => parts.map(part => part.trim()).filter(Boolean).join(' ');
        if (agentModel?.provider && agentModel.modelId?.trim()) {
            const binding = this.normalizeAgentBinding(bindingFromQaiqModelSelection(agentModel));
            const flags = formatModelFlagsForAgent(agentId, binding);
            if (agentId === QAIQ_AGENT_ID) {
                return { qaiq_flags: joinQaiqFlags(qaiqInteractionFlags, flags), model_flags: '' };
            }
            return { qaiq_flags: '', model_flags: flags };
        }
        if (agentId === QAIQ_AGENT_ID) {
            return { qaiq_flags: joinQaiqFlags(qaiqInteractionFlags, this.resolveQaiqProviderFlags()), model_flags: '' };
        }
        return empty;
    }

    /**
     * Pick QAIQ --provider/--model flags from languageModelAliases and provider model lists so
     * background jobs follow the same model the user configured in Settings.
     */
    protected resolveQaiqProviderFlags(): string {
        const binding = this.resolveQaapQaiqBinding();
        if (binding) {
            return formatQaiqProviderFlags(binding);
        }
        return this.resolveQaiqProviderFlagsFromEnv(this.previewProviderEnv());
    }

    protected resolveQaapQaiqBinding(): QaapQaiqModelBinding | undefined {
        if (!this.preferenceService) {
            return undefined;
        }
        return resolveQaapQaiqModelBinding(key => this.preferenceService!.get(key));
    }

    /** Prefer the model the user picked in the composer; fall back to Settings aliases. */
    protected resolveAgentBindingForTask(task: QaapAgentTask): QaapQaiqModelBinding | undefined {
        const selected = resolveTaskAgentModel(task);
        if (selected?.provider && selected.modelId?.trim()) {
            return this.normalizeAgentBinding(bindingFromQaiqModelSelection(selected));
        }
        if (this.isQaiqRunner(undefined, task.command)) {
            const binding = this.resolveQaapQaiqBinding();
            return binding ? this.normalizeAgentBinding(binding) : undefined;
        }
        return undefined;
    }

    protected normalizeAgentBinding(binding: QaapQaiqModelBinding): QaapQaiqModelBinding {
        if (!this.preferenceService) {
            return binding;
        }
        return normalizeQaiqModelBinding(binding, key => this.preferenceService!.get(key));
    }

    protected previewProviderEnv(): NodeJS.ProcessEnv {
        const env: NodeJS.ProcessEnv = { ...process.env };
        this.applyProviderPreferenceEnv(env);
        return env;
    }

    /** Env-only fallback when no model alias or provider list is configured yet. */
    protected resolveQaiqProviderFlagsFromEnv(env: NodeJS.ProcessEnv): string {
        if (env.GEMINI_API_KEY?.trim() || env.GOOGLE_API_KEY?.trim()) {
            return '--provider gemini --model gemini-2.5-flash';
        }
        if (env.OPENROUTER_API_KEY?.trim()) {
            return '--provider openai --model nvidia/nemotron-3-super-120b-a12b:free';
        }
        if (env.NVIDIA_API_KEY?.trim()) {
            return '--provider openai --model meta/llama-3.3-70b-instruct';
        }
        if (env.OLLAMA_HOST?.trim()) {
            return '--provider ollama --model qwen2.5-coder:7b';
        }
        if (env.OPENAI_API_KEY?.trim()) {
            return '--provider openai';
        }
        return '';
    }

    /** Fail fast when QAIQ would fall back to Anthropic OAuth / empty auth and hang. */
    protected assertQaiqConfigured(agentId: string): void {
        if (agentId !== QAIQ_AGENT_ID) {
            return;
        }
        const env = this.previewProviderEnv();
        if (this.resolveQaiqProviderFlags()) {
            return;
        }
        if (env.ANTHROPIC_API_KEY?.trim() || env.OPENAI_API_KEY?.trim()) {
            return;
        }
        throw new Error(
            'QAIQ needs an API key from QAAP Settings (Gemini, OpenRouter, NVIDIA, Ollama, OpenAI, or Anthropic) '
            + 'or from server env (e.g. OPENROUTER_API_KEY / GEMINI_API_KEY in .env on Docker). '
            + 'Add one, restart the server, then retry.'
        );
    }

    protected applyTemplate(template: string, prompt: string, vars: Record<string, string> = {}): string {
        const quoted = this.shellQuote(prompt);
        const resolved = template.includes('{prompt}')
            ? template.split('{prompt}').join(quoted)
            : `${template} ${quoted}`;
        return this.applyTemplateVars(resolved, vars);
    }

    /** Template expansion for stdio-approval runs: the prompt is delivered over stdin, not argv. */
    protected applyTemplateWithoutPrompt(template: string, vars: Record<string, string> = {}): string {
        return this.applyTemplateVars(template.split('{prompt}').join(' '), vars);
    }

    protected applyTemplateVars(template: string, vars: Record<string, string>): string {
        let resolved = template;
        for (const [key, value] of Object.entries(vars)) {
            resolved = resolved.split(`{${key}}`).join(value.trim());
        }
        return resolved.replace(/\s+/g, ' ').trim();
    }

    /** POSIX single-quote escaping so the prompt is passed as one safe argument. */
    protected shellQuote(value: string): string {
        return `'${value.split('\'').join('\'\\\'\'')}'`;
    }

    cancel(id: string): QaapAgentTask | undefined {
        const task = this.tasks.get(id);
        if (task?.state === 'queued') {
            this.pendingSpawnRequests.delete(id);
            void this.persistPendingSpawns();
            return this.finishTask(id, 'cancelled', undefined);
        }
        const child = this.processes.get(id);
        const externalPid = this.externalPids.get(id);
        if (child) {
            this.processSupervisor.terminate(id, child);
        } else if (externalPid) {
            scheduleProcessTreeKillByPid(externalPid, resolveKillGraceMs(process.env));
            this.externalPids.delete(id);
            this.stopDetachedLogWatch(id);
            this.unregisterRunningSnapshot(id);
        }
        if (task && task.state === 'running') {
            return this.finishTask(id, 'cancelled', undefined);
        }
        return task;
    }

    protected timeoutRunningTask(
        taskId: string,
        child: ChildProcess,
        logStream: fs.WriteStream,
        message: string,
    ): void {
        if (this.tasks.get(taskId)?.state !== 'running') {
            return;
        }
        logStream.write(`\n[qaap] ${message}\n`);
        this.processSupervisor.terminate(taskId, child);
        this.finishTask(taskId, 'failed', undefined);
    }

    /** Pending QAIQ stdio `can_use_tool` requests for a running task. */
    listPendingQaiqControlRequests(taskId: string): readonly QaapQaiqPendingControlRequest[] {
        return this.pendingQaiqControlRequests.get(taskId) ?? [];
    }

    /**
     * How a running task can receive approval answers:
     * `'qaiq-stdio'` — QAIQ control protocol (only pending `can_use_tool` requests are answerable),
     * `'stdin'` — legacy interactive stdin (`y`/`n` lines),
     * `'none'` — no channel; approval prompts cannot be delivered to this process.
     */
    getApprovalChannel(taskId: string): 'qaiq-stdio' | 'stdin' | 'none' {
        if (!this.processes.get(taskId)?.stdin) {
            return 'none';
        }
        if (this.qaiqStdioTasks.has(taskId)) {
            return 'qaiq-stdio';
        }
        if (this.stdinInteractiveTasks.has(taskId)) {
            return 'stdin';
        }
        return 'none';
    }

    /**
     * Best-effort reply to a CLI permission prompt for a manual-approval task.
     *
     * QAIQ stdio-approval runs answer the matching `can_use_tool` control request
     * (resuming the paused tool call); other interactive agents get a legacy
     * `y`/`n` line on stdin. Requires the task to have been spawned with stdin piped.
     */
    respondToApprovalPrompt(taskId: string, action: 'approve' | 'reject', toolUseId?: string): boolean {
        const child = this.processes.get(taskId);
        if (!child?.stdin) {
            return false;
        }
        const pending = this.pendingQaiqControlRequests.get(taskId);
        if (pending?.length) {
            const entry = this.findPendingControlRequestEntry(pending, toolUseId);
            if (!entry) {
                return false;
            }
            try {
                child.stdin.write(buildQaiqControlResponseLine(entry, action));
            } catch {
                return false;
            }
            pending.splice(pending.indexOf(entry), 1);
            this.clearQueuedApprovalTimer(taskId, entry.requestId);
            return true;
        }
        if (this.qaiqStdioTasks.has(taskId)) {
            return false;
        }
        if (!this.stdinInteractiveTasks.has(taskId)) {
            return false;
        }
        const payload = action === 'approve' ? 'y\n' : 'n\n';
        try {
            child.stdin.write(payload);
            return true;
        } catch {
            return false;
        }
    }

    protected findPendingControlRequestEntry(
        pending: QaapQaiqPendingControlRequest[],
        idFromApproval?: string,
    ): QaapQaiqPendingControlRequest | undefined {
        if (idFromApproval) {
            const matched = pending.find(entry =>
                entry.toolUseId === idFromApproval || entry.requestId === idFromApproval,
            );
            if (matched) {
                return matched;
            }
        }
        return pending[0];
    }

    /**
     * Arm the grace timer for a queued `can_use_tool` request of an auto-approve run.
     * If nobody answers from the approvals UI in time, the request is denied with
     * guidance so the agent finishes the turn instead of hanging or insta-failing.
     */
    protected scheduleQueuedApprovalTimeout(
        taskId: string,
        request: QaapQaiqPendingControlRequest,
        logStream: fs.WriteStream,
    ): void {
        const timers = this.queuedApprovalTimers.get(taskId) ?? new Map<string, NodeJS.Timeout>();
        this.queuedApprovalTimers.set(taskId, timers);
        const timer = setTimeout(() => {
            timers.delete(request.requestId);
            const pending = this.pendingQaiqControlRequests.get(taskId);
            const index = pending?.findIndex(entry => entry.requestId === request.requestId) ?? -1;
            if (!pending || index < 0) {
                return;
            }
            pending.splice(index, 1);
            const toolName = request.toolName ?? 'Tool';
            logStream.write(`\n[qaap] approval for ${toolName} not granted within `
                + `${Math.round(QUEUED_APPROVAL_GRACE_TIMEOUT_MS / 1000)}s — auto-denied.\n`);
            try {
                this.processes.get(taskId)?.stdin?.write(buildQaiqControlResponseLine(
                    request,
                    'reject',
                    { denyMessage: buildQaiqQueuedApprovalTimeoutMessage(toolName) },
                ));
            } catch {
                // stdin already closed — the turn is over anyway.
            }
        }, QUEUED_APPROVAL_GRACE_TIMEOUT_MS);
        timers.set(request.requestId, timer);
    }

    protected clearQueuedApprovalTimer(taskId: string, requestId: string): void {
        const timers = this.queuedApprovalTimers.get(taskId);
        const timer = timers?.get(requestId);
        if (timers && timer) {
            clearTimeout(timer);
            timers.delete(requestId);
            if (timers.size === 0) {
                this.queuedApprovalTimers.delete(taskId);
            }
        }
    }

    protected clearQueuedApprovalTimers(taskId: string): void {
        const timers = this.queuedApprovalTimers.get(taskId);
        if (timers) {
            for (const timer of timers.values()) {
                clearTimeout(timer);
            }
            this.queuedApprovalTimers.delete(taskId);
        }
    }

    protected async spawnProcessWhenReady(task: QaapAgentTask, request: QaapCreateAgentTaskRequest): Promise<void> {
        if (this.preferenceService) {
            await this.preferenceService.ready;
        }
        const prompt = (request.prompt ?? '').trim();
        if (prompt) {
            try {
                const autoApprove = task.autoApprove !== false;
                const agentModel = this.resolveAgentModelForRequest(request, prompt);
                const { command, stdinPrompt } = this.buildAgentCommand(
                    prompt,
                    request.agent,
                    autoApprove,
                    agentModel,
                    task.cwd,
                    request.contextPreamble,
                    request.interactionModeId,
                    request.approvalPolicyId,
                    request.toolApprovalRules,
                );
                if (stdinPrompt) {
                    this.stdinPrompts.set(task.id, stdinPrompt);
                }
                const next: QaapAgentTask = {
                    ...task,
                    command,
                    ...(agentModel ? { agentModel, qaiqModel: agentModel } : {}),
                };
                this.tasks.set(task.id, next);
                void this.persist();
                this.spawnProcess(next);
                return;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                fs.mkdirSync(STORE_DIR, { recursive: true });
                fs.writeFileSync(this.logPath(task.id), `${message}\n`, 'utf8');
                this.finishTask(task.id, 'failed', 1);
                return;
            }
        }
        this.spawnProcess(task);
    }

    protected spawnProcess(task: QaapAgentTask): void {
        fs.mkdirSync(STORE_DIR, { recursive: true });
        const logStream = fs.createWriteStream(this.logPath(task.id), { flags: 'w' });
        const stdioPrompt = this.stdinPrompts.get(task.id);
        const stdinInteractive = task.autoApprove === false || stdioPrompt !== undefined;
        const agentModel = resolveTaskAgentModel(task);
        const restoreAntigravitySettings = agentModel?.modelId?.trim()
            && isAntigravityCliCommand(task.command)
            ? applyAntigravityModelSetting(agentModel.modelId)?.restore
            : undefined;
        const finishAntigravitySettings = (): void => {
            restoreAntigravitySettings?.();
        };
        let child: ChildProcess;
        try {
            child = this.processSupervisor.spawn({
                taskId: task.id,
                command: task.command,
                cwd: task.cwd,
                env: this.buildChildEnv(task),
                stdinInteractive,
            });
        } catch (error) {
            finishAntigravitySettings();
            this.stdinPrompts.delete(task.id);
            logStream.end(`Failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
            this.finishTask(task.id, 'failed', undefined);
            return;
        }
        this.processes.set(task.id, child);
        this.registerRunningSnapshot(task, child.pid);
        if (stdinInteractive) {
            this.stdinInteractiveTasks.add(task.id);
        }
        if (stdioPrompt !== undefined) {
            this.qaiqStdioTasks.add(task.id);
            this.stdinPrompts.delete(task.id);
            // stream-json input: the prompt travels over stdin, which stays open
            // for control_responses until the end-of-turn `result` message.
            try {
                child.stdin?.write(buildQaiqStdioPromptLine(stdioPrompt));
            } catch (error) {
                logStream.write(`\n[qaap] failed to write prompt to agent stdin: ${error instanceof Error ? error.message : String(error)}\n`);
            }
        }
        const processWatch = this.processSupervisor.startWatch(task.id, child, {
            isStillRunning: () => this.tasks.get(task.id)?.state === 'running',
            isIdlePaused: () => (this.pendingQaiqControlRequests.get(task.id)?.length ?? 0) > 0,
            onTimeout: (_reason, message) => this.timeoutRunningTask(task.id, child, logStream, message),
        });
        let stdioLineBuffer = '';
        const scanStdioApprovalChunk = (chunk: unknown): void => {
            stdioLineBuffer += Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
            let newline: number;
            while ((newline = stdioLineBuffer.indexOf('\n')) >= 0) {
                const line = stdioLineBuffer.slice(0, newline);
                stdioLineBuffer = stdioLineBuffer.slice(newline + 1);
                const event = parseQaiqStdioEvent(line);
                if (!event) {
                    continue;
                }
                if (event.type === 'control-request') {
                    const autoAction = resolveQaiqControlRequestAutoAction(
                        task.command,
                        task.autoApprove,
                        event.request,
                    );
                    if (autoAction !== 'queue') {
                        const devServerDenial = findQaiqDevServerGuardDenial(event.request);
                        const denyMessage = devServerDenial
                            ?? (autoAction === 'deny' && event.request.toolName
                                ? buildQaiqAutoDeniedToolMessage(event.request.toolName)
                                : undefined);
                        if (devServerDenial) {
                            logStream.write('\n[qaap] auto-denied long-lived dev-server shell command; Qaap manages dev servers via the preview bootstrap.\n');
                        }
                        try {
                            child.stdin?.write(buildQaiqControlResponseLine(
                                event.request,
                                autoAction === 'allow' ? 'approve' : 'reject',
                                denyMessage ? { denyMessage } : {},
                            ));
                        } catch {
                            // stdin already closed — the turn is over anyway.
                        }
                        continue;
                    }
                    const pending = this.pendingQaiqControlRequests.get(task.id) ?? [];
                    pending.push(event.request);
                    this.pendingQaiqControlRequests.set(task.id, pending);
                    // "Request approval" runs wait indefinitely; auto-approve runs get a
                    // grace window so an unattended turn still finishes.
                    if (task.autoApprove !== false) {
                        this.scheduleQueuedApprovalTimeout(task.id, event.request, logStream);
                    }
                } else if (event.type === 'control-cancel') {
                    const pending = this.pendingQaiqControlRequests.get(task.id);
                    const index = pending?.findIndex(entry => entry.requestId === event.requestId) ?? -1;
                    if (pending && index >= 0) {
                        pending.splice(index, 1);
                    }
                    this.clearQueuedApprovalTimer(task.id, event.requestId);
                } else if (event.type === 'result') {
                    // End of turn — close stdin so the headless CLI exits.
                    try {
                        child.stdin?.end();
                    } catch {
                        // Already closed — nothing to do.
                    }
                }
            }
        };
        child.stdout?.on('data', chunk => {
            processWatch.bumpIdleTimer();
            logStream.write(chunk);
            this.fireOutput(task.id, chunk);
            void this.touchRunningSnapshotLog(task.id);
            if (stdioPrompt !== undefined) {
                scanStdioApprovalChunk(chunk);
            }
        });
        child.stderr?.on('data', chunk => {
            processWatch.bumpIdleTimer();
            logStream.write(chunk);
            this.fireOutput(task.id, chunk);
            void this.touchRunningSnapshotLog(task.id);
        });
        child.on('error', error => {
            logStream.write(`\n[qaap] process error: ${error.message}\n`);
        });
        child.on('close', code => {
            processWatch.release();
            this.unregisterRunningSnapshot(task.id);
            finishAntigravitySettings();
            logStream.end();
            this.processes.delete(task.id);
            this.stdinInteractiveTasks.delete(task.id);
            this.stdinPrompts.delete(task.id);
            this.pendingQaiqControlRequests.delete(task.id);
            this.clearQueuedApprovalTimers(task.id);
            this.qaiqStdioTasks.delete(task.id);
            // A SIGTERM-killed task is already marked 'cancelled' by cancel().
            if (this.tasks.get(task.id)?.state !== 'running') {
                return;
            }
            this.finishTask(task.id, code === 0 ? 'completed' : 'failed', code ?? undefined);
        });
    }

    protected fireOutput(taskId: string, chunk: unknown): void {
        const task = this.tasks.get(taskId);
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
        const filtered = filterAgentProcessLogChunk(text);
        if (!task || !filtered) {
            return;
        }
        this.onDidChangeTaskEmitter.fire({ type: 'output', task, chunk: filtered });
    }

    /**
     * Env handed to the spawned agent process. Prepends the helper-CLI dir to PATH and exposes
     * the token + API URL + this task's id, so the agent can fan out sub-tasks via `qaap-task`.
     */
    protected buildChildEnv(task: QaapAgentTask): NodeJS.ProcessEnv {
        const env: NodeJS.ProcessEnv = { ...process.env };
        env.PWD = task.cwd;
        this.applyProviderPreferenceEnv(env);
        const binding = this.resolveAgentBindingForTask(task);
        if (binding) {
            applyQaapQaiqModelEnv(env, binding);
            applyQaapQaiqCredentialEnv(env, binding, key => this.preferenceService?.get(key));
        }
        if (this.isQaiqRunner(undefined, task.command)) {
            this.applyQaiqProviderEnv(env, task.command, binding);
        }
        if (this.isQaiqRunner(undefined, task.command)) {
            env.QAAP_HOSTED_AGENT = '1';
            // The hosted backend runs as root inside its container, where qaiq refuses
            // `--dangerously-skip-permissions` unless it detects a sandbox. The container IS the
            // sandbox, so opt in explicitly (qaiq honours IS_SANDBOX=1 as the root-bypass escape
            // hatch). Scoped to the qaiq child rather than set globally so it never leaks into
            // unrelated processes. Respect an operator override if one is already present.
            if (env.IS_SANDBOX === undefined) {
                env.IS_SANDBOX = '1';
            }
        }
        this.applyHelperEnv(env, task.id, task.autoApprove);
        return env;
    }

    /**
     * When QAIQ runs with OpenRouter/Gemini/Ollama/NVIDIA flags, drop Anthropic credentials so the
     * CLI does not fall back to subscription OAuth and return 429 instead of using BYOK keys.
     *
     * Always sets CLAUDE_CODE_USE_OPENAI explicitly so that saved profile files
     * (/root/.openclaude.json, .openclaude-profile.json) cannot override the provider
     * the user configured in QAAP Settings.
     */
    /** Map OpenAI-compat credentials for explicit picker bindings (HF / OpenRouter / NVIDIA / official). */
    protected applyOpenAiVendorCompatEnv(env: NodeJS.ProcessEnv, binding: QaapQaiqModelBinding): void {
        switch (binding.vendor) {
            case 'huggingface':
                this.applyHuggingfaceOpenAiCompatEnv(env);
                break;
            case 'openrouter':
                this.applyOpenRouterOpenAiCompatEnv(env);
                break;
            case 'nvidia':
                this.applyNvidiaOpenAiCompatEnv(env);
                break;
            default:
                break;
        }
    }

    protected applyQaiqProviderEnv(env: NodeJS.ProcessEnv, command: string, binding?: QaapQaiqModelBinding): void {
        if (!this.isQaiqRunner(undefined, command)) {
            return;
        }
        const usesThirdPartyProvider = (binding !== undefined && binding.provider !== 'anthropic')
            || command.includes('--provider openai')
            || command.includes('--provider gemini')
            || command.includes('--provider ollama')
            || command.includes('--provider mistral');
        if (usesThirdPartyProvider) {
            delete env.ANTHROPIC_API_KEY;
        }
        if (binding?.vendor === 'openrouter' || (!binding && command.includes('--provider openai') && env.OPENROUTER_API_KEY?.trim())) {
            this.applyOpenRouterOpenAiCompatEnv(env);
            env.CLAUDE_CODE_USE_OPENAI = '1';
        } else if (binding?.vendor === 'nvidia' || (!binding && command.includes('--provider openai') && env.NVIDIA_API_KEY?.trim() && !env.OPENROUTER_API_KEY?.trim())) {
            this.applyNvidiaOpenAiCompatEnv(env);
            env.CLAUDE_CODE_USE_OPENAI = '1';
        } else if (binding?.vendor === 'huggingface') {
            this.applyHuggingfaceOpenAiCompatEnv(env);
            env.CLAUDE_CODE_USE_OPENAI = '1';
        } else if (!binding && command.includes('--provider openai') && env.OPENAI_API_KEY?.trim()) {
            env.CLAUDE_CODE_USE_OPENAI = '1';
        } else if (binding?.provider === 'openai') {
            this.applyOpenAiVendorCompatEnv(env, binding);
            env.CLAUDE_CODE_USE_OPENAI = '1';
        } else {
            // Gemini, Ollama, Anthropic, Mistral — profile files must not force OpenAI mode.
            env.CLAUDE_CODE_USE_OPENAI = '0';
        }
    }

    protected applyProviderPreferenceEnv(env: NodeJS.ProcessEnv): void {
        if (!this.preferenceService) {
            return;
        }
        for (const mapping of AGENT_ENV_PREFS) {
            if (env[mapping.env]?.trim()) {
                continue;
            }
            const value = this.preferenceService.get<string>(mapping.pref);
            if (typeof value === 'string' && value.trim()) {
                env[mapping.env] = value.trim();
            }
        }
        this.applyOpenRouterOpenAiCompatEnv(env);
    }

    /** QAIQ's OpenAI provider reads OPENAI_*; map OpenRouter prefs when needed. */
    protected applyOpenRouterOpenAiCompatEnv(env: NodeJS.ProcessEnv): void {
        if (!env.OPENROUTER_API_KEY?.trim() || env.OPENAI_API_KEY?.trim()) {
            return;
        }
        env.OPENAI_API_KEY = env.OPENROUTER_API_KEY.trim();
        if (!env.OPENAI_BASE_URL?.trim()) {
            env.OPENAI_BASE_URL = env.OPENROUTER_BASE_URL?.trim() || 'https://openrouter.ai/api/v1';
        }
    }

    /** QAIQ's OpenAI provider reads OPENAI_*; map NVIDIA NIM prefs when needed. */
    protected applyNvidiaOpenAiCompatEnv(env: NodeJS.ProcessEnv): void {
        if (!env.NVIDIA_API_KEY?.trim() || env.OPENAI_API_KEY?.trim()) {
            return;
        }
        env.OPENAI_API_KEY = env.NVIDIA_API_KEY.trim();
        if (!env.OPENAI_BASE_URL?.trim()) {
            env.OPENAI_BASE_URL = 'https://integrate.api.nvidia.com/v1';
        }
        env.NVIDIA_NIM = '1';
    }

    /** QAIQ's OpenAI provider reads OPENAI_*; map Hugging Face Inference Router prefs when needed. */
    protected applyHuggingfaceOpenAiCompatEnv(env: NodeJS.ProcessEnv): void {
        const hfKey = env.HUGGINGFACE_API_KEY?.trim() || env.HF_TOKEN?.trim();
        if (!hfKey) {
            return;
        }
        env.HUGGINGFACE_API_KEY = hfKey;
        env.HF_TOKEN = hfKey;
        env.OPENAI_API_KEY = hfKey;
        env.OPENAI_BASE_URL = 'https://router.huggingface.co/v1';
        delete env.NVIDIA_NIM;
    }

    /**
     * Mutates `env` in place to add the helper-CLI bindings (PATH prefix, token, API URL, optional
     * parent id). Returns `true` when the helper is provisioned and the env was updated, `false`
     * when the helper isn't ready yet (e.g. backend just booted and the port hasn't been bound).
     * Callers can use this to expose `qaap-task` to any spawned process — agent tasks, interactive
     * terminals, etc.
     */
    applyHelperEnv(env: NodeJS.ProcessEnv, parentTaskId?: string, autoApprove?: boolean): boolean {
        if (!this.helperToken || !this.helperApiUrl) {
            return false;
        }
        env.QAAP_TASK_TOKEN = this.helperToken;
        env.QAAP_TASK_API_URL = this.helperApiUrl;
        if (parentTaskId) {
            env.QAAP_TASK_PARENT_ID = parentTaskId;
        }
        if (autoApprove !== false) {
            env.QAAP_TASK_AUTO_APPROVE = '1';
        }
        env.PATH = `${HELPER_BIN_DIR}${path.delimiter}${env.PATH ?? ''}`;
        return true;
    }

    protected finishTask(id: string, state: QaapAgentTaskState, exitCode: number | undefined): QaapAgentTask | undefined {
        const task = this.tasks.get(id);
        if (!task) {
            return undefined;
        }
        const wasRunning = task.state === 'running';
        const finished: QaapAgentTask = { ...task, state, exitCode, finishedAt: Date.now() };
        this.tasks.set(id, finished);
        void this.persist();
        // 'completed'/'failed'/'interrupted' map to 'completed' for subscribers; 'cancelled' stays distinct.
        this.onDidChangeTaskEmitter.fire({
            type: state === 'cancelled' ? 'cancelled' : 'completed',
            task: finished,
        });
        if (isQaapAgentTaskFinished(state) && state !== 'cancelled') {
            void this.notifyCompletion(finished);
        }
        if (wasRunning) {
            this.drainQueueForCwd(task.cwd);
        }
        return finished;
    }

    /** Push the result to the user's devices — works with every tab closed. */
    protected async notifyCompletion(task: QaapAgentTask): Promise<void> {
        const ok = task.state === 'completed';
        try {
            await this.webPush.notify({
                title: ok ? 'Task finished' : 'Task failed',
                body: `${task.title}${ok ? ' completed.' : ` exited with code ${task.exitCode ?? 'unknown'}.`}`,
                tag: `qaap-agent-task-${task.id}`,
                route: 'diff-review',
            });
        } catch {
            /* push failure must not crash the runner */
        }
    }

    protected async readLog(id: string): Promise<string> {
        try {
            const logPath = this.logPath(id);
            const stat = await fsp.stat(logPath);
            const handle = await fsp.open(logPath, 'r');
            try {
                const start = Math.max(0, stat.size - MAX_LOG_BYTES);
                const { buffer, bytesRead } = await handle.read({
                    buffer: Buffer.alloc(Math.min(stat.size, MAX_LOG_BYTES)),
                    position: start,
                });
                const text = buffer.subarray(0, bytesRead).toString('utf8');
                const raw = start > 0 ? `…(truncated)\n${text}` : text;
                return filterAgentProcessLogChunk(raw);
            } finally {
                await handle.close();
            }
        } catch {
            return '';
        }
    }

    protected async persist(): Promise<void> {
        try {
            await fsp.mkdir(STORE_DIR, { recursive: true });
            await fsp.writeFile(INDEX_PATH, JSON.stringify([...this.tasks.values()], undefined, 2), 'utf8');
        } catch {
            /* persistence is best-effort */
        }
    }

    protected logPath(id: string): string {
        return path.join(STORE_DIR, `${id}.log`);
    }

    protected isDirectory(target: string): boolean {
        try {
            return fs.statSync(target).isDirectory();
        } catch {
            return false;
        }
    }
}
