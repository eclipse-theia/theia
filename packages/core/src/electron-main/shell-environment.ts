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

import { inject, injectable } from 'inversify';
import { Stopwatch } from '../common/performance';
import shellPathModule = require('../../electron-shared/shell-path');

export const ShellEnvironment = Symbol('ShellEnvironment');

/**
 * Resolves the `PATH` of the user's login shell and applies it to the environment of the Electron main process.
 *
 * GUI applications on macOS and Linux do not inherit the `PATH` defined in the user's dotfiles
 * (`.zshrc`, `.bash_profile`, ...), so without this, the processes that Theia spawns (the backend and,
 * through it, terminals, tasks and language servers) would not find the user's tools.
 * See https://github.com/electron/electron/issues/550#issuecomment-162037357
 * and https://github.com/eclipse-theia/theia/pull/3534#issuecomment-439689082.
 */
export interface ShellEnvironment {
    /**
     * Resolve the `PATH` of the login shell and apply it to `process.env`.
     *
     * The resolution runs an interactive login shell, which can take more than a second depending on the
     * user's dotfiles, so it is started once and the same promise is returned on subsequent calls. The promise
     * never rejects: if the shell cannot be run or does not respond in time, a warning is logged and the
     * environment is left as it is.
     */
    apply(): Promise<void>;
}

@injectable()
export class ShellEnvironmentImpl implements ShellEnvironment {

    @inject(Stopwatch)
    protected readonly stopwatch: Stopwatch;

    /** How long to wait for the login shell, in milliseconds, before giving up. */
    protected readonly timeoutMs = 10_000;

    protected applied: Promise<void> | undefined;

    apply(): Promise<void> {
        if (!this.applied) {
            this.applied = this.stopwatch.startAsync('electron-main-shell-environment', 'Resolving the shell environment', () => this.doApply())
                .catch(error => console.warn('Could not resolve the PATH of the login shell, child processes may not find the user\'s tools:', error));
        }
        return this.applied;
    }

    protected async doApply(): Promise<void> {
        if (process.platform === 'win32') {
            return;
        }
        const { shellPath } = await shellPathModule;
        const resolved = await this.withTimeout(shellPath());
        process.env.PATH = resolved || this.getFallbackPath();
    }

    protected withTimeout<T>(promise: Promise<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error(`The login shell did not respond within ${this.timeoutMs} ms`)), this.timeoutMs);
            promise.then(resolve, reject).finally(() => clearTimeout(timer));
        });
    }

    /**
     * The `PATH` to apply when the login shell does not define one, as `fix-path` does.
     */
    protected getFallbackPath(): string {
        return ['./node_modules/.bin', '/.nodebrew/current/bin', '/usr/local/bin', process.env.PATH].join(':');
    }
}
