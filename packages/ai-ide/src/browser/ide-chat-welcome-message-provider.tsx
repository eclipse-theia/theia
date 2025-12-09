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
import { CommonCommands, LocalizedMarkdown, MarkdownRenderer } from '@theia/core/lib/browser';
import { AlertMessage } from '@theia/core/lib/browser/widgets/alert-message';
import { OPEN_AI_CONFIG_VIEW } from './ai-configuration/ai-configuration-view-contribution';
import { CommandRegistry, DisposableCollection, Emitter, Event, PreferenceScope } from '@theia/core';
import { AgentService, FrontendLanguageModelRegistry } from '@theia/ai-core/lib/common';
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

    @inject(MarkdownRenderer)
    protected readonly markdownRenderer: MarkdownRenderer;

    @inject(CommandRegistry)
    protected readonly commandRegistry: CommandRegistry;

    @inject(FrontendLanguageModelRegistry)
    protected languageModelRegistry: FrontendLanguageModelRegistry;

    @inject(PreferenceService)
    protected preferenceService: PreferenceService;

    @inject(ChatAgentRecommendationService)
    protected recommendationService: ChatAgentRecommendationService;

    @inject(ChatAgentService)
    protected chatAgentService: ChatAgentService;

    @inject(AgentService)
    protected agentService: AgentService;

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
        this.toDispose.push(
            this.agentService.onDidChangeAgents(() => {
                this.notifyStateChanged();
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

    protected setDefaultAgent(agentId: string): void {
        this.preferenceService.set(DEFAULT_CHAT_AGENT_PREF, agentId, PreferenceScope.User);
    }

    dispose(): void {
        this.toDispose.dispose();
        this.onStateChangedEmitter.dispose();
    }

    renderWelcomeMessage(): React.ReactNode {
        if (!this._hasReadyModels && !this._modelRequirementBypassed) {
            return this.renderModelConfigurationScreen();
        }
        if (!this._defaultAgent) {
            return this.renderAgentSelectionScreen();
        }
        return this.renderWelcomeScreen();
    }

    protected renderWelcomeScreen(): React.ReactNode {
        return <div className={'theia-WelcomeMessage'} key="normal-welcome">
            <TheiaIdeAiLogo width={200} height={200} className="theia-WelcomeMessage-Logo" />
            <LocalizedMarkdown
                localizationKey="theia/ai/ide/chatWelcomeMessage"
                defaultMarkdown={`
# Ask the Theia IDE AI

To talk to a specialized agent, simply start your message with *@* followed by the agent's name: *@{0}*, *@{1}*, *@{2}*, and more.

Attach context: use variables, like *#{3}*, *#{4}* (current file), *#{5}* or click {6}.

Lean more in the [documentation](https://theia-ide.org/docs/user_ai/#chat).
`}
                args={['Coder', 'Architect', 'Universal', 'file', '_f', 'selectedText', '<span class="codicon codicon-add"></span>']}
                markdownRenderer={this.markdownRenderer}
                className="theia-WelcomeMessage-Content"
                markdownOptions={{ supportHtml: true }}
            />
        </div>;
    }

    protected renderModelConfigurationScreen(): React.ReactNode {
        const ErrorContent = () => {
            const [config, setConfig] = React.useState<{ hasModels: boolean; errorMessages: string[] }>(
                { hasModels: false, errorMessages: [] }
            );

            React.useEffect(() => {
                this.analyzeModelConfiguration().then(setConfig);
            }, []);

            const { hasModels, errorMessages } = config;

            if (!hasModels) {
                return <>
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
                </>;
            }

            return <>
                <TheiaIdeAiLogo width={150} height={150} className="theia-WelcomeMessage-Logo" />
                <LocalizedMarkdown
                    key="configure-provider-hasmodels"
                    localizationKey="theia/ai/ide/configureProvider"
                    defaultMarkdown={`
# Please configure at least one language model provider

If you want to use [OpenAI]({0}), [Anthropic]({1}) or [GoogleAI]({2}) hosted models, please enter an API key in the settings.

If you want to use another provider such as Ollama, please configure it in the settings and adapt agents or a model alias to use your custom model.

**Note:** Some agents, such as Claude Code do not need a provider to be configured, just continue in this case.

See the [documentation](https://theia-ide.org/docs/user_ai/) for more details.
                `}
                    args={[
                        `command:${CommonCommands.OPEN_PREFERENCES.id}?ai-features.languageModels.openai`,
                        `command:${CommonCommands.OPEN_PREFERENCES.id}?ai-features.languageModels.anthropic`,
                        `command:${CommonCommands.OPEN_PREFERENCES.id}?ai-features.languageModels.googleai`
                    ]}
                    markdownRenderer={this.markdownRenderer}
                    className="theia-WelcomeMessage-Content"
                    markdownOptions={{
                        supportHtml: true,
                        isTrusted: { enabledCommands: [CommonCommands.OPEN_PREFERENCES.id] }
                    }}
                />
                {errorMessages.length > 0 && (
                    <>
                        <LocalizedMarkdown
                            key="configuration-state"
                            localizationKey="theia/ai/ide/configurationState"
                            defaultMarkdown="# Current Configuration State"
                            markdownRenderer={this.markdownRenderer}
                            className="theia-WelcomeMessage-Content"
                        />
                        <div className="theia-WelcomeMessage-Content">
                            <ul className="theia-WelcomeMessage-IssuesList">
                                {errorMessages.map((msg, idx) => <li key={idx}>{msg}</li>)}
                            </ul>
                        </div>
                    </>
                )}
                <div className="theia-WelcomeMessage-Actions">
                    <button
                        className="theia-button main"
                        onClick={() => this.commandRegistry.executeCommand(CommonCommands.OPEN_PREFERENCES.id, 'ai-features')}>
                        {nls.localize('theia/ai/ide/openSettings', 'Open AI Settings')}
                    </button>
                    <button
                        className="theia-button secondary"
                        onClick={() => this.setModelRequirementBypassed(true)}>
                        {nls.localize('theia/ai/ide/continueAnyway', 'Continue Anyway')}
                    </button>
                </div>
                <small className="theia-WelcomeMessage-Hint">
                    {nls.localize('theia/ai/ide/bypassHint', 'Some agents like Claude Code don\'t require Theia Language Models')}
                </small>
            </>;
        };

        return <div className={'theia-WelcomeMessage'} key="setup-state">
            <ErrorContent />
        </div>;
    }

    protected renderAgentSelectionScreen(): React.ReactNode {
        const recommendedAgents = this.recommendationService.getRecommendedAgents()
            .filter(agent => this.chatAgentService.getAgent(agent.id) !== undefined);

        return <div className={'theia-WelcomeMessage theia-WelcomeMessage-AgentSelection'} key="agent-selection">
            <TheiaIdeAiLogo width={200} height={200} className="theia-WelcomeMessage-Logo" />
            <LocalizedMarkdown
                localizationKey="theia/ai/ide/selectDefaultAgent"
                defaultMarkdown={`
## Select a Default Chat Agent

Choose the agent to use by default. You can always override this by mentioning @AgentName in your message.
`}
                markdownRenderer={this.markdownRenderer}
                className="theia-WelcomeMessage-Content"
            />
            {recommendedAgents.length > 0 && (
                <p className="theia-WelcomeMessage-RecommendedNote">
                    {nls.localize('theia/ai/ide/recommendedAgents', 'Recommended agents:')}
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
                            {nls.localize('theia/ai/ide/or', 'or')}
                        </p>
                    </div>
                </>
            ) : (
                <AlertMessage
                    type='WARNING'
                    header={nls.localize('theia/ai/ide/noRecommendedAgents', 'No recommended agents are available.')}
                />
            )}
            <AlertMessage
                type='INFO'
                header={recommendedAgents.length > 0
                    ? nls.localize('theia/ai/ide/moreAgentsAvailable/header', 'More agents are available')
                    : nls.localize('theia/ai/ide/configureAgent/header', 'Configure a default agent')}>
                <LocalizedMarkdown
                    localizationKey="theia/ai/ide/moreAgentsAvailable"
                    defaultMarkdown='Use @AgentName to try others or configure a different default in [preferences]({0}).'
                    args={[`command:${CommonCommands.OPEN_PREFERENCES.id}?ai-features.chat`]}
                    markdownRenderer={this.markdownRenderer}
                    markdownOptions={{ isTrusted: { enabledCommands: [CommonCommands.OPEN_PREFERENCES.id] } }}
                />
            </AlertMessage>
        </div>;
    }

    renderDisabledMessage(): React.ReactNode {
        const openAiHistory = 'aiHistory:open';

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
                    <LocalizedMarkdown
                        localizationKey="theia/ai/ide/chatDisabledMessage/howToEnable"
                        defaultMarkdown={`
To enable the AI features, please go to the AI features section of&nbsp;[the settings menu]({0})&nbsp;and
1. Toggle the switch for **Ai-features: Enable**.
2. Provide at least one LLM provider (e.g. OpenAI). See [the documentation](https://theia-ide.org/docs/user_ai/)&nbsp;for more information.

This will activate the AI capabilities in the app. Please remember, these features are **in a beta state**, so they may change and we are working on improving them 🚧.\\
Please support us by [providing feedback](https://github.com/eclipse-theia/theia)!
`}
                        args={[`command:${CommonCommands.OPEN_PREFERENCES.id}?ai-features`]}
                        markdownRenderer={this.markdownRenderer}
                        className="section-content"
                        markdownOptions={{ isTrusted: { enabledCommands: [CommonCommands.OPEN_PREFERENCES.id] } }}
                    />

                    <div className="section-title">
                        <p>{nls.localize('theia/ai/ide/chatDisabledMessage/featuresTitle', 'Currently Supported Views and Features:')}</p>
                    </div>
                    <LocalizedMarkdown
                        localizationKey="theia/ai/ide/chatDisabledMessage/features"
                        defaultMarkdown={`
Once the AI features are enabled, you can access the following views and features:
- Code Completion
- Terminal Assistance (via CTRL+I in a terminal)
- This Chat View (features the following agents):
  * Universal Chat Agent
  * Coder Chat Agent
  * Architect Chat Agent
  * Command Chat Agent
  * Orchestrator Chat Agent
- [AI History View]({0})
- [AI Configuration View]({1})

See [the documentation](https://theia-ide.org/docs/user_ai/) for more information.
`}
                        args={[`command:${openAiHistory}`, `command:${OPEN_AI_CONFIG_VIEW.id}`]}
                        markdownRenderer={this.markdownRenderer}
                        className="section-content"
                        markdownOptions={{ isTrusted: { enabledCommands: [openAiHistory, OPEN_AI_CONFIG_VIEW.id] } }}
                    />
                </div>
            </div>
        </div>;
    }
}
