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

export const shellEnvironmentPath = '/services/shell-environment';

export const ShellEnvironmentServer = Symbol('ShellEnvironmentServer');

/**
 * The environment of the user's login shell, resolved by the backend when it starts.
 *
 * A GUI application on macOS and Linux does not inherit the variables that the user's dotfiles
 * (`.zshrc`, `.bash_profile`, ...) define, `PATH` among them, so the processes that the backend
 * spawns for the user, such as terminals, tasks, debug adapters and the plugin host, would not find
 * the user's tools. The backend of an Electron application therefore runs the login shell once at
 * start-up and applies its `PATH` to its own `process.env`, from where every process spawned
 * later inherits it. The other variables of the login shell are not applied. The channel of every
 * service that a frontend opens is held until that has happened, unless the service is declared
 * independent of the shell environment (see `ConnectionHandler.independentOfShellEnvironment`),
 * so backend code that serves a request of a held
 * service sees the resolved environment without waiting. Only code that spawns processes on its own,
 * before any frontend connects, needs to await {@link whenResolved}.
 *
 * The resolution is skipped in browser deployments, on Windows, and when the backend itself was
 * started from the login shell that is being resolved.
 */
export interface ShellEnvironmentServer {
    /**
     * Settles once the `PATH` of the login shell has been applied to the backend's `process.env`,
     * or once the resolution has been skipped, has failed or has timed out, with the outcome.
     * The returned promise never rejects.
     */
    whenResolved(): Promise<ShellEnvironmentResolution>;

    /**
     * Stores the time in seconds to wait for the login shell at the next start of the backend,
     * `undefined` to restore the default.
     */
    setResolutionTimeout(seconds: number | undefined): Promise<void>;
}

/**
 * The outcome of the resolution of the login shell environment, see {@link ShellEnvironmentServer}.
 */
export interface ShellEnvironmentResolution {
    /**
     * - `applied`: the `PATH` of the login shell has been applied to `process.env`
     * - `skipped`: there was nothing to resolve, see `reason`
     * - `timeout`: the login shell did not answer within the resolution timeout; `process.env` is unchanged
     * - `failed`: the login shell could not be run or its output could not be read or defines no `PATH`, see `reason`;
     *   `process.env` is unchanged
     */
    readonly status: 'applied' | 'skipped' | 'timeout' | 'failed';
    /**
     * Why the resolution was skipped or what went wrong.
     */
    readonly reason?: string;
}

/**
 * The preference that controls how long the backend waits for the login shell, in seconds, and the bounds
 * within which its value is honoured.
 */
export namespace ShellEnvironmentResolutionTimeout {
    export const PREFERENCE = 'application.shellEnvironmentResolutionTimeout';
    export const DEFAULT = 10;
    export const MIN = 1;
    export const MAX = 120;
}
