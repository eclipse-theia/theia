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
import { ToolRequestParameters } from '@theia/ai-core';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { PredefinedShellTool } from '@theia/ai-terminal/lib/browser/predefined-shell-tool';

export const GET_GIT_CHANGES_FUNCTION_ID = 'getGitChanges';

/**
 * Returns the unified git diff of changes in the current repository.
 *
 * The diff is fetched by invoking `git diff` under the selected SCM repository's root via
 * the existing shell-execution backend; if no repository is selected, falls back to the
 * workspace root.
 *
 * - With `stagedOnly = true` only staged changes are returned (`git diff --cached`).
 * - With `stagedOnly = false` all tracked changes vs HEAD **plus** the full content of
 *   untracked, non-ignored files are returned, so a brand-new file the user is about to
 *   commit is visible to the LLM. Untracked content is produced via
 *   `git diff --no-index /dev/null <file>` so it appears as a normal addition diff.
 *
 * The tool is a {@link PredefinedShellTool}, so it bypasses the user-confirmation flow
 * of the general-purpose `shellExecute` tool. The shell command is hardcoded here and
 * cannot be influenced by the LLM beyond toggling the `stagedOnly` flag.
 */
@injectable()
export class GetGitChangesTool extends PredefinedShellTool {

    @inject(ScmService)
    protected readonly scmService: ScmService;

    readonly id = GET_GIT_CHANGES_FUNCTION_ID;

    readonly description =
        'Returns the unified git diff of changes in the current repository. ' +
        'By default returns all current changes vs HEAD (staged + unstaged tracked files) and ' +
        'the full content of untracked, non-ignored files (as addition diffs); ' +
        'pass stagedOnly=true to return only staged changes (untracked files are then omitted). ' +
        'If the workspace is not a git repository the command exits non-zero with a message ' +
        'like "fatal: not a git repository" — treat that as "no changes to commit".';

    protected override readonly parameters: ToolRequestParameters = {
        type: 'object',
        properties: {
            stagedOnly: {
                type: 'boolean',
                description:
                    'If true, only staged changes (git diff --cached). ' +
                    'Default false = all changes vs HEAD + untracked files as additions.'
            }
        }
    };

    protected buildCommand(args: Record<string, unknown>): string {
        const stagedOnly = args.stagedOnly === true;
        if (stagedOnly) {
            return 'git diff --cached --no-color';
        }
        // Combine tracked changes vs HEAD with the contents of untracked, non-ignored files
        // (rendered as addition diffs via `git diff --no-index`). The `--no-index` invocation
        // exits with a non-zero status when a diff is produced, so we swallow that with `|| true`
        // to keep the overall command success-signal meaningful (only `git diff HEAD` failures bubble up).
        return 'git diff HEAD --no-color; '
            + 'git ls-files --others --exclude-standard -z '
            + '| xargs -0 -r -I{} sh -c \'git diff --no-index --no-color -- /dev/null "$1" || true\' _ {}';
    }

    protected override resolveWorkspaceRoot(): string | undefined {
        const repository = this.scmService.selectedRepository;
        if (repository) {
            return new URI(repository.provider.rootUri).path.fsPath();
        }
        return super.resolveWorkspaceRoot();
    }
}
