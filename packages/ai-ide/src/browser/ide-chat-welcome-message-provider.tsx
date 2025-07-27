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

    renderWelcomeMessage?(): React.ReactNode {
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
