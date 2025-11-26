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

import { ChatWelcomeMessageProvider, isEnterKey } from '@theia/ai-chat-ui/lib/browser/chat-tree-view';
import * as React from '@theia/core/shared/react';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CommandRegistry, DisposableCollection, Emitter, Event, PreferenceScope } from '@theia/core';
import { CommonCommands } from '@theia/core/lib/browser';
import { FrontendLanguageModelRegistry } from '@theia/ai-core/lib/common';
import { PreferenceService } from '@theia/core/lib/common';
import { DEFAULT_CHAT_AGENT_PREF, BYPASS_MODEL_REQUIREMENT_PREF } from '@theia/ai-chat/lib/common/ai-chat-preferences';
import { ChatAgentRecommendationService, ChatAgentService } from '@theia/ai-chat/lib/common';

const TheiaIdeAiLogo = ({ width = 200, height = 200, className = '' }) =>
    <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 200 200"
        width={width}
        height={height}
        className={className}
    >
        <rect x="55" y="45" width="90" height="85" rx="30" fill="var(--theia-disabledForeground)" />

        <line x1="100" y1="45" x2="100" y2="30" stroke="var(--theia-foreground)" strokeWidth="4" />
        <circle cx="100" cy="25" r="6" fill="var(--theia-foreground)" />

        <rect x="40" y="75" width="15" height="30" rx="5" fill="var(--theia-foreground)" />
        <rect x="145" y="75" width="15" height="30" rx="5" fill="var(--theia-foreground)" />

        <circle cx="80" cy="80" r="10" fill="var(--theia-editor-background)" />
        <circle cx="120" cy="80" r="10" fill="var(--theia-editor-background)" />

        <path d="M85 105 Q100 120 115 105" fill="none" stroke="var(--theia-editor-background)" strokeWidth="4" strokeLinecap="round" />

        <rect x="55" y="135" width="90" height="30" rx="5" fill="var(--theia-foreground)" />

        <rect x="60" y="140" width="10" height="8" rx="2" fill="var(--theia-editor-background)" />
        <rect x="75" y="140" width="10" height="8" rx="2" fill="var(--theia-editor-background)" />
        <rect x="90" y="140" width="10" height="8" rx="2" fill="var(--theia-editor-background)" />
        <rect x="105" y="140" width="10" height="8" rx="2" fill="var(--theia-editor-background)" />
        <rect x="120" y="140" width="10" height="8" rx="2" fill="var(--theia-editor-background)" />

        <rect x="65" y="152" width="50" height="8" rx="2" fill="var(--theia-editor-background)" />
        <rect x="120" y="152" width="10" height="8" rx="2" fill="var(--theia-editor-background)" />
    </svg>;

@injectable()
export class IdeChatWelcomeMessageProvider implements ChatWelcomeMessageProvider {

    @inject(CommandRegistry)
    protected commandRegistry: CommandRegistry;

    @inject(FrontendLanguageModelRegistry)
    protected languageModelRegistry: FrontendLanguageModelRegistry;

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(ChatAgentRecommendationService)
    protected recommendationService: ChatAgentRecommendationService;

    @inject(ChatAgentService)
    protected chatAgentService: ChatAgentService;

