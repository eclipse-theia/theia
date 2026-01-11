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
import { inject, injectable } from '@theia/core/shared/inversify';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { ChatAgentLocation, ChatAgentService, ChatService } from '@theia/ai-chat';
import { ErrorDetail } from '@theia/ai-terminal-assistant/lib/browser/terminal-output-analysis-agent';

export interface SummaryRequest {
    cwd: string;
    shell: string;
    recentTerminalContents: string[];
}

export const SummaryChatService = Symbol('SummaryChatService');

export interface SummaryChatService {
    startSolutionChatSession(error: ErrorDetail): void;
}

@injectable()
export class SummaryChatServiceImpl implements SummaryChatService {

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(ChatService)
    protected readonly chatService: ChatService;

    @inject(ChatAgentService)
    protected chatAgentService: ChatAgentService;

    startSolutionChatSession(error?: ErrorDetail): void {
        const terminal = this.terminalService.lastUsedTerminal;
        if (!terminal) return;

        const recent = this.getRecentTerminalCommands(terminal);
        const coderAgent = this.chatAgentService.getAgent('Coder');
        if (!coderAgent) return;

        const session = this.chatService.createSession(ChatAgentLocation.Panel, { focus: true }, coderAgent);
        this.chatService.sendRequest(session.id, { text: this.buildMessage(error, recent) });
    }

    protected getRecentTerminalCommands(terminal: TerminalWidget): string[] {
        const maxLines = 50;
        return terminal.buffer.getLines(0,
            terminal.buffer.length > maxLines ? maxLines : terminal.buffer.length
        ).reverse();
    }

    private formatLocation(error: ErrorDetail): string {
        const base = error.file ?? 'N/A';
        const parts: string[] = [];
        if (error.line) parts.push(`line ${error.line}`);
        if (error.column) parts.push(`column ${error.column}`);
        return parts.length ? `${base} at ${parts.join(', ')}` : base;
    }

    private buildMessage(error: ErrorDetail | undefined, recent: string[]): string {
        const lastOutput = recent.join('\n');
        if (!error) {
            return `Explain the command and the output of the last command output.
                    Only focus on exactly the last command output:
                    ${lastOutput}`;
        }
        return `Explain how to solve the following issue in the provided terminal output.
                Issue Type: ${error.type}
                Location: ${this.formatLocation(error)}
                Description: ${error.explanationSteps.join('\n')}
                Suggested Fixes: ${error.fixSteps.join('\n')}
                Only focus on exactly the last command output:
                ${lastOutput}`;
    }

}
