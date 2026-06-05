// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { Application, Request, Response } from '@theia/core/shared/express';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import {
    QAAP_GIT_REVIEW_API_PATH,
    parseUnifiedDiff,
    type QaapGitChangedFile,
    type QaapGitChangesResponse,
    type QaapGitCommitWorkflowAction,
    type QaapGitFileDiffResponse,
    type QaapGitBranchesResponse,
    type QaapGitHistoryCommit,
    type QaapGitHistoryResponse,
} from '../common/qaap-git-review';

/** Diffs can be large; allow up to 16 MB of git output. */
const GIT_MAX_BUFFER = 16 * 1024 * 1024;

/**
 * Exposes read-only `git` working-tree information for the mobile diff-review surface.
 * The agent (or the user) writes to the workspace on disk; this endpoint reports what changed.
 */
@injectable()
export class QaapGitReviewEndpoint implements BackendApplicationContribution {

    configure(app: Application): void {
        app.get(`${QAAP_GIT_REVIEW_API_PATH}/changes`, (req, res) => {
            void this.handleChanges(req, res);
        });
        app.get(`${QAAP_GIT_REVIEW_API_PATH}/diff`, (req, res) => {
            void this.handleDiff(req, res);
        });
        app.get(`${QAAP_GIT_REVIEW_API_PATH}/history`, (req, res) => {
            void this.handleHistory(req, res);
        });
        app.get(`${QAAP_GIT_REVIEW_API_PATH}/branches`, (req, res) => {
            void this.handleBranches(req, res);
        });
        app.post(`${QAAP_GIT_REVIEW_API_PATH}/checkout`, (req, res) => {
            void this.handleCheckout(req, res);
        });
        app.post(`${QAAP_GIT_REVIEW_API_PATH}/stage`, (req, res) => {
            void this.handleStage(req, res);
        });
        app.post(`${QAAP_GIT_REVIEW_API_PATH}/discard`, (req, res) => {
            void this.handleDiscard(req, res);
        });
        app.post(`${QAAP_GIT_REVIEW_API_PATH}/commit-workflow`, (req, res) => {
            void this.handleCommitWorkflow(req, res);
        });
    }

    protected async handleChanges(req: Request, res: Response): Promise<void> {
        const root = await this.resolveRepository(req, res);
        if (!root) {
            return;
        }
        try {
            const [files, branch] = await Promise.all([
                this.collectChangedFiles(root),
                this.readCurrentBranch(root),
            ]);
            res.json({ root, branch, files } satisfies QaapGitChangesResponse);
        } catch (error) {
            res.status(500).json({ error: this.errorMessage(error) });
        }
    }

