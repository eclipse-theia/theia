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
import { generateUuid } from '../common/uuid';

/**
 * Holds the CLI arguments of *forwarded* launches (see the `second-instance` handling in
 * `ElectronMainApplication`) in the trusted Electron main process, keyed by a one-shot,
 * unguessable launch id.
 *
 * The id travels to the new window through its URL while the arguments stay here, and the window
 * redeems them once over the authenticated Electron IPC channel. This keeps per-window options such
 * as `--session-preference` off the untrusted URL, where a crafted link could otherwise inject them
 * in a browser deployment.
 */
@injectable()
export class LaunchArgsStore {

    protected readonly argsById = new Map<string, string[]>();

    /**
     * Stores an `argv` and returns the one-shot id under which the window can redeem it.
     */
    store(argv: string[]): string {
        const id = generateUuid();
        this.argsById.set(id, argv);
        return id;
    }

    /**
     * Returns the `argv` stored under `id` and discards it, so it can be redeemed at most once.
     * Returns an empty array for an unknown or already-redeemed id.
     */
    redeem(id: string): string[] {
        const argv = this.argsById.get(id);
        this.argsById.delete(id);
        return argv ?? [];
    }
}
