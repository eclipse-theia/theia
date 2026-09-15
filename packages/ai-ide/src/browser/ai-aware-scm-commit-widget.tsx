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

import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { CommandService, ILogger, nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { AgentService } from '@theia/ai-core/lib/common';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { ScmCommitWidget } from '@theia/scm/lib/browser/scm-commit-widget';
import { ScmInput } from '@theia/scm/lib/browser/scm-input';
import { ScmProvider } from '@theia/scm/lib/browser/scm-provider';
import { COMMIT_MESSAGE_AGENT_ID } from './commit-message-agent';
import { CommitMessageCommands } from './commit-message-commands';
import { CommitMessageRunner } from './commit-message-runner';

/**
 * Source-control provider id of the VS Code / Theia git extension. The generator runs
 * `git diff --cached`, so it is git-specific by construction and the overlay is only offered
 * for that provider rather than for any provider that happens to expose a matching group.
 */
const GIT_PROVIDER_ID = 'git';

/** Resource group the git extension uses for staged resources. */
const STAGED_GROUP_ID = 'index';

/**
 * Extends the standard SCM commit-message widget with an overlay icon that generates a commit
 * message from the staged changes. Bound via a DI rebind of {@link ScmCommitWidget} so the SCM
 * view picks up the AI-aware version transparently.
 */
@injectable()
export class AiAwareScmCommitWidget extends ScmCommitWidget {

    @inject(CommandService)
    protected readonly commandService: CommandService;

    @inject(CommitMessageRunner)
    protected readonly commitMessageRunner: CommitMessageRunner;

    @inject(AgentService)
    protected readonly agentService: AgentService;

    @inject(AIActivationService)
    protected readonly aiActivationService: AIActivationService;

    @inject(ILogger) @named('ai-ide:AiAwareScmCommitWidget')
    protected readonly logger: ILogger;

    @postConstruct()
    protected initAiOverlay(): void {
        this.toDispose.push(this.commitMessageRunner.onDidChange(() => this.update()));
        this.toDispose.push(this.agentService.onDidChangeAgents(() => this.update()));
        this.toDispose.push(this.aiActivationService.onDidChangeActiveStatus(() => this.update()));
        // `canRun` carries conditions beyond `isActive` (e.g. workspace trust) and is what the
        // command's `isEnabled` is gated on, so the button's enabled state has to follow it.
        this.toDispose.push(this.aiActivationService.onDidChangeCanRun(() => this.update()));
    }

    protected override renderInput(input: ScmInput): React.ReactNode {
        const baseInput = super.renderInput(input);
        // The wrapper adds padding to make room for the button, so it must only be rendered when
        // a button is actually rendered into it. Users with AI off keep the stock SCM input.
        if (!this.shouldRenderAiButton(input)) {
            return baseInput;
        }
        return <div className='theia-ai-commit-message-input-wrapper'>
            {baseInput}
            {this.renderAiOverlay(input)}
        </div>;
    }

    protected shouldRenderAiButton(input: ScmInput): boolean {
        if (!input.visible || !this.aiActivationService.isActive) {
            return false;
        }
        // Without staged changes `git diff --cached` is empty, so the button would have nothing to
        // work with. A running generation keeps it rendered so it stays cancellable even if the
        // user unstages everything mid-run.
        return this.commitMessageRunner.isRunning() || this.hasStagedChanges(this.scmService.selectedRepository?.provider);
    }

    protected renderAiOverlay(input: ScmInput): React.ReactNode {
        const running = this.commitMessageRunner.isRunning();
        const agentEnabled = this.agentService.isEnabled(COMMIT_MESSAGE_AGENT_ID);
        // Mirrors `CommitMessageCommandContribution.isEnabled` as wrapped by
        // `AICommandHandlerFactory`; a divergence would render an enabled button whose click ends
        // in a `NO_ACTIVE_HANDLER` error. Cancelling is always allowed, so that the spinner keeps
        // working while the git extension has the input disabled during a commit.
        const disabled = !running && (!this.aiActivationService.canRun || !agentEnabled || !input.enabled);

        let title: string;
        if (running) {
            title = nls.localize('theia/ai-ide/commit-message/cancel-tooltip', 'Cancel commit-message generation');
        } else if (!agentEnabled) {
            title = nls.localize(
                'theia/ai-ide/commit-message/agent-disabled-tooltip',
                'The Commit Message agent is disabled. Enable it in the AI Configuration view.'
            );
        } else {
            title = nls.localize(
                'theia/ai-ide/commit-message/staged-tooltip',
                'Generate commit message from staged changes'
            );
        }
        const iconClass = running ? `${codicon('loading')} codicon-modifier-spin` : codicon('sparkle');

        return <div className='theia-ai-commit-message-overlay'>
            <button
                className='theia-ai-commit-message-icon'
                type='button'
                title={title}
                aria-label={title}
                disabled={disabled}
                onClick={this.onAiButtonClick}>
                <span className={iconClass} />
            </button>
        </div>;
    }

    protected onAiButtonClick = () => {
        // Cancelling never goes through the command: its `isEnabled` requires an enabled commit
        // input and a runnable AI, either of which may have flipped off since the run started.
        if (this.commitMessageRunner.isRunning()) {
            this.commitMessageRunner.cancel();
            return;
        }
        this.commandService.executeCommand(CommitMessageCommands.GENERATE_FROM_STAGED.id).catch(error =>
            this.logger.error('Failed to execute AI commit-message command', error)
        );
    };

    protected hasStagedChanges(provider: ScmProvider | undefined): boolean {
        if (provider?.id !== GIT_PROVIDER_ID) {
            return false;
        }
        const staged = provider.groups.find(group => group.id === STAGED_GROUP_ID);
        return !!staged && staged.resources.length > 0;
    }
}
