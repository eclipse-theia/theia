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
import { Widget } from '@theia/core/lib/browser';
import { TaskTerminalWidgetManager } from '@theia/task/lib/browser/task-terminal-widget-manager';
import { TaskWatcher } from '@theia/task/lib/common';
import { TaskService } from '@theia/task/lib/browser/task-service';

export interface SummaryRequest {
    cwd: string;
    shell: string;
    recentTerminalContents: string[];
}

export const SummaryService = Symbol('SummaryService');

export interface SummaryService {
    readonly onAllTerminalsClosed: Event<void>;
    readonly onCurrentTerminalBufferChanged: Event<void>;
    readonly onSummaryRequestStarted: Event<void>;
    readonly onSummaryRequestFinished: Event<Summary | undefined>;

    currentTerminal: TerminalWidget;
    terminalBuffer: string[];
    currentSummary: Summary | undefined;

    sendSummaryRequest(request: SummaryRequest): Promise<Summary | undefined>;
    sendSummaryRequestForLastUsedTerminal(): Promise<Summary | undefined>;
    openErrorInEditor(error: ErrorDetail): Promise<void>;
    createNewTerminal(): Promise<void>;
    writeToCurrentTerminal(command: string): Promise<void>;
    logCurrentTerminalContent(): Promise<void>;
    getBufferContent(): Promise<string[]>;
    toggleTerminalVisibility(): void;
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

    @inject(TaskTerminalWidgetManager)
    protected readonly taskTerminalWidgetManager: TaskTerminalWidgetManager;

    @inject(TaskService)
    protected readonly taskService: TaskService;

    @inject(TaskWatcher)
    protected readonly taskWatcher: TaskWatcher;

    protected readonly onAllTerminalsClosedEmitter = new Emitter<void>();
    readonly onAllTerminalsClosed: Event<void> = this.onAllTerminalsClosedEmitter.event;

    protected readonly onSummaryRequestStartedEmitter = new Emitter<void>();
    readonly onSummaryRequestStarted: Event<void> = this.onSummaryRequestStartedEmitter.event;

    protected readonly onSummaryRequestFinishedEmitter = new Emitter<Summary | undefined>();
    readonly onSummaryRequestFinished: Event<Summary | undefined> = this.onSummaryRequestFinishedEmitter.event;

    protected readonly onCurrentTerminalBufferChangedEmitter = new Emitter<void>();
    readonly onCurrentTerminalBufferChanged: Event<void> = this.onCurrentTerminalBufferChangedEmitter.event;

    protected readonly activeTerminals = new Set<TerminalWidget>();
    protected editorDecorations: monaco.editor.IEditorDecorationsCollection | undefined;
    protected editorDisposables: monaco.IDisposable[] = [];

    protected _currentTerminal: TerminalWidget;
    get currentTerminal(): TerminalWidget {
        return this._currentTerminal;
    }
    terminalBuffer: string[] = [];
    protected hiddenTerminalContainer: HTMLDivElement | undefined;
    protected isTerminalVisible: boolean = false;

    protected _currentSummary: Summary | undefined;
    get currentSummary(): Summary | undefined {
        return this._currentSummary;
    }

    protected summaryDebounce: ReturnType<typeof setTimeout> | undefined;

    @postConstruct()
    protected initialize(): void {
        this.initializeHiddenTerminal();
        // this.terminalService.all.forEach(terminal => {
        //     this.activeTerminals.add(terminal);
        //     terminal.onDidDispose(() => {
        //         this.activeTerminals.delete(terminal);
        //         if (this.activeTerminals.size === 0) {
        //             this.onAllTerminalsClosedEmitter.fire();
        //         }
        //     });
        // });

        // this.terminalService.onDidCreateTerminal(async (terminal: TerminalWidget) => {
        //     this.activeTerminals.add(terminal);
        //     terminal.onDidDispose(() => {
        //         this.activeTerminals.delete(terminal);
        //         if (this.activeTerminals.size === 0) {
        //             this.onAllTerminalsClosedEmitter.fire();
        //         }
        //     });
        // });

        this.debugSessionManager.onDidStartDebugSession(async () => {
            console.log('Debug session started.');

        });

        this.debugSessionManager.onDidDestroyDebugSession(async () => {
            console.log('Debug session destroyed.');
            this.onSummaryRequestStartedEmitter.fire();
            this._currentSummary = await this.sendSummaryRequestForLastUsedTerminal();
            this.onSummaryRequestFinishedEmitter.fire(this.currentSummary);
            this.createNewTerminal().catch(err => {
                console.error('Error recreating hidden terminal after task exit:', err);
            });
        });

        this.createNewTerminal().catch(err => {
            console.error('Error creating initial hidden terminal:', err);
        });

        // Listen for task exit events to recreate the hidden terminal
        // this.taskWatcher.onTaskExit(async () => {
        //     this.onSummaryRequestStartedEmitter.fire();
        //     this._currentSummary = await this.sendSummaryRequestForLastUsedTerminal();
        //     this.onSummaryRequestFinishedEmitter.fire(this.currentSummary);
        //     this.createNewTerminal().catch(err => {
        //         console.error('Error recreating hidden terminal after task exit:', err);
        //     });
        // });

        this.taskWatcher.onTaskExit(async () => {
            clearTimeout(this.summaryDebounce);
            this.summaryDebounce = setTimeout(async () => {
                const running = await this.taskService.getRunningTasks();
                if (running.length === 0) {
                    // request summary
                    this.onSummaryRequestStartedEmitter.fire();
                    this._currentSummary = await this.sendSummaryRequestForLastUsedTerminal();
                    this.onSummaryRequestFinishedEmitter.fire(this.currentSummary);
                    this.createNewTerminal().catch(err => {
                        console.error('Error recreating hidden terminal after task exit:', err);
                    });
                }
            }, 500);
        });
    }

