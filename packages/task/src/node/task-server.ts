/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, named } from 'inversify';
import { ILogger, Disposable, isWindows } from '@theia/core/lib/common/';
import { TaskClient, TaskExitedEvent, TaskInfo, TaskOptions, TaskServer } from '../common/task-protocol';
import { Task, TaskFactory } from './task';
import { RawProcess, RawProcessFactory, RawProcessOptions } from '@theia/process/lib/node/';
import { TerminalProcess, TerminalProcessFactory, TerminalProcessOptions } from '@theia/process/lib/node/';
import { TaskManager } from './task-manager';
import URI from "@theia/core/lib/common/uri";
import { FileUri } from "@theia/core/lib/node";
import * as fs from 'fs';
import * as path from 'path';

@injectable()
export class TaskServerImpl implements TaskServer {

    /** Task clients, to send notifications-to. */
    protected clients: TaskClient[] = [];
    /** Map of objects to dispose-of, per running task id */
    protected tasksToDispose = new Map<number, Disposable>();

    constructor(
        @inject(ILogger) @named('task') protected readonly logger: ILogger,
        @inject(RawProcessFactory) protected readonly rawProcessFactory: RawProcessFactory,
        @inject(TerminalProcessFactory) protected readonly terminalProcessFactory: TerminalProcessFactory,
        @inject(TaskManager) protected readonly taskManager: TaskManager,
        @inject(TaskFactory) protected readonly taskFactory: TaskFactory
    ) {
        taskManager.onDelete(id => {
            const toDispose = this.tasksToDispose.get(id);
            if (toDispose !== undefined) {
                toDispose.dispose();
                this.tasksToDispose.delete(id);
            }
        });
    }

    dispose() {
        // do nothing
    }

    getTasks(context?: string | undefined): Promise<TaskInfo[]> {
        const taskinfo: TaskInfo[] = [];

        const tasks = this.taskManager.getTasks(context);
        if (tasks !== undefined) {
            for (const task of tasks) {
                taskinfo.push(task.getRuntimeInfo());
            }
        }
        this.logger.debug(`getTasks(): about to return task information for ${taskinfo.length} tasks`);

        return Promise.resolve(taskinfo);
    }

    async run(options: TaskOptions, ctx?: string): Promise<TaskInfo> {
        // on windows, prefer windows-specific options, if available
        const processOptions = (isWindows && options.windowsProcessOptions !== undefined) ?
            options.windowsProcessOptions : options.processOptions;

        const command = processOptions.command;

        // sanity checks:
        // - we expect the cwd to be set by the client.
        // - we expect processType to be set by the client
        if (!options.cwd) {
            return Promise.reject(new Error("Can't run a task when 'cwd' is not provided by the client"));
        }
        if (!options.processType) {
            return Promise.reject(new Error("Can't run a task when 'processType' is not provided by the client"));
        }

        const cwd = FileUri.fsPath(options.cwd);
        // Use task's cwd with spawned process and pass node env object to
        // new process, so e.g. we can re-use the system path
        processOptions.options = {
            cwd: cwd,
            env: process.env
        };

        // When we create a process to execute a command, it's difficult to know if it failed
        // because the executable or script was not found, or if it was found, ran, and exited
        // unsuccessfully. So here we look to see if it seems we can find a file of that name
        // that is likely to be the one we want, before attempting to execute it.
        const cmd = await this.findCommand(command, cwd);
        if (cmd) {
            try {
                // use terminal or raw process
                let task: Task;
                let proc: TerminalProcess | RawProcess;

                if (options.processType === 'terminal') {
                    this.logger.debug('Task: creating underlying terminal process');
                    proc = this.terminalProcessFactory(<TerminalProcessOptions>processOptions);
                } else {
                    this.logger.debug('Task: creating underlying raw process');
                    proc = this.rawProcessFactory(<RawProcessOptions>processOptions);
                }

                task = this.taskFactory(
                    {
                        label: options.label,
                        command: cmd,
                        process: proc,
                        processType: options.processType,
                        context: ctx
                    });

                this.tasksToDispose.set(task.id,
                    proc.onExit(event => {
                        this.fireTaskExitedEvent({
                            'taskId': task.id,
                            'code': event.code,
                            'signal': event.signal,
                            'ctx': ctx === undefined ? '' : ctx
                        });
                    }));

                const taskInfo = task.getRuntimeInfo();

                this.fireTaskCreatedEvent(taskInfo);
                return taskInfo;

            } catch (error) {
                this.logger.error(`Error occurred while creating task: ${error}`);
                return Promise.reject(new Error(error));
            }
        } else {
            return Promise.reject(new Error(`Command not found: ${command}`));
        }
    }

    protected fireTaskExitedEvent(event: TaskExitedEvent) {
        this.logger.debug(log => log(`task has exited:`, event));

        this.clients.forEach(client => {
            client.onTaskExit(event);
        });
    }

    protected fireTaskCreatedEvent(event: TaskInfo) {
        this.logger.debug(log => log(`task created:`, event));

        this.clients.forEach(client => {
            client.onTaskCreated(event);
        });
    }

    /** Kill task for a given id. Rejects if task is not found */
    async kill(id: number): Promise<void> {
        const taskToKill = this.taskManager.get(id);
        if (taskToKill !== undefined) {
            this.logger.info(`Killing task id ${id}`);
            return taskToKill.kill();
        } else {
            this.logger.info(`Could not find task to kill, task id ${id}. Already terminated?`);
            return Promise.reject(`Could not find task to kill, task id ${id}. Already terminated?`);
        }
    }

    /** Adds a client to this server */
    setClient(client: TaskClient) {
        this.logger.debug(`a client has connected - adding it to the list:`);
        this.clients.push(client);
    }

    /** Removes a client, from this server */
    disconnectClient(client: TaskClient) {
        this.logger.debug(`a client has disconnected - removed from list:`);
        const idx = this.clients.indexOf(client);
        if (idx > -1) {
            this.clients.splice(idx, 1);
        }
    }

    /**
     * Uses heuristics to look-for a command. Will look into the system path, if the command
     * is given without a path. Will resolve if a potential match is found, else reject. There
     * is no guarantee that a command we find will be the one executed, if multiple commands with
     * the same name exist.
     * @param command command name to look for
     * @param cwd current working directory
     */
    protected async findCommand(command: string, cwd: string): Promise<string | undefined> {
        const systemPath = process.env.PATH;
        const pathDelimiter = path.delimiter;

        if (path.isAbsolute(command)) {
            if (await this.executableFileExists(command)) {
                return command;
            }
        } else {
            // look for command relative to cwd
            const resolvedCommand = FileUri.fsPath(new URI(cwd).resolve(command));

            if (await this.executableFileExists(resolvedCommand)) {
                return resolvedCommand;
            } else {
                // just a command to find in the system path?
                if (path.basename(command) === command) {
                    // search for this command in the system path
                    if (systemPath !== undefined) {
                        const pathArray: string[] = systemPath.split(pathDelimiter);

                        for (const p of pathArray) {
                            const candidate = FileUri.fsPath(new URI(p).resolve(command));
                            if (await this.executableFileExists(candidate)) {
                                return candidate;
                            }
                        }
                    }
                }
            }

        }
    }

    /**
     * Checks for the existence of a file, at the provided path, and make sure that
     * it's readable and executable.
     */
    protected async executableFileExists(filePath: string): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            fs.access(filePath, fs.constants.F_OK | fs.constants.X_OK, err => {
                resolve(err ? false : true);
            });
        });
    }
}
