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
import { AiTerminalSummaryAgent, ErrorDetail, Summary } from './terminal-output-analysis-agent';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalWidgetImpl } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { Emitter, Event } from '@theia/core';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import { MonacoEditorService } from '@theia/monaco/lib/browser/monaco-editor-service';
import * as monaco from '@theia/monaco-editor-core/esm/vs/editor/editor.api';
import { LocalFileLinkProvider } from '@theia/terminal/lib/browser/terminal-file-link-provider';

export interface SummaryRequest {
    cwd: string;
    shell: string;
    recentTerminalContents: string[];
}

export const SummaryService = Symbol('SummaryService');

export interface SummaryService {
    readonly onAllTerminalsClosed: Event<void>;
    readonly onBuildFinished: Event<void>;
    sendSummaryRequest(request: SummaryRequest): Promise<Summary | undefined>;
    sendSummaryRequestForLastUsedTerminal(): Promise<Summary | undefined>;
    openErrorInEditor(error: ErrorDetail): Promise<void>;
}

@injectable()
export class SummaryServiceImpl implements SummaryService {

    @inject(AiTerminalSummaryAgent)
    protected readonly agent: AiTerminalSummaryAgent;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(DebugSessionManager)
    protected readonly debugSessionManager: DebugSessionManager;

    @inject(MonacoEditorService)
    protected readonly monacoEditorService: MonacoEditorService;

    @inject(LocalFileLinkProvider)
    protected readonly fileLinkProvider: LocalFileLinkProvider;

    protected readonly onAllTerminalsClosedEmitter = new Emitter<void>();
    readonly onAllTerminalsClosed: Event<void> = this.onAllTerminalsClosedEmitter.event;

    protected readonly onBuildFinishedEmitter = new Emitter<void>();
    readonly onBuildFinished: Event<void> = this.onBuildFinishedEmitter.event;

    protected readonly activeTerminals = new Set<TerminalWidget>();
    protected editorDecorations: monaco.editor.IEditorDecorationsCollection | undefined;
    protected editorDisposables: monaco.IDisposable[] = [];

    @postConstruct()
    protected initialize(): void {
        this.terminalService.all.forEach(terminal => {
            this.activeTerminals.add(terminal);
            terminal.onDidDispose(() => {
                this.activeTerminals.delete(terminal);
                if (this.activeTerminals.size === 0) {
                    this.onAllTerminalsClosedEmitter.fire();
                }
            });
        });

        this.terminalService.onDidCreateTerminal(async (terminal: TerminalWidget) => {
            this.activeTerminals.add(terminal);
            terminal.onDidDispose(() => {
                this.activeTerminals.delete(terminal);
                if (this.activeTerminals.size === 0) {
                    this.onAllTerminalsClosedEmitter.fire();
                }
            });
        });

        this.debugSessionManager.onDidStartDebugSession(async () => {
            console.log('Debug session started.');
        });

        this.debugSessionManager.onDidDestroyDebugSession(async () => {
            console.log('Debug session destroyed.');
            this.onBuildFinishedEmitter.fire();
        });

    }

    async sendSummaryRequest(
        request: SummaryRequest
    ): Promise<Summary | undefined> {
        const { cwd, shell, recentTerminalContents } = request;
        return this.agent.getSummary(
            cwd,
            shell,
            recentTerminalContents
        );
    }

    async sendSummaryRequestForLastUsedTerminal(): Promise<Summary | undefined> {
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

    async openErrorInEditor(error: ErrorDetail): Promise<void> {
        if (!error.file) throw new Error('Error does not contain file information.');
        const terminal = this.terminalService.lastUsedTerminal;
        if (!terminal) {
            throw new Error('No active terminal found.');
        }
        const terminalLinks = await this.fileLinkProvider.provideLinks(`${error.file}${error.line ? ':' + error.line.toString() : ''}`, terminal);
        const termminalLink = terminalLinks[0];
        if (!termminalLink) {
            throw new Error(`Could not find file link for ${error.file}`);
        }
        await termminalLink.handle();

        const monacoEditor = this.monacoEditorService.getActiveCodeEditor();
        if (monacoEditor) {
            monacoEditor.createDecorationsCollection([{
                range: new monaco.Range(error.line || 1, 1, error.line || 1, 1),
                options: {
                    className: 'error-line-decoration',
                    description: 'error-line-decoration',
                    hoverMessage: { value: `**Error**: ${error.fix}` },
                    isWholeLine: true,
                }
            }]);
        }
    };

    protected getRecentTerminalCommands(terminal: TerminalWidget): string[] {
        const maxLines = 50;
        return terminal.buffer.getLines(0,
            terminal.buffer.length > maxLines ? maxLines : terminal.buffer.length
        ).reverse();
    }

}
