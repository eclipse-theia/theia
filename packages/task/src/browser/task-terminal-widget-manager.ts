// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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
import { codicon, WidgetOpenerOptions } from '@theia/core/lib/browser';
import { TerminalCollection, TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalWidgetFactoryOptions } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { PanelKind, TaskConfiguration, TaskWatcher, TaskExitedEvent, TaskServer, TaskOutputPresentation, TaskInfo } from '../common/index.js';
import { ProcessTaskInfo } from '../common/process/task-protocol.js';
import { TaskDefinitionRegistry } from './task-definition-registry.js';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import URI from '@theia/core/lib/common/uri';
import { nls } from '@theia/core';

export interface TaskTerminalWidget extends TerminalWidget {
    readonly kind: 'task';
    dedicated?: boolean;
    taskId?: number;
    taskConfig?: TaskConfiguration;
    busy?: boolean;
}
export namespace TaskTerminalWidget {
    /** The attribute of a task terminal that holds the `presentation.group` of the tasks it runs. */
    export const GROUP_ATTRIBUTE = 'theia.task.group';
    export function is(widget: TerminalWidget): widget is TaskTerminalWidget {
        return widget.kind === 'task';
    }
}

export interface TaskTerminalWidgetOpenerOptions extends WidgetOpenerOptions {
    taskConfig?: TaskConfiguration;
    taskInfo?: TaskInfo;
}
export namespace TaskTerminalWidgetOpenerOptions {
    export function isDedicatedTerminal(options: TaskTerminalWidgetOpenerOptions): boolean {
        const taskConfig = options.taskInfo ? options.taskInfo.config : options.taskConfig;
        return !!taskConfig && !!taskConfig.presentation && taskConfig.presentation.panel === PanelKind.Dedicated;
    }

    export function isNewTerminal(options: TaskTerminalWidgetOpenerOptions): boolean {
        const taskConfig = options.taskInfo ? options.taskInfo.config : options.taskConfig;
        return !!taskConfig && !!taskConfig.presentation && taskConfig.presentation.panel === PanelKind.New;
    }

    export function isSharedTerminal(options: TaskTerminalWidgetOpenerOptions): boolean {
        const taskConfig = options.taskInfo ? options.taskInfo.config : options.taskConfig;
        return !!taskConfig && (taskConfig.presentation === undefined || taskConfig.presentation.panel === undefined || taskConfig.presentation.panel === PanelKind.Shared);
    }

    export function echoExecutedCommand(options: TaskTerminalWidgetOpenerOptions): boolean {
        const taskConfig = options.taskInfo ? options.taskInfo.config : options.taskConfig;
        return !!taskConfig && (taskConfig.presentation === undefined || taskConfig.presentation.echo === undefined || taskConfig.presentation.echo);
    }
}

@injectable()
export class TaskTerminalWidgetManager {

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

    /** The terminals being created for `presentation.group`s without a terminal yet, so that tasks of the group started meanwhile join them. */
    protected readonly pendingGroupTerminals = new Map<string, Promise<TerminalWidget>>();

    @postConstruct()
    protected init(): void {
        this.taskWatcher.onTaskExit((event: TaskExitedEvent) => {
            const finishedTaskId = event.taskId;
            // find the terminal where the task ran, and mark it as "idle"
            for (const terminal of this.getTaskTerminalWidgets()) {
                if (terminal.taskId === finishedTaskId) {
                    const showReuseMessage = !!event.config && TaskOutputPresentation.shouldShowReuseMessage(event.config);
                    const closeOnFinish = !!event.config && TaskOutputPresentation.shouldCloseTerminalOnFinish(event.config);
                    this.updateTerminalOnTaskExit(terminal, showReuseMessage, closeOnFinish);
                    break;
                }
            }
        });

        this.terminalService.onDidCreateTerminal(async (widget: TerminalWidget) => {
            const terminal = TaskTerminalWidget.is(widget) && widget;
            if (terminal) {
                // Until its process is attached, a task terminal is either about to run a task or may still be running one.
                terminal.busy = true;
                const didConnectListener = terminal.onDidOpen(async () => {
                    const context = this.workspaceService?.workspace?.resource.toString();
                    const tasksInfo = await this.taskServer.getTasks(context);
                    const taskInfo = tasksInfo.find(info => info.terminalId === widget.terminalId);
                    if (taskInfo) {
                        this.claimTerminal(terminal, taskInfo.config);
                        terminal.taskId = taskInfo.taskId;
                    } else {
                        this.updateTerminalOnTaskExit(terminal, true, false);
                    }
                });
                const didConnectFailureListener = terminal.onDidOpenFailure(async () => {
                    this.updateTerminalOnTaskExit(terminal, true, false);
                });
                terminal.onDidDispose(() => {
                    didConnectListener.dispose();
                    didConnectFailureListener.dispose();
                });
            }
        });
    }

