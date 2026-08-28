// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { ChatWelcomeMessageProvider } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import * as React from '@theia/core/shared/react';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { codicon, LocalizedMarkdown, MarkdownRenderer } from '@theia/core/lib/browser';
import { CommandRegistry, DisposableCollection, Emitter, Event, PreferenceScope } from '@theia/core';
import { FrontendLanguageModelRegistry } from '@theia/ai-core/lib/common';
import { PreferenceService } from '@theia/core/lib/common';
import { BYPASS_MODEL_REQUIREMENT_PREF, DEFAULT_CHAT_AGENT_PREF } from '@theia/ai-chat/lib/common/ai-chat-preferences';
import { WalkthroughService } from '@theia/getting-started/lib/browser/walkthrough-service';
import { OPEN_AI_CONFIG_VIEW } from './ai-configuration/ai-configuration-view-contribution';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';
import { AI_OPEN_GETTING_STARTED_WALKTHROUGH } from './ai-getting-started-contribution';
import { AI_GETTING_STARTED_WALKTHROUGH_ID } from './ai-getting-started-walkthrough';

const TheiaIdeAiLogo = ({ width = 120, height = 120, className = '' }) =>
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 100 100"
        width={width}
        height={height}
        className={className}
    >
        {/* Head: outline only */}
        <rect x="22" y="24" width="56" height="44" rx="16"
            fill="none" stroke="var(--theia-disabledForeground)" strokeWidth="2.5" />
        {/* Antenna */}
        <line x1="50" y1="24" x2="50" y2="16" stroke="var(--theia-disabledForeground)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="50" cy="13" r="3" fill="var(--theia-disabledForeground)" />
        {/* Ears: small strokes */}
        <line x1="17" y1="39" x2="17" y2="53" stroke="var(--theia-disabledForeground)" strokeWidth="3" strokeLinecap="round" />
        <line x1="83" y1="39" x2="83" y2="53" stroke="var(--theia-disabledForeground)" strokeWidth="3" strokeLinecap="round" />
        {/* Eyes: small dots */}
        <circle cx="39" cy="44" r="3.5" fill="var(--theia-disabledForeground)" />
        <circle cx="61" cy="44" r="3.5" fill="var(--theia-disabledForeground)" />
        {/* Mouth: subtle line */}
        <path d="M42 55 Q50 60 58 55" fill="none" stroke="var(--theia-disabledForeground)" strokeWidth="2" strokeLinecap="round" />
        {/* Chat dots */}
        <circle cx="38" cy="84" r="1.5" fill="var(--theia-disabledForeground)" opacity="0.35" />
        <circle cx="50" cy="84" r="2" fill="var(--theia-disabledForeground)" opacity="0.5" />
        <circle cx="62" cy="84" r="2.5" fill="var(--theia-disabledForeground)" opacity="0.65" />
    </svg>;

/**
 * The welcome message of the chat view.
 *
 * It only covers what has to be shown right here: the states that keep the chat from working (no language
 * model, AI turned off, workspace not trusted) and a one-line reminder of how to talk to the agents. Everything
 * that teaches the AI features lives in the "Get started with AI" walkthrough, which each state links to.
 */
@injectable()
export class IdeChatWelcomeMessageProvider implements ChatWelcomeMessageProvider {

    readonly priority = 100;

    @inject(MarkdownRenderer)
    protected readonly markdownRenderer: MarkdownRenderer;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(FrontendLanguageModelRegistry)
    protected languageModelRegistry: FrontendLanguageModelRegistry;

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    @inject(WalkthroughService)
    protected readonly walkthroughService: WalkthroughService;

    protected readonly toDispose = new DisposableCollection();
    protected _hasReadyModels = false;
    protected _modelRequirementBypassed = false;
    protected _hasDefaultAgent = false;
    protected modelConfig: { hasModels: boolean; errorMessages: string[] } | undefined;

    protected readonly onStateChangedEmitter = new Emitter<void>();

    get onStateChanged(): Event<void> {
        return this.onStateChangedEmitter.event;
    }