    protected readonly toDispose = new DisposableCollection();
    protected _hasReadyModels = false;
    protected _modelRequirementBypassed = false;
    protected _defaultAgent = '';

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
                if (e.preferenceName === DEFAULT_CHAT_AGENT_PREF) {
                    const effectiveValue = this.preferenceService.get<string>(DEFAULT_CHAT_AGENT_PREF, '');
                    if (this._defaultAgent !== effectiveValue) {
                        this._defaultAgent = effectiveValue;
                        this.notifyStateChanged();
                    }
                } else if (e.preferenceName === BYPASS_MODEL_REQUIREMENT_PREF) {
                    const effectiveValue = this.preferenceService.get<boolean>(BYPASS_MODEL_REQUIREMENT_PREF, false);
                    if (this._modelRequirementBypassed !== effectiveValue) {
                        this._modelRequirementBypassed = effectiveValue;
                        this.notifyStateChanged();
                    }
                }
            })
        );
        this.preferenceService.ready.then(() => {
            const defaultAgentValue = this.preferenceService.get(DEFAULT_CHAT_AGENT_PREF, '');
            const bypassValue = this.preferenceService.get(BYPASS_MODEL_REQUIREMENT_PREF, false);
            this._defaultAgent = defaultAgentValue;
            this._modelRequirementBypassed = bypassValue;
            this.notifyStateChanged();
        });
    }

    protected async checkLanguageModelStatus(): Promise<void> {
        const models = await this.languageModelRegistry.getLanguageModels();
        this._hasReadyModels = models.some(model => model.status.status === 'ready');
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

    get defaultAgent(): string {
        return this._defaultAgent;
    }

    protected setModelRequirementBypassed(bypassed: boolean): void {
        this.preferenceService.set(BYPASS_MODEL_REQUIREMENT_PREF, bypassed, PreferenceScope.User);
    }

    dispose(): void {
        this.toDispose.dispose();
        this.onStateChangedEmitter.dispose();
    }

    renderWelcomeMessage?(): React.ReactNode {
        if (!this._hasReadyModels && !this._modelRequirementBypassed) {
            return this.renderErrorState();
        }
        if (!this._defaultAgent) {
            return this.renderAgentSelectionPrompt();
        }
        return this.renderNormalWelcome();
    }

    protected renderNormalWelcome(): React.ReactNode {
        return <div className={'theia-WelcomeMessage'}>
            <TheiaIdeAiLogo width={200} height={200} className="theia-WelcomeMessage-Logo" />
            <div className="theia-WelcomeMessage-Content">
                <h1>Ask the Theia IDE AI</h1>
                <p>
                    To talk to a specialized agent, simply start your message with <em>@</em> followed by the agent's name:{' '}
                    <em>@Coder</em>, <em>@Architect</em>, <em>@Universal</em>, and more.
                </p>
                <p>
                    Attach context:  use variables, like <em>#file</em>, <em>#_f</em> (current file), <em>#selectedText</em>{' '}
                    or click <span className="codicon codicon-add" />.
                </p>
                <p>
                    Lean more in the <a target='_blank' href="https://theia-ide.org/docs/user_ai/#chat">documentation</a>.
                </p>
            </div>
        </div>;
    }

    protected renderErrorState(): React.ReactNode {
        const ErrorContent = () => {
            const [config, setConfig] = React.useState<{ hasModels: boolean; errorMessages: string[] }>(
                { hasModels: false, errorMessages: [] }
            );

            React.useEffect(() => {
                this.analyzeModelConfiguration().then(setConfig);
            }, []);

            const { hasModels, errorMessages } = config;

            let title: string;
            let message: React.ReactNode;
            let guidance: React.ReactNode;

            if (!hasModels) {
                title = nls.localize('theia/ai/chat-ui/welcome/noModelsTitle', 'No Language Models Configured');
                message = nls.localize('theia/ai/chat-ui/welcome/noModelsMessage',
                    'To use AI Chat, you need to configure at least one Language Model.');
                guidance = <>
                    <p><strong>{nls.localize('theia/ai/chat-ui/welcome/howToConfigure', 'How to configure:')}</strong></p>
                    <ul className="theia-WelcomeMessage-GuidanceList">
                        <li>
                            <strong>{nls.localize('theia/ai/chat-ui/welcome/apiKeyModels', 'API Key-based models:')}</strong>{' '}
                            {nls.localize('theia/ai/chat-ui/welcome/apiKeyModelsDesc',
                                'Add an API key for ChatGPT (OpenAI), Claude (Anthropic), Gemini (Google), or other providers')}
                        </li>
                        <li>
                            <strong>{nls.localize('theia/ai/chat-ui/welcome/customServer', 'Custom server:')}</strong>{' '}
                            {nls.localize('theia/ai/chat-ui/welcome/customServerDesc',
                                'Configure Ollama host + models, LlamaFile, or other compatible servers')}
                        </li>
                    </ul>
                </>;
            } else {
                title = nls.localize('theia/ai/chat-ui/welcome/modelsUnavailableTitle', 'Language Models Not Configured');
                message = nls.localize('theia/ai/chat-ui/welcome/modelsUnavailableMessage',
                    'Language Models are available but need to be configured before use.');
                guidance = <>
                    {errorMessages.length > 0 && (
                        <>
                            <p><strong>{nls.localize('theia/ai/chat-ui/welcome/issues', 'Issues detected:')}</strong></p>
                            <ul className="theia-WelcomeMessage-IssuesList">
                                {errorMessages.map((msg, idx) => <li key={idx}>{msg}</li>)}
                            </ul>
                        </>
                    )}
                    <p><strong>{nls.localize('theia/ai/chat-ui/welcome/commonFixes', 'Common fixes:')}</strong></p>
                    <ul className="theia-WelcomeMessage-GuidanceList">
                        <li>{nls.localize('theia/ai/chat-ui/welcome/checkApiKey', 'Check that your API key is valid and not expired')}</li>
                        <li>{nls.localize('theia/ai/chat-ui/welcome/checkServer', 'Verify that custom servers (Ollama, LlamaFile) are running')}</li>
                        <li>{nls.localize('theia/ai/chat-ui/welcome/checkNetwork', 'Check your network connection and firewall settings')}</li>
                    </ul>
                </>;
            }

            return <div className="theia-WelcomeMessage-Content">
                <div className="theia-WelcomeMessage-ErrorIcon">⚠️</div>
                <h2>{title}</h2>
                <p>{message}</p>
                {guidance}
                <div className="theia-WelcomeMessage-Actions">
                    <button
                        className="theia-button main"
                        onClick={() => this.commandRegistry.executeCommand(CommonCommands.OPEN_PREFERENCES.id, 'ai-features')}>
                        {nls.localize('theia/ai/chat-ui/welcome/openSettings', 'Open AI Settings')}
                    </button>
                    <button
                        className="theia-button secondary"
                        onClick={() => this.setModelRequirementBypassed(true)}>
                        {nls.localize('theia/ai/chat-ui/welcome/continueAnyway', 'Continue Anyway')}
                    </button>
                </div>
                <small className="theia-WelcomeMessage-Hint">
                    {nls.localize('theia/ai/chat-ui/welcome/bypassHint',
                        'Some agents like Claude Code don\'t require Theia Language Models')}
                </small>
            </div>;
        };

        return <div className={'theia-WelcomeMessage theia-WelcomeMessage-Error'}>
            <ErrorContent />
        </div>;
    }

    protected renderAgentSelectionPrompt(): React.ReactNode {
        const recommendedAgents = this.recommendationService.getRecommendedAgents()
            .filter(agent => this.chatAgentService.getAgent(agent.id) !== undefined);

        return <div className={'theia-WelcomeMessage theia-WelcomeMessage-AgentSelection'}>
            <TheiaIdeAiLogo width={200} height={200} className="theia-WelcomeMessage-Logo" />
            <div className="theia-WelcomeMessage-Content">
                <h2>{nls.localize('theia/ai/chat-ui/welcome/selectAgentTitle', 'Select a Default Chat Agent')}</h2>
                <p>{nls.localize('theia/ai/chat-ui/welcome/selectAgentMessage', 'Choose the agent to use by default. You can always override this by mentioning @AgentName in your message.')}</p>
                {recommendedAgents.length > 0 && (
                    <p className="theia-WelcomeMessage-RecommendedNote">
                        {nls.localize('theia/ai/chat-ui/welcome/recommendedAgentsNote', 'Recommended agents:')}
                    </p>
                )}
                {recommendedAgents.length > 0 ? (
                    <>
                        <div className="theia-WelcomeMessage-AgentButtons">
                            {recommendedAgents.map(agent => (
                                <button
                                    key={agent.id}
                                    className="theia-WelcomeMessage-AgentButton"
                                    onClick={() => this.setDefaultAgent(agent.id)}
                                    title={agent.description}>
                                    <span className="theia-WelcomeMessage-AgentButton-Icon">@</span>
                                    <span className="theia-WelcomeMessage-AgentButton-Label">{agent.label}</span>
                                </button>
                            ))}
                        </div>
                        <div className="theia-WelcomeMessage-AlternativeOptions">
                            <p className="theia-WelcomeMessage-OrDivider">
                                {nls.localize('theia/ai/chat-ui/welcome/or', 'or')}
                            </p>
                        </div>
                    </>
                ) : (
                    <div className="theia-WelcomeMessage-NoRecommendedAgents">
                        <p>{nls.localize('theia/ai/chat-ui/welcome/noRecommendedAgents',
                            'No recommended agents are available.')}</p>
                    </div>
                )}
                <div>
                    {recommendedAgents.length > 0 && (
                        <div className="theia-WelcomeMessage-Option">
                            {nls.localize('theia/ai/chat-ui/welcome/moreAgents',
                                'More agents are available. Use @AgentName to try others or configure a different default in')}{' '}
                            {this.renderLinkButton(
                                nls.localize('theia/ai/chat-ui/welcome/preferences', 'preferences'),
                                CommonCommands.OPEN_PREFERENCES.id,
                                'ai-features.chat'
                            )}
                        </div>
                    )}
                    {recommendedAgents.length === 0 && (
                        <div className="theia-WelcomeMessage-Option">
                            {nls.localize('theia/ai/chat-ui/welcome/manualConfig',
                                'Configure a default agent in')}{' '}
                            {this.renderLinkButton(
                                nls.localize('theia/ai/chat-ui/welcome/preferences', 'preferences'),
                                CommonCommands.OPEN_PREFERENCES.id,
                                'ai-features.chat'
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>;
    }

    protected setDefaultAgent(agentId: string): void {
        this.preferenceService.set(DEFAULT_CHAT_AGENT_PREF, agentId, PreferenceScope.User);
    }

    renderDisabledMessage?(): React.ReactNode {
        return <div className={'theia-ResponseNode'}>
            <div className='theia-ResponseNode-Content' key={'disabled-message'}>
                <div className="disable-message">
                    <span className="section-header">{
                        nls.localize('theia/ai/chat-ui/chat-view-tree-widget/aiFeatureHeader', '🚀 AI Features Available (Beta Version)!')}
                    </span>
                    <div className="section-title">
                        <p><code>{nls.localize('theia/ai/chat-ui/chat-view-tree-widget/featuresDisabled', 'Currently, all AI Features are disabled!')}</code></p>
                    </div>
                    <div className="section-title">
                        <p>{nls.localize('theia/ai/chat-ui/chat-view-tree-widget/howToEnable', 'How to Enable the AI Features:')}</p>
                    </div>
                    <div className="section-content">
                        <p>To enable the AI features, please go to the AI features section of the&nbsp;
                            {this.renderLinkButton(nls.localize('theia/ai/chat-ui/chat-view-tree-widget/settingsMenu', 'the settings menu'),
                                CommonCommands.OPEN_PREFERENCES.id, 'ai-features')}&nbsp;and
                        </p>
                        <ol>
                            <li>Toggle the switch for <strong>{nls.localize('theia/ai/chat-ui/chat-view-tree-widget/aiFeaturesEnable', 'Ai-features: Enable')}</strong>.</li>
                            <li>Provide at least one LLM provider (e.g. OpenAI). See <a href="https://theia-ide.org/docs/user_ai/" target="_blank">the documentation</a>
                                &nbsp;for more information.</li>
                        </ol>
                        <p>This will activate the AI capabilities in the app. Please remember, these features are <strong>in a beta state</strong>,
                            so they may change and we are working on improving them 🚧.<br></br>
                            Please support us by <a href="https://github.com/eclipse-theia/theia">providing feedback
                            </a>!</p>
                    </div>

                    <div className="section-title">
                        <p>Currently Supported Views and Features:</p>
                    </div>
                    <div className="section-content">
                        <p>Once the AI features are enabled, you can access the following views and features:</p>
                        <ul>
                            <li>Code Completion</li>
                            <li>Terminal Assistance (via CTRL+I in a terminal)</li>
                            <li>This Chat View (features the following agents):
                                <ul>
                                    <li>Universal Chat Agent</li>
                                    <li>Coder Chat Agent</li>
                                    <li>Architect Chat Agent</li>
                                    <li>Command Chat Agent</li>
                                    <li>Orchestrator Chat Agent</li>
                                </ul>
                            </li>
                            <li>{this.renderLinkButton(nls.localize('theia/ai/chat-ui/chat-view-tree-widget/aiHistoryView', 'AI History View'), 'aiHistory:open')}</li>
                            <li>{this.renderLinkButton(
                                nls.localize('theia/ai/chat-ui/chat-view-tree-widget/aiConfigurationView', 'AI Configuration View'), 'aiConfiguration:open')}
                            </li>
                        </ul>
                        <p>See <a href="https://theia-ide.org/docs/user_ai/" target="_blank">the documentation</a> for more information.</p>
                    </div>
                </div>
            </div>
        </div >;
    }

    protected renderLinkButton(title: string, openCommandId: string, ...commandArgs: unknown[]): React.ReactNode {
        return <a
            role={'button'}
            tabIndex={0}
            onClick={() => this.commandRegistry.executeCommand(openCommandId, ...commandArgs)}
            onKeyDown={e => isEnterKey(e) && this.commandRegistry.executeCommand(openCommandId)}>
            {title}
        </a>;
    }

}
