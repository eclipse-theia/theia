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
import { codicon, CommonCommands, LocalizedMarkdown, MarkdownRenderer } from '@theia/core/lib/browser';
import { CommandRegistry, DisposableCollection, Emitter, Event, PreferenceScope } from '@theia/core';
import { AgentService, FrontendLanguageModelRegistry } from '@theia/ai-core/lib/common';
import { PreferenceService } from '@theia/core/lib/common';
import { DEFAULT_CHAT_AGENT_PREF, BYPASS_MODEL_REQUIREMENT_PREF, PERSISTED_SESSION_LIMIT_PREF, SESSION_STORAGE_PREF } from '@theia/ai-chat/lib/common/ai-chat-preferences';
import { ChatAgentRecommendationService, ChatAgentService, ChatService } from '@theia/ai-chat/lib/common';
import { ToolConfirmationManager } from '@theia/ai-chat/lib/browser/chat-tool-preference-bindings';
import { DEFAULT_TOOL_CONFIRMATION_PREFERENCE, TOOL_CONFIRMATION_PREFERENCE, ToolConfirmationMode } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { OPEN_AI_CONFIG_VIEW, OPEN_AI_CONFIG_VIEW_TOOLS } from './ai-configuration/ai-configuration-view-contribution';
import { AIActivationService } from '@theia/ai-core/lib/browser';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';

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

    @inject(ChatAgentRecommendationService)
    protected recommendationService: ChatAgentRecommendationService;

    @inject(ChatAgentService)
    protected chatAgentService: ChatAgentService;

    @inject(AgentService)
    protected agentService: AgentService;

    @inject(ToolConfirmationManager)
    protected readonly toolConfirmationManager: ToolConfirmationManager;

    @inject(AIActivationService)
    protected readonly activationService: AIActivationService;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    protected readonly toDispose = new DisposableCollection();
    protected _hasReadyModels = false;
    protected _modelRequirementBypassed = false;
    protected _defaultAgent = '';
    protected modelConfig: { hasModels: boolean; errorMessages: string[] } | undefined;
    /** True once the user has any chat (active or persisted). Drives the compact "has-chats" welcome variant. */
    protected hasAnyChat = false;

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
                    const effectiveValue = this.preferenceService.get(DEFAULT_CHAT_AGENT_PREF, '');
                    if (this._defaultAgent !== effectiveValue) {
                        this._defaultAgent = effectiveValue;
                        this.notifyStateChanged();
                    }
                } else if (e.preferenceName === BYPASS_MODEL_REQUIREMENT_PREF) {
                    const effectiveValue = this.preferenceService.get(BYPASS_MODEL_REQUIREMENT_PREF, false);
                    if (this._modelRequirementBypassed !== effectiveValue) {
                        this._modelRequirementBypassed = effectiveValue;
                        this.notifyStateChanged();
                    }
                } else if (e.preferenceName === DEFAULT_TOOL_CONFIRMATION_PREFERENCE || e.preferenceName === TOOL_CONFIRMATION_PREFERENCE) {
                    // Re-render so the tool-confirmation explainer is hidden once the user configures confirmation behavior.
                    this.notifyStateChanged();
                } else if (e.preferenceName === SESSION_STORAGE_PREF || e.preferenceName === PERSISTED_SESSION_LIMIT_PREF) {
                    this.refreshHasAnyChat();
                }
            })
        );
        this.toDispose.push(
            this.chatService.onSessionEvent(() => this.refreshHasAnyChat())
        );
        this.refreshHasAnyChat();
        this.toDispose.push(
            this.agentService.onDidChangeAgents(() => {
                this.notifyStateChanged();
            })
        );
        this.analyzeModelConfiguration().then(config => {
            this.modelConfig = config;
            this.notifyStateChanged();
        });
        this.preferenceService.ready.then(() => {
            const defaultAgentValue = this.preferenceService.get(DEFAULT_CHAT_AGENT_PREF, '');
            const bypassValue = this.preferenceService.get(BYPASS_MODEL_REQUIREMENT_PREF, false);
            this._defaultAgent = defaultAgentValue;
            this._modelRequirementBypassed = bypassValue;
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

    /**
     * Recomputes {@link hasAnyChat} (true when the user has any titled active session or any
     * persisted session on disk). Fires a state change when the flag flips so the welcome
     * variant updates between the rich onboarding (no chats yet) and the compact mode.
     */
    protected async refreshHasAnyChat(): Promise<void> {
        const hasTitledActive = this.chatService.getSessions().some(s => !!s.title);
        let hasPersisted = false;
        if (!hasTitledActive) {
            try {
                hasPersisted = await this.chatService.hasPersistedSessions();
            } catch {
                hasPersisted = false;
            }
        }
        const next = hasTitledActive || hasPersisted;
        if (this.hasAnyChat !== next) {
            this.hasAnyChat = next;
            this.notifyStateChanged();
        }
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

    /**
     * Whether to show the tool-confirmation explainer on the welcome screen.
     *
     * Only shown while the user is still in the default state, i.e. every tool call is confirmed and
     * no per-tool overrides exist. Once the user has changed the default mode (e.g. to always allow
     * or to disable tools) or pre-approved individual tools (including via bulk approval), they are
     * already aware of the mechanism, so the explainer is suppressed.
     */
    protected get shouldShowToolConfirmationInfo(): boolean {
        return this.toolConfirmationManager.getDefaultConfirmationMode() === ToolConfirmationMode.CONFIRM
            && Object.keys(this.toolConfirmationManager.getAllConfirmationSettings()).length === 0;
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
        if (this.hasAnyChat) {
            // Returning user: keep a slim banner (logo + heading + one-line tip) above the
            // sessions list so the chat view still has identity, but skip the verbose
            // multi-paragraph tutorial.
            return <div className={'theia-WelcomeMessage theia-WelcomeMessage-Compact'} key="normal-welcome-compact">
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
                {this.renderToolConfirmationAlert()}
            </div>;
        }
        // First-time user: original full-length onboarding with the larger logo and the
        // verbose agent/context paragraphs so the empty panel feels welcoming.
        return <div className={'theia-WelcomeMessage theia-WelcomeMessage-Main'} key="normal-welcome">
            <TheiaIdeAiLogo className="theia-WelcomeMessage-Logo" />
            <LocalizedMarkdown
                localizationKey="theia/ai/ide/chatWelcomeMessage"
                defaultMarkdown={`
## Ask the {7} AI

Use *@AgentName* to talk to a specialized agent, like *@{0}*, *@{1}*, or *@{2}*.

Attach context with *#{3}*, *#{4}*, *#{5}*, or click {6}. [Learn more](https://theia-ide.org/docs/user_ai/#chat).
`}
                args={['Coder', 'Architect', 'Universal', 'file', '_f', 'selectedText', '<span class="codicon codicon-attach"></span>',
                    FrontendApplicationConfigProvider.get().applicationName]}
                markdownRenderer={this.markdownRenderer}
                className="theia-WelcomeMessage-Content"
                markdownOptions={{ supportHtml: true }}
            />
            {this.renderToolConfirmationAlert()}
        </div>;
    }

    protected renderToolConfirmationAlert(): React.ReactNode {
        if (!this.shouldShowToolConfirmationInfo) {
            return undefined;
        }
        return (
            <div className="theia-alert theia-info-alert theia-WelcomeMessage-Alert">
                <div className="theia-message-header">
                    <span className={codicon('info')}></span>
                    <span>{nls.localize('theia/ai/ide/toolConfirmationInfo/header', 'Tool confirmation')}</span>
                </div>
                <div className="theia-message-content">
                    <LocalizedMarkdown
                        localizationKey="theia/ai/ide/toolConfirmationInfo"
                        defaultMarkdown={
                            'AI agents may want to use tools to act on your workspace. ' +
                            'By default each tool call needs your confirmation. ' +
                            'You can change this default or pre-approve individual tools in the [Tools configuration view]({0}).'
                        }
                        args={[`command:${OPEN_AI_CONFIG_VIEW_TOOLS.id}`]}
                        markdownRenderer={this.markdownRenderer}
                        markdownOptions={{ isTrusted: { enabledCommands: [OPEN_AI_CONFIG_VIEW_TOOLS.id] } }}
                    />
                </div>
            </div>
        );
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

Set up an API key for [OpenAI]({0}), [Anthropic]({1}), or [GoogleAI]({2}) or configure another provider like Ollama in the settings.

Some agents (e.g. Claude Code) work without a provider. [Learn more](https://theia-ide.org/docs/user_ai/).
`}
                args={[
                    `command:${CommonCommands.OPEN_PREFERENCES.id}?ai-features.openAiOfficial.openAiApiKey`,
                    `command:${CommonCommands.OPEN_PREFERENCES.id}?ai-features.anthropic.AnthropicApiKey`,
                    `command:${CommonCommands.OPEN_PREFERENCES.id}?ai-features.google.apiKey`
                ]}
                markdownRenderer={this.markdownRenderer}
                className="theia-WelcomeMessage-Content"
                markdownOptions={{
                    supportHtml: true,
                    isTrusted: { enabledCommands: [CommonCommands.OPEN_PREFERENCES.id] }
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
                    onClick={() => this.commandRegistry.executeCommand(CommonCommands.OPEN_PREFERENCES.id, 'ai-features')}>
                    {nls.localize('theia/ai/ide/openSettings', 'Open AI Settings')}
                </button>
                <button
                    className="theia-button secondary"
                    onClick={() => this.setModelRequirementBypassed(true)}>
                    {nls.localize('theia/ai/ide/continueAnyway', 'Continue Anyway')}
                </button>
            </div>
        </div>;
    }

    protected renderAgentSelectionScreen(): React.ReactNode {
        const recommendedAgents = this.recommendationService.getRecommendedAgents()
            .filter(agent => this.chatAgentService.getAgent(agent.id) !== undefined);

        return <div className={'theia-WelcomeMessage theia-WelcomeMessage-Main theia-WelcomeMessage-AgentSelection'} key="agent-selection">
            <TheiaIdeAiLogo className="theia-WelcomeMessage-Logo" />
            <LocalizedMarkdown
                localizationKey="theia/ai/ide/selectDefaultAgent"
                defaultMarkdown={`
## Select a Default Chat Agent

Choose the agent to use by default. You can always override this by mentioning *@AgentName* in your message.
`}
                markdownRenderer={this.markdownRenderer}
                className="theia-WelcomeMessage-Content"
            />
            {recommendedAgents.length > 0 ? (
                <div className="theia-WelcomeMessage-AgentButtons">
                    {recommendedAgents.map(agent => (
                        <button
                            key={agent.id}
                            className="theia-WelcomeMessage-AgentButton"
                            onClick={() => this.setDefaultAgent(agent.id)}
                            title={agent.description}>
                            <span className={`theia-WelcomeMessage-AgentButton-Icon ${codicon('mention')}`}></span>
                            <span className="theia-WelcomeMessage-AgentButton-Label">{agent.label}</span>
                        </button>
                    ))}
                </div>
            ) : (
                <p className="theia-WelcomeMessage-SubNote">
                    {nls.localize('theia/ai/ide/noRecommendedAgents', 'No recommended agents are available.')}
                </p>
            )}
            <div className="theia-alert theia-info-alert theia-WelcomeMessage-Alert">
                <div className="theia-message-header">
                    <span className={codicon('info')}></span>
                    <span>
                        {recommendedAgents.length > 0
                            ? nls.localize('theia/ai/ide/moreAgentsAvailable/header', 'More agents are available')
                            : nls.localize('theia/ai/ide/configureAgent/header', 'Configure a default agent')}
                    </span>
                </div>
                <div className="theia-message-content">
                    <LocalizedMarkdown
                        localizationKey="theia/ai/ide/moreAgentsAvailable"
                        defaultMarkdown='Use @AgentName to try others or configure a different default in [preferences]({0}).'
                        args={[`command:${CommonCommands.OPEN_PREFERENCES.id}?ai-features.chat.defaultChatAgent`]}
                        markdownRenderer={this.markdownRenderer}
                        markdownOptions={{ isTrusted: { enabledCommands: [CommonCommands.OPEN_PREFERENCES.id] } }}
                    />
                </div>
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
        const openAiHistory = 'aiHistory:open';

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
                        defaultMarkdown={`1. Enable AI features in the settings
2. Configure at least one LLM provider (e.g. OpenAI, Anthropic, GoogleAI or Ollama)
3. Start chatting with powerful AI agents`}
                        markdownRenderer={this.markdownRenderer}
                    />
                </div>
            </div>
            <div className="theia-WelcomeMessage-Actions">
                <button
                    className="theia-button main"
                    onClick={() => this.commandRegistry.executeCommand(CommonCommands.OPEN_PREFERENCES.id, 'ai-features')}>
                    {nls.localize('theia/ai/ide/openSettings', 'Open AI Settings')}
                </button>
            </div>
            <LocalizedMarkdown
                localizationKey="theia/ai/ide/chatDisabledMessage/features"
                defaultMarkdown={`This will activate the AI features in the app.

Please support us by [providing feedback](https://github.com/eclipse-theia/theia)!

Once the AI features are enabled, you can access the following views and features:
- Code Completion
- Terminal Assistance (via CTRL+I in a terminal)
- This Chat View - available agents include:
  - Coder Chat Agent
  - Architect Chat Agent
  - Universal Chat Agent
- [AI History View]({0})
- [AI Configuration View]({1})

See [the documentation](https://theia-ide.org/docs/user_ai/) for more information.`}
                args={[`command:${openAiHistory}`, `command:${OPEN_AI_CONFIG_VIEW.id}`]}
                markdownRenderer={this.markdownRenderer}
                className="theia-WelcomeMessage-Content"
                markdownOptions={{
                    isTrusted: { enabledCommands: [openAiHistory, OPEN_AI_CONFIG_VIEW.id] }
                }}
            />
        </div>;
    }
}
