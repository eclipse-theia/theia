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

import { Emitter, Event, ILogger, MessageService, nls } from '@theia/core';
import { CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ScmRepository } from '@theia/scm/lib/browser/scm-repository';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { CommitMessageAgent } from './commit-message-agent';
import { CommitMessageScope } from './commit-message-commands';
import { GetGitChangesTool } from './git-changes-tool';

/**
 * Tracks an in-flight commit-message generation for a given scope. `cts` is fired by
 * {@link CommitMessageRunner.cancel} so a click on the spinning button cancels the run
 * even while we are still in the pre-request phase (resolving the repository, fetching the
 * diff, awaiting the overwrite confirmation). Once the LLM request is under way, the same
 * token cancels it via {@link CommitMessageAgent.generateCommitMessage}.
 */
interface RunningSlot {
    readonly cts: CancellationTokenSource;
}

/**
 * Drives the {@link CommitMessageAgent}: fetches the git diff for the requested scope, asks the
 * agent to turn it into a commit message and writes the result into the SCM commit-message input
 * of the currently selected repository. The agent is a plain (non-chat) agent, so there is no
 * chat session, no tool-confirmation prompt and no chat-model bookkeeping here.
 */
@injectable()
export class CommitMessageRunner {

    @inject(CommitMessageAgent)
    protected readonly commitMessageAgent: CommitMessageAgent;

    @inject(GetGitChangesTool)
    protected readonly gitChangesTool: GetGitChangesTool;

    @inject(ScmService)
    protected readonly scmService: ScmService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected readonly running = new Map<CommitMessageScope, RunningSlot>();

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    isRunning(scope: CommitMessageScope): boolean {
        return this.running.has(scope);
    }

    cancel(scope: CommitMessageScope): void {
        this.running.get(scope)?.cts.cancel();
    }

    async run(scope: CommitMessageScope): Promise<void> {
        // Only one generation may run at a time: the two scopes share `repository.input.value`,
        // so allowing both (e.g. from the command palette, which bypasses the widget's button
        // disabling) would let them race on the input.
        if (this.running.size > 0) {
            return;
        }
        const slot: RunningSlot = { cts: new CancellationTokenSource() };
        this.running.set(scope, slot);
        this.onDidChangeEmitter.fire();

        try {
            const repository = this.scmService.selectedRepository;
            if (!repository) {
                await this.messageService.warn(
                    nls.localize('theia/ai-ide/commit-message/no-repository', 'No source-control repository is selected.')
                );
                return;
            }

            const changes = await this.gitChangesTool.getChanges(scope === 'staged', slot.cts.token);
            if (slot.cts.token.isCancellationRequested) {
                return;
            }
            if (!changes.trim()) {
                await this.messageService.warn(
                    nls.localize('theia/ai-ide/commit-message/no-changes', 'There are no changes to generate a commit message from.')
                );
                return;
            }

            if (!(await this.confirmOverwrite(repository))) {
                return;
            }
            if (slot.cts.token.isCancellationRequested) {
                return;
            }

            const message = await this.commitMessageAgent.generateCommitMessage(changes, scope, slot.cts.token);
            if (slot.cts.token.isCancellationRequested) {
                return;
            }
            if (!message) {
                this.messageService.warn(
                    nls.localize('theia/ai-ide/commit-message/empty', 'The model returned an empty commit message.')
                );
                return;
            }

            repository.input.value = message;
            repository.input.focus();
        } catch (error) {
            if (slot.cts.token.isCancellationRequested) {
                return;
            }
            this.logger.error('Failed to run commit-message agent', error);
            this.notifyFailure(error instanceof Error ? error.message : String(error));
        } finally {
            this.running.delete(scope);
            this.onDidChangeEmitter.fire();
            slot.cts.dispose();
        }
    }

    protected notifyFailure(reason: string): void {
        this.messageService.error(
            nls.localize(
                'theia/ai-ide/commit-message/failed',
                'Failed to generate commit message: {0}',
                reason
            )
        );
    }

    /** Returns `true` if the operation should proceed. */
    protected async confirmOverwrite(repository: ScmRepository): Promise<boolean> {
        if (!repository.input.value || !repository.input.value.trim()) {
            return true;
        }
        const replace = nls.localizeByDefault('Replace');
        const cancel = nls.localizeByDefault('Cancel');
        const choice = await this.messageService.warn(
            nls.localize(
                'theia/ai-ide/commit-message/replace-prompt',
                'The commit message field is not empty. Replace it?'
            ),
            replace,
            cancel
        );
        return choice === replace;
    }
}
