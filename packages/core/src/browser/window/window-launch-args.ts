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

import { injectable } from 'inversify';

/**
 * Provides the CLI arguments a window was launched with, when it was opened by a *forwarded*
 * (second-instance) launch. See the `second-instance` handling in `ElectronMainApplication`.
 *
 * The default (browser) implementation always reports "no launch arguments": there is no trusted
 * per-window launch channel in a plain browser deployment, and the window URL must never be treated
 * as one. Electron rebinds this to an implementation that redeems the arguments over the
 * authenticated IPC channel using the one-shot launch id from the window URL.
 */
@injectable()
export class WindowLaunchArgs {

    /**
     * Returns the forwarded launch `argv` for the current window, or `undefined` when the window
     * was not opened by a forwarded launch (a cold-start window, or any browser deployment). The
     * result is cached, so repeated calls from different contributions observe the same arguments
     * even though redemption is one-shot.
     */
    async getLaunchArgs(): Promise<string[] | undefined> {
        return undefined;
    }
}