    @postConstruct()
    protected init(): void {
        this.checkLanguageModelStatus();
        this.toDispose.push(
            this.languageModelRegistry.onChange(() => {
                this.checkLanguageModelStatus();
            })
        );
        this.toDispose.push(
            this.preferenceService.onPreferenceChanged(e => {
                if (e.preferenceName === BYPASS_MODEL_REQUIREMENT_PREF) {
                    const effectiveValue = this.preferenceService.get<boolean>(BYPASS_MODEL_REQUIREMENT_PREF, false);
                    if (this._modelRequirementBypassed !== effectiveValue) {
                        this._modelRequirementBypassed = effectiveValue;
                        this.notifyStateChanged();
                    }
                } else if (e.preferenceName === DEFAULT_CHAT_AGENT_PREF) {
                    this.updateDefaultAgentState();
                }
            })
        );
        // The setup action disappears once the walkthrough is done.
        this.toDispose.push(
            this.walkthroughService.onDidChangeWalkthroughs(() => this.notifyStateChanged())
        );
        this.analyzeModelConfiguration().then(config => {
            this.modelConfig = config;
            this.notifyStateChanged();
        });
        this.preferenceService.ready.then(() => {
            this._modelRequirementBypassed = this.preferenceService.get(BYPASS_MODEL_REQUIREMENT_PREF, false);
            this.updateDefaultAgentState();
            this.notifyStateChanged();
        });
        // Listen to both canRun and activeStatus changes. They may change independent from each other.
        this.toDispose.push(
            this.activationService.onDidChangeCanRun(() => {
                this.notifyStateChanged();
            })
        );
        this.toDispose.push(
            this.activationService.onDidChangeActiveStatus(() => {
                this.notifyStateChanged();
            })
        );
    }

    protected updateDefaultAgentState(): void {
        const hasDefaultAgent = !!this.preferenceService.get<string>(DEFAULT_CHAT_AGENT_PREF, '');
        if (this._hasDefaultAgent !== hasDefaultAgent) {
            this._hasDefaultAgent = hasDefaultAgent;
            this.notifyStateChanged();
        }
    }

    protected async checkLanguageModelStatus(): Promise<void> {
        const models = await this.languageModelRegistry.getLanguageModels();
        this._hasReadyModels = models.some(model => model.status.status === 'ready');
        this.modelConfig = await this.analyzeModelConfiguration();
        this.notifyStateChanged();
    }

    protected async analyzeModelConfiguration(): Promise<{ hasModels: boolean; errorMessages: string[] }> {
        const models = await this.languageModelRegistry.getLanguageModels();
        const hasModels = models.length > 0;
        const unavailableModels = models.filter(model => model.status.status === 'unavailable');
        const errorMessages = unavailableModels
            .map(model => model.status.message)
            .filter((msg): msg is string => !!msg);
        const uniqueErrorMessages = [...new Set(errorMessages)];
        return { hasModels, errorMessages: uniqueErrorMessages };
    }

    protected notifyStateChanged(): void {
        this.onStateChangedEmitter.fire();
    }

    get hasReadyModels(): boolean {
        return this._hasReadyModels;
    }

    get modelRequirementBypassed(): boolean {
        return this._modelRequirementBypassed;
    }

    /**
     * Whether the getting started walkthrough still has something to offer. Once it is finished, the chat view
     * stops advertising it.
     */
    protected get hasPendingWalkthroughSteps(): boolean {
        const { completed, total } = this.walkthroughService.getStepProgress(AI_GETTING_STARTED_WALKTHROUGH_ID);
        return total > 0 && completed < total;
    }

    protected openWalkthrough = () => this.commandRegistry.executeCommand(AI_OPEN_GETTING_STARTED_WALKTHROUGH.id);

    protected openAiConfiguration = () => this.commandRegistry.executeCommand(OPEN_AI_CONFIG_VIEW.id);

    protected setModelRequirementBypassed(bypassed: boolean): void {
        this.preferenceService.set(BYPASS_MODEL_REQUIREMENT_PREF, bypassed, PreferenceScope.User);
    }

    dispose(): void {
        this.toDispose.dispose();
        this.onStateChangedEmitter.dispose();
    }

    renderWelcomeMessage(): React.ReactNode {
        if (!this._hasReadyModels && !this._modelRequirementBypassed) {
            return this.renderModelConfigurationScreen();
        }
        return this.renderWelcomeScreen();
    }

    protected renderWelcomeScreen(): React.ReactNode {
        return <div className={'theia-WelcomeMessage theia-WelcomeMessage-Compact'} key="normal-welcome">
            <TheiaIdeAiLogo className="theia-WelcomeMessage-Logo" width={64} height={64} />
            <LocalizedMarkdown
                localizationKey="theia/ai/ide/chatWelcomeMessageShort"
                defaultMarkdown={`
## Ask the {0} AI

Use *@agent* to call a specialized agent and *#* (or {1}) to attach context. [Learn more](https://theia-ide.org/docs/user_ai/#chat).
`}
                args={[
                    FrontendApplicationConfigProvider.get().applicationName,
                    '<span class="codicon codicon-attach"></span>'
                ]}
                markdownRenderer={this.markdownRenderer}
                className="theia-WelcomeMessage-Content"
                markdownOptions={{ supportHtml: true }}
            />
            {this.renderDefaultAgentAlert()}
            {this.renderWalkthroughAction()}
        </div>;
    }

