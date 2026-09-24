// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { EnvVariable, EnvVariablesServer } from '../../common/env-variables';

/**
 * Wraps the raw `EnvVariablesServer` RPC proxy and caches the result of `getConfigDirUri()`
 * on the frontend.
 *
 * The config directory URI is constant for the lifetime of a Theia session, but several
 * `FrontendApplicationContribution`s resolve it independently during startup (for example
 * `CommonFrontendContribution.configure()`). Without this cache, each caller pays a full
 * RPC round-trip, even though the backend already memoizes the resolved value in a single
 * `Promise` (see `EnvVariablesServerImpl`) - the backend-side memoization only avoids
 * recomputation, not the round-trip itself.
 *
 * Caching the pending promise here - rather than only the resolved value - means concurrent
 * callers that ask before the first round-trip has resolved still share that one in-flight
 * request instead of each starting their own.
 *
 * This class is instantiated manually (see `frontend-application-module.ts`) around the
 * connection proxy, so it is not itself bound in the DI container.
 */
export class CachingEnvVariablesServer implements EnvVariablesServer {

    protected configDirUri: Promise<string> | undefined;

    constructor(protected readonly delegate: EnvVariablesServer) { }

    getExecPath(): Promise<string> {
        return this.delegate.getExecPath();
    }

    getVariables(): Promise<EnvVariable[]> {
        return this.delegate.getVariables();
    }

    getValue(key: string): Promise<EnvVariable | undefined> {
        return this.delegate.getValue(key);
    }

    getConfigDirUri(): Promise<string> {
        return this.configDirUri ??= this.delegate.getConfigDirUri();
    }

    getHomeDirUri(): Promise<string> {
        return this.delegate.getHomeDirUri();
    }

    getDrives(): Promise<string[]> {
        return this.delegate.getDrives();
    }

}
