// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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
// code copied and modified from https://github.com/microsoft/vscode/blob/1.77.0/src/vscode-dts/vscode.proposed.customEditorMove.d.ts

export module '@theia/plugin' {

    export interface CustomTextEditorProvider {

        /**
         * Handle when the underlying resource for a custom editor is renamed.
         *
         * This allows the webview for the editor be preserved throughout the rename. If this method is not implemented,
         * the editor will destroy the previous custom editor and create a replacement one.
         *
         * @param newDocument New text document to use for the custom editor.
         * @param existingWebviewPanel Webview panel for the custom editor.
         * @param token A cancellation token that indicates the result is no longer needed.
         *
         * @return Thenable indicating that the webview editor has been moved.
         */
        moveCustomTextEditor?(newDocument: TextDocument, existingWebviewPanel: WebviewPanel, token: CancellationToken): Thenable<void>;
    }
}
