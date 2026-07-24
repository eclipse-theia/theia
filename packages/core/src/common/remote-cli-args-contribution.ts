// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { MaybePromise } from './types';

export const RemoteCliArgsContribution = Symbol('RemoteCliArgsContribution');

/**
 * Frontend contribution that provides additional CLI arguments to pass to a remote backend
 * started for the *current* window (e.g. when attaching to a dev container).
 *
 * This lets per-window CLI options (such as `--session-preference`) that were forwarded to a
 * window via its URL be re-applied on the remote backend. Unlike the node-side
 * `RemoteCliContribution#enhanceArgs`, which reads process-global state on the shared backend,
 * this contribution runs in the renderer and therefore has access to the current window's
 * context.
 */
export interface RemoteCliArgsContribution {
    /**
     * Returns the extra CLI arguments to append when starting a remote backend for the current
     * window. Implementations should return an empty array when they have nothing to contribute
     * (e.g. for a regular cold-start window whose args are already applied by the shared backend).
     */
    getRemoteCliArgs(): MaybePromise<string[]>;
}
