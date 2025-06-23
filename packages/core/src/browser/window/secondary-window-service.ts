// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics, Ericsson, ARM, EclipseSource and others.
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

import { Event } from '../../common';
import { ApplicationShell } from '../shell';
import { ExtractableWidget } from '../widgets';

export const SecondaryWindowService = Symbol('SecondaryWindowService');

/**
 * Service for opening new secondary windows to contain widgets extracted from the application shell.
 *
 * @experimental The functionality provided by this service and its implementation is still under development. Use with caution.
 */
export interface SecondaryWindowService {
    /**
     * Creates a new secondary window for a widget to be extracted from the application shell.
     * The created window is closed automatically when the current theia instance is closed.
     *
     * @param onClose optional callback that is invoked when the secondary window is closed
     * @returns the created window or `undefined` if it could not be created
     */
    createSecondaryWindow(widget: ExtractableWidget, shell: ApplicationShell): Window | undefined;
    readonly onWindowOpened: Event<Window>;
    readonly onWindowClosed: Event<Window>;

    /** Handles focussing the given secondary window in the browser and on Electron. */
    focus(win: Window): void;
    getWindows(): Window[];
}
