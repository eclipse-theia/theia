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
import { ConfirmDialog, Dialog } from '@theia/core/lib/browser/dialogs';
import { CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { ScmRepository } from '@theia/scm/lib/browser/scm-repository';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { CommitMessageAgent } from './commit-message-agent';
import { GetGitChangesTool } from './git-changes-tool';

/**
 * Drives the {@link CommitMessageAgent}: fetches the staged git diff, asks the agent to turn it
 * into a commit message and writes the result into the SCM commit-message input of the currently
 * selected repository. The agent is a plain (non-chat) agent, so there is no chat session, no
 * tool-confirmation prompt and no chat-model bookkeeping here.
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

    @inject(ILogger) @named('ai-ide:CommitMessageRunner')
    protected readonly logger: ILogger;

    /**
     * Cancellation source of the in-flight generation, or `undefined` when idle. It is fired by
     * {@link cancel} so a click on the spinning button cancels the run even while we are still in
     * the pre-request phase (resolving the repository, fetching the diff, awaiting the overwrite
     * confirmation). Once the LLM request is under way, the same token cancels it via
     * {@link CommitMessageAgent.generateCommitMessage}.
     */
    protected current: CancellationTokenSource | undefined;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    isRunning(): boolean {
        return !!this.current;
    }

    cancel(): void {
        this.current?.cancel();
    }

    async run(): Promise<void> {
        if (this.current) {
            return;
        }
        const cts = new CancellationTokenSource();
        this.current = cts;
        this.onDidChangeEmitter.fire();

        try {
            const repository = this.scmService.selectedRepository;
            if (!repository) {
                // Deliberately not awaited: a dismissed toast never resolves, which would leave
                // the button spinning forever.
                this.messageService.warn(
                    nls.localize('theia/ai-ide/commit-message/no-repository', 'No source-control repository is selected.')
                );
                return;
            }

            const changes = await this.gitChangesTool.getChanges(cts.token);
            if (cts.token.isCancellationRequested) {
                return;
            }
            if (!changes.trim()) {
                this.messageService.warn(
                    nls.localize('theia/ai-ide/commit-message/no-changes', 'There are no staged changes to generate a commit message from.')
                );
                return;
            }

            if (!(await this.confirmOverwrite(repository))) {
                return;
            }
            if (cts.token.isCancellationRequested) {
                return;
            }

            const message = await this.commitMessageAgent.generateCommitMessage(changes, cts.token);
            if (cts.token.isCancellationRequested) {
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
            if (cts.token.isCancellationRequested) {
                return;
            }
            this.logger.error('Failed to run commit-message agent', error);
            this.notifyFailure(error instanceof Error ? error.message : String(error));
        } finally {
            this.current = undefined;
            this.onDidChangeEmitter.fire();
            cts.dispose();
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
        if (!repository.input.value.trim()) {
            return true;
        }
        return !!await new ConfirmDialog({
            title: nls.localize('theia/ai-ide/commit-message/replace-title', 'Replace Commit Message'),
            msg: nls.localize(
                'theia/ai-ide/commit-message/replace-prompt',
                'The commit message field is not empty. Replace its content with the generated message?'
            ),
            ok: nls.localizeByDefault('Replace'),
            cancel: Dialog.CANCEL
        }).open();
    }
}
