// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Emitter, Event } from '@theia/core/lib/common/event';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ChildProcess, spawn, spawnSync } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    isQaapAgentTaskFinished,
    type QaapAgentDescriptor,
    type QaapAgentTask,
    type QaapAgentTaskCwdGroup,
    type QaapAgentTaskDetail,
    type QaapAgentTaskEvent,
    type QaapAgentTaskState,
    type QaapCreateAgentTaskRequest,
} from '../common/qaap-agent-task';
import { QaapWebPushService } from './qaap-web-push-service';

/** Built-in coding agents the runner can auto-detect on the server's PATH. */
interface AgentCandidate {
    readonly id: string;
    readonly label: string;
    /** Executable name to look up on PATH (`which <bin>`). */
    readonly bin: string;
    /** Template applied to the user prompt; `{prompt}` is replaced with a shell-quoted value. */
    readonly template: string;
}

const AGENT_CANDIDATES: readonly AgentCandidate[] = [
    { id: 'claude', label: 'Claude Code', bin: 'claude', template: 'claude -p {prompt}' },
    { id: 'codex', label: 'Codex', bin: 'codex', template: 'codex exec {prompt}' },
    { id: 'aider', label: 'Aider', bin: 'aider', template: 'aider --yes-always --message {prompt}' },
];

/** Pseudo-agent that runs the prompt verbatim as a shell command. */
const SHELL_AGENT_ID = 'shell';
/** Reserved id for the QAAP_AGENT_COMMAND env-var template, when set. */
const ENV_AGENT_ID = 'env';

