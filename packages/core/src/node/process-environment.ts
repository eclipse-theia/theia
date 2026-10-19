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

import { inject, injectable, named, postConstruct } from 'inversify';
import { ILogger } from '../common/logger';
import { Deferred } from '../common/promise-util';
import { isObject } from '../common/types';
import { BackendApplicationContribution } from './backend-application';

/**
 * Name of the environment variable with which the parent process announces that it will complete
 * the environment of the backend later, see {@link ProcessEnvironment}.
 */
export const PROCESS_ENVIRONMENT_PENDING_VARIABLE = 'THEIA_PROCESS_ENVIRONMENT';

/**
 * The IPC messages exchanged between the backend and its parent process to complete the environment.
 */
export namespace ProcessEnvironmentMessage {
    /** Sent by the backend to request the environment from its parent process. */
    export interface Request {
        readonly type: typeof Request.TYPE;
    }
    export namespace Request {
        export const TYPE = 'theia-process-environment-request';
        export function is(message: unknown): message is Request {
            return isObject<Request>(message) && message.type === TYPE;
        }
    }
    /** Sent by the parent process with the variables to apply to the environment of the backend. */
    export interface Response {
        readonly type: typeof Response.TYPE;
        readonly env: NodeJS.ProcessEnv;
    }
    export namespace Response {
        export const TYPE = 'theia-process-environment';
        export function is(message: unknown): message is Response {
            return isObject<Response>(message) && message.type === TYPE && isObject(message.env);
        }
    }
}

export const ProcessEnvironment = Symbol('ProcessEnvironment');

/**
 * Tells when the environment of the backend process, `process.env`, is complete.
 *
 * An Electron application resolves the `PATH` of the user's login shell, which GUI applications on macOS and
 * Linux do not inherit, in its main process. Running the login shell can take seconds, so the backend is forked
 * before the `PATH` is known and receives it over IPC once it is. Until then `process.env` is the environment of
 * the GUI application, in which the user's tools may be missing. Code that spawns child processes which should
 * find the user's tools, such as terminals, tasks and the plugin host, awaits {@link ready} before spawning.
 */
export interface ProcessEnvironment {
    /**
     * Resolves once `process.env` carries the environment of the user's login shell, or right away when nothing
     * is pending, for example in a browser deployment or on Windows. Never rejects: if the parent process does
     * not answer in time, a warning is logged and the environment is left as it is.
     */
    readonly ready: Promise<void>;
}

@injectable()
export class ProcessEnvironmentImpl implements ProcessEnvironment, BackendApplicationContribution {

    @inject(ILogger) @named('core:ProcessEnvironmentImpl')
    protected readonly logger: ILogger;

    /** How long to wait for the parent process, in milliseconds, before giving up. */
    protected readonly timeoutMs = 15_000;

    protected readonly readyDeferred = new Deferred<void>();
    readonly ready = this.readyDeferred.promise;

    protected requested = false;

    /**
     * The request is made as soon as the service exists, so that `ready` settles whether or not the backend
     * application runs its contributions, for example in a test container; `initialize` only makes it eager.
     */
    @postConstruct()
    protected init(): void {
        this.request();
    }

    initialize(): void {
        this.request();
    }

    /**
     * Request the environment from the parent process, if it announced that the environment is pending.
     */
    protected request(): void {
        if (this.requested) {
            return;
        }
        this.requested = true;
        if (process.env[PROCESS_ENVIRONMENT_PENDING_VARIABLE] !== 'pending' || typeof process.send !== 'function') {
            this.readyDeferred.resolve();
            return;
        }
        const timer = setTimeout(() => {
            process.off('message', listener);
            this.logger.warn(`The parent process did not provide the environment within ${this.timeoutMs} ms, child processes may not find the user's tools.`);
            this.readyDeferred.resolve();
        }, this.timeoutMs);
        const listener = (message: unknown) => {
            if (ProcessEnvironmentMessage.Response.is(message)) {
                process.off('message', listener);
                clearTimeout(timer);
                this.apply(message.env);
                this.readyDeferred.resolve();
            }
        };
        process.on('message', listener);
        process.send({ type: ProcessEnvironmentMessage.Request.TYPE } satisfies ProcessEnvironmentMessage.Request);
    }

    protected apply(env: NodeJS.ProcessEnv): void {
        Object.assign(process.env, env);
        delete process.env[PROCESS_ENVIRONMENT_PENDING_VARIABLE];
    }
}
