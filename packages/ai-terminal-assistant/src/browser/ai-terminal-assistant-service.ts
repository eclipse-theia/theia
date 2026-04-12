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
import { Widget } from '@theia/core/lib/browser';
import { TaskTerminalWidgetManager } from '@theia/task/lib/browser/task-terminal-widget-manager';
import { TaskWatcher } from '@theia/task/lib/common';
import { TaskService } from '@theia/task/lib/browser/task-service';
import { AiTerminalAssistantPreferences } from './ai-terminal-assistant-preferences';
import { ErrorSourceResolutionService } from './error-source-resolution-service';

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

    @inject(ErrorSourceResolutionService)
    protected readonly errorSourceResolutionService: ErrorSourceResolutionService;

    @inject(TaskTerminalWidgetManager)
    protected readonly taskTerminalWidgetManager: TaskTerminalWidgetManager;

    @inject(TaskService)
    protected readonly taskService: TaskService;

    @inject(TaskWatcher)
    protected readonly taskWatcher: TaskWatcher;

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
                    // create a new terminal to have clean terminal for the next command
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
        this._currentSummary = summary ? await this.errorSourceResolutionService.enrichErrorsWithFileContent(summary) : undefined;
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
        return this.errorSourceResolutionService.openErrorInEditor(error);
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

        this._currentTerminal = await this.terminalService.newTerminal({
            title: 'Hidden TaskTerminal',
            destroyTermOnClose: true,
            kind: 'task',
            hideFromUser: true,
            isTransient: true,
        });

        // Set up output listener BEFORE starting to catch early output
        this.currentTerminal.onOutput(output => {
            if (this._isTaskRunning) {
                const lines = this.currentTerminal.buffer.getLines(0, this.currentTerminal.buffer.length);
                this._terminalBuffer = lines.reverse();
                this.onCurrentTerminalBufferChangedEmitter.fire();
            }
        });

        // Attach terminal to hidden container instead of using terminalService.open()
        // This allows xterm.js to initialize without showing the terminal to the user
        if (this.hiddenTerminalContainer) {
            Widget.attach(this.currentTerminal, this.hiddenTerminalContainer);
            // this.currentTerminal.show();
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
