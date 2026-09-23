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
import { LaunchArguments } from '../common/launch-arguments';

/**
 * Holds the parsed CLI options of *forwarded* launches (see the `second-instance` handling in
 * `ElectronMainApplication`) in the trusted Electron main process, keyed by the `webContents` id of
 * the window that was opened for them.
 *
 * ### Why the arguments never travel on the window URL
 *
 * The URL is the one channel in the system that carries no trust: in a browser deployment it is
 * attacker-writable, so putting per-window options such as `--session-preference` there would let a
 * crafted link inject settings (some of which persist to the User scope). The arguments therefore
 * stay here in the main process and are handed to the window over the per-window metadata channel
 * (`CHANNEL_WC_METADATA`), where main identifies the calling window by `event.sender.id` rather than
 * by any value from the URL. This is the single place that documents that rationale; other files
 * point here.
 *
 * The entry is not consumed on first read, so that a plain `Reload Window`, which re-runs the
 * renderer against the same window, still observes the arguments. It is removed when the window is
 * closed, and when the window is redirected to a *different* frontend (e.g. into a dev container
 * after a CLI attach), since the arguments describe the launch rather than whatever the window is
 * navigated to afterwards. See `TheiaElectronWindow.reload`.
 *
 * @experimental
 */
@injectable()
export class LaunchArgsStore {

    protected readonly argsByWindowId = new Map<number, LaunchArguments>();

    /**
     * Associates the parsed options of a forwarded launch with the window identified by `windowId` (its
     * `webContents` id). Must be called before the window loads its URL, so that the preload script
     * cannot ask for the arguments before they are stored.
     */
    store(windowId: number, args: LaunchArguments): void {
        this.argsByWindowId.set(windowId, args);
    }

    /**
     * Returns the parsed launch options for the window identified by `windowId`, or `undefined`
     * for a window that was not opened by a forwarded launch (a cold-start window), or one whose
     * arguments were dropped. Repeatable, so a plain reload still sees the arguments.
     */
    get(windowId: number): LaunchArguments | undefined {
        return this.argsByWindowId.get(windowId);
    }

    /**
     * Drops the arguments stored for `windowId`. Called when the window is closed, and when it is
     * redirected to a different frontend.
     */
    delete(windowId: number): void {
        this.argsByWindowId.delete(windowId);
    }
}