    /**
     * Nothing answers a message that does not name an agent while no default agent is configured, so the chat
     * has to say so where the message is typed rather than leaving the first request to fail.
     */
    protected renderDefaultAgentAlert(): React.ReactNode {
        if (this._hasDefaultAgent) {
            return undefined;
        }
        return (
            <div className="theia-alert theia-info-alert theia-WelcomeMessage-Alert">
                <div className="theia-message-header">
                    <span className={codicon('info')}></span>
                    <span>{nls.localize('theia/ai/ide/noDefaultAgent/header', 'No default agent')}</span>
                </div>
                <div className="theia-message-content">
                    <LocalizedMarkdown
                        localizationKey="theia/ai/ide/noDefaultAgent"
                        defaultMarkdown={'Address an agent with *@AgentName*, or [choose the agent]({0}) that answers when you do not name one.'}
                        args={[`command:${OPEN_AI_CONFIG_VIEW.id}?${DEFAULT_CHAT_AGENT_PREF}`]}
                        markdownRenderer={this.markdownRenderer}
                        markdownOptions={{ isTrusted: { enabledCommands: [OPEN_AI_CONFIG_VIEW.id] } }}
                    />
                </div>
            </div>
        );
    }

    /**
     * The entry point into the walkthrough, shown while it is unfinished.
     */
    protected renderWalkthroughAction(): React.ReactNode {
        if (!this.hasPendingWalkthroughSteps) {
            return undefined;
        }
        return <div className="theia-WelcomeMessage-Actions">
            <button
                className="theia-button secondary"
                onClick={this.openWalkthrough}>
                {AI_OPEN_GETTING_STARTED_WALKTHROUGH.label}
            </button>
        </div>;
    }

    protected renderModelConfigurationScreen(): React.ReactNode {
        const config = this.modelConfig ?? { hasModels: false, errorMessages: [] };
        const { hasModels, errorMessages } = config;

        if (!hasModels) {
            return <div className={'theia-WelcomeMessage'} key="setup-state">
                <div className="theia-WelcomeMessage-ErrorIcon">⚠️</div>
                <LocalizedMarkdown
                    localizationKey="theia/ai/ide/noLanguageModelProviders"
                    defaultMarkdown={`
## No Language Model Providers Available

No language model provider packages are installed in this IDE.

This typically happens in custom IDE distributions where Theia AI language model packages have been omitted.

**To resolve this:**

- Install one or more language model provider packages (e.g., '@theia/ai-openai', '@theia/ai-anthropic', '@theia/ai-ollama')
- Or use agents that don't require Theia Language Models (e.g., Claude Code)
                `}
                    markdownRenderer={this.markdownRenderer}
                    className="theia-WelcomeMessage-Content"
                />
                <div className="theia-WelcomeMessage-Actions">
                    <button
                        className="theia-button main"
                        onClick={() => this.setModelRequirementBypassed(true)}>
                        {nls.localize('theia/ai/ide/continueAnyway', 'Continue Anyway')}
                    </button>
                </div>
                <small className="theia-WelcomeMessage-Hint">
                    {nls.localize('theia/ai/ide/bypassHint', 'Some agents like Claude Code don\'t require Theia Language Models')}
                </small>
            </div>;
        }

        return <div className={'theia-WelcomeMessage theia-WelcomeMessage-Main'} key="setup-state">
            <TheiaIdeAiLogo className="theia-WelcomeMessage-Logo" />
            <LocalizedMarkdown
                key="configure-provider-hasmodels"
                localizationKey="theia/ai/ide/configureProvider"
                defaultMarkdown={`
## Configure a Language Model

Set up an API key for a provider like OpenAI, Anthropic or GoogleAI, or connect a local one such as Ollama.

New here? [Get started with AI]({0}) walks you through the setup.
`}
                args={[`command:${AI_OPEN_GETTING_STARTED_WALKTHROUGH.id}`]}
                markdownRenderer={this.markdownRenderer}
                className="theia-WelcomeMessage-Content"
                markdownOptions={{
                    supportHtml: true,
                    isTrusted: { enabledCommands: [AI_OPEN_GETTING_STARTED_WALKTHROUGH.id] }
                }}
            />
            {errorMessages.length > 0 && (
                <div className="theia-alert theia-warning-alert theia-WelcomeMessage-Alert">
                    <div className="theia-message-header">
                        <span className={codicon('warning')}></span>
                        <span>{nls.localize('theia/ai/ide/configurationState', 'Configuration issues')}</span>
                    </div>
                    <div className="theia-message-content">
                        <ul className="theia-WelcomeMessage-IssuesList">
                            {errorMessages.map((msg, idx) => <li key={idx}>{msg}</li>)}
                        </ul>
                    </div>
                </div>
            )}
            <div className="theia-WelcomeMessage-Actions">
                <button
                    className="theia-button main"
                    onClick={this.openAiConfiguration}>
                    {nls.localize('theia/ai/ide/openAiConfiguration', 'Open AI Configuration')}
                </button>
                <button
                    className="theia-button secondary"
                    onClick={() => this.setModelRequirementBypassed(true)}>
                    {nls.localize('theia/ai/ide/continueAnyway', 'Continue Anyway')}
                </button>
            </div>
        </div>;
    }

