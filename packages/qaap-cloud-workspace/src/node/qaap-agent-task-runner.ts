// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ChildProcess, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    isQaapAgentTaskFinished,
    type QaapAgentTask,
    type QaapAgentTaskDetail,
    type QaapAgentTaskState,
    type QaapCreateAgentTaskRequest,
} from '../common/qaap-agent-task';
import { QaapWebPushService } from './qaap-web-push-service';

const STORE_DIR = path.join(os.homedir(), '.qaap', 'agent-tasks');
const INDEX_PATH = path.join(STORE_DIR, 'index.json');
/** Cap returned log size so a runaway task cannot blow up the response. */
const MAX_LOG_BYTES = 512 * 1024;

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

    @postConstruct()
    protected init(): void {
        void this.restoreFromDisk();
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
            ? this.buildAgentCommand(prompt)
            : (request.command ?? '').trim();
        if (!command) {
            throw new Error('A non-empty "command" or "prompt" is required.');
        }
        const cwd = path.resolve(request.cwd ?? '');
        if (!path.isAbsolute(cwd) || !this.isDirectory(cwd)) {
            throw new Error('A valid absolute "cwd" directory is required.');
        }
        const id = randomUUID();
        const task: QaapAgentTask = {
            id,
            title: (request.title ?? '').trim() || prompt || command,
            command,
            cwd,
            state: 'running',
            createdAt: Date.now(),
        };
        this.tasks.set(id, task);
        this.spawnProcess(task);
        void this.persist();
        return task;
    }

    /**
     * Turn a natural-language prompt into the command that runs the coding agent.
     *
     * `QAAP_AGENT_COMMAND` is a template: a `{prompt}` placeholder is replaced with the
     * shell-quoted prompt; without a placeholder the prompt is appended. Examples:
     *   QAAP_AGENT_COMMAND='claude -p {prompt}'
     *   QAAP_AGENT_COMMAND='aider --yes --message {prompt}'
     * With no template configured the prompt is run verbatim, so a prompt that is itself a
     * shell command still works.
     */
    protected buildAgentCommand(prompt: string): string {
        const template = process.env.QAAP_AGENT_COMMAND?.trim();
        if (!template) {
            return prompt;
        }
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
            child = spawn(task.command, { cwd: task.cwd, shell: true });
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

    protected finishTask(id: string, state: QaapAgentTaskState, exitCode: number | undefined): QaapAgentTask | undefined {
        const task = this.tasks.get(id);
        if (!task) {
            return undefined;
        }
        const finished: QaapAgentTask = { ...task, state, exitCode, finishedAt: Date.now() };
        this.tasks.set(id, finished);
        void this.persist();
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
