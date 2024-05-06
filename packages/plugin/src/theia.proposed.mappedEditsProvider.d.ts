// *****************************************************************************
// Copyright (C) 2024 STMicroelectronics and others.
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

export module '@theia/plugin' {

    export interface DocumentContextItem {
        readonly uri: Uri;
        readonly version: number;
        readonly ranges: Range[];
    }

    export interface MappedEditsContext {
        documents: DocumentContextItem[][];
    }

    /**
     * Interface for providing mapped edits for a given document.
     */
    export interface MappedEditsProvider {
        /**
         * Provide mapped edits for a given document.
         * @param document The document to provide mapped edits for.
         * @param codeBlocks Code blocks that come from an LLM's reply.
         *                  "Insert at cursor" in the panel chat only sends one edit that the user clicks on, but inline chat can send multiple blocks
         *                  and let the lang server decide what to do with them.
         * @param context The context for providing mapped edits.
         * @param token A cancellation token.
         * @returns A provider result of text edits.
         */
        provideMappedEdits(
            document: TextDocument,
            codeBlocks: string[],
            context: MappedEditsContext,
            token: CancellationToken
        ): ProviderResult<WorkspaceEdit | null>;
    }

    export namespace chat {
        export function registerMappedEditsProvider(documentSelector: DocumentSelector, provider: MappedEditsProvider): Disposable;
    }
}