    renderDisabledMessage(): React.ReactNode {
        if (this.activationService.isActive && !this.activationService.canRun) {
            return this.renderTrustRestrictedMessage();
        }
        return this.renderPreferenceDisabledMessage();
    }

    protected renderTrustRestrictedMessage(): React.ReactNode {
        return <div className={'theia-WelcomeMessage theia-WelcomeMessage-Main theia-WelcomeMessage-Disabled'} key="trust-restricted-message">
            <TheiaIdeAiLogo className="theia-WelcomeMessage-Logo" />
            <div className="theia-WelcomeMessage-Content">
                <h2>{nls.localize('theia/ai/ide/chatRestrictedMessage/title', 'AI Features are Restricted')}</h2>
            </div>
            <div className="theia-alert theia-warning-alert theia-WelcomeMessage-Alert">
                <div className="theia-message-header">
                    <span className={codicon('shield')}></span>
                    <span>{nls.localizeByDefault('Restricted Mode')}</span>
                </div>
                <div className="theia-message-content">
                    <LocalizedMarkdown
                        localizationKey="theia/ai/ide/chatRestrictedMessage/explanation"
                        defaultMarkdown={'AI features are disabled because this workspace is not trusted. '
                            + 'Grant trust to enable AI chat, inline suggestions, code actions, and prompt templates.'}
                        markdownRenderer={this.markdownRenderer}
                    />
                </div>
            </div>
            <div className="theia-WelcomeMessage-Actions">
                <button
                    className="theia-button main"
                    onClick={() => this.commandRegistry.executeCommand(WorkspaceCommands.MANAGE_WORKSPACE_TRUST.id)}>
                    {nls.localizeByDefault('Manage Workspace Trust')}
                </button>
            </div>
        </div>;
    }

    protected renderPreferenceDisabledMessage(): React.ReactNode {
        return <div className={'theia-WelcomeMessage theia-WelcomeMessage-Main theia-WelcomeMessage-Disabled'} key="disabled-message">
            <TheiaIdeAiLogo className="theia-WelcomeMessage-Logo" />
            <div className="theia-WelcomeMessage-Content">
                <h2>{nls.localize('theia/ai/ide/chatDisabledMessage/title', 'AI Features are Disabled')}</h2>
            </div>
            <div className="theia-alert theia-info-alert theia-WelcomeMessage-Alert">
                <div className="theia-message-header">
                    <span className={codicon('lightbulb')}></span>
                    <span>{nls.localize('theia/ai/ide/howToGetStarted', 'How to get started')}</span>
                </div>
                <div className="theia-message-content">
                    <LocalizedMarkdown
                        localizationKey="theia/ai/ide/chatDisabledMessage/steps"
                        defaultMarkdown={'Turn the AI features on, connect a language model and pick an agent. '
                            + '[Get started with AI]({0}) takes you through it step by step.'}
                        args={[`command:${AI_OPEN_GETTING_STARTED_WALKTHROUGH.id}`]}
                        markdownRenderer={this.markdownRenderer}
                        markdownOptions={{ isTrusted: { enabledCommands: [AI_OPEN_GETTING_STARTED_WALKTHROUGH.id] } }}
                    />
                </div>
            </div>
            <div className="theia-WelcomeMessage-Actions">
                <button
                    className="theia-button main"
                    onClick={this.openAiConfiguration}>
                    {nls.localize('theia/ai/ide/openAiConfiguration', 'Open AI Configuration')}
                </button>
                <button
                    className="theia-button secondary"
                    onClick={this.openWalkthrough}>
                    {AI_OPEN_GETTING_STARTED_WALKTHROUGH.label}
                </button>
            </div>
        </div>;
    }
}
