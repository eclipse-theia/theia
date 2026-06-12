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
import { ChatRequestParser } from '@theia/ai-chat/lib/common/chat-request-parser';
import { ChatAgentLocation } from '@theia/ai-chat/lib/common/chat-agents';
import {
    ChatContext,
    ChatResponseModel,
    MarkdownChatResponseContent,
    MutableChatModel,
    MutableChatRequestModel,
    TextChatResponseContent
} from '@theia/ai-chat/lib/common/chat-model';
import { ToolConfirmationManager } from '@theia/ai-chat/lib/browser/chat-tool-preference-bindings';
import { ToolConfirmationMode } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { ScmRepository } from '@theia/scm/lib/browser/scm-repository';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { CommitMessageAgent } from './commit-message-agent';
import { CommitMessageScope } from './commit-message-commands';
import { GET_GIT_CHANGES_FUNCTION_ID } from './git-changes-tool';

/**
 * Tracks an in-flight commit-message generation for a given scope. `cts` is fired by
 * {@link CommitMessageRunner.cancel} so a click on the spinning button cancels the run
 * even while we are still in the pre-request phase (resolving the repository, awaiting
 * the overwrite confirmation, parsing the chat request). Once the request exists,
 * `request.cancel()` cancels the LLM call as well.
 */
interface RunningSlot {
    readonly cts: CancellationTokenSource;
    request?: MutableChatRequestModel;
}

const USER_MESSAGES: Record<CommitMessageScope, string> = {
    staged: 'Provide a commit message for the staged changes.',
    all: 'Provide a commit message for all current changes.'
};

/**
 * Runs the {@link CommitMessageAgent} silently — i.e. without creating a `ChatService`
 * session that would surface in the chat view — and writes the resulting commit message
 * into the SCM commit-message input of the currently selected repository.
 */
@injectable()
export class CommitMessageRunner {

    @inject(CommitMessageAgent)
    protected readonly commitMessageAgent: CommitMessageAgent;

    @inject(ChatRequestParser)
    protected readonly chatRequestParser: ChatRequestParser;

    @inject(ScmService)
    protected readonly scmService: ScmService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(ToolConfirmationManager)
    protected readonly confirmationManager: ToolConfirmationManager;

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected readonly running = new Map<CommitMessageScope, RunningSlot>();

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    isRunning(scope: CommitMessageScope): boolean {
        return this.running.has(scope);
    }

    cancel(scope: CommitMessageScope): void {
        const slot = this.running.get(scope);
        if (!slot) {
            return;
        }
        slot.cts.cancel();
        slot.request?.cancel();
    }

