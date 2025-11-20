// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
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
// code copied and modified from https://github.com/microsoft/vscode/blob/1.103.2/src/vscode-dts/vscode.proposed.scmProviderOptions.d.ts

export module '@theia/plugin' {
    // https://github.com/microsoft/vscode/issues/254910

    export interface SourceControl {
        /**
         * Context value of the source control. This can be used to contribute source control specific actions.
         * For example, if a source control is given a context value of `repository`, when contributing actions to `scm/sourceControl/context`
         * using `menus` extension point, you can specify context value for key `scmProviderContext` in `when` expressions, like `scmProviderContext == repository`.
         * ```json
         * "contributes": {
         *   "menus": {
         *     "scm/sourceControl/context": [
         *       {
         *         "command": "extension.gitAction",
         *         "when": "scmProviderContext == repository"
         *       }
         *     ]
         *   }
         * }
         * ```
         * This will show action `extension.gitAction` only for source controls with `contextValue` equal to `repository`.
         */
        contextValue?: string;

        /**
         * Fired when the parent source control is disposed.
         */
        readonly onDidDisposeParent: Event<void>;
    }

    export namespace scm {
        export function createSourceControl(id: string, label: string, rootUri?: Uri, iconPath?: IconPath, parent?: SourceControl): SourceControl;
    }
}
