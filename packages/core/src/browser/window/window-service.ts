/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { Event } from '../../common/event';
import { NewWindowOptions } from '../../common/window';

/**
 * Service for opening new browser windows.
 */
export const WindowService = Symbol('WindowService');

export interface WindowService {
    /**
     * Opens a new window and loads the content from the given URL.
     * In a browser, opening a new Theia tab or open a link is the same thing.
     * But in Electron, we want to open links in a browser, not in Electron.
     */
    openNewWindow(url: string, options?: NewWindowOptions): undefined;

    /**
     * Opens a new default window.
     * - In electron and in the browser it will open the default window without a pre-defined content.
     */
    openNewDefaultWindow(): void;

    /**
     * Fires when the `window` unloads. The unload event is inevitable. On this event, the frontend application can save its state and release resource.
     * Saving the state and releasing any resources must be a synchronous call. Any asynchronous calls invoked after emitting this event might be ignored.
     */
    readonly onUnload: Event<void>;

    /**
     * Checks `FrontendApplicationContribution#willStop` for impediments to shutdown and runs any actions returned.
     * Can be used safely in browser and Electron when triggering reload or shutdown programmatically.
     * Should _only_ be called before a shutdown - if this returns `true`, `FrontendApplicationContribution#willStop`
     * will not be called again in the current session. I.e. if this return `true`, the shutdown should proceed without
     * further condition.
     */
    isSafeToShutDown(): Promise<boolean>;

    /**
     * Will prevent subsequent checks of `FrontendApplicationContribution#willStop`. Should only be used after requesting
     * user confirmation.
     *
     * This is primarily intended programmatic restarts due to e.g. change of display language. It allows for a single confirmation
     * of intent, rather than one warning and then several warnings from other contributions.
     */
    setSafeToShutDown(): void;

    /**
     * Reloads the window according to platform.
     */
    reload(): void;
}
