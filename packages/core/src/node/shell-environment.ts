// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import { ChildProcess, spawn } from 'child_process';
import { randomUUID } from 'crypto';
import { userInfo } from 'os';
import { basename } from 'path';
import { inject, injectable, named } from 'inversify';
import { environment } from '@theia/application-package/lib/environment';
import { ILogger } from '../common/logger.js';
import { Stopwatch } from '../common/performance/index.js';
import { ShellEnvironmentResolutionTimeout, ShellEnvironmentResolution, ShellEnvironmentServer } from '../common/shell-environment.js';
import { BackendApplicationContribution } from './backend-application.js';
import { SettingService } from './setting-service.js';

/**
 * Thrown when the login shell does not answer within the resolution timeout.
 */
export class ShellEnvironmentTimeoutError extends Error {
    constructor(readonly timeout: number) {
        super(`The login shell did not answer within ${timeout} seconds`);
    }
}

/**
 * Resolves the environment of the user's login shell when the backend starts and applies its `PATH` to `process.env`,
 * see {@link ShellEnvironmentServer}.
 *
 * The shell is run as an interactive login shell, so that it reads the same dotfiles as a terminal, and prints
 * its environment as JSON by running this very executable as Node between two random markers, which keeps
 * whatever the dotfiles print apart from the environment. This is how VS Code resolves the shell environment.
 * The shell that hangs, for example on a prompt in the dotfiles, is killed with its process group when the
 * timeout expires, or when the backend stops before that.
 */
@injectable()
export class ShellEnvironmentServerImpl implements ShellEnvironmentServer, BackendApplicationContribution {

    /**
     * Set in the environment of the login shell, so that dotfiles can tell the resolution from a terminal session.
     * A backend that finds it in its own environment was started by those dotfiles and does not resolve again.
     */
    static readonly RESOLVING_VARIABLE = 'THEIA_RESOLVING_ENVIRONMENT';

    @inject(ILogger) @named('core:ShellEnvironmentServerImpl')
    protected readonly logger: ILogger;

    @inject(SettingService)
    protected readonly settingService: SettingService;

    @inject(Stopwatch)
    protected readonly stopwatch: Stopwatch;

    protected resolution: Promise<ShellEnvironmentResolution> | undefined;

    /**
     * The login shell while it is running.
     */
    protected shell: ChildProcess | undefined;

    initialize(): void {
        // Start the login shell as early as possible, so that it runs while the rest of the start-up proceeds.
        this.whenResolved();
    }

    onStop(): void {
        // The timer that kills a hanging shell goes with the backend, and the shell would outlive it: a backend that
        // exits abruptly only sends `SIGTERM` to its child processes, which an interactive shell ignores.
        if (this.shell) {
            this.logger.debug('Killing the login shell, which is still running while the backend stops.');
            this.kill(this.shell);
        }
    }

    whenResolved(): Promise<ShellEnvironmentResolution> {
        this.resolution ??= this.resolve();
        return this.resolution;
    }

    async setResolutionTimeout(seconds: number | undefined): Promise<void> {
        const value = seconds === undefined ? '' : String(seconds);
        const stored = await this.settingService.get(ShellEnvironmentResolutionTimeout.PREFERENCE) ?? '';
        if (stored !== value) {
            await this.settingService.set(ShellEnvironmentResolutionTimeout.PREFERENCE, value);
        }
    }

    protected async resolve(): Promise<ShellEnvironmentResolution> {
        const skipReason = this.getSkipReason();
        if (skipReason) {
            this.logger.debug(`Not resolving the login shell environment: ${skipReason}.`);
            return { status: 'skipped', reason: skipReason };
        }
        try {
            const timeout = await this.getResolutionTimeout();
            const env = await this.stopwatch.startAsync('shell-environment', 'Resolving the login shell environment',
                () => this.resolveLoginShellEnvironment(timeout));
            this.apply(this.sanitize(env));
            return { status: 'applied' };
        } catch (error) {
            if (error instanceof ShellEnvironmentTimeoutError) {
                this.logger.warn(`${error.message}, processes spawned by the backend may not find the user's tools. ` +
                    `The timeout is configured by the '${ShellEnvironmentResolutionTimeout.PREFERENCE}' preference.`);
                return { status: 'timeout' };
            }
            const reason = error instanceof Error ? error.message : String(error);
            this.logger.warn(`Could not resolve the login shell environment, processes spawned by the backend may not find the user's tools: ${reason}`);
            return { status: 'failed', reason };
        }
    }