    async run(scope: CommitMessageScope): Promise<void> {
        if (this.running.has(scope)) {
            return;
        }
        // Reserve the scope synchronously so a concurrent click cannot race past the guard.
        // The token in the slot lets `cancel(scope)` abort the run during the pre-request
        // phase (before `addRequest` has produced a `MutableChatRequestModel` to cancel).
        const slot: RunningSlot = { cts: new CancellationTokenSource() };
        this.running.set(scope, slot);
        this.onDidChangeEmitter.fire();

        const model = new MutableChatModel(ChatAgentLocation.Panel);
        try {
            const repository = this.scmService.selectedRepository;
            if (!repository) {
                await this.messageService.warn(
                    nls.localize('theia/ai-ide/commit-message/no-repository', 'No source-control repository is selected.')
                );
                return;
            }
            if (slot.cts.token.isCancellationRequested) {
                return;
            }

            // Gate the tool on user consent before the agent gets a chance to call it. Background
            // invocations like this one have no UI to render the regular per-call confirmation
            // modal into, so we ask the user up-front to flip the tool to `ALWAYS_ALLOW`.
            if (!(await this.ensureToolAllowed())) {
                return;
            }
            if (slot.cts.token.isCancellationRequested) {
                return;
            }

            if (!(await this.confirmOverwrite(repository))) {
                return;
            }
            if (slot.cts.token.isCancellationRequested) {
                return;
            }

            const context: ChatContext = { variables: [] };
            const parsedRequest = await this.chatRequestParser.parseChatRequest(
                { text: USER_MESSAGES[scope] },
                ChatAgentLocation.Panel,
                context
            );
            if (slot.cts.token.isCancellationRequested) {
                return;
            }

            const request = model.addRequest(parsedRequest, this.commitMessageAgent.id, context);
            slot.request = request;
            // A cancel that arrived while we were building the request must propagate to it now.
            if (slot.cts.token.isCancellationRequested) {
                request.cancel();
                return;
            }

            await this.invokeAndAwaitCompletion(request);

            if (request.response.isCanceled) {
                return;
            }
            if (request.response.isError) {
                const reason = request.response.errorObject?.message
                    ?? nls.localize('theia/ai-ide/commit-message/unknown-error', 'unknown error');
                this.notifyFailure(reason);
                return;
            }

            const text = this.extractCommitMessageText(request.response);
            if (!text) {
                this.messageService.warn(
                    nls.localize('theia/ai-ide/commit-message/empty', 'The model returned an empty commit message.')
                );
                return;
            }

            repository.input.value = text;
            repository.input.focus();
        } catch (error) {
            this.logger.error('Failed to run commit-message agent', error);
            this.notifyFailure(error instanceof Error ? error.message : String(error));
        } finally {
            this.running.delete(scope);
            this.onDidChangeEmitter.fire();
            slot.cts.dispose();
            model.dispose();
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

    /**
     * Extracts the commit-message text from the response, discarding non-textual content
     * such as thinking blocks (whose `asString()` serializes as JSON) and tool calls.
     */
    protected extractCommitMessageText(response: ChatResponseModel): string {
        return response.response.content
            .filter(c => TextChatResponseContent.is(c) || MarkdownChatResponseContent.is(c))
            .map(c => c.asString?.() ?? '')
            .filter(text => !!text)
            .join('\n\n')
            .trim();
    }

    /**
     * Ensures the `getGitChanges` tool is set to {@link ToolConfirmationMode.ALWAYS_ALLOW} for
     * the upcoming agent invocation. If the tool is already on `ALWAYS_ALLOW` (per user choice
     * or a session override), this is a no-op. Otherwise the user is asked once; on accept the
     * preference is persisted so subsequent runs do not show the dialog again.
     *
     * Returns `true` when the run should proceed.
     */
    protected async ensureToolAllowed(): Promise<boolean> {
        // No `chatId` is meaningful here because the runner owns a private, throw-away model;
        // pass an empty string so the manager falls through to the persisted preference.
        const mode = this.confirmationManager.getConfirmationMode(GET_GIT_CHANGES_FUNCTION_ID, '');
        if (mode === ToolConfirmationMode.ALWAYS_ALLOW) {
            return true;
        }
        const allow = nls.localizeByDefault('Allow');
        const cancel = nls.localizeByDefault('Cancel');
        const message = mode === ToolConfirmationMode.DISABLED
            ? nls.localize(
                'theia/ai-ide/commit-message/allow-tool-prompt-disabled',
                'The `{0}` tool is currently disabled. Allow it from now on to generate a commit message?',
                GET_GIT_CHANGES_FUNCTION_ID
            )
            : nls.localize(
                'theia/ai-ide/commit-message/allow-tool-prompt-confirm',
                'Generating a commit message requires the `{0}` tool. Allow it from now on?',
                GET_GIT_CHANGES_FUNCTION_ID
            );
        const choice = await this.messageService.warn(message, allow, cancel);
        if (choice !== allow) {
            return false;
        }
        await this.confirmationManager.setConfirmationMode(
            GET_GIT_CHANGES_FUNCTION_ID,
            ToolConfirmationMode.ALWAYS_ALLOW
        );
        return true;
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

    protected async invokeAndAwaitCompletion(request: MutableChatRequestModel): Promise<void> {
        const completion = new Promise<void>(resolve => {
            if (this.isResponseFinished(request)) {
                resolve();
                return;
            }
            const listener = request.response.onDidChange(() => {
                if (this.isResponseFinished(request)) {
                    listener.dispose();
                    resolve();
                }
            });
        });
        await Promise.all([
            this.commitMessageAgent.invoke(request).catch(error => {
                this.logger.error('Commit message agent threw', error);
                if (!request.response.isComplete && !request.response.isCanceled && !request.response.isError) {
                    request.response.error(error instanceof Error ? error : new Error(String(error)));
                }
            }),
            completion
        ]);
    }

    protected isResponseFinished(request: MutableChatRequestModel): boolean {
        const response = request.response;
        return response.isComplete || response.isCanceled || response.isError;
    }
}
