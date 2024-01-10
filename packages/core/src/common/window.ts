// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

/**
 * The window hash value that is used to spawn a new default window.
 */
export const DEFAULT_WINDOW_HASH: string = '!empty';

/**
 * The options for opening new windows.
 */
export interface NewWindowOptions {
    /**
     * Controls whether the window should be opened externally.
     */
    readonly external?: boolean;
}

export interface WindowSearchParams {
    [key: string]: string
}
