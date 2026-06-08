// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { execFile, spawnSync } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as fsp from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { QaapAgentConversationStore } from './qaap-agent-conversation-store';
import {
    QaapChooseParallelVariantResponse,
    QaapCreateParallelRunRequest,
    QaapParallelChooseAction,
    QaapParallelRun,
    QaapParallelRunVariant,
    type QaapParallelRunVariantStats,
} from '../common/qaap-parallel-run';

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 16 * 1024 * 1024;
const STORE_DIR = path.join(os.homedir(), '.qaap', 'parallel-runs');
const INDEX_PATH = path.join(STORE_DIR, 'index.json');
const LIVE_STATS_DEBOUNCE_MS = 1500;

/**
 * Orchestrates "parallel runs": the same prompt handed to N agents, each working in its own
 * isolated git worktree + branch. The user's current working tree and branch are never touched
 * unless they explicitly pick the `merge` action. Worktrees live under the OS temp dir so they
 * don't pollute the repository's status.
 */
@injectable()
export class QaapParallelRunStore {

    @inject(QaapAgentConversationStore)
    protected readonly conversationStore: QaapAgentConversationStore;

    protected readonly runs = new Map<string, QaapParallelRun>();
    protected readonly liveStatsTimers = new Map<string, ReturnType<typeof setTimeout>>();

    @postConstruct()
    protected init(): void {
        void this.load();
        this.conversationStore.onDidChange(event => {
            if (event.type === 'parallel-run') {
                return;
            }
            const conversationId = event.type === 'message'
                ? event.conversationId
                : event.type === 'updated' || event.type === 'created'
                    ? event.conversation.id
                    : undefined;
            if (!conversationId) {
                return;
            }
            const summary = event.type === 'updated' || event.type === 'created'
                ? event.conversation
                : this.conversationStore.get(conversationId);
            const runId = summary?.parallelRunId
                ?? this.conversationStore.get(conversationId)?.parallelRunId;
            if (!runId || !this.runs.has(runId)) {
                return;
            }
            this.scheduleLiveStatsPush(runId, event.type === 'updated');
        });
    }

    async create(request: QaapCreateParallelRunRequest): Promise<QaapParallelRun> {
        const cwd = path.resolve(request.cwd ?? '');
        if (!path.isAbsolute(cwd) || !this.isDirectory(cwd)) {
            throw new Error('A valid absolute "cwd" directory is required.');
        }
        await this.assertGitRepo(cwd);
        const prompt = (request.prompt ?? '').trim();
        if (!prompt) {
            throw new Error('A non-empty "prompt" is required.');
        }
        const agents = (request.agents ?? []).filter(a => !!a && a.trim());
        if (agents.length === 0) {
            throw new Error('At least one agent is required.');
        }

        const id = randomUUID();
        const slug = id.slice(0, 8);
        const root = path.join(os.tmpdir(), 'qaap-parallel', slug);
        const variants: QaapParallelRunVariant[] = [];
        try {
            for (const agentId of agents) {
                const safe = agentId.replace(/[^a-zA-Z0-9_-]/g, '-');
                const branch = `qaap/parallel/${slug}/${safe}`;
                const worktreePath = path.join(root, safe);
                await this.git(cwd, ['worktree', 'add', '-b', branch, worktreePath, 'HEAD']);
                const conversation = this.conversationStore.create({
                    cwd: worktreePath,
                    agent: agentId,
                    title: `Variant · ${agentId}`,
                    message: prompt,
                    parallelRunId: id,
                    parallelBaseCwd: cwd,
                });
                variants.push({
                    id: randomUUID(),
                    agentId,
                    worktreePath,
                    branch,
                    conversationId: conversation.id,
                    state: 'running',
                    adds: 0,
                    dels: 0,
                    fileCount: 0,
                });
            }
        } catch (error) {
            // Roll back any worktrees already created so a partial failure leaves no orphans.
            for (const variant of variants) {
                await this.removeWorktree(cwd, variant.worktreePath).catch(() => undefined);
                await this.deleteBranch(cwd, variant.branch).catch(() => undefined);
                this.conversationStore.delete(variant.conversationId);
            }
            throw error;
        }

        const run: QaapParallelRun = { id, cwd, prompt, createdAt: Date.now(), variants };
        this.runs.set(id, run);
        await this.persist();
        void this.pushLiveStats(id);
        return run;
    }

