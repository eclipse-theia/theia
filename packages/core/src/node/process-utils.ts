// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

import * as cp from 'child_process';
import { injectable } from 'inversify';

/**
 * `@theia/core` service with some process-related utilities.
 */
@injectable()
export class ProcessUtils {

    terminateProcessTree(ppid: number): void {
        if (process.platform === 'win32') {
            this.winTerminateProcessTree(ppid);
        } else {
            this.unixTerminateProcessTree(ppid);
        }
    }

    protected winTerminateProcessTree(ppid: number): void {
        this.spawnSync('taskkill.exe', ['/f', '/t', '/pid', ppid.toString(10)]);
    }

    protected unixTerminateProcessTree(ppid: number): void {
        for (const pid of this.unixGetChildrenRecursive(ppid)) {
            // Prevent killing the current process:
            if (pid !== process.pid) {
                // Don't stop if a process fails to be killed (keep on killing the others):
                try {
                    process.kill(pid);
                } catch (error) {
                    console.error(error);
                }
            }
        }
        if (ppid === this.unixGetPGID(ppid)) {
            // When a process pgid === pid this means the the process is a group leader.
            // We can then kill every process part of its group by doing `kill(-pgid)`.
            // This can catch leaked processes under `init` that are still part of the group.
            process.kill(-ppid);
        }
        process.kill(ppid);
    }

    protected unixGetPGID(pid: number): number {
        const { stdout } = this.spawnSync('ps', ['-p', pid.toString(10), '-o', 'pgid=']);
        return Number.parseInt(stdout, 10);
    }

    protected unixGetChildrenRecursive(ppid: number): Set<number> {
        const { stdout } = this.spawnSync('ps', ['ax', '-o', 'ppid=,pid=']);
        const pids = new Set<number>([ppid]);
        const matcher = /(\d+)\s+(\d+)/;
        const psList = stdout
            .trim()
            .split('\n')
            .map(line => {
                const match = line.match(matcher)!;
                return {
                    ppid: Number.parseInt(match[1], 10),
                    pid: Number.parseInt(match[2], 10),
                };
            });
        // Keep looking for parent/child relationships while we keep finding new parents:
        let size; do {
            size = pids.size;
            for (const child of psList) {
                if (pids.has(child.ppid)) {
                    pids.add(child.pid);
                }
            }
        } while (size !== pids.size);
        // Exclude the requested parent id:
        pids.delete(ppid);
        return pids;
    }

    protected spawnSync(file: string, argv: string[], options?: cp.SpawnSyncOptions): cp.SpawnSyncReturns<string> {
        const result = cp.spawnSync(file, argv, { ...options, encoding: 'utf8' });
        if (result.error) {
            throw result.error;
        }
        if (result.status !== 0) {
            throw new Error(`${JSON.stringify(file)} exited with ${result.status ?? result.signal}. Output:\n${JSON.stringify(result.output)}`);
        }
        return result;
    }
}
