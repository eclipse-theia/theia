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
import * as DOMPurify from '@theia/core/shared/dompurify';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable } from '@theia/core/shared/inversify';
import { CommandRegistry, URI } from '@theia/core';
import { OpenerService, open } from '@theia/core/lib/browser';

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

    @inject(OpenerService)
    protected readonly openerService: OpenerService;

    renderWelcomeMessage?(): React.ReactNode {
        return <div className={'theia-WelcomeMessage'}>
            <TheiaIdeAiLogo width={200} height={200} className="theia-WelcomeMessage-Logo" />
            <div className="theia-WelcomeMessage-Content" dangerouslySetInnerHTML={{ // eslint-disable-line react/no-danger
                __html: this.sanitize(nls.localize('theia/ai/ide/chatWelcomeMessage', `
                    <h1>Ask the Theia IDE AI</h1>
                    <p>
                        To talk to a specialized agent, simply start your message with <em>@</em> followed by the agent's name:
                        <em>@Coder</em>, <em>@Architect</em>, <em>@Universal</em>, and more.
                    </p>
                    <p>
                        Attach context: use variables, like <em>#file</em>, <em>#_f</em> (current file), <em>#selectedText</em>
                        or click <span class="codicon codicon-add"></span>.
                    </p>
                    <p>
                        Lean more in the <a target='_blank' href="https://theia-ide.org/docs/user_ai/#chat">documentation</a>.
                    </p>`
                ))
            }} onClick={this.onClick} onKeyDown={this.onKeyDown} />
        </div>;
    }

    renderDisabledMessage?(): React.ReactNode {
        return <div className={'theia-ResponseNode'}>
            <div className='theia-ResponseNode-Content' key={'disabled-message'} dangerouslySetInnerHTML={{ // eslint-disable-line react/no-danger
                __html: this.sanitize(nls.localize('theia/ai/ide/chatDisabledMessage', `
                    <div class="disable-message">
                        <span class="section-header">
                            🚀 AI Features Available (Beta Version)!
                        </span>
                        <div class="section-title">
                            <p><code>Currently, all AI Features are disabled!</code></p>
                        </div>
                        <div class="section-title">
                            <p>How to Enable the AI Features:</p>
                        </div>
                        <div class="section-content">
                            <p>
                                To enable the AI features, please go to the AI features section
                                of&nbsp;<a role="button" href="command:preferences:open?ai-features">the settings menu</a>&nbsp;and
                            </p>
                            <ol>
                                <li>Toggle the switch for <strong>Ai-features: Enable</strong>.</li>
                                <li>Provide at least one LLM provider (e.g. OpenAI).
                                    See <a href="https://theia-ide.org/docs/user_ai/" target="_blank">the documentation</a>&nbsp;for more information.</li>
                            </ol>
                            <p>
                                This will activate the AI capabilities in the app. Please remember, these features are <strong>in a beta state</strong>,
                                so they may change and we are working on improving them 🚧.<br/>
                                Please support us by <a href="https://github.com/eclipse-theia/theia">providing feedback</a>!
                            </p>
                        </div>

                        <div class="section-title">
                            <p>Currently Supported Views and Features:</p>
                        </div>
                        <div class="section-content">
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
                                <li><a role="button" href="command:aiHistory:open">AI History View</a></li>
                                <li><a role="button" href="command:aiConfiguration:open">AI Configuration View</a></li>
                            </ul>
                            <p>See <a href="https://theia-ide.org/docs/user_ai/" target="_blank">the documentation</a> for more information.</p>
                        </div>
                    </div>`
                ))
            }} onClick={this.onClick} onKeyDown={this.onKeyDown} />
        </div >;
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

    protected sanitize(html: string): string {
        return DOMPurify.sanitize(html, {
            ALLOW_UNKNOWN_PROTOCOLS: true // DOMPurify usually strips non http(s) links from hrefs
        });
    }

    protected onClick = (event: React.MouseEvent) => {
        if (event.target instanceof HTMLAnchorElement) {
            event.stopPropagation();
            event.preventDefault();
            open(this.openerService, new URI(event.target.href));
        }
    };

    protected onKeyDown = (event: React.KeyboardEvent) => {
        if (isEnterKey(event) && event.target instanceof HTMLAnchorElement) {
            event.stopPropagation();
            event.preventDefault();
            open(this.openerService, new URI(event.target.href));
        }
    };
}