    protected initializeHiddenTerminal(): void {
        // Initialization logic for the hidden terminal can be placed here if needed
        // Create a hidden container for the terminal widget
        // This allows the terminal to be attached to the DOM (required for xterm.js)
        // while keeping it invisible to the user
        // We use clip-path to hide the content while keeping the element "visible" for phosphor
        this.hiddenTerminalContainer = document.createElement('div');
        this.hiddenTerminalContainer.id = 'ai-terminal-hidden-container';
        this.hiddenTerminalContainer.style.position = 'fixed';
        this.hiddenTerminalContainer.style.width = '800px';
        this.hiddenTerminalContainer.style.height = '600px';
        this.hiddenTerminalContainer.style.overflow = 'hidden';
        // Use clip-path to make content invisible but keep element technically visible
        // This ensures phosphor's isVisible check passes
        this.hiddenTerminalContainer.style.clipPath = 'inset(100%)';
        this.hiddenTerminalContainer.style.pointerEvents = 'none';
        document.body.appendChild(this.hiddenTerminalContainer);
    }



    toggleTerminalVisibility(): void {
        if (this.hiddenTerminalContainer) {
            if (this.isTerminalVisible) {
                this.hiddenTerminalContainer.style.clipPath = 'none';
                this.hiddenTerminalContainer.style.pointerEvents = 'auto';
                this.isTerminalVisible = false;
            } else {
                this.hiddenTerminalContainer.style.clipPath = 'inset(100%)';
                this.hiddenTerminalContainer.style.pointerEvents = 'none';
                this.isTerminalVisible = true;
            }
        }
    }

    async createNewTerminal(): Promise<void> {
        // Dispose previous terminal if exists
        if (this.currentTerminal && !this.currentTerminal.isDisposed) {
            this.currentTerminal.dispose();
        }
        this.terminalBuffer = [];

        const task = true;
        if (task) {
            this._currentTerminal = await this.terminalService.newTerminal({
                title: 'Hidden TaskTerminal',
                destroyTermOnClose: true,
                hideFromUser: true,
                kind: 'task',
            });
        } else {
            this._currentTerminal = await this.terminalService.newTerminal({
                title: 'Hidden Terminal',
                destroyTermOnClose: true,
                hideFromUser: true,
            });
        }

        // Set up output listener BEFORE starting to catch early output
        this.currentTerminal.onOutput((output) => {
            console.log('Background terminal output: ', output);
            this.terminalBuffer = this.currentTerminal.buffer.getLines(0, this.currentTerminal.buffer.length);
            this.onCurrentTerminalBufferChangedEmitter.fire();
        });

        // Attach terminal to hidden container instead of using terminalService.open()
        // This allows xterm.js to initialize without showing the terminal to the user
        if (this.hiddenTerminalContainer) {
            Widget.attach(this.currentTerminal, this.hiddenTerminalContainer);
            // Show the widget to ensure phosphor considers it visible
            this.currentTerminal.show();
        }

        // Start the terminal process - this will also trigger onDidOpen when connected
        await this.currentTerminal.start();

        // Trigger update to initialize xterm.js properly
        // This calls open() internally which sets termOpened=true, enabling onOutput events
        this.currentTerminal.update();

        // Wait a tick to ensure xterm.js is initialized after update
        await new Promise<void>(resolve => setTimeout(resolve, 100));

    }
    async logCurrentTerminalContent(): Promise<void> {
        const terminalContent = this.currentTerminal.buffer.getLines(0, this.currentTerminal.buffer.length);
        console.log('the current terminal buffer:', terminalContent);
        console.log('the stored terminal buffer:', this.terminalBuffer);
    }

    async getBufferContent(): Promise<string[]> {
        return this.currentTerminal.buffer.getLines(0, this.currentTerminal.buffer.length);
    }

    async writeToCurrentTerminal(command: string): Promise<void> {
        if (this.currentTerminal) {
            this.currentTerminal.sendText(command);
            this.currentTerminal.sendText('\r');
        } else {
            throw new Error('No current terminal to write to.');
        }
    }

    async openTerminal() {
        const terminal = await this.terminalService.newTerminal({});
        this.terminalService.open(terminal, { mode: 'activate' });
        await terminal.start();
        const currentTerminalContents = terminal.buffer.getLines(0, terminal.buffer.length);
        console.log('Current terminal contents:', currentTerminalContents);
        return terminal;
    }

    async sendSummaryRequest(
        request: SummaryRequest
    ): Promise<Summary | undefined> {
        const { cwd, shell, recentTerminalContents } = request;
        return this.agent.getSummary(
            cwd,
            recentTerminalContents,
            shell,
        );
    }

    async sendSummaryRequestForLastUsedTerminal(): Promise<Summary | undefined> {
        const lastUsedTerminal = this.terminalService.lastUsedTerminal;
        if (lastUsedTerminal) {
            const cwd = (await (lastUsedTerminal as TerminalWidgetImpl).cwd).toString();
            const shell = await this.getTerminalShell(lastUsedTerminal);
            const recentTerminalContents = this.getRecentTerminalCommands(lastUsedTerminal);
            return this.agent.getSummary(
                cwd,
                recentTerminalContents,
                shell,
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
                    hoverMessage: { value: `**Error**: ${error.fixSteps.join(' ')}` },
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

    // fetch shell if terminal process is still running 
    protected async getTerminalShell(terminal: TerminalWidget): Promise<string | undefined> {
        try {
            const processInfo = await terminal.processInfo;
            return processInfo ? processInfo.executable : undefined;
        } catch {
            return undefined;
        }
    }

}
