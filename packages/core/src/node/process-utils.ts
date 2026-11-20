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
 * The arguments of `ps` that list all processes with their parent, process group and start time.
 * `lstart` goes last, as it contains spaces.
 */
const UNIX_LIST_PROCESSES_ARGS = ['-A', '-o', 'pid=,ppid=,pgid=,lstart='];

/**
 * How long to wait for `ps` to list all processes before giving up, in milliseconds.
 */
const UNIX_LIST_PROCESSES_TIMEOUT_MS = 1000;

/**
 * How often to check whether processes that were sent `SIGTERM` have exited, in milliseconds.
 */
const UNIX_FORCE_KILL_POLL_INTERVAL_MS = 100;

/**
 * A process as listed by `ps`.
 */
export interface UnixProcessInfo {
    pid: number;
    ppid: number;
    pgid: number;
    /**
     * As printed by `ps`. Only meant to be compared with another listing, to tell a process apart from a later
     * one with the same PID.
     */
    startTime: string;
}

/**
 * A process that was sent `SIGTERM` and is killed with `SIGKILL` if it is still running at its deadline.
 */
export interface UnixForceKillTarget {
    startTime: string;
    /**
     * In milliseconds, on the monotonic clock of `performance.now()`.
     */
    deadline: number;
}

/**
 * `@theia/core` service with some process-related utilities.
 */
@injectable()
export class ProcessUtils {

    @inject(ILogger) @named('core:ProcessUtils')
    protected readonly logger: ILogger;

    /**
     * How long the processes of a tree have to exit after `SIGTERM` before they are killed with `SIGKILL`,
     * in milliseconds, see {@link unixTerminateProcessTree}.
     */
    protected readonly unixForceKillDelay: number = 5000;

    /**
     * How long {@link terminateChildProcessTrees} waits for processes to exit after `SIGTERM` before it kills
     * them with `SIGKILL`, in milliseconds, measured from the start of the call. It is shorter than
     * {@link unixForceKillDelay}, as it delays the exit of the current process. Listing the processes before
     * `SIGKILL` can take up to another second.
     */
    protected readonly unixChildProcessTreesForceKillDelay: number = 2000;

    /**
     * The processes that were sent `SIGTERM` and are to be killed with `SIGKILL` if they are still running
     * at their deadline, by PID.
     */
    protected readonly unixForceKillTargets = new Map<number, UnixForceKillTarget>();

    /**
     * The timer of {@link unixScheduleForceKill}.
     */
    protected unixForceKillTimer: ReturnType<typeof setTimeout> | undefined;

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
     * the event loop. On Unix, it resolves once the processes have exited, or have been killed with `SIGKILL`
     * after {@link unixChildProcessTreesForceKillDelay}.
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

    /**
     * Sends `SIGTERM` to the given process, its descendants and, if it leads a process group, the members of
     * its group. Those that are still running {@link unixForceKillDelay} later are then killed with `SIGKILL`.
     *
     * The tree of the current process is only terminated when it exits, so its own processes only get `SIGTERM`.
     * The processes of earlier trees that are still waiting for their deadline are killed with `SIGKILL` right
     * away instead, as they would outlive the current process otherwise.
     */
    protected unixTerminateProcessTree(ppid: number): void {
        if (ppid === process.pid) {
            this.unixForceKillPendingTargets();
        }
        const processes = ppid === process.pid ? undefined : this.unixTryListProcesses();
        if (!processes) {
            this.unixSendSigterm(ppid, this.unixGetChildrenRecursive(ppid), ppid === this.unixGetPGID(ppid));
            return;
        }
        const isGroupLeader = processes.get(ppid)?.pgid === ppid;
        const descendants = this.unixGetDescendants(processes.values(), ppid);
        this.unixSendSigterm(ppid, descendants, isGroupLeader);
        const groupMembers = isGroupLeader ? this.unixGetGroupMembers(processes, ppid) : [];
        this.unixAddForceKillTargets(processes, [ppid, ...descendants, ...groupMembers], performance.now() + this.unixForceKillDelay);
        this.unixScheduleForceKill();
    }

    protected unixSendSigterm(ppid: number, descendants: Iterable<number>, isGroupLeader: boolean): void {
        this.unixSendSigtermToAll(descendants);
        if (isGroupLeader) {
            // When a process pgid === pid this means the the process is a group leader.
            // We can then kill every process part of its group by doing `kill(-pgid)`.
            // This can catch leaked processes under `init` that are still part of the group.
            this.unixKill(-ppid);
        }
        this.unixKill(ppid);
    }

