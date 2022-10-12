// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * This is the place for extra APIs Theia supports compared to VS Code.
 */
export module '@theia/plugin' {

    export interface WebviewPanel {
        /**
         * Show the webview panel according to a given options.
         *
         * A webview panel may only show in a single column at a time. If it is already showing, this
         * method moves it to a new column.
         *
         * @param area target area where webview panel will be resided. Shows in the 'WebviewPanelTargetArea.Main' area if undefined.
         * @param viewColumn View column to show the panel in. Shows in the current `viewColumn` if undefined.
         * @param preserveFocus When `true`, the webview will not take focus.
         */
        reveal(area?: WebviewPanelTargetArea, viewColumn?: ViewColumn, preserveFocus?: boolean): void;
    }

}