    /**
     * Why the resolution does not apply to this backend, or `undefined` if it does.
     */
    protected getSkipReason(): string | undefined {
        if (process.platform === 'win32') {
            return 'the application runs on Windows';
        }
        if (!environment.electron.is()) {
            return 'the application is not an Electron application';
        }
        if (process.env[ShellEnvironmentServerImpl.RESOLVING_VARIABLE]) {
            return 'the backend was started from the login shell that is being resolved';
        }
        return undefined;
    }

    /**
     * The time in seconds to wait for the login shell: the value that the frontend stored from the
     * `application.shellEnvironmentResolutionTimeout` preference at an earlier start, or the default.
     */
    protected async getResolutionTimeout(): Promise<number> {
        let stored: string | undefined;
        try {
            stored = await this.settingService.get(ShellEnvironmentResolutionTimeout.PREFERENCE);
        } catch (error) {
            this.logger.warn('Could not read the resolution timeout of the login shell environment, using the default:', error);
        }
        const seconds = Number(stored);
        if (!stored || !Number.isFinite(seconds)) {
            return ShellEnvironmentResolutionTimeout.DEFAULT;
        }
        return Math.min(Math.max(seconds, ShellEnvironmentResolutionTimeout.MIN), ShellEnvironmentResolutionTimeout.MAX);
    }

    /**
     * Runs the login shell and returns the environment that it prints, see {@link getShellArguments}.
     *
     * @param timeout the time in seconds after which a shell that is still running is killed. The result is then a
     *   {@link ShellEnvironmentTimeoutError}, unless the shell has printed its environment or exited already.
     */
    protected resolveLoginShellEnvironment(timeout: number): Promise<NodeJS.ProcessEnv> {
        const shell = this.getLoginShell();
        const mark = randomUUID().replace(/-/g, '').substring(0, 12);
        const args = this.getShellArguments(shell, mark);
        this.logger.debug(`Resolving the login shell environment with ${shell} ${JSON.stringify(args)}`);
        return new Promise((resolve, reject) => {
            const child = spawn(shell, args, {
                // Its own process group, so that the shell and whatever the dotfiles started can be killed together.
                detached: process.platform !== 'win32',
                stdio: ['ignore', 'pipe', 'pipe'],
                env: this.getShellEnvironment(),
                windowsHide: true
            });
            this.shell = child;
            const stdout: Buffer[] = [];
            const stderr: Buffer[] = [];
            const output = (): string => Buffer.concat(stdout).toString('utf8');
            let exit: { code: number | null, signal: NodeJS.Signals | null } | undefined;
            let settled = false;
            const settle = (outcome: () => void): void => {
                if (!settled) {
                    settled = true;
                    clearTimeout(timer);
                    const errors = Buffer.concat(stderr).toString('utf8').trim();
                    if (errors) {
                        this.logger.debug(`The login shell printed to stderr:\n${errors}`);
                    }
                    outcome();
                }
            };
            const complete = (): void => settle(() => {
                if (exit?.code || exit?.signal) {
                    reject(new Error(`The login shell exited with ${exit.signal ? `signal ${exit.signal}` : `code ${exit.code}`}`));
                } else {
                    try {
                        resolve(this.parseEnvironment(output(), mark));
                    } catch (error) {
                        reject(error);
                    }
                }
            });
            // A program that the shell configuration started in the background without redirecting its output keeps the pipes
            // open after the shell has exited, so the shell's 'close' may come much later than its 'exit', or never. The
            // environment is taken as soon as the shell has exited and printed it, whichever comes last. After that, the output
            // is still read but discarded, so that the program can go on writing to it.
            const completeIfPrinted = (): void => {
                if (exit && this.hasPrintedEnvironment(output(), mark)) {
                    complete();
                }
            };
            const timer = setTimeout(() => {
                if (exit || this.hasPrintedEnvironment(output(), mark)) {
                    // The shell has exited without printing its environment, or printed it but does not exit:
                    // report the outcome rather than the timeout.
                    complete();
                } else {
                    // Give up first, then kill: a program that the shell configuration started may have escaped the process
                    // group and keep the output open, in which case the shell never closes and nothing must wait for it.
                    settle(() => reject(new ShellEnvironmentTimeoutError(timeout)));
                }
                if (!exit) {
                    this.kill(child);
                }
            }, timeout * 1000);
            child.stdout!.on('data', chunk => {
                if (!settled) {
                    stdout.push(chunk);
                    completeIfPrinted();
                }
            });
            child.stderr!.on('data', chunk => {
                if (!settled) {
                    stderr.push(chunk);
                }
            });
            child.on('error', error => settle(() => reject(error)));
            child.on('exit', (code, signal) => {
                // What the shell configuration started in the background is left running, and the PID may be reused.
                this.shell = undefined;
                exit = { code, signal };
                if (code || signal) {
                    complete();
                } else {
                    // Otherwise, what the shell printed last may not have been read yet: wait for it, or for 'close'.
                    completeIfPrinted();
                }
            });
            child.on('close', (code, signal) => {
                exit ??= { code, signal };
                complete();
            });
        });
    }

