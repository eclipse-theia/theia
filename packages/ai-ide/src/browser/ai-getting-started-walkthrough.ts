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

import { AI_CHAT_TOGGLE_COMMAND_ID } from '@theia/ai-chat-ui/lib/browser/ai-chat-ui-contribution';
import { ChatAgentRecommendationService } from '@theia/ai-chat/lib/common';
import { DEFAULT_CHAT_AGENT_PREF } from '@theia/ai-chat/lib/common/ai-chat-preferences';
import { ENABLE_AI_CONTEXT_KEY } from '@theia/ai-core/lib/browser/ai-activation-service';
import { AiConfigurationCategoryId } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { PerspectiveServiceImpl } from '@theia/core/lib/browser/perspective-service';
import { nls } from '@theia/core/lib/common/nls';
import { WalkthroughProvider } from '@theia/getting-started/lib/common/walkthrough-provider';
import { WalkthroughDefinition, WalkthroughStepDefinition } from '@theia/getting-started/lib/common/walkthrough-types';
import { inject, injectable } from '@theia/core/shared/inversify';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';
import { AI_SET_DEFAULT_CHAT_AGENT } from './ai-getting-started-commands';
import { OPEN_AI_CONFIG_VIEW, OPEN_AI_CONFIG_VIEW_TOOLS } from './ai-configuration/ai-configuration-view-contribution';
import {
    AI_CHAT_USED_CONTEXT_KEY,
    AI_DEFAULT_AGENT_CONTEXT_KEY,
    AI_MODEL_READY_CONTEXT_KEY,
    AI_TOOL_CONFIRMATION_CONFIGURED_CONTEXT_KEY
} from './ai-walkthrough-context-keys';

/**
 * Id of the walkthrough that guides a new user through setting up and using the AI features.
 * Also the argument of the `walkthrough.open` command.
 */
export const AI_GETTING_STARTED_WALKTHROUGH_ID = 'ai-features.getting-started';

const AI_DOC_URL = 'https://theia-ide.org/docs/user_ai/';
const THEIA_AI_DOC_URL = 'https://theia-ide.org/docs/theia_ai/';
const FEEDBACK_URL = 'https://github.com/eclipse-theia/theia/issues/new/choose';

/**
 * Contributes the "Get started with AI" walkthrough to the welcome page: the single, progress-tracked path
 * from disabled AI features to a first answer in the chat.
 */
@injectable()
export class AiGettingStartedWalkthroughProvider implements WalkthroughProvider {

    @inject(ChatAgentRecommendationService)
    protected readonly recommendationService: ChatAgentRecommendationService;

    protected walkthrough: WalkthroughDefinition | undefined;

    getWalkthroughs(): WalkthroughDefinition[] {
        // Built on demand rather than in the field initializer, so that the localization is in place.
        this.walkthrough ??= this.createWalkthrough();
        return [this.walkthrough];
    }

    protected get applicationName(): string {
        return FrontendApplicationConfigProvider.get().applicationName;
    }

    /** Deep-links into the AI Configuration view, which takes a category id or an `ai-features.*` preference id. */
    protected aiConfiguration(target?: string): string {
        return `command:${OPEN_AI_CONFIG_VIEW.id}${target ? `?${target}` : ''}`;
    }

    protected createWalkthrough(): WalkthroughDefinition {
        return {
            id: AI_GETTING_STARTED_WALKTHROUGH_ID,
            icon: 'sparkle',
            title: nls.localize('theia/ai/ide/walkthrough/title', 'Get started with AI'),
            description: nls.localize('theia/ai/ide/walkthrough/description', 'Set up the AI features of {0} and learn how to work with them.', this.applicationName),
            steps: [
                this.createAiSupportStep(),
                this.createEnableStep(),
                this.createModelStep(),
                this.createAgentStep(),
                this.createFirstQuestionStep(),
                this.createToolConfirmationStep(),
                this.createGoFurtherStep()
            ]
        };
    }

