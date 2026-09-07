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
 * Group id used by the VS Code / Theia git extension for staged resources.
 * TODO: replace with a generic capability on `ScmProvider` (e.g. `groups[i].kind`) so
 * non-git providers with staging support also get a working button.
 */
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
    }

    protected override renderInput(input: ScmInput): React.ReactNode {
        const baseInput = super.renderInput(input);
        // When AI features are globally disabled the widget falls back to the stock SCM input,
        // so users who never want AI features see no wrapper div, no padding, and no button.
        if (!input.visible || !this.aiActivationService.isActive) {
            return baseInput;
        }
        return <div className='theia-ai-commit-message-input-wrapper'>
            {baseInput}
            {this.renderAiOverlay(input)}
        </div>;
    }

    protected renderAiOverlay(input: ScmInput): React.ReactNode {
        // Without staged changes `git diff --cached` is empty, so the button would have nothing
        // to work with.
        if (!this.hasStagedChanges(this.scmService.selectedRepository?.provider)) {
            return undefined;
        }
        const agentEnabled = this.agentService.isEnabled(COMMIT_MESSAGE_AGENT_ID);
        const running = this.commitMessageRunner.isRunning();
        const disabled = (!agentEnabled || !input.enabled) && !running;

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
        this.commandService.executeCommand(CommitMessageCommands.GENERATE_FROM_STAGED.id).catch(error =>
            this.logger.error('Failed to execute AI commit-message command', error)
        );
    };

    protected hasStagedChanges(provider: ScmProvider | undefined): boolean {
        if (!provider) {
            return false;
        }
        const staged = provider.groups.find(group => group.id === STAGED_GROUP_ID);
        return !!staged && staged.resources.length > 0;
    }
}
