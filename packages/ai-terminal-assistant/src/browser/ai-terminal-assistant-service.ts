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
import { AiTerminalSummaryAgent, ErrorDetail, ErrorLines, Summary } from './terminal-output-analysis-agent';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalWidgetImpl } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { Emitter, Event, URI } from '@theia/core';
import { DebugSessionManager } from '@theia/debug/lib/browser/debug-session-manager';
import { MonacoEditorService } from '@theia/monaco/lib/browser/monaco-editor-service';
import * as monaco from '@theia/monaco-editor-core/esm/vs/editor/editor.api';
import { LocalFileLinkProvider } from '@theia/terminal/lib/browser/terminal-file-link-provider';
import { Widget } from '@theia/core/lib/browser';
import { TaskTerminalWidgetManager } from '@theia/task/lib/browser/task-terminal-widget-manager';
import { TaskWatcher } from '@theia/task/lib/common';
import { TaskService } from '@theia/task/lib/browser/task-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { AiTerminalAssistantPreferences } from './ai-terminal-assistant-preferences';

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
    readonly onTaskStarted: Event<void>;
    readonly onTaskExited: Event<void>;

    currentTerminal: TerminalWidget;
    currentSummary: Summary | undefined;
    currentErrorLines: string[];
    isTaskRunning: boolean;

    sendSummaryRequest(request: SummaryRequest): Promise<Summary | undefined>;
    sendSummaryRequestForLastUsedTerminal(): Promise<Summary | undefined>;
    openErrorInEditor(error: ErrorDetail): Promise<void>;
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

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(LocalFileLinkProvider)
    protected readonly fileLinkProvider: LocalFileLinkProvider;

    @inject(FileSearchService)
    protected readonly fileSearchService: FileSearchService;

    @inject(TaskTerminalWidgetManager)
    protected readonly taskTerminalWidgetManager: TaskTerminalWidgetManager;

    @inject(TaskService)
    protected readonly taskService: TaskService;

    @inject(TaskWatcher)
    protected readonly taskWatcher: TaskWatcher;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(AiTerminalAssistantPreferences)
    protected readonly aiTerminalAssistantPreferences: AiTerminalAssistantPreferences;

    protected readonly onAllTerminalsClosedEmitter = new Emitter<void>();
    readonly onAllTerminalsClosed: Event<void> = this.onAllTerminalsClosedEmitter.event;

    protected readonly onSummaryRequestStartedEmitter = new Emitter<void>();
    readonly onSummaryRequestStarted: Event<void> = this.onSummaryRequestStartedEmitter.event;

    protected readonly onSummaryRequestFinishedEmitter = new Emitter<Summary | undefined>();
    readonly onSummaryRequestFinished: Event<Summary | undefined> = this.onSummaryRequestFinishedEmitter.event;

    protected readonly onTaskStartedEmitter = new Emitter<void>();
    readonly onTaskStarted: Event<void> = this.onTaskStartedEmitter.event;

    protected readonly onTaskExitedEmitter = new Emitter<void>();
    readonly onTaskExited: Event<void> = this.onTaskExitedEmitter.event;

    protected readonly onCurrentTerminalBufferChangedEmitter = new Emitter<void>();
    readonly onCurrentTerminalBufferChanged: Event<void> = this.onCurrentTerminalBufferChangedEmitter.event;

    protected readonly activeTerminals = new Set<TerminalWidget>();
    protected editorDecorations: monaco.editor.IEditorDecorationsCollection | undefined;
    protected editorDisposables: monaco.IDisposable[] = [];

    protected _currentTerminal: TerminalWidget;
    get currentTerminal(): TerminalWidget {
        return this._currentTerminal;
    }
    protected _terminalBuffer: string[] = [];
    protected hiddenTerminalContainer: HTMLDivElement | undefined;
    protected isTerminalVisible: boolean = false;

    protected _currentSummary: Summary | undefined;
    get currentSummary(): Summary | undefined {
        return this._currentSummary;
    }

    protected _currentErrorLines: string[] = [];
    get currentErrorLines(): string[] {
        return this._currentErrorLines;
    }

    protected _summaryDebounce: ReturnType<typeof setTimeout> | undefined;

    protected _isTaskRunning: boolean = false;
    get isTaskRunning(): boolean {
        return this._isTaskRunning;
    }

    protected _isStandAlone: boolean;

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

        this._isStandAlone = this.aiTerminalAssistantPreferences['terminal.aiAssistant.mode'] === 'standalone';

        this.aiTerminalAssistantPreferences.onPreferenceChanged(async event => {
            if (event.preferenceName === 'terminal.aiAssistant.mode') {
                const newMode = this.aiTerminalAssistantPreferences['terminal.aiAssistant.mode'];
                this._isStandAlone = newMode === 'standalone';
                if (newMode === 'dedicated') {
                    if (this.currentTerminal && !this.currentTerminal.isDisposed) {
                        this.currentTerminal.dispose();
                    }
                    this.removeHiddenTerminalContainer();
                }
                if (newMode === 'standalone') {
                    if (!this.hiddenTerminalContainer) {
                        this.initializeHiddenTerminal();
                    }
                    if (!this.currentTerminal || this.currentTerminal.isDisposed) {
                        this.createNewTerminal().catch(err => {
                            console.error('Error creating terminal after mode switch:', err);
                        });
                    }
                }
            }
        });

        this.debugSessionManager.onDidStartDebugSession(async () => {
            console.log('Debug session started.');
            this._isTaskRunning = true;
            this.onTaskStartedEmitter.fire();
        });

        this.debugSessionManager.onDidDestroyDebugSession(async () => {
            console.log('Debug session destroyed.');
            this._isTaskRunning = false;
            this.onTaskExitedEmitter.fire();
            await this.requestSummary();
            this.createNewTerminal().catch(err => {
                console.error('Error recreating hidden terminal after task exit:', err);
            });
        });

        this.createNewTerminal().catch(err => {
            console.error('Error creating initial hidden terminal:', err);
        });

        this.taskWatcher.onTaskCreated(() => {
            this._isTaskRunning = true;
            this.onTaskStartedEmitter.fire();
            console.log('Task started.');
        });

        this.taskWatcher.onTaskExit(async () => {
            clearTimeout(this._summaryDebounce);
            this._summaryDebounce = setTimeout(async () => {
                const running = await this.taskService.getRunningTasks();
                if (running.length === 0) {
                    // request summary
                    this._isTaskRunning = false;
                    this.onTaskExitedEmitter.fire();
                    console.log('Task exited.');
                    await this.requestSummary();
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
        this.hiddenTerminalContainer.style.width = '2000px';
        this.hiddenTerminalContainer.style.height = '600px';
        this.hiddenTerminalContainer.style.overflow = 'hidden';
        // Use clip-path to make content invisible but keep element technically visible
        // This ensures phosphor's isVisible check passes
        this.hiddenTerminalContainer.style.clipPath = 'inset(100%)';
        this.hiddenTerminalContainer.style.pointerEvents = 'none';
        document.body.appendChild(this.hiddenTerminalContainer);
    }

    protected removeHiddenTerminalContainer(): void {
        if (this.hiddenTerminalContainer) {
            document.body.removeChild(this.hiddenTerminalContainer);
            this.hiddenTerminalContainer = undefined;
        }
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

    async logCurrentTerminalContent(): Promise<void> {
        const terminalContent = this.currentTerminal.buffer.getLines(0, this.currentTerminal.buffer.length);
        console.log('the current terminal buffer:', terminalContent);
        console.log('the stored terminal buffer:', this._terminalBuffer);
    }

    async getBufferContent(): Promise<string[]> {
        const maxLines = 100;
        return this.currentTerminal.buffer.getLines(
            Math.max(0, this.currentTerminal.buffer.length - maxLines),
            maxLines
        );
    }

    async writeToCurrentTerminal(command: string): Promise<void> {
        if (this.currentTerminal) {
            this.currentTerminal.sendText(command);
            this.currentTerminal.sendText('\r');
        } else {
            throw new Error('No current terminal to write to.');
        }
    }

    async openTerminal(): Promise<TerminalWidget> {
        const terminal = await this.terminalService.newTerminal({});
        this.terminalService.open(terminal, { mode: 'activate' });
        await terminal.start();
        const currentTerminalContents = terminal.buffer.getLines(0, terminal.buffer.length);
        console.log('Current terminal contents:', currentTerminalContents);
        return terminal;
    }

    async requestSummary(): Promise<void> {
        this.onSummaryRequestStartedEmitter.fire();
        const summary = await this.sendSummaryRequestForLastUsedTerminal();
        this._currentSummary = summary ? await this.enrichErrorsWithFileContent(summary) : undefined;
        this.onSummaryRequestFinishedEmitter.fire(this.currentSummary);
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
            console.log('recent terminal contents:', recentTerminalContents);
            return this.agent.getSummary(
                cwd,
                recentTerminalContents,
                shell,
            );
        }
        throw new Error('No active terminal found.');
    }

    async openErrorInEditor(error: ErrorDetail): Promise<void> {
        if (!error.file) {
            throw new Error('Error does not contain file information.');
        };
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

    protected async enrichErrorsWithFileContent(summary: Summary): Promise<Summary> {
        const enrichedErrors = await Promise.all(summary.errors.map(async error => {
            const errorLines = await this.getErrorLines(error);
            return {
                ...error,
                errorLines,
            };
        }));
        console.log('Enriched errors with file content:', enrichedErrors);
        return {
            ...summary,
            errors: enrichedErrors,
        };
    }

    protected async getErrorLines(error: ErrorDetail): Promise<ErrorLines | undefined> {
        if (!error.file || !error.line) {
            console.log('Error does not contain file or line information:', error);
            return undefined;
        }
        const fileUri = await this.getFileUriFromError(error);
        if (!fileUri) {
            console.log('Could not find file URI for error:', error);
            return undefined;
        }
        const uri: URI = new URI(fileUri);
        const fileContent = await this.fileService.read(uri);
        const lines = fileContent.value.split('\n');
        console.log('Fetched file content for error lines:', lines);

        const start = Math.max(0, error.line - 2);
        const end = Math.min(lines.length, error.line + 1);
        if (error.line && error.line > 0 && error.line <= lines.length) {
            const errorLines = lines.slice(start, end);
            // prefix each line with line number
            const numberedLines = errorLines.map((line, index) => `${start + index + 1}: ${line}`);
            return {
                errorLines: numberedLines,
                errorLinesStart: start + 1
            };
        }
        return undefined;
    }

    protected async getFileUriFromError(error: ErrorDetail): Promise<string | undefined> {
        if (!error.file) {
            return undefined;
        }
        const searchTerm = error.file.replace(/`/g, '');
        console.log('Searching for file URI with term:', searchTerm);
        const roots = this.workspaceService.tryGetRoots().map(root => root.resource.toString());
        const opts: FileSearchService.Options = {
            rootUris: roots,
            fuzzyMatch: true,
            limit: 1,
        };

        const results = await this.fileSearchService.find(searchTerm, opts);

        return results.length > 0 ? results[0] : undefined;
    }

    protected getRecentTerminalCommands(terminal: TerminalWidget): string[] {
        const maxLines = 50;
        return terminal.buffer.getLines(
            Math.max(terminal.buffer.length - maxLines, 0),
            maxLines,
            true
        );
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

    protected async createNewTerminal(): Promise<void> {
        // Dispose previous terminal if exists
        if (this.currentTerminal && !this.currentTerminal.isDisposed) {
            this.currentTerminal.dispose();
        }
        this._terminalBuffer = [];

        if (!this._isStandAlone) {
            return;
        }
        const task: boolean = true;

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
        this.currentTerminal.onOutput(output => {
            if (this._isTaskRunning) {
                this._terminalBuffer = this.currentTerminal.buffer.getLines(0, this.currentTerminal.buffer.length).reverse();
                this.onCurrentTerminalBufferChangedEmitter.fire();
            }
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
}
