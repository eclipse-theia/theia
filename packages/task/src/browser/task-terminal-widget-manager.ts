/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable, postConstruct } from 'inversify';
import { ApplicationShell, WidgetOpenerOptions } from '@theia/core/lib/browser';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalWidgetFactoryOptions } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { PanelKind, TaskConfiguration, TaskWatcher, TaskExitedEvent, TaskServer, TaskOutputPresentation } from '../common';
import { TaskDefinitionRegistry } from './task-definition-registry';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';

export interface TaskTerminalWidget extends TerminalWidget {
    readonly kind: 'task';
    dedicated?: boolean;
    taskId?: number;
    taskConfig?: TaskConfiguration;
    busy?: boolean;
}
export namespace TaskTerminalWidget {
    export function is(widget: TerminalWidget): widget is TaskTerminalWidget {
        return widget.kind === 'task';
    }
}

export interface TaskTerminalWidgetOpenerOptions extends WidgetOpenerOptions {
    taskId: number;
    taskConfig?: TaskConfiguration;
}
export namespace TaskTerminalWidgetOpenerOptions {
    export function isDedicatedTerminal(options: TaskTerminalWidgetOpenerOptions): boolean {
        return !!options.taskConfig && !!options.taskConfig.presentation && options.taskConfig.presentation.panel === PanelKind.Dedicated;
    }

    export function isNewTerminal(options: TaskTerminalWidgetOpenerOptions): boolean {
        return !!options.taskConfig && !!options.taskConfig.presentation && options.taskConfig.presentation.panel === PanelKind.New;
    }

    export function isSharedTerminal(options: TaskTerminalWidgetOpenerOptions): boolean {
        return !!options.taskConfig &&
            (options.taskConfig.presentation === undefined || options.taskConfig.presentation.panel === undefined || options.taskConfig.presentation.panel === PanelKind.Shared);
    }
}

@injectable()
export class TaskTerminalWidgetManager {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(TaskDefinitionRegistry)
    protected readonly taskDefinitionRegistry: TaskDefinitionRegistry;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(TaskWatcher)
    protected readonly taskWatcher: TaskWatcher;

    @inject(TaskServer)
    protected readonly taskServer: TaskServer;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @postConstruct()
    protected init(): void {
        this.taskWatcher.onTaskExit((event: TaskExitedEvent) => {
            const finishedTaskId = event.taskId;
            // find the terminal where the task ran, and mark it as "idle"
            for (const terminal of this.getTaskTerminalWidgets()) {
                if (terminal.taskId === finishedTaskId) {
                    const showReuseMessage = !!event.config && TaskOutputPresentation.shouldShowReuseMessage(event.config);
                    this.notifyTaskFinished(terminal, showReuseMessage);
                    break;
                }
            }
        });

        this.terminalService.onDidCreateTerminal(async (widget: TerminalWidget) => {
            const terminal = TaskTerminalWidget.is(widget) && widget;
            if (terminal) {
                const didConnectListener = terminal.onDidOpen(async () => {
                    const context = this.workspaceService.workspace && this.workspaceService.workspace.uri;
                    const tasksInfo = await this.taskServer.getTasks(context);
                    const taskInfo = tasksInfo.find(info => info.terminalId === widget.terminalId);
                    if (taskInfo) {
                        const taskConfig = taskInfo.config;
                        terminal.dedicated = !!taskConfig.presentation && !!taskConfig.presentation.panel && taskConfig.presentation.panel === PanelKind.Dedicated;
                        terminal.taskId = taskInfo.taskId;
                        terminal.taskConfig = taskConfig;
                        terminal.busy = true;
                    } else {
                        this.notifyTaskFinished(terminal, true);
                    }
                });
                const didConnectFailureListener = terminal.onDidOpenFailure(async () => {
                    this.notifyTaskFinished(terminal, true);
                });
                terminal.onDidDispose(() => {
                    didConnectListener.dispose();
                    didConnectFailureListener.dispose();
                });
            }
        });
    }

    async open(factoryOptions: TerminalWidgetFactoryOptions, openerOptions: TaskTerminalWidgetOpenerOptions): Promise<TerminalWidget> {
        const dedicated = TaskTerminalWidgetOpenerOptions.isDedicatedTerminal(openerOptions);
        if (dedicated && !openerOptions.taskConfig) {
            throw new Error('"taskConfig" must be included as part of the "option" if "isDedicated" is true');
        }

        const { isNew, widget } = await this.getWidgetToRunTask(factoryOptions, openerOptions);
        if (isNew) {
            this.shell.addWidget(widget, { area: openerOptions.widgetOptions ? openerOptions.widgetOptions.area : 'bottom' });
            widget.resetTerminal();
        } else {
            if (factoryOptions.title) {
                widget.setTitle(factoryOptions.title);
            }
            if (openerOptions.taskConfig && TaskOutputPresentation.shouldClearTerminalBeforeRun(openerOptions.taskConfig)) {
                widget.clearOutput();
            }
        }
        this.terminalService.open(widget, openerOptions);

        return widget;
    }

    protected async getWidgetToRunTask(
        factoryOptions: TerminalWidgetFactoryOptions, openerOptions: TaskTerminalWidgetOpenerOptions
    ): Promise<{ isNew: boolean, widget: TerminalWidget }> {
        let reusableTerminalWidget: TerminalWidget | undefined;
        if (TaskTerminalWidgetOpenerOptions.isDedicatedTerminal(openerOptions)) {
            for (const widget of this.getTaskTerminalWidgets()) {
                // to run a task whose `taskPresentation === 'dedicated'`, the terminal to be reused must be
                // 1) dedicated, 2) idle, 3) the one that ran the same task
                if (widget.dedicated &&
                    !widget.busy &&
                    widget.taskConfig && openerOptions.taskConfig &&
                    this.taskDefinitionRegistry.compareTasks(openerOptions.taskConfig, widget.taskConfig)) {

                    reusableTerminalWidget = widget;
                    break;
                }
            }
        } else if (TaskTerminalWidgetOpenerOptions.isSharedTerminal(openerOptions)) {
            const availableWidgets: TerminalWidget[] = [];
            for (const widget of this.getTaskTerminalWidgets()) {
                // to run a task whose `taskPresentation === 'shared'`, the terminal to be used must be
                // 1) not dedicated, and 2) idle
                if (!widget.dedicated && !widget.busy) {
                    availableWidgets.push(widget);
                }
            }
            const lastUsedWidget = availableWidgets.find(w => {
                const lastUsedTerminal = this.terminalService.lastUsedTerminal;
                return lastUsedTerminal && lastUsedTerminal.id === w.id;
            });
            reusableTerminalWidget = lastUsedWidget || availableWidgets[0];
        }

        // we are unable to find a terminal widget to run the task, or `taskPresentation === 'new'`
        if (!reusableTerminalWidget) {
            const widget = await this.terminalService.newTerminal({ ...factoryOptions, kind: 'task' });
            return { isNew: true, widget };
        }
        return { isNew: false, widget: reusableTerminalWidget };
    }

    private getTaskTerminalWidgets(): TaskTerminalWidget[] {
        return this.terminalService.all.filter(TaskTerminalWidget.is);
    }

    private notifyTaskFinished(terminal: TaskTerminalWidget, showReuseMessage: boolean): void {
        terminal.busy = false;
        terminal.scrollToBottom();
        if (showReuseMessage) {
            terminal.writeLine('\x1b[1m\n\rTerminal will be reused by tasks. \x1b[0m\n');
        }
    }
}
