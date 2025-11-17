// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Copied from https://github.com/microsoft/vscode/blob/main/src/vscode-dts/vscode.proposed.terminalDataWriteEvent.d.ts

export module '@theia/plugin' {

    // https://github.com/microsoft/vscode/issues/78502
    //
    // This API is still proposed but we don't intent on promoting it to stable due to problems
    // around performance. See #145234 for a more likely API to get stabilized.
    export interface TerminalDataWriteEvent {
        /**
         * The {@link Terminal} for which the data was written.
         */
        readonly terminal: Terminal;
        /**
         * The data being written.
         */
        readonly data: string;
    }

    namespace window {
        /**
         * An event which fires when the terminal's child pseudo-device is written to (the shell).
         * In other words, this provides access to the raw data stream from the process running
         * within the terminal, including VT sequences.
         */
        export const onDidWriteTerminalData: Event<TerminalDataWriteEvent>;
    }
}