    protected async handleStage(req: Request, res: Response): Promise<void> {
        const root = await this.resolveRepositoryBody(req, res);
        if (!root) {
            return;
        }
        const file = this.sanitizeRelativePath(req.body?.file);
        if (!file) {
            res.status(400).json({ error: 'Missing or invalid "file" in request body.' });
            return;
        }
        try {
            await this.git(root, ['add', '--', file]);
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ error: this.errorMessage(error) });
        }
    }

    protected async handleDiscard(req: Request, res: Response): Promise<void> {
        const root = await this.resolveRepositoryBody(req, res);
        if (!root) {
            return;
        }
        const file = this.sanitizeRelativePath(req.body?.file);
        if (!file) {
            res.status(400).json({ error: 'Missing or invalid "file" in request body.' });
            return;
        }
        const absolute = path.join(root, file);
        try {
            if (fs.existsSync(absolute)) {
                const status = await this.git(root, ['status', '--porcelain=v1', '--', file]);
                if (status.startsWith('??')) {
                    await fs.promises.unlink(absolute);
                } else {
                    await this.git(root, ['checkout', '--', file]);
                }
            }
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ error: this.errorMessage(error) });
        }
    }

    protected async handleCommitWorkflow(req: Request, res: Response): Promise<void> {
        const root = await this.resolveRepositoryBody(req, res);
        if (!root) {
            return;
        }
        const action = req.body?.action as QaapGitCommitWorkflowAction | undefined;
        const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
        const branchName = this.sanitizeBranchName(req.body?.branchName);
        if (!action || !this.isCommitWorkflowAction(action)) {
            res.status(400).json({ error: 'Missing or invalid "action" in request body.' });
            return;
        }
        if (!message) {
            res.status(400).json({ error: 'Missing or invalid "message" in request body.' });
            return;
        }
        if (this.requiresNewBranch(action) && !branchName) {
            res.status(400).json({ error: 'Missing or invalid "branchName" for this action.' });
            return;
        }
        try {
            if (branchName) {
                await this.git(root, ['checkout', '-b', branchName]);
            }
            await this.git(root, ['add', '-A']);
            await this.git(root, ['commit', '-m', message]);
            if (this.shouldPush(action)) {
                await this.pushCurrentBranch(root);
            }
            res.json({ ok: true, action, branch: branchName ?? await this.readCurrentBranch(root) });
        } catch (error) {
            res.status(500).json({ error: this.errorMessage(error) });
        }
    }

    protected isCommitWorkflowAction(value: string): value is QaapGitCommitWorkflowAction {
        return value === 'create-branch-commit'
            || value === 'create-branch-commit-push'
            || value === 'commit-push'
            || value === 'commit'
            || value === 'commit-create-pr';
    }

    protected requiresNewBranch(action: QaapGitCommitWorkflowAction): boolean {
        return action === 'create-branch-commit' || action === 'create-branch-commit-push';
    }

    protected shouldPush(action: QaapGitCommitWorkflowAction): boolean {
        return action === 'create-branch-commit-push'
            || action === 'commit-push'
            || action === 'commit-create-pr';
    }

    protected async pushCurrentBranch(root: string): Promise<void> {
        try {
            await this.git(root, ['rev-parse', '--abbrev-ref', '@{u}']);
            await this.git(root, ['push']);
        } catch {
            const branch = (await this.git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
            await this.git(root, ['push', '-u', 'origin', branch]);
        }
    }

    protected sanitizeBranchName(value: unknown): string | undefined {
        if (typeof value !== 'string') {
            return undefined;
        }
        const trimmed = value.trim();
        if (!trimmed || trimmed.includes('..') || /[\s~^:?*[\]\\]/.test(trimmed)) {
            return undefined;
        }
        return trimmed;
    }

    protected async resolveRepositoryBody(req: Request, res: Response): Promise<string | undefined> {
        const raw = typeof req.body?.root === 'string' ? req.body.root : '';
        return this.resolveRepositoryRoot(raw, res);
    }

    /** Validate the client-supplied repository root and confirm it is a git work tree. */
    protected async resolveRepository(req: Request, res: Response): Promise<string | undefined> {
        const raw = typeof req.query.root === 'string' ? req.query.root : '';
        return this.resolveRepositoryRoot(raw, res);
    }

    protected async resolveRepositoryRoot(raw: string, res: Response): Promise<string | undefined> {
        const root = raw ? path.resolve(raw) : '';
        if (!root || !path.isAbsolute(root) || !this.isExistingDirectory(root)) {
            res.status(400).json({ error: 'Missing or invalid "root" query parameter.' });
            return undefined;
        }
        try {
            const inside = (await this.git(root, ['rev-parse', '--is-inside-work-tree'])).trim();
            if (inside !== 'true') {
                throw new Error('not a work tree');
            }
        } catch {
            res.status(400).json({ error: 'The given root is not a git repository.' });
            return undefined;
        }
        return root;
    }

    protected async handleDiff(req: Request, res: Response): Promise<void> {
        const root = await this.resolveRepository(req, res);
        if (!root) {
            return;
        }
        const file = this.sanitizeRelativePath(req.query.file);
        if (!file) {
            res.status(400).json({ error: 'Missing or invalid "file" query parameter.' });
            return;
        }
        try {
            const patch = await this.computeFileDiff(root, file);
            res.json({
                path: file,
                binary: patch.includes('Binary files '),
                hunks: parseUnifiedDiff(patch),
            } satisfies QaapGitFileDiffResponse);
        } catch (error) {
            res.status(500).json({ error: this.errorMessage(error) });
        }
    }

    protected async handleHistory(req: Request, res: Response): Promise<void> {
        const root = await this.resolveRepository(req, res);
        if (!root) {
            return;
        }
        try {
            const [branch, commits] = await Promise.all([
                this.readCurrentBranch(root),
                this.collectHistory(root),
            ]);
            res.json({ root, branch, commits } satisfies QaapGitHistoryResponse);
        } catch (error) {
            res.status(500).json({ error: this.errorMessage(error) });
        }
    }

    protected async handleBranches(req: Request, res: Response): Promise<void> {
        const root = await this.resolveRepository(req, res);
        if (!root) {
            return;
        }
        try {
            const [current, branches] = await Promise.all([
                this.readCurrentBranch(root),
                this.listLocalBranches(root),
            ]);
            res.json({ root, current, branches } satisfies QaapGitBranchesResponse);
        } catch (error) {
            res.status(500).json({ error: this.errorMessage(error) });
        }
    }

    protected async handleCheckout(req: Request, res: Response): Promise<void> {
        const root = await this.resolveRepositoryBody(req, res);
        if (!root) {
            return;
        }
        const branch = this.sanitizeBranchName(req.body?.branch);
        if (!branch) {
            res.status(400).json({ error: 'Missing or invalid "branch" in request body.' });
            return;
        }
        try {
            await this.git(root, ['checkout', branch]);
            res.json({ ok: true, branch: await this.readCurrentBranch(root) ?? branch });
        } catch (error) {
            res.status(500).json({ error: this.errorMessage(error) });
        }
    }

    protected async collectChangedFiles(root: string): Promise<QaapGitChangedFile[]> {
        const status = await this.git(root, ['status', '--porcelain=v1', '-z']);
        const [unstaged, staged] = await Promise.all([
            this.numstat(root, ['diff', '--numstat', '-z']),
            this.numstat(root, ['diff', '--cached', '--numstat', '-z']),
        ]);
        const files: QaapGitChangedFile[] = [];
        for (const entry of status.split('\0')) {
            if (entry.length < 4) {
                continue;
            }
            const indexStatus = entry[0];
            const worktreeStatus = entry[1];
            const filePath = entry.slice(3);
            const untracked = indexStatus === '?';
            const isStaged = !untracked && indexStatus !== ' ' && worktreeStatus === ' ';
            const counts = unstaged.get(filePath) ?? staged.get(filePath);
            files.push({
                path: filePath,
                status: untracked ? 'U' : (worktreeStatus !== ' ' ? worktreeStatus : indexStatus),
                adds: counts?.adds ?? (untracked ? await this.countLines(root, filePath) : 0),
                dels: counts?.dels ?? 0,
                staged: isStaged,
            });
        }
        return files;
    }

    /** Resolve the most relevant diff for a file: unstaged, else staged, else untracked. */
    protected async computeFileDiff(root: string, file: string): Promise<string> {
        const unstaged = await this.git(root, ['diff', '--', file]);
        if (unstaged.trim()) {
            return unstaged;
        }
        const staged = await this.git(root, ['diff', '--cached', '--', file]);
        if (staged.trim()) {
            return staged;
        }
        // Untracked file — diff against an empty tree so the whole file shows as added.
        try {
            return await this.git(root, ['diff', '--no-index', '--', '/dev/null', file]);
        } catch (error) {
            // `git diff --no-index` exits 1 when files differ; its stdout still holds the patch.
            const stdout = (error as { stdout?: string }).stdout;
            return typeof stdout === 'string' ? stdout : '';
        }
    }

    protected async collectHistory(root: string): Promise<QaapGitHistoryCommit[]> {
        const format = '%H%x1f%h%x1f%s%x1f%an%x1f%ae%x1f%aI%x1f%D%x1e';
        const out = await this.git(root, ['log', '--decorate=short', '--date=iso-strict', `--pretty=format:${format}`, '-n', '80']);
        return out.split('\x1e')
            .map(entry => entry.trim())
            .filter(Boolean)
            .map(entry => {
                const [hash = '', shortHash = '', subject = '', authorName = '', authorEmail = '', authoredAt = '', refsRaw = ''] = entry.split('\x1f');
                return {
                    hash,
                    shortHash,
                    subject,
                    authorName,
                    authorEmail,
                    authoredAt,
                    refs: refsRaw.split(',').map(ref => ref.trim()).filter(Boolean),
                };
            });
    }

    protected async readCurrentBranch(root: string): Promise<string | undefined> {
        try {
            const name = (await this.git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim();
            return name && name !== 'HEAD' ? name : undefined;
        } catch {
            return undefined;
        }
    }

    protected async listLocalBranches(root: string): Promise<string[]> {
        try {
            const out = await this.git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']);
            return out.split('\n').map(line => line.trim()).filter(Boolean);
        } catch {
            return [];
        }
    }

    protected async numstat(root: string, args: string[]): Promise<Map<string, { adds: number; dels: number }>> {
        const out = await this.git(root, args);
        const map = new Map<string, { adds: number; dels: number }>();
        // `-z` numstat output: "adds\tdels\t" followed by a NUL-terminated path.
        const tokens = out.split('\0');
        for (let i = 0; i < tokens.length; i++) {
            const match = /^(\d+|-)\t(\d+|-)\t(.*)$/.exec(tokens[i]);
            if (!match) {
                continue;
            }
            let filePath = match[3];
            if (!filePath && i + 1 < tokens.length) {
                filePath = tokens[++i];
            }
            map.set(filePath, {
                adds: match[1] === '-' ? 0 : Number(match[1]),
                dels: match[2] === '-' ? 0 : Number(match[2]),
            });
        }
        return map;
    }

    protected async countLines(root: string, file: string): Promise<number> {
        try {
            const content = await fs.promises.readFile(path.join(root, file), 'utf8');
            return content ? content.split('\n').length : 0;
        } catch {
            return 0;
        }
    }

    protected git(root: string, args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            execFile('git', args, { cwd: root, maxBuffer: GIT_MAX_BUFFER }, (error, stdout) => {
                if (error) {
                    reject(Object.assign(error, { stdout }));
                } else {
                    resolve(stdout);
                }
            });
        });
    }

    /** Reject absolute paths and parent-directory traversal so git stays inside the repo. */
    protected sanitizeRelativePath(value: unknown): string | undefined {
        if (typeof value !== 'string' || !value) {
            return undefined;
        }
        const normalized = value.replace(/\\/g, '/');
        if (path.isAbsolute(normalized) || normalized.split('/').includes('..')) {
            return undefined;
        }
        return normalized;
    }

    protected isExistingDirectory(target: string): boolean {
        try {
            return fs.statSync(target).isDirectory();
        } catch {
            return false;
        }
    }

    protected errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
