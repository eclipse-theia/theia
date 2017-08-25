/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { ILogger } from '@theia/core/lib/common';
import { FrontendApplication } from '@theia/core/lib/browser';
import { TaskServer, TaskExitedEvent, TaskOptions, TaskInfo } from '../common/task-protocol';
import { TERMINAL_WIDGET_FACTORY_ID, TerminalWidgetFactoryOptions } from '@theia/terminal/lib/browser/terminal-widget';
import { WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { TaskWatcher } from '../common/task-watcher';
import { MessageService } from '@theia/core/lib/common/message-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { TaskConfigurations, TaskConfigurationClient } from './task-configurations';
import { TerminalWidget } from '@theia/terminal/lib/browser/terminal-widget';

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
        @inject(TaskServer) protected readonly taskServer: TaskServer,
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
        @inject(TaskWatcher) protected readonly taskWatcher: TaskWatcher,
        @inject(MessageService) protected readonly messageService: MessageService,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(TaskConfigurations) protected readonly taskConfigurations: TaskConfigurations
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
            taskInfo = await this.taskServer.run(this.prepareTaskConfiguration(task), this.getContext());
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
     * sane default values.
     */
    protected prepareTaskConfiguration(task: TaskOptions): TaskOptions {
        if (task.cwd) {
            if (this.workspaceRootUri) {
                task.cwd = task.cwd.replace(/\$workspace/gi, this.workspaceRootUri);
            }
        } else if (this.workspaceRootUri) {
            // if "cwd' is not set in task launch config. Let's use the workspace root
            // as default
            task.cwd = this.workspaceRootUri;
        }

        if (!task.processType) {
            task.processType = 'terminal';
        }
        return task;
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