    /** Refresh each variant's state (from its conversation) and working-tree diff stats. */
    async get(id: string): Promise<QaapParallelRun | undefined> {
        const run = this.runs.get(id);
        if (!run) {
            return undefined;
        }
        for (const variant of run.variants) {
            const conversation = this.conversationStore.get(variant.conversationId);
            variant.state = conversation?.status === 'streaming'
                ? 'running'
                : conversation?.status === 'failed' ? 'failed' : 'idle';
            try {
                const stats = await this.diffStats(variant.worktreePath);
                variant.adds = stats.adds;
                variant.dels = stats.dels;
                variant.fileCount = stats.fileCount;
            } catch {
                /* worktree may have been removed — leave last-known stats */
            }
        }
        return run;
    }

    protected scheduleLiveStatsPush(runId: string, immediate: boolean): void {
        const existing = this.liveStatsTimers.get(runId);
        if (existing) {
            clearTimeout(existing);
        }
        const delay = immediate ? 0 : LIVE_STATS_DEBOUNCE_MS;
        const timer = setTimeout(() => {
            this.liveStatsTimers.delete(runId);
            void this.pushLiveStats(runId);
        }, delay);
        this.liveStatsTimers.set(runId, timer);
    }

    protected async pushLiveStats(runId: string): Promise<void> {
        const run = await this.get(runId);
        if (!run) {
            return;
        }
        const variants: QaapParallelRunVariantStats[] = run.variants.map(variant => ({
            conversationId: variant.conversationId,
            agentId: variant.agentId,
            state: variant.state,
            adds: variant.adds,
            dels: variant.dels,
            fileCount: variant.fileCount,
        }));
        this.conversationStore.emitParallelRunStats(runId, variants);
    }

    async choose(id: string, conversationId: string, action: QaapParallelChooseAction): Promise<QaapChooseParallelVariantResponse> {
        const run = this.runs.get(id);
        if (!run) {
            throw new Error('Parallel run not found.');
        }
        const winner = run.variants.find(v => v.conversationId === conversationId);
        if (!winner) {
            throw new Error('Variant not found.');
        }

        if (action === 'none') {
            await this.finalizeRun(run);
            return { ok: true, branch: winner.branch };
        }

        // Commit the winner's working-tree changes so the branch carries them once its worktree is removed.
        await this.commitWorktree(winner.worktreePath, `qaap: parallel variant ${winner.agentId}`);

        if (action === 'merge') {
            try {
                await this.git(run.cwd, ['merge', '--no-ff', '--no-edit', winner.branch]);
            } catch (error) {
                await this.git(run.cwd, ['merge', '--abort']).catch(() => undefined);
                return { ok: false, error: `Merge failed (your tree was left untouched): ${this.errorMessage(error)}` };
            }
            await this.finalizeRun(run);
            return { ok: true, branch: winner.branch };
        }

        // keep-branch: drop all worktrees, delete the losing branches, keep the winner's branch.
        await this.finalizeRun(run, { keepBranches: [winner.branch] });
        return { ok: true, branch: winner.branch };
    }

    /** Tear down a run entirely: remove all worktrees, branches, and variant conversations. */
    async remove(id: string): Promise<void> {
        const run = this.runs.get(id);
        if (!run) {
            return;
        }
        await this.finalizeRun(run);
    }

    /**
     * Remove git worktrees/branches, delete variant conversations, and drop the run from the index.
     * {@link keepBranches} preserves named branches (e.g. the winning variant on `keep-branch`).
     */
    protected async finalizeRun(run: QaapParallelRun, options?: { keepBranches?: string[] }): Promise<void> {
        const keep = new Set(options?.keepBranches ?? []);
        for (const variant of run.variants) {
            await this.removeWorktree(run.cwd, variant.worktreePath).catch(() => undefined);
        }
        for (const variant of run.variants) {
            if (keep.has(variant.branch)) {
                continue;
            }
            await this.deleteBranch(run.cwd, variant.branch).catch(() => undefined);
        }
        for (const variant of run.variants) {
            this.conversationStore.delete(variant.conversationId);
        }
        this.runs.delete(run.id);
        await this.persist();
    }

    protected async load(): Promise<void> {
        await this.conversationStore.whenReady();
        try {
            const raw = await fsp.readFile(INDEX_PATH, 'utf8');
            const stored = JSON.parse(raw) as QaapParallelRun[];
            for (const run of stored) {
                this.runs.set(run.id, run);
            }
        } catch {
            /* no prior parallel runs */
        }
        if (this.reconcileFromConversations()) {
            await this.persist();
        }
    }

