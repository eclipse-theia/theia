// *****************************************************************************
// Copyright (C) 2017 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { injectable, inject, named } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/';
import { Process, IProcessExitEvent } from '@theia/process/lib/node';
import { Task, TaskOptions } from '../task';
import { TaskManager } from '../task-manager';
import { ProcessType, ProcessTaskInfo } from '../../common/process/task-protocol';
import { TaskExitedEvent } from '../../common/task-protocol';

// copied from https://github.com/Microsoft/vscode/blob/1.33.1/src/vs/base/common/strings.ts
// Escape codes
// http://en.wikipedia.org/wiki/ANSI_escape_code
const EL = /\x1B\x5B[12]?K/g; // Erase in line
const COLOR_START = /\x1b\[\d+(;\d+)*m/g; // Color
const COLOR_END = /\x1b\[0?m/g; // Color

export function removeAnsiEscapeCodes(str: string): string {
    if (str) {
        str = str.replace(EL, '');
        str = str.replace(COLOR_START, '');
        str = str.replace(COLOR_END, '');
    }

    return str.trimRight();
}

export const TaskProcessOptions = Symbol('TaskProcessOptions');
export interface TaskProcessOptions extends TaskOptions {
    process: Process;
    processType: ProcessType;
    command?: string;
}

export const TaskFactory = Symbol('TaskFactory');
export type TaskFactory = (options: TaskProcessOptions) => ProcessTask;

/** Represents a Task launched as a process by `ProcessTaskRunner`. */
@injectable()
export class ProcessTask extends Task {

    protected command: string | undefined;

    constructor(
        @inject(TaskManager) taskManager: TaskManager,
        @inject(ILogger) @named('task') logger: ILogger,
        @inject(TaskProcessOptions) protected override readonly options: TaskProcessOptions
    ) {
        super(taskManager, logger, options);

        const toDispose = this.process.onClose(async event => {
            toDispose.dispose();
            this.fireTaskExited(await this.getTaskExitedEvent(event));
        });

        // Buffer to accumulate incoming output.
        let dataBuffer: string = '';
        this.process.outputStream.on('data', (chunk: string) => {
            dataBuffer += chunk;

            while (1) {
                // Check if we have a complete line.
                const eolIdx = dataBuffer.indexOf('\n');
                if (eolIdx < 0) {
                    break;
                }

                // Get and remove the line from the data buffer.
                const lineBuf = dataBuffer.slice(0, eolIdx);
                dataBuffer = dataBuffer.slice(eolIdx + 1);
                const processedLine = removeAnsiEscapeCodes(lineBuf);
                this.fireOutputLine({
                    taskId: this.taskId,
                    ctx: this.context,
                    line: processedLine
                });
            }
        });

        this.command = this.options.command;
        this.logger.info(`Created new task, id: ${this.id}, process id: ${this.options.process.id}, OS PID: ${this.process.pid}, context: ${this.context}`);
    }

    kill(): Promise<void> {
        return new Promise<void>(resolve => {
            if (this.process.killed) {
                resolve();
            } else {
                const toDispose = this.process.onClose(event => {
                    toDispose.dispose();
                    resolve();
                });
                this.process.kill();
            }
        });
    }

    protected async getTaskExitedEvent(evt: IProcessExitEvent): Promise<TaskExitedEvent> {
        return {
            taskId: this.taskId,
            ctx: this.context,
            code: evt.code,
            signal: evt.signal,
            config: this.options.config,
            terminalId: this.process.id,
            processId: this.process.id
        };
    }

    getRuntimeInfo(): ProcessTaskInfo {
        return {
            taskId: this.id,
            ctx: this.context,
            config: this.options.config,
            terminalId: this.process.id,
            processId: this.process.id,
            command: this.command
        };
    }

    get process(): Process {
        return this.options.process;
    }

    get processType(): ProcessType {
        return this.options.processType;
    }
}