const STORE_DIR = path.join(os.homedir(), '.qaap', 'agent-tasks');
const INDEX_PATH = path.join(STORE_DIR, 'index.json');
/** Cap returned log size so a runaway task cannot blow up the response. */
const MAX_LOG_BYTES = 512 * 1024;

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

    protected readonly tasks = new Map<string, QaapAgentTask>();
    protected readonly processes = new Map<string, ChildProcess>();
    /** Agents whose CLI was found on PATH at startup, keyed by id. */
    protected readonly detectedAgents = new Map<string, AgentCandidate>();
    /** Random token shared with spawned agents so they can call back via `qaap-task`. */
    protected helperToken = '';
    /** URL spawned agents POST sub-tasks to. Bound from the backend's listen port. */
    protected helperApiUrl = '';
    /** Best-effort `package.json#name` per cwd; lazily populated. */
    protected readonly projectNameCache = new Map<string, string>();

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
            if (this.isOnPath(candidate.bin)) {
                this.detectedAgents.set(candidate.id, candidate);
            }
        }
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
        if (process.env.QAAP_AGENT_COMMAND?.trim()) {
            result.push({ id: ENV_AGENT_ID, label: 'Custom (QAAP_AGENT_COMMAND)', available: true });
        }
        result.push({ id: SHELL_AGENT_ID, label: 'Shell command', available: true });
        return result;
    }

    /** Id picked when a create request omits one — first detected agent, env template, or shell. */
    defaultAgent(): string {
        for (const candidate of AGENT_CANDIDATES) {
            if (this.detectedAgents.has(candidate.id)) {
                return candidate.id;
            }
        }
        if (process.env.QAAP_AGENT_COMMAND?.trim()) {
            return ENV_AGENT_ID;
        }
        return SHELL_AGENT_ID;
    }

    async detail(id: string): Promise<QaapAgentTaskDetail | undefined> {
        const task = this.tasks.get(id);
        if (!task) {
            return undefined;
        }
        return { ...task, log: await this.readLog(id) };
    }

    /** Validate the request, spawn the process and start tracking the task. */
    create(request: QaapCreateAgentTaskRequest): QaapAgentTask {
        const prompt = (request.prompt ?? '').trim();
        const command = prompt
            ? this.buildAgentCommand(prompt, request.agent)
            : (request.command ?? '').trim();
        if (!command) {
            throw new Error('A non-empty "command" or "prompt" is required.');
        }
        const cwd = path.resolve(request.cwd ?? '');
        if (!path.isAbsolute(cwd) || !this.isDirectory(cwd)) {
            throw new Error('A valid absolute "cwd" directory is required.');
        }
        const id = randomUUID();
        const parentId = request.parentId && this.tasks.has(request.parentId) ? request.parentId : undefined;
        const task: QaapAgentTask = {
            id,
            title: (request.title ?? '').trim() || prompt || command,
            command,
            cwd,
            state: 'running',
            createdAt: Date.now(),
            parentId,
        };
        this.tasks.set(id, task);
        this.spawnProcess(task);
        void this.persist();
        this.onDidChangeTaskEmitter.fire({ type: 'created', task });
        return task;
    }

    /**
     * Turn a natural-language prompt into the command that runs the coding agent.
     *
     * Resolution order, given the requested {@link agentId}:
     *   1. A detected built-in agent (`claude`, `codex`, `aider`) → use its template.
     *   2. `'env'` or any unknown id, when `QAAP_AGENT_COMMAND` is set → use that template.
     *   3. `'shell'`, or no agent available → run the prompt verbatim as a shell command.
     *
     * A template's `{prompt}` placeholder is replaced with a POSIX shell-quoted prompt;
     * without a placeholder the prompt is appended.
     */
    protected buildAgentCommand(prompt: string, agentId: string | undefined): string {
        const id = agentId?.trim() || this.defaultAgent();
        if (id === SHELL_AGENT_ID) {
            return prompt;
        }
        const detected = this.detectedAgents.get(id);
        if (detected) {
            return this.applyTemplate(detected.template, prompt);
        }
        const envTemplate = process.env.QAAP_AGENT_COMMAND?.trim();
        if (envTemplate) {
            return this.applyTemplate(envTemplate, prompt);
        }
        return prompt;
    }

    protected applyTemplate(template: string, prompt: string): string {
        const quoted = this.shellQuote(prompt);
        return template.includes('{prompt}')
            ? template.split('{prompt}').join(quoted)
            : `${template} ${quoted}`;
    }

    /** POSIX single-quote escaping so the prompt is passed as one safe argument. */
    protected shellQuote(value: string): string {
        return `'${value.split('\'').join('\'\\\'\'')}'`;
    }

    cancel(id: string): QaapAgentTask | undefined {
        const process = this.processes.get(id);
        if (process) {
            process.kill('SIGTERM');
        }
        const task = this.tasks.get(id);
        if (task && task.state === 'running') {
            return this.finishTask(id, 'cancelled', undefined);
        }
        return task;
    }

    protected spawnProcess(task: QaapAgentTask): void {
        fs.mkdirSync(STORE_DIR, { recursive: true });
        const logStream = fs.createWriteStream(this.logPath(task.id), { flags: 'w' });
        let child: ChildProcess;
        try {
            child = spawn(task.command, { cwd: task.cwd, shell: true, env: this.buildChildEnv(task) });
        } catch (error) {
            logStream.end(`Failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
            this.finishTask(task.id, 'failed', undefined);
            return;
        }
        this.processes.set(task.id, child);
        child.stdout?.on('data', chunk => logStream.write(chunk));
        child.stderr?.on('data', chunk => logStream.write(chunk));
        child.on('error', error => {
            logStream.write(`\n[qaap] process error: ${error.message}\n`);
        });
        child.on('close', code => {
            logStream.end();
            this.processes.delete(task.id);
            // A SIGTERM-killed task is already marked 'cancelled' by cancel().
            if (this.tasks.get(task.id)?.state !== 'running') {
                return;
            }
            this.finishTask(task.id, code === 0 ? 'completed' : 'failed', code ?? undefined);
        });
    }

    /**
     * Env handed to the spawned agent process. Prepends the helper-CLI dir to PATH and exposes
     * the token + API URL + this task's id, so the agent can fan out sub-tasks via `qaap-task`.
     */
    protected buildChildEnv(task: QaapAgentTask): NodeJS.ProcessEnv {
        const env: NodeJS.ProcessEnv = { ...process.env };
        this.applyHelperEnv(env, task.id);
        return env;
    }

    /**
     * Mutates `env` in place to add the helper-CLI bindings (PATH prefix, token, API URL, optional
     * parent id). Returns `true` when the helper is provisioned and the env was updated, `false`
     * when the helper isn't ready yet (e.g. backend just booted and the port hasn't been bound).
     * Callers can use this to expose `qaap-task` to any spawned process — agent tasks, interactive
     * terminals, etc.
     */
    applyHelperEnv(env: NodeJS.ProcessEnv, parentTaskId?: string): boolean {
        if (!this.helperToken || !this.helperApiUrl) {
            return false;
        }
        env.QAAP_TASK_TOKEN = this.helperToken;
        env.QAAP_TASK_API_URL = this.helperApiUrl;
        if (parentTaskId) {
            env.QAAP_TASK_PARENT_ID = parentTaskId;
        }
        env.PATH = `${HELPER_BIN_DIR}${path.delimiter}${env.PATH ?? ''}`;
        return true;
    }

    protected finishTask(id: string, state: QaapAgentTaskState, exitCode: number | undefined): QaapAgentTask | undefined {
        const task = this.tasks.get(id);
        if (!task) {
            return undefined;
        }
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
            const stat = await fsp.stat(this.logPath(id));
            const handle = await fsp.open(this.logPath(id), 'r');
            try {
                const start = Math.max(0, stat.size - MAX_LOG_BYTES);
                const { buffer, bytesRead } = await handle.read({
                    buffer: Buffer.alloc(Math.min(stat.size, MAX_LOG_BYTES)),
                    position: start,
                });
                const text = buffer.subarray(0, bytesRead).toString('utf8');
                return start > 0 ? `…(truncated)\n${text}` : text;
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
