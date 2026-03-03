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

// Copied from https://github.com/microsoft/vscode/blob/85f2ce803d86e9fddeba10874fc2758a75b8e806/src/vscode-dts/vscode.proposed.statusBarItemTooltip.d.ts

export module '@theia/plugin' {

    // https://github.com/microsoft/vscode/issues/234339

    export interface StatusBarItem {

        /**
         * The tooltip text when you hover over this entry.
         *
         * Can optionally return the tooltip in a thenable if the computation is expensive.
         */
        tooltip2: string | MarkdownString | undefined | ((token: CancellationToken) => ProviderResult<string | MarkdownString | undefined>);
    }
}
