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
import { AiTerminalSummaryAgent } from './ai-terminal-summary-agent';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalWidgetImpl } from '@theia/terminal/src/browser/terminal-widget-impl';

export interface SummaryRequest {
    cwd: string;
    shell: string;
    recentTerminalContents: string[];
}

export const SummaryService = Symbol('SummaryService');

export interface SummaryService {
    sendSummaryRequest(
        request: SummaryRequest
    ): Promise<string>;

    sendSummaryRequestForLastUsedTerminal(): Promise<string>;
}

@injectable()
export class SummaryServiceImpl implements SummaryService {
    @inject(AiTerminalSummaryAgent)
    protected readonly agent: AiTerminalSummaryAgent;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @postConstruct()
    protected initialize(): void {

        this.terminalService.onDidCreateTerminal(async (terminal: TerminalWidget) => {
            if (terminal) {
                const didOutput = terminal.onData(async (data: string) => {
                    // Handle terminal output data if listening to end of command execution is possible 
                });
                terminal.onDidDispose(() => {
                    didOutput.dispose();
                });
            }
        });

    }

    async sendSummaryRequest(
        request: SummaryRequest
    ): Promise<string> {
        const { cwd, shell, recentTerminalContents } = request;
        return this.agent.getSummary(
            cwd,
            shell,
            recentTerminalContents
        );
    }

    async sendSummaryRequestForLastUsedTerminal(): Promise<string> {
        const lastUsedTerminal = this.terminalService.lastUsedTerminal;
        if (lastUsedTerminal) {
            const cwd = (await (lastUsedTerminal as TerminalWidgetImpl).cwd).toString();
            const processInfo = await lastUsedTerminal.processInfo;
            const shell = processInfo.executable;
            const recentTerminalContents = this.getRecentTerminalCommands(lastUsedTerminal);
            return this.agent.getSummary(
                cwd,
                shell,
                recentTerminalContents
            );
        }
        throw new Error('No active terminal found.');
    }


    protected getRecentTerminalCommands(terminal: TerminalWidget): string[] {
        const maxLines = 100;
        return terminal.buffer.getLines(0,
            terminal.buffer.length > maxLines ? maxLines : terminal.buffer.length
        ).reverse();
    }

}
