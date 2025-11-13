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
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { ChatAgentLocation, ChatAgentService, ChatService } from '@theia/ai-chat';

export interface SummaryRequest {
    cwd: string;
    shell: string;
    recentTerminalContents: string[];
}

export const SummaryChatService = Symbol('SummaryChatService');

export interface SummaryChatService {
    createNewChatSession(): void;
}

@injectable()
export class SummaryChatServiceImpl implements SummaryChatService {

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(ChatAgentService)
    protected chatAgentService: ChatAgentService;

    @postConstruct()
    protected init(): void {
    }

    protected getRecentTerminalCommands(terminal: TerminalWidget): string[] {
        const maxLines = 50;
        return terminal.buffer.getLines(0,
            terminal.buffer.length > maxLines ? maxLines : terminal.buffer.length
        ).reverse();
    }

    createNewChatSession(): void {
        const lastUsedTerminal = this.terminalService.lastUsedTerminal;
        if (lastUsedTerminal) {
            const recentTerminalContents = this.getRecentTerminalCommands(lastUsedTerminal);
            const coderAgent = this.chatAgentService.getAgent('Coder');
            const session = this.chatService.createSession(ChatAgentLocation.Panel, { focus: true }, coderAgent);
            this.chatService.sendRequest(session.id, {
                text: `Explain how to solve the issue in the provided terminal output.
                Only focus on exactly the last command output: ${recentTerminalContents.join('\n')}`,
            });
        }
    }

}