    /** Rebuild run records lost from disk but still referenced by persisted variant conversations. */
    protected reconcileFromConversations(): boolean {
        const variantsByRunId = new Map<string, Array<{
            conversationId: string;
            agentId: string;
            worktreePath: string;
            baseCwd: string;
            updatedAt: number;
        }>>();
        for (const group of this.conversationStore.listAllGroupedByCwd()) {
            for (const summary of group.conversations) {
                if (!summary.parallelRunId || !summary.parallelBaseCwd) {
                    continue;
                }
                const bucket = variantsByRunId.get(summary.parallelRunId) ?? [];
                bucket.push({
                    conversationId: summary.id,
                    agentId: summary.agentId,
                    worktreePath: summary.cwd,
                    baseCwd: summary.parallelBaseCwd,
                    updatedAt: summary.updatedAt,
                });
                variantsByRunId.set(summary.parallelRunId, bucket);
            }
        }
        let added = false;
        for (const [runId, items] of variantsByRunId) {
            if (this.runs.has(runId)) {
                continue;
            }
            added = true;
            const baseCwd = path.resolve(items[0].baseCwd);
            const slug = runId.slice(0, 8);
            const variants: QaapParallelRunVariant[] = items.map(item => ({
                id: randomUUID(),
                agentId: item.agentId,
                worktreePath: item.worktreePath,
                branch: this.resolveBranchName(item.worktreePath)
                    ?? `qaap/parallel/${slug}/${item.agentId.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
                conversationId: item.conversationId,
                state: 'idle',
                adds: 0,
                dels: 0,
                fileCount: 0,
            }));
            this.runs.set(runId, {
                id: runId,
                cwd: baseCwd,
                prompt: '',
                createdAt: Math.min(...items.map(i => i.updatedAt)),
                variants,
            });
        }
        return added;
    }

    protected async persist(): Promise<void> {
        try {
            await fsp.mkdir(STORE_DIR, { recursive: true });
            await fsp.writeFile(INDEX_PATH, JSON.stringify([...this.runs.values()], undefined, 2), 'utf8');
        } catch {
            /* persistence is best-effort */
        }
    }

    protected resolveBranchName(worktreePath: string): string | undefined {
        try {
            const result = spawnSync('git', ['-C', worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
            if (result.status === 0) {
                const branch = result.stdout.trim();
                return branch && branch !== 'HEAD' ? branch : undefined;
            }
        } catch { /* worktree may be gone */ }
        return undefined;
    }

    protected async commitWorktree(worktreePath: string, message: string): Promise<void> {
        const status = await this.git(worktreePath, ['status', '--porcelain']);
        if (!status.trim()) {
            return; // nothing to commit
        }
        await this.git(worktreePath, ['add', '-A']);
        await this.git(worktreePath, [
            '-c', 'user.email=qaap@local', '-c', 'user.name=qaap',
            'commit', '--no-verify', '-m', message,
        ]);
    }

    protected async removeWorktree(cwd: string, worktreePath: string): Promise<void> {
        await this.git(cwd, ['worktree', 'remove', '--force', worktreePath]);
    }

    protected async deleteBranch(cwd: string, branch: string): Promise<void> {
        await this.git(cwd, ['branch', '-D', branch]);
    }

    protected async diffStats(worktreePath: string): Promise<{ adds: number; dels: number; fileCount: number }> {
        const unstaged = await this.git(worktreePath, ['diff', '--numstat']);
        const staged = await this.git(worktreePath, ['diff', '--cached', '--numstat']);
        let adds = 0;
        let dels = 0;
        const files = new Set<string>();
        for (const line of `${unstaged}\n${staged}`.split('\n')) {
            const trimmed = line.trim();
            if (!trimmed) {
                continue;
            }
            const [a, d, ...rest] = trimmed.split('\t');
            const file = rest.join('\t');
            if (file) {
                files.add(file);
            }
            adds += a === '-' ? 0 : (parseInt(a, 10) || 0);
            dels += d === '-' ? 0 : (parseInt(d, 10) || 0);
        }
        return { adds, dels, fileCount: files.size };
    }

    protected async assertGitRepo(cwd: string): Promise<void> {
        try {
            await this.git(cwd, ['rev-parse', '--is-inside-work-tree']);
        } catch {
            throw new Error('The "cwd" is not inside a git repository.');
        }
    }

    protected async git(cwd: string, args: string[]): Promise<string> {
        const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], { maxBuffer: GIT_MAX_BUFFER });
        return stdout;
    }

    protected isDirectory(p: string): boolean {
        try {
            return fs.statSync(p).isDirectory();
        } catch {
            return false;
        }
    }

    protected errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