    /**
     * The user's login shell: `$SHELL`, else the shell of the user account, else `/bin/sh`.
     */
    protected getLoginShell(): string {
        let shell = process.env.SHELL;
        if (!shell) {
            try {
                shell = userInfo().shell ?? undefined;
            } catch {
                // The account has no entry in the user database, see https://github.com/github/codespaces/issues/1639.
            }
        }
        return shell && shell !== '/bin/false' ? shell : '/bin/sh';
    }

    /**
     * The arguments that make the `shell` run as an interactive login shell and print its environment
     * as JSON between two occurrences of the `mark`. The environment is printed by the `executable`, this one
     * by default, running as Node, so that no shell builtin is involved and no value can be misread, however it is formatted.
     * Xonsh, whose commands are Python, prints it with Python.
     */
    protected getShellArguments(shell: string, mark: string, executable: string = process.execPath): string[] {
        const name = basename(shell);
        if (/^(pwsh|powershell)(-preview)?$/.test(name)) {
            // Older versions of PowerShell drop double quotes, so a single quote is escaped as two inside a single-quoted string.
            return ['-Login', '-Command', `& '${executable.replace(/'/g, "''")}' -p '''${mark}'' + JSON.stringify(process.env) + ''${mark}'''`];
        }
        if (name === 'xonsh') {
            return ['-i', '-l', '-c', `import os, json; print("${mark}", json.dumps(dict(os.environ)), "${mark}")`];
        }
        const script = `'"${mark}" + JSON.stringify(process.env) + "${mark}"'`;
        if (name === 'nu') {
            // Nushell runs a quoted path in command position only after a caret. Its single-quoted strings have no escapes,
            // so a path that contains a single quote is put in a double-quoted string instead.
            const quoted = executable.includes("'") ? `"${executable.replace(/[\\"]/g, '\\$&')}"` : `'${executable}'`;
            return ['-i', '-l', '-c', `^${quoted} -p ${script}`];
        }
        // A single quote cannot be escaped inside a single-quoted string, so the string is closed around an escaped quote.
        const command = `'${executable.replace(/'/g, "'\\''")}' -p ${script}`;
        if (name === 'csh' || name === 'tcsh') {
            return ['-ic', command];
        }
        return ['-i', '-l', '-c', command];
    }

