/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, named } from "inversify";
import { ILogger } from '@theia/core/lib/common';
import { FrontendApplication, ApplicationShell } from '@theia/core/lib/browser';
import { TaskServer, TaskExitedEvent, TaskOptions, TaskInfo } from '../common/task-protocol';
import { TERMINAL_WIDGET_FACTORY_ID, TerminalWidgetFactoryOptions } from '@theia/terminal/lib/browser/terminal-widget';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { TaskWatcher } from '../common/task-watcher';
import { MessageService } from '@theia/core/lib/common/message-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { TaskConfigurations, TaskConfigurationClient } from './task-configurations';
import { TerminalWidget } from '@theia/terminal/lib/browser/terminal-widget';
import { VariableResolverService } from "@theia/variable-resolver/lib/browser";
import { ProcessOptions } from "@theia/process/lib/node";

@injectable()
export class TaskService implements TaskConfigurationClient {

    protected workspaceRootUri: string | undefined = undefined;
    /**
     * Reflects whether a valid task configuration file was found
     * in the current workspace, and is being watched for changes.
     */
    protected configurationFileFound: boolean = false;

    constructor(
        @inject(FrontendApplication) protected readonly app: FrontendApplication,
        @inject(ApplicationShell) protected readonly shell: ApplicationShell,
        @inject(TaskServer) protected readonly taskServer: TaskServer,
        @inject(ILogger) @named('task') protected readonly logger: ILogger,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
        @inject(TaskWatcher) protected readonly taskWatcher: TaskWatcher,
        @inject(MessageService) protected readonly messageService: MessageService,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(TaskConfigurations) protected readonly taskConfigurations: TaskConfigurations,
        @inject(VariableResolverService) protected readonly variableResolverService: VariableResolverService
    ) {
        // wait for the workspace root to be set
        this.workspaceService.root.then(async root => {
            if (root) {
                this.configurationFileFound = await this.taskConfigurations.watchConfigurationFile(root.uri);
                this.workspaceRootUri = root.uri;
            }
        });

        // notify user that task has started
        this.taskWatcher.onTaskCreated((event: TaskInfo) => {
            if (this.isEventForThisClient(event.ctx)) {
                this.messageService.info(`Task #${event.taskId} created - ${event.label}`);
            }
        });

        // notify user that task has finished
        this.taskWatcher.onTaskExit((event: TaskExitedEvent) => {
            const signal = event.signal;
            if (!this.isEventForThisClient(event.ctx)) {
                return;
            }

            if (event.code === 0) {  // normal process exit
                let success = '';

                // this finer breakdown will not work on Windows.
                if (signal && signal !== '0') {
                    if (signal === '1') {
                        success = 'Terminal Hangup received - ';
                    } else if (signal === '2') {
                        success = 'User Interrupt received - ';
                    } else if (signal === '15' || signal === 'SIGTERM') {
                        success = 'Termination Interrupt received - ';
                    } else {
                        success = 'Interrupt received - ';
                    }
                } else {
                    success = 'Success - ';
                }

                success += `Task ${event.taskId} has finished. exit code: ${event.code}, signal: ${event.signal}`;
                this.messageService.info(success);
            } else {  // abnormal process exit
                this.messageService.error(`Error: Task ${event.taskId} failed. Exit code: ${event.code}, signal: ${event.signal}`);
            }
        });
    }

    /** returns an array of known task configuration labels */
    getTasks(): string[] {
        return this.taskConfigurations.getTaskLabels();
    }

    /** Returns an array of running tasks 'TaskInfo' objects */
    getRunningTasks(): Promise<TaskInfo[]> {
        return this.taskServer.getTasks(this.getContext());
    }

    /** runs a task, by task configuration label */
    async run(taskName: string): Promise<void> {
        let taskInfo: TaskInfo;
        const task = this.taskConfigurations.getTask(taskName);
        if (!task) {
            this.logger.error(`Can't get task launch configuration for label: ${taskName}`);
            return;
        }

        try {
            taskInfo = await this.taskServer.run(await this.prepareTaskConfiguration(task), this.getContext());
        } catch (error) {
            this.logger.error(`Error launching task '${taskName}': ${error}`);
            this.messageService.error(`Error launching task '${taskName}': ${error}`);
            return;
        }

        this.logger.debug(`Task created. task id: ${taskInfo.taskId}, OS ProcessId: ${taskInfo.osProcessId} `);

        // open terminal widget if the task is based on a terminal process:
        if (taskInfo.terminalId !== undefined) {
            this.attach(taskInfo.terminalId, taskInfo.taskId);
        }
    }

    /**
     * Perform some adjustments to the task launch configuration, before sending
     * it to the backend to be executed. We can make sure that parameters that
     * are optional to the user but required by the server will be defined, with
     * sane default values. Also, resolve all known variables, e.g. `${workspaceFolder}`.
     */
    protected async prepareTaskConfiguration(task: TaskOptions): Promise<TaskOptions> {
        const resultTask: TaskOptions = {
            label: task.label,
            processType: task.processType ? task.processType : 'terminal',
            processOptions: await this.resolveVariablesInOptions(task.processOptions)
        };
        if (task.windowsProcessOptions) {
            resultTask.windowsProcessOptions = await this.resolveVariablesInOptions(task.windowsProcessOptions);
        }
        resultTask.cwd = await this.variableResolverService.resolve(task.cwd ? task.cwd : '${workspaceFolder}');
        return resultTask;
    }

    /**
     * Resolve the variables in the given process options.
     */
    protected async resolveVariablesInOptions(options: ProcessOptions): Promise<ProcessOptions> {
        const resultOptions: ProcessOptions = {
            command: await this.variableResolverService.resolve(options.command)
        };
        if (options.args) {
            resultOptions.args = await this.variableResolverService.resolveArray(options.args);
        }
        resultOptions.options = options.options;
        return resultOptions;
    }

    async attach(terminalId: number, taskId: number): Promise<void> {
        // create terminal widget to display task's execution output
        const widget = <TerminalWidget>await this.widgetManager.getOrCreateWidget(
            TERMINAL_WIDGET_FACTORY_ID,
            <TerminalWidgetFactoryOptions>{
                created: new Date().toString(),
                id: 'task-' + taskId,
                caption: `Task #${taskId}`,
                label: `Task #${taskId}`,
                destroyTermOnClose: true
            });
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
        return this.workspaceRootUri;
    }
}
