// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const execFileAsync = promisify(execFile);
const GIT_MAX_BUFFER = 16 * 1024 * 1024;

/** Result of provisioning an isolated worktree for a composer "New Worktree" task. */
export interface QaapConversationWorktree {
    /** Absolute path of the new worktree — used as the conversation's cwd. */
    readonly worktreePath: string;
    /** Branch backing the worktree (created off HEAD of the base repository). */
    readonly branch: string;
}

/**
 * Provisions isolated git worktrees for single conversations started from the composer's
 * "New Worktree" destination. Mirrors the parallel-run layout: worktrees live under the OS
 * temp dir so they never pollute the repository's status, each on a fresh `qaap/worktree/*`
 * branch cut from HEAD.
 */
@injectable()
export class QaapConversationWorktreeService {

    async create(baseCwd: string): Promise<QaapConversationWorktree> {
        const cwd = path.resolve(baseCwd ?? '');
        if (!path.isAbsolute(cwd) || !this.isDirectory(cwd)) {
            throw new Error('A valid absolute "cwd" directory is required.');
        }
        await this.assertGitRepo(cwd);
        const slug = randomUUID().slice(0, 8);
        const branch = `qaap/worktree/${slug}`;
        const worktreePath = path.join(os.tmpdir(), 'qaap-worktrees', slug);
        await this.git(cwd, ['worktree', 'add', '-b', branch, worktreePath, 'HEAD']);
        return { worktreePath, branch };
    }

    protected async assertGitRepo(cwd: string): Promise<void> {
        try {
            await this.git(cwd, ['rev-parse', '--is-inside-work-tree']);
        } catch {
            throw new Error('Worktree tasks need the project to be a git repository.');
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
}
