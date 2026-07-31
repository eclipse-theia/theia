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
import { LAUNCH_ID_PARAM } from '../../common/window';

/**
 * Electron implementation of {@link WindowLaunchArgs}. Reads the one-shot launch id from the window
 * URL and redeems the forwarded launch `argv` over the authenticated Electron IPC channel, so the
 * arguments themselves never travel on the (untrusted) URL. The result is cached, since redemption
 * is one-shot and several contributions read the arguments during startup.
 */
@injectable()
export class ElectronWindowLaunchArgs extends WindowLaunchArgs {

    protected launchArgs: Promise<string[] | undefined> | undefined;

    override getLaunchArgs(): Promise<string[] | undefined> {
        if (!this.launchArgs) {
            this.launchArgs = this.resolveLaunchArgs();
        }
        return this.launchArgs;
    }

    protected async resolveLaunchArgs(): Promise<string[] | undefined> {
        const launchId = this.getLaunchId();
        if (!launchId) {
            // Cold-start window (or no forwarded launch): let callers fall back to the shared backend.
            return undefined;
        }
        try {
            return await this.redeemFromMain(launchId);
        } catch (e) {
            // The window *was* opened by a forwarded launch, so the shared backend holds the wrong
            // (cold-start) values for it. Report "forwarded, but empty" rather than falling back.
            console.warn('Failed to redeem forwarded launch arguments:', e);
            return [];
        }
    }

    protected getLaunchId(): string | undefined {
        const id = new URLSearchParams(location.search).get(LAUNCH_ID_PARAM);
        // eslint-disable-next-line no-null/no-null
        return id === null ? undefined : id;
    }

    protected redeemFromMain(launchId: string): Promise<string[]> {
        return window.electronTheiaCore.redeemLaunchArgs(launchId);
    }
}
