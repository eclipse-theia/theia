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
import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandRegistry } from '@theia/core';
import { CommonCommands } from '@theia/core/lib/browser';
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering';
import { OPEN_AI_CONFIG_VIEW } from './ai-configuration/ai-configuration-view-contribution';

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

    /**
     * @deprecated not needed by this class anymore
     */
    @inject(CommandRegistry)
    protected commandRegistry: CommandRegistry;

    @inject(MarkdownRenderer)
    protected readonly markdownRenderer: MarkdownRenderer;

    renderWelcomeMessage(): React.ReactNode {
        const welcomeMessage = nls.localize('theia/ai/ide/chatWelcomeMessage', `
# Ask the Theia IDE AI

To talk to a specialized agent, simply start your message with *@* followed by the agent's name: *@{0}*, *@{1}*, *@{2}*, and more.

Attach context: use variables, like *#{3}*, *#{4}* (current file), *#{5}* or click {6}.

Lean more in the [documentation](https://theia-ide.org/docs/user_ai/#chat).
`, 'Coder', 'Architect', 'Universal', 'file', '_f', 'selectedText', '<span class="codicon codicon-add"></span>');
        const welcomeMessageRendered = this.markdownRenderer.render(new MarkdownStringImpl(welcomeMessage, { supportHtml: true }));
        return <div className={'theia-WelcomeMessage'}>
            <TheiaIdeAiLogo width={200} height={200} className="theia-WelcomeMessage-Logo" />
            <div className="theia-WelcomeMessage-Content" ref={node => {
                node?.replaceChildren(welcomeMessageRendered.element);
            }} />
        </div>;
    }

    renderDisabledMessage(): React.ReactNode {
        const howToEnable = nls.localize('theia/ai/ide/chatDisabledMessage/howToEnable', `
To enable the AI features, please go to the AI features section of&nbsp;[the settings menu]({0})&nbsp;and
1. Toggle the switch for **Ai-features: Enable**.
2. Provide at least one LLM provider (e.g. OpenAI). See [the documentation](https://theia-ide.org/docs/user_ai/)&nbsp;for more information.

This will activate the AI capabilities in the app. Please remember, these features are **in a beta state**, so they may change and we are working on improving them 🚧.\\
Please support us by [providing feedback](https://github.com/eclipse-theia/theia)!
`, `command:${CommonCommands.OPEN_PREFERENCES.id}?ai-features`);
        const howToEnableRendered = this.markdownRenderer.render(new MarkdownStringImpl(howToEnable, { isTrusted: { enabledCommands: [CommonCommands.OPEN_PREFERENCES.id] } }));

        const openAiHistory = 'aiHistory:open';
        const features = nls.localize('theia/ai/ide/chatDisabledMessage/features', `
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
`, `command:${openAiHistory}`, `command:${OPEN_AI_CONFIG_VIEW.id}`);
        const featuresRendered = this.markdownRenderer.render(new MarkdownStringImpl(features, { isTrusted: { enabledCommands: [openAiHistory, OPEN_AI_CONFIG_VIEW.id] } }));

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
                    <div className="section-content" ref={node => {
                        node?.replaceChildren(howToEnableRendered.element);
                    }} />

                    <div className="section-title">
                        <p>{nls.localize('theia/ai/ide/chatDisabledMessage/featuresTitle', 'Currently Supported Views and Features:')}</p>
                    </div>
                    <div className="section-content" ref={node => {
                        node?.replaceChildren(featuresRendered.element);
                    }} />
                </div>
            </div>
        </div>;
    }

    /**
     * @deprecated not called by this class anymore
     */
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
