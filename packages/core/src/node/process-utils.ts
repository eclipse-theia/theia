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
import * as path from 'path';
import { injectable, inject, named } from 'inversify';
import { ILogger } from '../common/logger.js';

/**
 * How long to wait for PowerShell to list child processes before giving up, in milliseconds.
 */
const WIN_LIST_CHILDREN_TIMEOUT_MS = 5000;

/**
 * Options for running PowerShell to list child processes.
 */
const WIN_LIST_CHILDREN_OPTIONS = { windowsHide: true, timeout: WIN_LIST_CHILDREN_TIMEOUT_MS };

/**
 * `@theia/core` service with some process-related utilities.
 */
@injectable()
export class ProcessUtils {

    @inject(ILogger) @named('core:ProcessUtils')
    protected readonly logger: ILogger;

    /**
     * Kills the given process together with all of its descendants.
     *
     * This blocks the event loop, so that it can run in an `exit` handler, where the loop is no longer
     * available. Prefer {@link terminateChildProcessTrees} while the event loop is running, as listing
     * the descendants of a process can be slow, in particular on Windows.
     */
    terminateProcessTree(ppid: number): void {
        if (process.platform === 'win32') {
            this.winTerminateProcessTree(ppid);
        } else {
            this.unixTerminateProcessTree(ppid);
        }
    }

    /**
     * Kills all of the descendants of the given process, but not the process itself, without blocking
     * the event loop.
     *
     * @throws if the descendants of the process cannot be listed
     */
    async terminateChildProcessTrees(ppid: number): Promise<void> {
        if (process.platform === 'win32') {
            await this.winTerminateChildProcessTrees(ppid);
        } else {
            await this.unixTerminateChildProcessTrees(ppid);
        }
    }

    protected winTerminateProcessTree(ppid: number): void {
        if (ppid !== process.pid) {
            this.winTaskkillTrees([ppid]);
            return;
        }
        // `taskkill /t` always kills the root of the tree as well. Killing the current process
        // with `/f` terminates it with exit code 1, overriding the exit code that it may be
        // exiting with, so only kill the trees of its children, as on Unix.
        let childPids: number[];
        try {
            childPids = this.winGetChildPids(ppid);
        } catch (error) {
            // Without the list of children, killing the whole tree is the only way to avoid leaking
            // child processes, at the cost of the current process exiting with code 1.
            this.logger.warn(`Failed to list the child processes of PID ${ppid}, killing its whole tree`, error);
            this.winTaskkillTrees([ppid]);
            return;
        }
        if (childPids.length > 0) {
            this.winTaskkillTrees(childPids);
        }
    }

    protected async winTerminateChildProcessTrees(ppid: number): Promise<void> {
        const childPids = await this.winGetChildPidsAsync(ppid);
        if (childPids.length > 0) {
            // `taskkill` is quick, unlike PowerShell, so running it synchronously is fine here too.
            this.winTaskkillTrees(childPids);
        }
    }

    /**
     * Forcefully kills the given processes together with all of their descendants.
     */
    protected winTaskkillTrees(pids: number[]): void {
        const pidArgs = pids.flatMap(pid => ['/pid', pid.toString(10)]);
        // Not `this.spawnSync`, which throws on a non-zero exit code that is expected here.
        const result = cp.spawnSync('taskkill.exe', ['/f', '/t', ...pidArgs], { encoding: 'utf8' });
        if (result.error) {
            throw result.error;
        }
        // taskkill may exit with a non-zero code when some child processes have already exited.
        // This is expected during shutdown — log but don't throw.
        if (result.status !== 0) {
            this.logger.warn(`taskkill.exe exited with ${result.status} for PIDs ${pids.join(', ')}. Output:\n${JSON.stringify(result.output)}`);
        }
    }

    /**
     * @returns the PIDs of the direct children of the given process, see {@link winGetChildPidsArgs}
     */
    protected winGetChildPids(ppid: number): number[] {
        const { stdout } = this.spawnSync(this.winGetPowerShellPath(), this.winGetChildPidsArgs(ppid), WIN_LIST_CHILDREN_OPTIONS);
        return this.winParsePids(stdout);
    }

    /**
     * @returns the PIDs of the direct children of the given process, see {@link winGetChildPidsArgs}
     */
    protected async winGetChildPidsAsync(ppid: number): Promise<number[]> {
        const { stdout } = await this.execFile(this.winGetPowerShellPath(), this.winGetChildPidsArgs(ppid), WIN_LIST_CHILDREN_OPTIONS);
        return this.winParsePids(stdout);
    }