    /**
     * The opening slide, carrying what the welcome page used to announce in its AI banner: what the features
     * are, that they are opt-in and may incur costs, and the invitation to the community behind them.
     */
    protected createAiSupportStep(): WalkthroughStepDefinition {
        return {
            id: 'ai-support',
            title: nls.localize('theia/ai/ide/walkthrough/aiSupport/title', 'AI support in {0}', this.applicationName),
            description: nls.localize('theia/ai/ide/walkthrough/aiSupport/description', `
{0} comes with AI support: chat with specialized agents about your project, let them change code and run tasks, complete code as you type and get help in the terminal.

These features are disabled by default, so that you can opt in at your own discretion.

Once enabled, they may generate continuous requests to the language models you provide access to. This might incur costs that you need to monitor closely.

[Read the documentation]({1}).

We welcome your feedback, contributions and sponsorship! Visit the [GitHub project]({2}) to support the ongoing development. Thank you for being part of our community!

All of this is built on Theia AI, the framework for AI-powered tools and IDEs, published as a stable release. [Read the framework documentation]({3}).
`, this.applicationName, AI_DOC_URL, FEEDBACK_URL, THEIA_AI_DOC_URL).trim(),
            // Reading it is done once the user acts on it, either by following a link or by turning the features on.
            completionEvents: [`onContext:${ENABLE_AI_CONTEXT_KEY}`, `onLink:${AI_DOC_URL}`]
        };
    }

    protected createEnableStep(): WalkthroughStepDefinition {
        return {
            id: 'enable-ai',
            title: nls.localize('theia/ai/ide/walkthrough/enableAi/title', 'Turn on the AI features'),
            description: nls.localize('theia/ai/ide/walkthrough/enableAi/description', `
Nothing is sent anywhere until you switch the AI features on, and you can switch them off again at any time.

[Open the AI Configuration]({0}) and enable them there.
`, this.aiConfiguration(ENABLE_AI_CONTEXT_KEY)).trim(),
            completionEvents: [`onContext:${ENABLE_AI_CONTEXT_KEY}`]
        };
    }

    protected createModelStep(): WalkthroughStepDefinition {
        return {
            id: 'connect-model',
            title: nls.localize('theia/ai/ide/walkthrough/connectModel/title', 'Connect a language model'),
            description: nls.localize('theia/ai/ide/walkthrough/connectModel/description', `
Add an API key for a hosted provider:

- [OpenAI]({0})
- [Anthropic]({1})
- [Google]({2})

Prefer to stay local or use another service? Ollama, llamafile and any OpenAI-compatible endpoint can be set up in the [Models]({3}) page.

Some agents bring their own model, for example Claude Code, and work without a provider.
`, this.aiConfiguration('ai-features.openAiOfficial.openAiApiKey'),
                this.aiConfiguration('ai-features.anthropic.AnthropicApiKey'),
                this.aiConfiguration('ai-features.google.apiKey'),
                this.aiConfiguration(AiConfigurationCategoryId.MODELS)).trim(),
            completionEvents: [`onContext:${AI_MODEL_READY_CONTEXT_KEY}`]
        };
    }

    protected createAgentStep(): WalkthroughStepDefinition {
        const intro = nls.localize('theia/ai/ide/walkthrough/chooseAgent/intro', `
Every chat request goes to an agent, and one of them answers whenever you do not name one yourself.

**Set your default agent:**
`).trim();
        const outro = nls.localize('theia/ai/ide/walkthrough/chooseAgent/outro', `
You can also [choose the default agent]({0}) in the settings, and address another one for a single message by starting it with *@AgentName*.
The [Agents]({1}) page lists them all.
`, this.aiConfiguration(DEFAULT_CHAT_AGENT_PREF), this.aiConfiguration(AiConfigurationCategoryId.AGENTS)).trim();
        return {
            id: 'choose-agent',
            title: nls.localize('theia/ai/ide/walkthrough/chooseAgent/title', 'Choose your default agent'),
            description: [intro, this.renderAgentChoices(), outro].filter(part => !!part).join('\n\n'),
            completionEvents: [`onContext:${AI_DEFAULT_AGENT_CONTEXT_KEY}`]
        };
    }