    /**
     * Creates a terminal for the given task. A terminal for a task in a `presentation.group` is split next to a terminal of the group, if there is one.
     */
    async newTaskTerminal(factoryOptions: TerminalWidgetFactoryOptions, taskConfig?: TaskConfiguration): Promise<TerminalWidget> {
        const group = taskConfig && TaskOutputPresentation.getGroup(taskConfig);
        if (group === undefined) {
            return this.createTaskTerminal(factoryOptions, taskConfig);
        }
        const groupTerminal = this.getTaskTerminalWidgets().find(widget => this.getTerminalGroup(widget) === group) ?? this.pendingGroupTerminals.get(group);
        if (groupTerminal) {
            const parentTerminal = await Promise.resolve(groupTerminal).catch(() => undefined);
            return this.createTaskTerminal(factoryOptions, taskConfig, group, parentTerminal);
        }
        const terminal = this.createTaskTerminal(factoryOptions, taskConfig, group);
        this.pendingGroupTerminals.set(group, terminal);
        const forget = (): void => {
            this.pendingGroupTerminals.delete(group);
        };
        terminal.then(forget, forget);
        return terminal;
    }

    protected createTaskTerminal(
        factoryOptions: TerminalWidgetFactoryOptions, taskConfig?: TaskConfiguration, group?: string, parentTerminal?: TerminalWidget
    ): Promise<TerminalWidget> {
        return this.terminalService.newTerminal({
            collection: this.getTerminalCollection(taskConfig),
            ...factoryOptions,
            location: parentTerminal ? { parentTerminal: parentTerminal.id } : factoryOptions.location,
            // A terminal only runs tasks of the group it is created for, so the group is kept with the terminal across reloads.
            attributes: group === undefined ? factoryOptions.attributes : { ...factoryOptions.attributes, [TaskTerminalWidget.GROUP_ATTRIBUTE]: group },
            kind: 'task'
        });
    }

    /**
     * Returns the collection of terminals that a terminal for the given task is presented with.
     * By default, all task terminals are presented together.
     *
     * Terminals are split and reused by `presentation.group` regardless of their collection,
     * so tasks of the same group should be given the same collection.
     */
    protected getTerminalCollection(_taskConfig?: TaskConfiguration): TerminalCollection | undefined {
        return { id: 'tasks', label: nls.localizeByDefault('Tasks'), iconClass: codicon('tasklist') };
    }

    protected getTerminalGroup(widget: TaskTerminalWidget): string | undefined {
        return widget.attributes?.[TaskTerminalWidget.GROUP_ATTRIBUTE] ?? (widget.taskConfig && TaskOutputPresentation.getGroup(widget.taskConfig));
    }

    async open(factoryOptions: TerminalWidgetFactoryOptions, openerOptions: TaskTerminalWidgetOpenerOptions): Promise<TerminalWidget> {
        const taskInfo = openerOptions.taskInfo;
        const taskConfig = taskInfo ? taskInfo.config : openerOptions.taskConfig;
        const dedicated = TaskTerminalWidgetOpenerOptions.isDedicatedTerminal(openerOptions);
        if (dedicated && !taskConfig) {
            throw new Error('"taskConfig" must be included as part of the "option.taskInfo" if "isDedicated" is true');
        }

        const { isNew, widget } = await this.getWidgetToRunTask(factoryOptions, openerOptions);
        try {
            if (isNew) {
                widget.resetTerminal();
            } else {
                if (factoryOptions.title) {
                    widget.setTitle(factoryOptions.title);
                }
                if (taskConfig && TaskOutputPresentation.shouldClearTerminalBeforeRun(taskConfig)) {
                    widget.clearOutput();
                }
            }
            await this.terminalService.open(widget, openerOptions);
        } catch (error) {
            if (TaskTerminalWidget.is(widget)) {
                widget.busy = false;
            }
            throw error;
        }
        const command = taskInfo && ProcessTaskInfo.is(taskInfo) ? taskInfo.command : undefined;
        if (TaskTerminalWidgetOpenerOptions.echoExecutedCommand(openerOptions) && command && command.length > 0) {
            if (widget.commandHistoryState) {
                widget.write('\x1b]133;prompt_started\x07');
            }
            widget.writeLine('\x1b[1m> ' + nls.localizeByDefault('Executing task: {0}', command) + ' <\x1b[0m\n');
        }
        return widget;
    }

