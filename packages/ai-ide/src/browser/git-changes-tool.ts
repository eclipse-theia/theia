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

import { inject, injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { CancellationToken } from '@theia/core/lib/common/cancellation';
import { ToolInvocationContext, ToolRequestParameters } from '@theia/ai-core';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { PredefinedShellTool, PredefinedShellToolCanceledResult, PredefinedShellToolResult } from '@theia/ai-terminal/lib/browser/predefined-shell-tool';
import { combineAndTruncate } from '@theia/ai-terminal/lib/common/shell-execution-server';

export const GET_GIT_CHANGES_FUNCTION_ID = 'getGitChanges';

/**
 * Returns the git diff of the current repository. `git diff --cached`/`git diff HEAD` are plain,
 * operator-free commands that behave the same on POSIX shells and Windows `cmd.exe`.
 *
 * For the non-staged scope the content of untracked, non-ignored files is appended so brand-new
 * files are visible. Untracked files are listed with `git ls-files -z` and read via the
 * {@link FileService}, so their names never reach a shell and cannot inject a command.
 */
@injectable()
export class GetGitChangesTool extends PredefinedShellTool {

    @inject(ScmService)
    protected readonly scmService: ScmService;

    @inject(FileService)
    protected readonly fileService: FileService;

    readonly id = GET_GIT_CHANGES_FUNCTION_ID;

    readonly description =
        'Returns the git diff of the current repository. By default returns all current changes vs ' +
        'HEAD (staged + unstaged tracked files) plus the content of untracked, non-ignored files; ' +
        'pass stagedOnly=true to return only staged changes (untracked files are then omitted). If ' +
        'the workspace is not a git repository the command reports "fatal: not a git repository", ' +
        'which means there are no changes to commit.';

    protected override readonly parameters: ToolRequestParameters = {
        type: 'object',
        properties: {
            stagedOnly: {
                type: 'boolean',
                description: 'If true, only staged changes (git diff --cached). Default false = all changes vs HEAD + untracked file content.'
            }
        }
    };

    /** Runs the diff directly; the commit-message generator uses this to inject the changes into its prompt. */
    async getChanges(stagedOnly: boolean, cancellationToken?: CancellationToken): Promise<string> {
        const result = await this.execute(JSON.stringify({ stagedOnly }), { cancellationToken });
        return result.output ?? '';
    }

    protected buildCommand(args: Record<string, unknown>): string {
        return args.stagedOnly === true ? 'git diff --cached --no-color' : 'git diff HEAD --no-color';
    }

    protected override async execute(
        argString: string,
        ctx?: ToolInvocationContext
    ): Promise<PredefinedShellToolResult | PredefinedShellToolCanceledResult> {
        const args: Record<string, unknown> = argString ? JSON.parse(argString) : {};
        const result = await super.execute(argString, ctx);
        if (args.stagedOnly === true || 'canceled' in result) {
            return result;
        }
        const untracked = await this.collectUntracked(ctx?.cancellationToken);
        return untracked ? { ...result, output: [result.output, untracked].filter(text => !!text).join('\n\n') } : result;
    }

    /** Content of untracked, non-ignored files, each as a labeled block. */
    protected async collectUntracked(token?: CancellationToken): Promise<string> {
        const rootUri = this.resolveRootUri();
        if (!rootUri) {
            return '';
        }
        const list = await this.shellServer.execute({
            command: 'git ls-files --others --exclude-standard -z',
            cwd: rootUri.path.fsPath(),
            timeout: this.timeout
        });
        const blocks: string[] = [];
        for (const file of (list.stdout ?? '').split('\0').filter(name => !!name)) {
            if (token?.isCancellationRequested) {
                break;
            }
            try {
                const { value } = await this.fileService.read(rootUri.resolve(file));
                blocks.push(value.includes('\0') ? `New binary file ${file}` : `New file ${file}:\n${value}`);
            } catch {
                // The file may be unreadable or have vanished since it was listed; skip it.
            }
        }
        return combineAndTruncate(blocks.join('\n\n'), '');
    }

    protected resolveRootUri(): URI | undefined {
        const repository = this.scmService.selectedRepository;
        return repository ? new URI(repository.provider.rootUri) : this.workspaceService.getWorkspaceRootUri(undefined);
    }

    protected override resolveWorkspaceRoot(): string | undefined {
        return this.resolveRootUri()?.path.fsPath();
    }
}