    /**
     * One action per recommended agent, each setting it as the default right away.
     *
     * Every link stands alone in its paragraph, which is what the welcome page renders as a button, so this
     * reads like the buttons the chat welcome used to offer. Products customize the list through
     * {@link ChatAgentRecommendationService}.
     */
    protected renderAgentChoices(): string {
        return this.recommendationService.getRecommendedAgents()
            .map(agent => {
                const command = `command:${AI_SET_DEFAULT_CHAT_AGENT.id}?${encodeURIComponent(JSON.stringify(agent.id))}`;
                // Carried as the link title, so what the agent is good at stays available as a tooltip.
                const title = agent.description ? ` "${agent.description.replace(/"/g, '')}"` : '';
                return `[@${agent.label}](${command}${title})`;
            })
            .join('\n\n');
    }

    protected createFirstQuestionStep(): WalkthroughStepDefinition {
        return {
            id: 'first-question',
            title: nls.localize('theia/ai/ide/walkthrough/firstQuestion/title', 'Ask your first question'),
            description: nls.localize('theia/ai/ide/walkthrough/firstQuestion/description', `
[Open the AI Chat]({0}) and ask something about your project.

Two things make the answers a lot better:

- *@AgentName* picks the agent for this message, for example *@Coder*.
- *#* attaches context, for example *#file* or *#selectedText*. The paperclip button next to the input does the same.

The chat remembers your sessions, so you can pick a conversation up later.
`, `command:${AI_CHAT_TOGGLE_COMMAND_ID}`).trim(),
            completionEvents: [`onContext:${AI_CHAT_USED_CONTEXT_KEY}`]
        };
    }

    protected createToolConfirmationStep(): WalkthroughStepDefinition {
        return {
            id: 'tool-confirmation',
            title: nls.localize('theia/ai/ide/walkthrough/toolConfirmation/title', 'Stay in control of what agents do'),
            description: nls.localize('theia/ai/ide/walkthrough/toolConfirmation/description', `
Agents act on your workspace through tools: they read files, run terminal commands or edit code.

Every tool call asks for your confirmation first. In the [Tools]({0}) page you can change that default or pre-approve the tools you trust.

AI features stay off entirely while a workspace is not trusted. [Manage workspace trust]({1}) to decide per project.
`, `command:${OPEN_AI_CONFIG_VIEW_TOOLS.id}`, `command:${WorkspaceCommands.MANAGE_WORKSPACE_TRUST.id}`).trim(),
            completionEvents: [
                `onContext:${AI_TOOL_CONFIRMATION_CONFIGURED_CONTEXT_KEY}`,
                `onLink:command:${OPEN_AI_CONFIG_VIEW_TOOLS.id}`
            ]
        };
    }

    protected createGoFurtherStep(): WalkthroughStepDefinition {
        return {
            id: 'go-further',
            title: nls.localize('theia/ai/ide/walkthrough/goFurther/title', 'Go further'),
            description: nls.localize('theia/ai/ide/walkthrough/goFurther/description', `
The chat is only the beginning. AI also completes code as you type and assists in the terminal with *Ctrl+I*.

- [Prompts and skills]({0}): read and adapt the instructions the agents work with.
- [MCP servers]({1}): add tools beyond the ones {3} ships with.
- [Token usage]({2}): see what your requests consume.
- [Switch Perspective]({5}) (experimental): the *AI First* layout moves the chat into the main area, with the explorer and source control on the right.

The AI History view, where available, shows what was actually sent to the model.

There is more in [the documentation]({4}) - and your feedback is always welcome.
`, this.aiConfiguration(AiConfigurationCategoryId.PROMPTS_AND_SKILLS),
                this.aiConfiguration(AiConfigurationCategoryId.MCP_SERVERS),
                this.aiConfiguration(AiConfigurationCategoryId.TOKEN_USAGE),
                this.applicationName,
                AI_DOC_URL,
                `command:${PerspectiveServiceImpl.SWITCH_PERSPECTIVE_COMMAND.id}`).trim()
        };
    }
}