    /**
     * Sends `SIGTERM` to the descendants of the given process and, if it leads a process group, to the other
     * members of its group, which may have been reparented. The ones that are still running
     * {@link unixChildProcessTreesForceKillDelay} after the call started are killed with `SIGKILL`, together
     * with the processes of earlier calls of {@link unixTerminateProcessTree} that are still running.
     */
    protected async unixTerminateChildProcessTrees(ppid: number): Promise<void> {
        const deadline = performance.now() + this.unixChildProcessTreesForceKillDelay;
        let processes: Map<number, UnixProcessInfo>;
        try {
            processes = await this.unixListProcessesAsync();
        } catch (error) {
            this.logger.warn('Failed to list the start times of processes, child processes will only be sent SIGTERM', error);
            const { stdout } = await this.execFile('ps', ['ax', '-o', 'ppid=,pid='], { timeout: UNIX_LIST_PROCESSES_TIMEOUT_MS });
            this.unixSendSigtermToAll(this.unixParseChildrenRecursive(stdout, ppid));
            return;
        }
        const pids = this.unixGetDescendants(processes.values(), ppid);
        if (processes.get(ppid)?.pgid === ppid) {
            this.unixGetGroupMembers(processes, ppid).forEach(pid => pids.add(pid));
            pids.delete(ppid);
        }
        this.unixSendSigtermToAll(pids);
        this.unixAddForceKillTargets(processes, pids, deadline);
        for (const target of this.unixForceKillTargets.values()) {
            target.deadline = Math.min(target.deadline, deadline);
        }
        await this.unixWaitForForceKillTargets(deadline);
        await this.unixForceKillDueTargets();
    }

    protected unixSendSigtermToAll(pids: Iterable<number>): void {
        for (const pid of pids) {
            // Prevent killing the current process:
            if (pid !== process.pid) {
                this.unixKill(pid);
            }
        }
    }

    /**
     * Records the given processes as {@link unixForceKillTargets}, except for the current process. A process
     * that is already recorded keeps its earlier deadline.
     */
    protected unixAddForceKillTargets(processes: Map<number, UnixProcessInfo>, pids: Iterable<number>, deadline: number): void {
        for (const pid of pids) {
            const info = processes.get(pid);
            if (pid === process.pid || !info) {
                continue;
            }
            const existing = this.unixForceKillTargets.get(pid);
            if (existing?.startTime === info.startTime && existing.deadline <= deadline) {
                continue;
            }
            this.unixForceKillTargets.set(pid, { startTime: info.startTime, deadline });
        }
    }

    /**
     * Schedules {@link unixForceKillDueTargets} for the earliest deadline of the {@link unixForceKillTargets},
     * and again after that for the remaining ones. The timer does not keep the current process alive.
     */
    protected unixScheduleForceKill(): void {
        clearTimeout(this.unixForceKillTimer);
        this.unixForceKillTimer = undefined;
        if (this.unixForceKillTargets.size === 0) {
            return;
        }
        const deadline = Math.min(...Array.from(this.unixForceKillTargets.values(), target => target.deadline));
        this.unixForceKillTimer = setTimeout(async () => {
            this.unixForceKillTimer = undefined;
            await this.unixForceKillDueTargets();
            this.unixScheduleForceKill();
        }, Math.max(0, deadline - performance.now())).unref();
    }

    /**
     * Waits until all of the {@link unixForceKillTargets} have exited, or until the given deadline.
     */
    protected async unixWaitForForceKillTargets(deadline: number): Promise<void> {
        for (; ;) {
            for (const pid of this.unixForceKillTargets.keys()) {
                if (!this.unixIsAlive(pid)) {
                    this.unixForceKillTargets.delete(pid);
                }
            }
            const remaining = deadline - performance.now();
            if (this.unixForceKillTargets.size === 0 || remaining <= 0) {
                return;
            }
            await new Promise(resolve => setTimeout(resolve, Math.min(remaining, UNIX_FORCE_KILL_POLL_INTERVAL_MS)));
        }
    }

    /**
     * Kills the {@link unixForceKillTargets} whose deadline has passed with `SIGKILL`, if they are still running
     * and their PID has not been reused since. They stay in the map until the processes have been listed, so that
     * a shutdown in the meantime still finds them. Never rejects.
     */
    protected async unixForceKillDueTargets(): Promise<void> {
        const now = performance.now();
        const due = new Map<number, UnixForceKillTarget>();
        for (const [pid, target] of this.unixForceKillTargets) {
            if (target.deadline <= now) {
                due.set(pid, target);
            }
        }
        const survivors = this.unixGetSurvivors(due);
        for (const pid of due.keys()) {
            if (!survivors.has(pid)) {
                this.unixForceKillTargets.delete(pid);
            }
        }
        if (survivors.size === 0) {
            return;
        }
        let processes: Map<number, UnixProcessInfo> | undefined;
        try {
            processes = await this.unixListProcessesAsync();
        } catch (error) {
            this.logger.error('Failed to kill the remaining processes of a process tree', error);
        }
        // Leave out the targets that were handled or replaced in the meantime, e.g. on exit.
        const pending = new Map(Array.from(survivors).filter(([pid, target]) => this.unixForceKillTargets.get(pid) === target));
        pending.forEach((_, pid) => this.unixForceKillTargets.delete(pid));
        if (processes) {
            this.unixForceKillSurvivors(pending, processes);
        }
    }