    /**
     * @returns the arguments of a PowerShell command that prints the PIDs of the direct children of the
     * given process, one per line, except for:
     * - the PowerShell process that lists them, which is a child of the current process and exits right after
     * - the console host (`conhost.exe`) that Windows attaches to a process launched without a console,
     *   which `taskkill` may fail to kill
     * - processes created before the given process: Windows does not update the parent of a process
     *   when the parent exits and reuses PIDs, so these are the orphans of a previous process with the same PID
     */
    protected winGetChildPidsArgs(ppid: number): string[] {
        const pid = ppid.toString(10);
        return [
            '-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
            `$parent = Get-CimInstance -ClassName Win32_Process -Filter 'ProcessId=${pid}';`
            + ` Get-CimInstance -ClassName Win32_Process -Filter 'ParentProcessId=${pid}'`
            + " | Where-Object { $_.ProcessId -ne $PID -and $_.Name -ne 'conhost.exe' -and $_.CreationDate -ge $parent.CreationDate }"
            + ' | ForEach-Object { $_.ProcessId }'
        ];
    }

    /**
     * @param output the output of the command of {@link winGetChildPidsArgs}
     */
    protected winParsePids(output: string): number[] {
        return output
            .split(/\s+/)
            .filter(token => /^\d+$/.test(token))
            .map(token => Number.parseInt(token, 10));
    }

    /**
     * @returns the absolute path of Windows PowerShell, so that it does not depend on the `PATH`,
     * or just its name if the Windows directory is unknown.
     */
    protected winGetPowerShellPath(): string {
        const systemRoot = process.env.SystemRoot;
        if (!systemRoot) {
            return 'powershell.exe';
        }
        // `v1.0` is not the version: all versions of Windows PowerShell, up to the final 5.1, are installed
        // in this directory. PowerShell 7 and later are a separate, optional installation (`pwsh.exe`).
        return path.win32.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    }

    protected unixTerminateProcessTree(ppid: number): void {
        for (const pid of this.unixGetChildrenRecursive(ppid)) {
            // Prevent killing the current process:
            if (pid !== process.pid) {
                this.unixKill(pid);
            }
        }
        if (ppid === this.unixGetPGID(ppid)) {
            // When a process pgid === pid this means the the process is a group leader.
            // We can then kill every process part of its group by doing `kill(-pgid)`.
            // This can catch leaked processes under `init` that are still part of the group.
            this.unixKill(-ppid);
        }
        this.unixKill(ppid);
    }

    protected async unixTerminateChildProcessTrees(ppid: number): Promise<void> {
        const { stdout } = await this.execFile('ps', ['ax', '-o', 'ppid=,pid=']);
        for (const pid of this.unixParseChildrenRecursive(stdout, ppid)) {
            // Prevent killing the current process:
            if (pid !== process.pid) {
                this.unixKill(pid);
            }
        }
    }

    protected unixKill(pid: number): void {
        try {
            process.kill(pid);
        } catch (error) {
            // ESRCH means the process is already gone, which is the goal here. Log
            // anything else but keep going so the rest of the tree is still killed.
            if ((error as NodeJS.ErrnoException | undefined)?.code !== 'ESRCH') {
                this.logger.error(`[${pid}] failed to kill`, error);
            }
        }
    }

    protected unixGetPGID(pid: number): number {
        const { stdout } = this.spawnSync('ps', ['-p', pid.toString(10), '-o', 'pgid=']);
        return Number.parseInt(stdout, 10);
    }

    protected unixGetChildrenRecursive(ppid: number): Set<number> {
        const { stdout } = this.spawnSync('ps', ['ax', '-o', 'ppid=,pid=']);
        return this.unixParseChildrenRecursive(stdout, ppid);
    }

    /**
     * @param psOutput the output of `ps ax -o ppid=,pid=`
     * @returns the PIDs of all of the descendants of the given process
     */
    protected unixParseChildrenRecursive(psOutput: string, ppid: number): Set<number> {
        const pids = new Set<number>([ppid]);
        const matcher = /(\d+)\s+(\d+)/;
        const psList = psOutput
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

    /**
     * Runs the given executable without blocking the event loop.
     *
     * @throws if the executable cannot be run or exits with a non-zero code, or on timeout
     */
    protected execFile(file: string, argv: string[], options?: cp.ExecFileOptions): Promise<{ stdout: string, stderr: string }> {
        return new Promise((resolve, reject) => {
            cp.execFile(file, argv, { ...options, encoding: 'utf8' }, (error, stdout, stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve({ stdout, stderr });
                }
            });
        });
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
