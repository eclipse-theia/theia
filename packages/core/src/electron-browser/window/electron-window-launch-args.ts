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
import { WindowLaunchArgs } from '../../browser/window/window-launch-args';

/**
 * Electron implementation of {@link WindowLaunchArgs}. Redeems the forwarded launch `argv` over the
 * authenticated Electron IPC channel, where the main process identifies this window by the IPC
 * sender rather than by any value from the URL (see `LaunchArgsStore`). The result is cached per
 * page load, since several contributions read the arguments during startup.
 */
@injectable()
export class ElectronWindowLaunchArgs implements WindowLaunchArgs {

    protected launchArgs: Promise<string[] | undefined> | undefined;

    getLaunchArgs(): Promise<string[] | undefined> {
        if (!this.launchArgs) {
            this.launchArgs = this.resolveLaunchArgs();
        }
        return this.launchArgs;
    }

    protected async resolveLaunchArgs(): Promise<string[] | undefined> {
        try {
            // Main returns `undefined` for a cold-start window, letting callers fall back to the
            // shared backend, and the stored `argv` for a forwarded window (kept for the window's
            // lifetime, so a reload still sees it).
            return await this.redeemFromMain();
        } catch (e) {
            console.warn('Failed to redeem forwarded launch arguments:', e);
            return undefined;
        }
    }

    protected redeemFromMain(): Promise<string[] | undefined> {
        return window.electronTheiaCore.redeemLaunchArgs();
    }
}