    /**
     * The environment to run the login shell in: the backend's own, plus the {@link getResolutionVariables resolution variables}.
     */
    protected getShellEnvironment(): NodeJS.ProcessEnv {
        return {
            ...process.env,
            ...this.getResolutionVariables()
        };
    }

    /**
     * The variables that are set in the environment of the login shell for the resolution: those that make the executable
     * run as Node and that announce the resolution to the dotfiles. {@link sanitize} removes them from the result.
     */
    protected getResolutionVariables(): NodeJS.ProcessEnv {
        return {
            // The executable is Electron in an Electron application; this makes it run as Node.
            ELECTRON_RUN_AS_NODE: '1',
            ELECTRON_NO_ATTACH_CONSOLE: '1',
            [ShellEnvironmentServerImpl.RESOLVING_VARIABLE]: '1',
            // Keep Oh My Zsh from waiting on its update prompt and its tmux plugin from replacing the shell with tmux.
            DISABLE_AUTO_UPDATE: 'true',
            ZSH_TMUX_AUTOSTART: 'false',
            ZSH_TMUX_AUTOSTARTED: 'true'
        };
    }

    /**
     * Whether the `output` of the shell contains the environment between two occurrences of the `mark`, see {@link getShellArguments}.
     */
    protected hasPrintedEnvironment(output: string, mark: string): boolean {
        const start = output.indexOf(mark);
        return start >= 0 && output.indexOf(mark, start + mark.length) >= 0;
    }

    /**
     * Extracts the environment that {@link getShellArguments} made the shell print from its `output`.
     */
    protected parseEnvironment(output: string, mark: string): NodeJS.ProcessEnv {
        const start = output.indexOf(mark);
        const end = start < 0 ? -1 : output.indexOf(mark, start + mark.length);
        if (end < 0) {
            this.logger.debug(`The login shell printed:\n${output}`);
            throw new Error('The login shell did not print its environment; its shell configuration may have started another program');
        }
        try {
            return JSON.parse(output.substring(start + mark.length, end));
        } catch (error) {
            throw new Error(`The environment printed by the login shell could not be parsed: ${error instanceof Error ? error.message : error}`);
        }
    }

    /**
     * Removes from the `env` that the login shell printed the {@link getResolutionVariables resolution variables},
     * restoring the backend's own values of them.
     */
    protected sanitize(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
        const result = { ...env };
        for (const key of Object.keys(this.getResolutionVariables())) {
            if (process.env[key] === undefined) {
                delete result[key];
            } else {
                result[key] = process.env[key];
            }
        }
        return result;
    }

    /**
     * Applies the `PATH` of the login shell to `process.env`, which is what the processes spawned by the backend need to find
     * the user's tools. The other variables of the login shell are not applied; override this method to apply more of them.
     *
     * @param env the {@link sanitize sanitized} environment of the login shell. It holds whatever else the user's dotfiles
     *   define, so an override should choose the variables to apply rather than apply them all.
     */
    protected apply(env: NodeJS.ProcessEnv): void {
        if (!env.PATH) {
            throw new Error('The environment printed by the login shell does not define PATH');
        }
        process.env.PATH = env.PATH;
        this.logger.debug(`Applied the PATH of the login shell to the backend: ${env.PATH}`);
    }

    /**
     * Kills the login shell that has not answered in time, or that is still running when the backend stops. An interactive
     * shell ignores `SIGTERM`, and the dotfiles may have started processes of their own, so the whole process group is killed
     * where there is one.
     */
    protected kill(child: ChildProcess): void {
        if (child.pid === undefined) {
            return;
        }
        try {
            if (process.platform === 'win32') {
                child.kill();
            } else {
                process.kill(-child.pid, 'SIGKILL');
            }
        } catch (error) {
            this.logger.debug(`Could not kill the process group of the login shell ${child.pid}, killing the shell alone:`, error);
            child.kill('SIGKILL');
        }
    }
}
