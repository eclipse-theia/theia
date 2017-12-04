
/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { MessageConnection } from "vscode-jsonrpc";

const THEIA_PARENT_PID = 'THEIA_PARENT_PID';
const THEIA_ENTRY_POINT = 'THEIA_ENTRY_POINT';

export type IPCEntryPoint = (connection: MessageConnection) => void;

/**
 * Exit the current process if the parent process is not alive.
 * Relevant only for some OS, like Windows
 */
export function checkParentAlive(): void {
    if (process.env[THEIA_PARENT_PID]) {
        const parentPid = Number(process.env[THEIA_PARENT_PID]);

        if (typeof parentPid === 'number' && !isNaN(parentPid)) {
            setInterval(() => {
                try {
                    // throws an exception if the main process doesn't exist anymore.
                    process.kill(parentPid, 0);
                } catch {
                    process.exit();
                }
            }, 5000);
        }
    }
}

export const ipcEntryPoint = process.env[THEIA_ENTRY_POINT];

export function createIpcEnv(options?: {
    entryPoint?: string
    env?: NodeJS.ProcessEnv
}): NodeJS.ProcessEnv {
    const op = Object.assign({}, options);
    const childEnv = Object.assign({}, op.env);
    childEnv[THEIA_PARENT_PID] = String(process.pid);
    childEnv[THEIA_ENTRY_POINT] = op.entryPoint;
    return childEnv;
}
