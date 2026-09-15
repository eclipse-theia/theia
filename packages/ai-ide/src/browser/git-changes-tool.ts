// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { CancellationToken } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ToolInvocationContext, ToolRequest, ToolRequestParameters } from '@theia/ai-core';
import { ScmRepository } from '@theia/scm/lib/browser/scm-repository';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { PredefinedShellTool } from '@theia/ai-terminal/lib/browser/predefined-shell-tool';
import {
    OutputTruncationOptions,
    ShellExecutionCanceledResult,
    ShellExecutionToolResult
} from '@theia/ai-terminal/lib/common/shell-execution-server';

export const GET_GIT_CHANGES_FUNCTION_ID = 'getGitChanges';

/** Returned instead of a diff when the arguments do not identify a known repository. */
export interface GitChangesRepositoryError {
    error: string;
    availableRepositories: string[];
}

export namespace GitChangesRepositoryError {
    export function is(result: unknown): result is GitChangesRepositoryError {
        return !!result && typeof result === 'object' && 'availableRepositories' in result;
    }
}

/**
 * Returns `git diff --cached` for one of the workspace's git repositories.
 *
 * `git diff --cached` is a plain, operator-free command that behaves the same on POSIX shells and
 * Windows `cmd.exe`, and it renders staged additions of new files as complete addition diffs, so
 * untracked files need no separate handling.
 *
 * The `repository` argument is matched against the repositories the SCM service actually knows
 * about, and the command then runs in *that* repository's root — the argument never reaches the
 * shell, so a repository name cannot inject a command. An unknown name is answered with the list
 * of valid ones rather than a silent fallback, so the model cannot mistake one repository's diff
 * for another's.
 */
@injectable()
export class GetGitChangesTool extends PredefinedShellTool {

    @inject(ScmService)
    protected readonly scmService: ScmService;

    readonly id = GET_GIT_CHANGES_FUNCTION_ID;

    readonly description =
        'Returns the staged changes (`git diff --cached`) of a git repository in the workspace, ' +
        'including the full content of newly added files. Unstaged and untracked files are not ' +
        'included. Returns an empty diff when nothing is staged, and an error listing the known ' +
        'repositories when the requested one does not exist.';

    protected override readonly parameters: ToolRequestParameters = {
        type: 'object',
        properties: {
            repository: {
                type: 'string',
                description:
                    'Which repository to read. Use the path of the repository root relative to the ' +
                    'workspace (e.g. "backend" or "backend/tools"), or its absolute path. Omit it to ' +
                    'use the repository currently selected in the Source Control view; in a ' +
                    'single-repository workspace that is always the right one, but in a workspace ' +
                    'with several repositories pass the name explicitly so the diff is not taken ' +
                    'from whichever repository the user happens to have selected.'
            }
        }
    };

    /**
     * A diff is only useful as a whole, so the `shellExecute` budget of 50 head plus 50 tail
     * lines is far too tight. The head is favoured over the tail because the leading hunks
     * describe the change; the backend caps stdout at 1MB regardless.
     */
    protected override readonly truncation: OutputTruncationOptions = {
        headLines: 2000,
        tailLines: 500,
        maxLineLength: 2000
    };

    override getTool(): ToolRequest {
        return {
            ...super.getTool(),
            // The base class runs the command unconditionally; an unknown repository has to be
            // answered before that, so the handler is wrapped rather than `execute` overridden.
            handler: (argString: string, ctx?: ToolInvocationContext) => this.handle(argString, ctx),
            getArgumentsShortLabel: (args: string) => {
                try {
                    const repository = JSON.parse(args)?.repository;
                    return typeof repository === 'string' && repository ? { label: repository, hasMore: false } : undefined;
                } catch {
                    return undefined;
                }
            }
        };
    }

    /**
     * Runs the diff for the given repository and returns it. Used directly by the commit-message
     * generator, which already knows its repository and must not go through tool confirmation.
     *
     * Returns an empty string when the execution was canceled.
     *
     * @throws if the git command fails, so a `fatal: ...` message is never mistaken for a diff.
     */
    async getStagedChanges(repository: ScmRepository, cancellationToken?: CancellationToken): Promise<string> {
        const result = await this.execute(JSON.stringify({ repository: repository.provider.rootUri }), { cancellationToken });
        if (ShellExecutionCanceledResult.is(result)) {
            return '';
        }
        if (!result.success) {
            const detail = result.error || result.output || `exit code ${result.exitCode}`;
            throw new Error(`Failed to read the staged changes: ${detail}`);
        }
        return result.output;
    }

    protected buildCommand(): string {
        return 'git diff --cached --no-color';
    }

    protected async handle(
        argString: string,
        ctx?: ToolInvocationContext
    ): Promise<ShellExecutionToolResult | ShellExecutionCanceledResult | GitChangesRepositoryError> {
        const args: Record<string, unknown> = argString ? JSON.parse(argString) : {};
        if (!this.findRepository(args)) {
            const requested = this.requestedRepository(args);
            return {
                error: requested
                    ? `Unknown repository '${requested}'.`
                    : 'No repository is selected in the Source Control view; pass the repository argument.',
                availableRepositories: this.availableRepositories()
            };
        }
        return this.execute(argString, ctx);
    }

    protected resolveWorkspaceRoot(args: Record<string, unknown>): string {
        const repository = this.findRepository(args);
        if (!repository) {
            // Guarded by `handle`; failing loudly here keeps an unresolved repository from
            // silently running the diff in the backend process' own working directory.
            throw new Error(`Unknown repository '${this.requestedRepository(args) ?? ''}'.`);
        }
        return new URI(repository.provider.rootUri).path.fsPath();
    }

    protected requestedRepository(args: Record<string, unknown>): string | undefined {
        return typeof args.repository === 'string' && args.repository.trim() ? args.repository.trim() : undefined;
    }

    /**
     * Matches the `repository` argument against the known repositories by label, folder name or
     * path, and falls back to the selected repository when the argument is absent.
     */
    protected findRepository(args: Record<string, unknown>): ScmRepository | undefined {
        const requested = this.requestedRepository(args);
        if (!requested) {
            return this.scmService.selectedRepository;
        }
        const normalized = this.normalize(requested);
        return this.scmService.repositories.find(repository => {
            const root = new URI(repository.provider.rootUri);
            return this.normalize(this.repositoryLabel(repository)) === normalized
                || this.normalize(root.path.base) === normalized
                || this.normalize(root.path.fsPath()) === normalized
                || this.normalize(root.toString()) === normalized;
        });
    }

    protected availableRepositories(): string[] {
        return this.scmService.repositories.map(repository => this.repositoryLabel(repository));
    }

    /**
     * Identifies a repository by the path of its root relative to the workspace, so that the label
     * is both unambiguous and usable as the `repository` argument of a follow-up call.
     */
    protected repositoryLabel(repository: ScmRepository): string {
        const root = new URI(repository.provider.rootUri);
        for (const workspaceRoot of this.workspaceService.tryGetRoots()) {
            if (!workspaceRoot.resource.isEqualOrParent(root)) {
                continue;
            }
            const relative = workspaceRoot.resource.relative(root)?.toString();
            return relative ? `${workspaceRoot.resource.path.base}/${relative}` : workspaceRoot.resource.path.base;
        }
        return root.path.base;
    }

    /** Path separators and case differ across platforms and between user phrasings. */
    protected normalize(value: string): string {
        return value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    }
}
