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

export interface NewWindowOptions {
    readonly external?: boolean;
}

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
    openNewWindow(url: string, options?: NewWindowOptions): Window | undefined;

    /**
     * Called when the `window` is about to `unload` its resources.
     * At this point, the `document` is still visible and the [`BeforeUnloadEvent`](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)
     * event will be canceled if the return value of this method is `false`.
     */
    canUnload(): boolean;

}
