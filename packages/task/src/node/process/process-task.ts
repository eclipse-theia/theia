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

/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import { injectable, inject, named } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/';
import { Terminal, TerminalExitEvent } from '@theia/process/lib/node';
import { Task, TaskOptions } from '../task';
import { TaskManager } from '../task-manager';
import { ProcessType, ProcessTaskInfo } from '../../common/process/task-protocol';
import { TaskExitedEvent } from '../../common/task-protocol';

// Copied from https://github.com/Microsoft/vscode/blob/1.33.1/src/vs/base/common/strings.ts
// See escape codes: http://en.wikipedia.org/wiki/ANSI_escape_code
const EL = /\x1B\x5B[12]?K/g; // Erase in line
const COLOR_START = /\x1b\[\d+(;\d+)*m/g;
const COLOR_END = /\x1b\[0?m/g;

export function removeAnsiEscapeCodes(str: string): string {
    if (str) {
        str = str.replace(EL, '');
        str = str.replace(COLOR_START, '');
        str = str.replace(COLOR_END, '');
    }
    return str.trimRight();
}

export const TerminalTaskOptions = Symbol('TerminalTaskOptions');
export interface TerminalTaskOptions extends TaskOptions {
    terminal: Terminal;
    processType: ProcessType;
    command?: string;
}

export const TaskFactory = Symbol('TaskFactory');
export type TaskFactory = (options: TerminalTaskOptions) => TerminalTask;

/**
 * Represents a Task launched as a process by `ProcessTaskRunner`.
 */
@injectable()
export class TerminalTask extends Task {

    constructor(
        @inject(TaskManager) protected readonly taskManager: TaskManager,
        @inject(ILogger) @named('task') protected readonly logger: ILogger,
        @inject(TerminalTaskOptions) protected readonly options: TerminalTaskOptions
    ) {
        super(taskManager, logger, options);
        this.attachOnData();
        this.terminal.onClose(close => {
            this.getTaskExitedEvent(close).then(event => this.fireTaskExited(event));
        });
        this.logger.info(`Created new task, id: ${this.id}, process id: ${this.options.terminal._id}, OS PID: ${this.terminal.info.pid}, context: ${this.context}`);
    }

    get terminal(): Terminal {
        return this.options.terminal;
    }

    get processType(): ProcessType {
        return this.options.processType;
    }

    protected get command(): string | undefined {
        return this.options.command;
    }

    kill(): Promise<void> {
        return new Promise<void>(resolve => {
            if (this.terminal.exitStatus === undefined) {
                this.terminal.onClose(() => resolve());
                this.terminal.kill();
            } else {
                resolve();
            }
        });
    }

    getRuntimeInfo(): ProcessTaskInfo {
        return {
            taskId: this.id,
            ctx: this.context,
            config: this.options.config,
            terminalId: this.terminal._id,
            command: this.command
        };
    }

    protected attachOnData(): void {
        // Buffer to accumulate incoming output.
        let dataBuffer: string = '';
        this.terminal.onData(chunk => {
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
    }

    protected async getTaskExitedEvent(event: TerminalExitEvent): Promise<TaskExitedEvent> {
        return {
            taskId: this.taskId,
            ctx: this.context,
            code: event.code!,
            signal: event.signal!,
            config: this.options.config,
            terminalId: this.terminal._id,
        };
    }
}
