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
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { PredefinedShellTool } from '@theia/ai-terminal/lib/browser/predefined-shell-tool';
import { OutputTruncationOptions } from '@theia/ai-terminal/lib/common/shell-execution-server';

export const GET_GIT_CHANGES_FUNCTION_ID = 'getGitChanges';

/**
 * Returns `git diff --cached` for the selected SCM repository — a plain, operator-free command
 * that behaves the same on POSIX shells and Windows `cmd.exe`. Staged additions of new files
 * appear as complete addition diffs, so no separate handling of untracked files is needed.
 */
@injectable()
export class GetGitChangesTool extends PredefinedShellTool {

    @inject(ScmService)
    protected readonly scmService: ScmService;

    readonly id = GET_GIT_CHANGES_FUNCTION_ID;

    readonly description =
        'Returns the staged changes (git diff --cached) of the current repository, including the ' +
        'full content of newly added files. If the workspace is not a git repository the command ' +
        'reports "fatal: not a git repository", which means there are no changes to commit.';

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

    /**
     * Runs the diff directly and returns it; the commit-message generator uses this to inject the
     * changes into its prompt.
     *
     * @throws if the git command fails, so a `fatal:` message is never mistaken for a diff.
     */
    async getChanges(cancellationToken?: CancellationToken): Promise<string> {
        const result = await this.execute('', { cancellationToken });
        if ('canceled' in result) {
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

    protected resolveWorkspaceRoot(): string | undefined {
        const repository = this.scmService.selectedRepository;
        return repository ? new URI(repository.provider.rootUri).path.fsPath() : this.firstWorkspaceRoot();
    }
}