    /**
     * Kills all of the {@link unixForceKillTargets} with `SIGKILL` without waiting for their deadline, if they are
     * still running and their PID has not been reused since. This blocks the event loop.
     */
    protected unixForceKillPendingTargets(): void {
        const targets = new Map(this.unixForceKillTargets);
        this.unixForceKillTargets.clear();
        clearTimeout(this.unixForceKillTimer);
        this.unixForceKillTimer = undefined;
        const survivors = this.unixGetSurvivors(targets);
        if (survivors.size === 0) {
            return;
        }
        try {
            this.unixForceKillSurvivors(survivors, this.unixListProcesses());
        } catch (error) {
            this.logger.error('Failed to kill the remaining processes of a process tree', error);
        }
    }

    /**
     * @returns the given targets that are still running
     */
    protected unixGetSurvivors(targets: Map<number, UnixForceKillTarget>): Map<number, UnixForceKillTarget> {
        return new Map(Array.from(targets).filter(([pid]) => this.unixIsAlive(pid)));
    }

    /**
     * Kills the given targets with `SIGKILL` if they are listed in `processes` with the same start time.
     */
    protected unixForceKillSurvivors(targets: Map<number, UnixForceKillTarget>, processes: Map<number, UnixProcessInfo>): void {
        for (const [pid, target] of targets) {
            if (processes.get(pid)?.startTime === target.startTime) {
                this.logger.warn(`[${pid}] still running after SIGTERM, killing it with SIGKILL`);
                this.unixKill(pid, 'SIGKILL');
            }
        }
    }

    protected unixIsAlive(pid: number): boolean {
        try {
            process.kill(pid, 0);
            return true;
        } catch (error) {
            return (error as NodeJS.ErrnoException | undefined)?.code !== 'ESRCH';
        }
    }

    /**
     * @returns the PIDs of all of the descendants of the given process
     */
    protected unixGetDescendants(processes: Iterable<{ pid: number, ppid: number }>, ppid: number): Set<number> {
        const list = Array.from(processes);
        const pids = new Set<number>([ppid]);
        // Keep looking for parent/child relationships while we keep finding new parents:
        let size; do {
            size = pids.size;
            for (const child of list) {
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
     * @returns the PIDs of the members of the given process group, including those that were reparented
     */
    protected unixGetGroupMembers(processes: Map<number, UnixProcessInfo>, pgid: number): number[] {
        return Array.from(processes.values()).filter(info => info.pgid === pgid).map(info => info.pid);
    }

    /**
     * @returns all processes, see {@link unixListProcesses}, or `undefined` if they cannot be listed
     */
    protected unixTryListProcesses(): Map<number, UnixProcessInfo> | undefined {
        try {
            return this.unixListProcesses();
        } catch (error) {
            this.logger.warn('Failed to list the start times of processes, a process tree will only be sent SIGTERM', error);
            return undefined;
        }
    }

    /**
     * @returns all processes by PID, from a single run of `ps`
     */
    protected unixListProcesses(): Map<number, UnixProcessInfo> {
        const { stdout } = this.spawnSync('ps', UNIX_LIST_PROCESSES_ARGS, this.unixListProcessesOptions());
        return this.unixParseProcesses(stdout);
    }

    /**
     * @returns all processes by PID, from a single run of `ps`, without blocking the event loop
     */
    protected async unixListProcessesAsync(): Promise<Map<number, UnixProcessInfo>> {
        const { stdout } = await this.execFile('ps', UNIX_LIST_PROCESSES_ARGS, this.unixListProcessesOptions());
        return this.unixParseProcesses(stdout);
    }

    protected unixListProcessesOptions(): cp.SpawnSyncOptions & cp.ExecFileOptions {
        // A fixed locale and time zone keep the output of `lstart` comparable across runs.
        return { env: { ...process.env, LC_ALL: 'C', TZ: 'UTC' }, timeout: UNIX_LIST_PROCESSES_TIMEOUT_MS };
    }

    /**
     * @param psOutput the output of `ps` with {@link UNIX_LIST_PROCESSES_ARGS}
     */
    protected unixParseProcesses(psOutput: string): Map<number, UnixProcessInfo> {
        const processes = new Map<number, UnixProcessInfo>();
        for (const line of psOutput.split('\n')) {
            const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/);
            if (match) {
                const pid = Number.parseInt(match[1], 10);
                processes.set(pid, { pid, ppid: Number.parseInt(match[2], 10), pgid: Number.parseInt(match[3], 10), startTime: match[4] });
            }
        }
        return processes;
    }

    protected unixKill(pid: number, signal?: NodeJS.Signals): void {
        try {
            process.kill(pid, signal);
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
        return this.unixGetDescendants(psList, ppid);
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
