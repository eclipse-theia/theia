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
 * Holds the CLI arguments of *forwarded* launches (see the `second-instance` handling in
 * `ElectronMainApplication`) in the trusted Electron main process, keyed by the `webContents` id of
 * the window that was opened for them.
 *
 * ### Why the arguments never travel on the window URL
 *
 * The URL is the one channel in the system that carries no trust: in a browser deployment it is
 * attacker-writable, so putting per-window options such as `--session-preference` there would let a
 * crafted link inject settings (some of which persist to the User scope). The arguments therefore
 * stay here in the main process, and the window reads them back over the authenticated Electron IPC
 * channel, where main identifies the calling window by `event.sender.id` rather than by any value
 * from the URL. This is the single place that documents that rationale; other files point here.
 *
 * The entry is kept for the lifetime of the window (not consumed on first read) so that a plain
 * `Reload Window`, which re-runs the renderer against the same window, still observes the arguments.
 * It is removed when the window is closed.
 */
@injectable()
export class LaunchArgsStore {

    protected readonly argsByWindowId = new Map<number, string[]>();

    /**
     * Associates a forwarded launch `argv` with the window identified by `windowId` (its
     * `webContents` id). Must be called before the window loads its URL, so the renderer cannot
     * redeem before the arguments are stored.
     */
    store(windowId: number, argv: string[]): void {
        this.argsByWindowId.set(windowId, argv);
    }

    /**
     * Returns the forwarded launch `argv` for the window identified by `windowId`, or `undefined`
     * for a window that was not opened by a forwarded launch (a cold-start window). Repeatable for
     * the lifetime of the window, so a reload still sees the arguments.
     */
    get(windowId: number): string[] | undefined {
        return this.argsByWindowId.get(windowId);
    }

    /**
     * Drops the arguments stored for `windowId`. Called when the window is closed.
     */
    delete(windowId: number): void {
        this.argsByWindowId.delete(windowId);
    }
}
