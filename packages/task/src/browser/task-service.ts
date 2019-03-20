/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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

import { inject, injectable, named, postConstruct } from 'inversify';
import { EditorManager } from '@theia/editor/lib/browser';
import { ILogger } from '@theia/core/lib/common';
import { FrontendApplication, ApplicationShell } from '@theia/core/lib/browser';
import { TaskResolverRegistry, TaskProviderRegistry } from './task-contribution';
import { TERMINAL_WIDGET_FACTORY_ID, TerminalWidgetFactoryOptions } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { MessageService } from '@theia/core/lib/common/message-service';
import { TaskServer, TaskExitedEvent, TaskInfo, TaskConfiguration } from '../common/task-protocol';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { VariableResolverService } from '@theia/variable-resolver/lib/browser';
import { TaskWatcher } from '../common/task-watcher';
import { TaskConfigurationClient, TaskConfigurations } from './task-configurations';
import { ProvidedTaskConfigurations } from './provided-task-configurations';
import { Range } from 'vscode-languageserver-types';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class TaskService implements TaskConfigurationClient {
    /**
     * Reflects whether a valid task configuration file was found
     * in the current workspace, and is being watched for changes.
     */
    protected configurationFileFound: boolean = false;

    /**
     * The last executed task.
     */
    protected lastTask: { source: string, taskLabel: string } | undefined = undefined;

    @inject(FrontendApplication)
    protected readonly app: FrontendApplication;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(TaskServer)
    protected readonly taskServer: TaskServer;

    @inject(ILogger) @named('task')
    protected readonly logger: ILogger;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(TaskWatcher)
    protected readonly taskWatcher: TaskWatcher;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(TaskConfigurations)
    protected readonly taskConfigurations: TaskConfigurations;

    @inject(ProvidedTaskConfigurations)
    protected readonly providedTaskConfigurations: ProvidedTaskConfigurations;

    @inject(VariableResolverService)
    protected readonly variableResolverService: VariableResolverService;

    @inject(TaskResolverRegistry)
    protected readonly taskResolverRegistry: TaskResolverRegistry;

    @inject(TerminalService)
    protected readonly terminalService: TerminalService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    /**
     * @deprecated To be removed in 0.5.0
     */
    @inject(TaskProviderRegistry)
    protected readonly taskProviderRegistry: TaskProviderRegistry;

    @postConstruct()
    protected init(): void {
        this.workspaceService.onWorkspaceChanged(async roots => {
            this.configurationFileFound = (await Promise.all(roots.map(r => this.taskConfigurations.watchConfigurationFile(r.uri)))).some(result => !!result);
            const rootUris = roots.map(r => new URI(r.uri));
            const taskConfigFileUris = this.taskConfigurations.configFileUris.map(strUri => new URI(strUri));
            for (const taskConfigUri of taskConfigFileUris) {
                if (!rootUris.some(rootUri => !!rootUri.relative(taskConfigUri))) {
                    this.taskConfigurations.unwatchConfigurationFile(taskConfigUri.toString());
                    this.taskConfigurations.removeTasks(taskConfigUri.toString());
                }
            }
        });

        // notify user that task has started
        this.taskWatcher.onTaskCreated((event: TaskInfo) => {
            if (this.isEventForThisClient(event.ctx)) {
                this.messageService.info(`Task #${event.taskId} created - ${event.config.label}`);
            }
        });

        // notify user that task has finished
        this.taskWatcher.onTaskExit((event: TaskExitedEvent) => {
            if (!this.isEventForThisClient(event.ctx)) {
                return;
            }

            if (event.code !== undefined) {
                const message = `Task ${event.taskId} has exited with code ${event.code}.`;
                if (event.code === 0) {
                    this.messageService.info(message);
                } else {
                    this.messageService.error(message);
                }
            } else if (event.signal !== undefined) {
                this.messageService.info(`Task ${event.taskId} was terminated by signal ${event.signal}.`);
            } else {
                console.error('Invalid TaskExitedEvent received, neither code nor signal is set.');
            }
        });
    }

    /** Returns an array of the task configurations configured in tasks.json and provided by the extensions. */
    async getTasks(): Promise<TaskConfiguration[]> {
        const configuredTasks = this.getConfiguredTasks();
        const providedTasks = await this.getProvidedTasks();
        return [...configuredTasks, ...providedTasks];
    }

    /** Returns an array of the task configurations which are configured in tasks.json files */
    getConfiguredTasks(): TaskConfiguration[] {
        return this.taskConfigurations.getTasks();
    }

    /** Returns an array of the task configurations which are provided by the extensions. */
    getProvidedTasks(): Promise<TaskConfiguration[]> {
        return this.providedTaskConfigurations.getTasks();
    }

    /**
     * Returns a task configuration provided by an extension by task source and label.
     * If there are no task configuration, returns undefined.
     */
    getProvidedTask(source: string, label: string): TaskConfiguration | undefined {
        return this.providedTaskConfigurations.getTask(source, label);
    }

    /** Returns an array of running tasks 'TaskInfo' objects */
    getRunningTasks(): Promise<TaskInfo[]> {
        return this.taskServer.getTasks(this.getContext());
    }

    /** Returns an array of task types that are registered, including the default types */
    getRegisteredTaskTypes(): Promise<string[]> {
        return this.taskServer.getRegisteredTaskTypes();
    }

    /**
     * Get the last executed task.
     *
     * @returns the last executed task or `undefined`.
     */
    getLastTask(): { source: string, taskLabel: string } | undefined {
        return this.lastTask;
    }

    /**
     * Runs a task, by task configuration label.
     * Note, it looks for a task configured in tasks.json only.
     */
    async runConfiguredTask(source: string, taskLabel: string): Promise<void> {
        const task = this.taskConfigurations.getTask(source, taskLabel);
        if (!task) {
            this.logger.error(`Can't get task launch configuration for label: ${taskLabel}`);
            return;
        }
        this.run(task._source, task.label);
    }

    /**
     * Run the last executed task.
     */
    async runLastTask(): Promise<void> {
        if (!this.lastTask) {
            return;
        }
        const { source, taskLabel } = this.lastTask;
        return this.run(source, taskLabel);
    }

    /**
     * Runs a task, by the source and label of the task configuration.
     * It looks for configured and provided tasks.
     */
    async run(source: string, taskLabel: string): Promise<void> {
        let task = this.getProvidedTask(source, taskLabel);
        if (!task) {
            task = this.taskConfigurations.getTask(source, taskLabel);
            if (!task) {
                this.logger.error(`Can't get task launch configuration for label: ${taskLabel}`);
                return;
            }
        }

        const resolver = this.taskResolverRegistry.getResolver(task.type);
        let resolvedTask: TaskConfiguration;
        try {
            resolvedTask = resolver ? await resolver.resolveTask(task) : task;
        } catch (error) {
            this.logger.error(`Error resolving task '${taskLabel}': ${error}`);
            this.messageService.error(`Error resolving task '${taskLabel}': ${error}`);
            return;
        }

        let taskInfo: TaskInfo;
        try {
            taskInfo = await this.taskServer.run(resolvedTask, this.getContext());
            this.lastTask = { source, taskLabel };
        } catch (error) {
            const errorStr = `Error launching task '${taskLabel}': ${error.message}`;
            this.logger.error(errorStr);
            this.messageService.error(errorStr);
            return;
        }

        this.logger.debug(`Task created. Task id: ${taskInfo.taskId}`);

        // open terminal widget if the task is based on a terminal process (type: shell)
        if (taskInfo.terminalId !== undefined) {
            this.attach(taskInfo.terminalId, taskInfo.taskId);
        }
    }

    /**
     * Run selected text in the last active terminal.
     */
    async runSelectedText(): Promise<void> {
        if (!this.editorManager.currentEditor) { return; }
        const startLine = this.editorManager.currentEditor.editor.selection.start.line;
        const startCharacter = this.editorManager.currentEditor.editor.selection.start.character;
        const endLine = this.editorManager.currentEditor.editor.selection.end.line;
        const endCharacter = this.editorManager.currentEditor.editor.selection.end.character;
        let selectedRange: Range = Range.create(startLine, startCharacter, endLine, endCharacter);
        // if no text is selected, default to selecting entire line
        if (startLine === endLine && startCharacter === endCharacter) {
            selectedRange = Range.create(startLine, 0, endLine + 1, 0);
        }
        const selectedText: string = this.editorManager.currentEditor.editor.document.getText(selectedRange).trimRight() + '\n';
        let terminal = this.terminalService.currentTerminal;
        if (!terminal) {
            terminal = <TerminalWidget>await this.terminalService.newTerminal(<TerminalWidgetFactoryOptions>{ created: new Date().toString() });
            await terminal.start();
            this.terminalService.activateTerminal(terminal);
        }
        terminal.sendText(selectedText);
    }

    async attach(terminalId: number, taskId: number): Promise<void> {
        // create terminal widget to display an execution output of a Task that was launched as a command inside a shell
        const widget = <TerminalWidget>await this.widgetManager.getOrCreateWidget(
            TERMINAL_WIDGET_FACTORY_ID,
            <TerminalWidgetFactoryOptions>{
                created: new Date().toString(),
                id: 'task-' + taskId,
                caption: `Task #${taskId}`,
                label: `Task #${taskId}`,
                destroyTermOnClose: true
            }
        );
        this.shell.addWidget(widget, { area: 'bottom' });
        this.shell.activateWidget(widget.id);
        widget.start(terminalId);
    }

    protected isEventForThisClient(context: string | undefined): boolean {
        if (context === this.getContext()) {
            return true;
        }
        return false;
    }

    taskConfigurationChanged(event: string[]) {
        // do nothing for now
    }

    protected getContext(): string | undefined {
        return this.workspaceService.workspace && this.workspaceService.workspace.uri;
    }

    /** Kill task for a given id if task is found */
    async kill(id: number): Promise<void> {
        try {
            await this.taskServer.kill(id);
        } catch (error) {
            this.logger.error(`Error killing task '${id}': ${error}`);
            this.messageService.error(`Error killing task '${id}': ${error}`);
            return;
        }
        this.logger.debug(`Task killed. Task id: ${id}`);
    }
}
