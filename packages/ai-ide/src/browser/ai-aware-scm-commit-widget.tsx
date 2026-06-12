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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { CommandService, ILogger, nls } from '@theia/core';
import { codicon } from '@theia/core/lib/browser';
import { AgentService } from '@theia/ai-core/lib/common';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { ScmCommitWidget } from '@theia/scm/lib/browser/scm-commit-widget';
import { ScmInput } from '@theia/scm/lib/browser/scm-input';
import { ScmProvider } from '@theia/scm/lib/browser/scm-provider';
import { COMMIT_MESSAGE_AGENT_ID } from './commit-message-agent';
import { CommitMessageCommands, CommitMessageScope } from './commit-message-commands';
import { CommitMessageRunner } from './commit-message-runner';

/**
 * Group id used by the VS Code / Theia git extension for staged resources.
 * TODO: replace with a generic capability on `ScmProvider` (e.g. `groups[i].kind`) so
 * non-git providers with staging support also get a working "staged" button.
 */
const STAGED_GROUP_ID = 'index';

/**
 * Extends the standard SCM commit-message widget with two overlay icons that trigger
 * AI-driven commit-message generation — one for staged changes only, one for all current
 * changes. Bound via a DI rebind of {@link ScmCommitWidget} so the SCM view picks up the
 * AI-aware version transparently.
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

    @inject(ILogger)
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
        // so users who never want AI features see no wrapper div, no padding, and no buttons.
        if (!input.visible || !this.aiActivationService.isActive) {
            return baseInput;
        }
        return <div className='theia-ai-commit-message-input-wrapper'>
            {baseInput}
            {this.renderAiOverlay(input)}
        </div>;
    }

    protected renderAiOverlay(input: ScmInput): React.ReactNode {
        const provider = this.scmService.selectedRepository?.provider;
        const showStaged = this.hasStagedChanges(provider);
        const showAll = this.hasAnyChanges(provider);
        if (!showStaged && !showAll) {
            return undefined;
        }
        const agentEnabled = this.agentService.isEnabled(COMMIT_MESSAGE_AGENT_ID);
        const buttonsDisabled = !agentEnabled || !input.enabled;
        const disabledReason = !agentEnabled
            ? nls.localize(
                'theia/ai-ide/commit-message/agent-disabled-tooltip',
                'The Commit Message agent is disabled. Enable it in the AI Configuration view.'
            )
            : undefined;
        return <div className='theia-ai-commit-message-overlay'>
            {showStaged && this.renderAiButton('staged', 'sparkle', buttonsDisabled, disabledReason,
                nls.localize(
                    'theia/ai-ide/commit-message/staged-tooltip',
                    'Generate commit message from staged changes'
                ))}
            {showAll && this.renderAiButton('all', 'sparkle-filled', buttonsDisabled, disabledReason,
                nls.localize(
                    'theia/ai-ide/commit-message/all-tooltip',
                    'Generate commit message from all current changes'
                ))}
        </div>;
    }

    protected renderAiButton(
        scope: CommitMessageScope,
        baseIcon: string,
        disabled: boolean,
        disabledReason: string | undefined,
        defaultTitle: string
    ): React.ReactNode {
        const running = this.commitMessageRunner.isRunning(scope);
        // While any scope is running, the other scope's button must be disabled so the two
        // generations cannot race on `repository.input.value`. The running button itself stays
        // interactive so the user can cancel.
        const otherScope: CommitMessageScope = scope === 'staged' ? 'all' : 'staged';
        const otherRunning = this.commitMessageRunner.isRunning(otherScope);
        const iconClass = running
            ? `${codicon('loading')} codicon-modifier-spin`
            : codicon(baseIcon);
        let title: string;
        if (running) {
            title = nls.localize('theia/ai-ide/commit-message/cancel-tooltip', 'Cancel commit-message generation');
        } else if (otherRunning) {
            title = nls.localize(
                'theia/ai-ide/commit-message/other-running-tooltip',
                'Another commit-message generation is in progress.'
            );
        } else if (disabled && disabledReason) {
            title = disabledReason;
        } else {
            title = defaultTitle;
        }
        const buttonDisabled = (disabled || otherRunning) && !running;
        return <button
            key={scope}
            className='theia-ai-commit-message-icon'
            type='button'
            title={title}
            aria-label={title}
            disabled={buttonDisabled}
            onClick={() => this.onAiButtonClick(scope)}>
            <span className={iconClass} />
        </button>;
    }

    protected onAiButtonClick(scope: CommitMessageScope): void {
        const commandId = scope === 'staged'
            ? CommitMessageCommands.GENERATE_FROM_STAGED.id
            : CommitMessageCommands.GENERATE_FROM_ALL.id;
        this.commandService.executeCommand(commandId).catch(error =>
            this.logger.error('Failed to execute AI commit-message command', error)
        );
    }

    protected hasStagedChanges(provider: ScmProvider | undefined): boolean {
        if (!provider) {
            return false;
        }
        const staged = provider.groups.find(group => group.id === STAGED_GROUP_ID);
        return !!staged && staged.resources.length > 0;
    }

    protected hasAnyChanges(provider: ScmProvider | undefined): boolean {
        if (!provider) {
            return false;
        }
        return provider.groups.some(group => group.resources.length > 0);
    }
}