    protected async getWidgetToRunTask(
        factoryOptions: TerminalWidgetFactoryOptions, openerOptions: TaskTerminalWidgetOpenerOptions
    ): Promise<{ isNew: boolean, widget: TerminalWidget }> {
        let reusableTerminalWidget: TerminalWidget | undefined;
        const taskConfig = openerOptions.taskInfo ? openerOptions.taskInfo.config : openerOptions.taskConfig;
        if (TaskTerminalWidgetOpenerOptions.isDedicatedTerminal(openerOptions)) {
            for (const widget of this.getTaskTerminalWidgets()) {
                // to run a task whose `taskPresentation === 'dedicated'`, the terminal to be reused must be
                // 1) dedicated, 2) idle, 3) the one that ran the same task
                if (widget.dedicated &&
                    !widget.busy &&
                    widget.taskConfig && taskConfig &&
                    this.taskDefinitionRegistry.compareTasks(taskConfig, widget.taskConfig)) {

                    reusableTerminalWidget = widget;
                    break;
                }
            }
        } else if (TaskTerminalWidgetOpenerOptions.isSharedTerminal(openerOptions)) {
            const availableWidgets: TerminalWidget[] = [];
            const group = taskConfig && TaskOutputPresentation.getGroup(taskConfig);
            for (const widget of this.getTaskTerminalWidgets()) {
                // to run a task whose `taskPresentation === 'shared'`, the terminal to be used must be
                // 1) not dedicated, 2) idle, and 3) used by a task of the same `presentation.group`
                if (!widget.dedicated && !widget.busy && this.getTerminalGroup(widget) === group) {
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
        const lastCwd = taskConfig?.options?.cwd ? new URI(taskConfig.options.cwd) : new URI();

        if (!reusableTerminalWidget) {
            const widget = await this.newTaskTerminal(factoryOptions, taskConfig);
            widget.lastCwd = lastCwd;
            this.claimTerminal(widget, taskConfig);
            return { isNew: true, widget };
        }
        reusableTerminalWidget.lastCwd = lastCwd;
        this.claimTerminal(reusableTerminalWidget, taskConfig);
        return { isNew: false, widget: reusableTerminalWidget };
    }

    /**
     * Marks the terminal as running the given task. A terminal is claimed when it is chosen for a task, rather than
     * once the task's process is attached, so that tasks started concurrently don't reuse it.
     */
    protected claimTerminal(widget: TerminalWidget, taskConfig: TaskConfiguration | undefined): void {
        if (taskConfig && TaskTerminalWidget.is(widget)) {
            widget.taskConfig = taskConfig;
            widget.dedicated = taskConfig.presentation?.panel === PanelKind.Dedicated;
            widget.busy = true;
        }
    }

    protected getTaskTerminalWidgets(): TaskTerminalWidget[] {
        return this.terminalService.all.filter(TaskTerminalWidget.is);
    }

    protected updateTerminalOnTaskExit(terminal: TaskTerminalWidget, showReuseMessage: boolean, closeOnFinish: boolean): void {
        terminal.busy = false;
        if (closeOnFinish) {
            terminal.close();
        } else if (showReuseMessage) {
            terminal.scrollToBottom();
            terminal.writeLine('\x1b[1m\n\r' + nls.localize('theia/task/terminalWillBeReusedByTasks', 'Terminal will be reused by tasks.') + '\x1b[0m\n');
        }
    }
}
