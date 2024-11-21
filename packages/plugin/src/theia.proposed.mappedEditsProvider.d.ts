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

    export interface ConversationRequest {
        readonly type: 'request';
        readonly message: string;
    }

    export interface ConversationResponse {
        readonly type: 'response';
        readonly message: string;
        readonly result?: ChatResult;
        readonly references?: DocumentContextItem[];
    }

    export interface MappedEditsContext {
        readonly documents: DocumentContextItem[][];
        /**
         * The conversation that led to the current code block(s).
         * The last conversation part contains the code block(s) for which the code mapper should provide edits.
         */
        readonly conversation?: (ConversationRequest | ConversationResponse)[];
    }

    /**
     * Interface for providing mapped edits for a given document.
     */
    export interface MappedEditsProvider {
        /**
         * Provide mapped edits for a given document.
         * @param document The document to provide mapped edits for.
         * @param codeBlocks Code blocks that come from an LLM's reply. "Apply in Editor" in the panel chat only sends one edit that the user clicks on, but inline chat can send
         * multiple blocks and let the lang server decide what to do with them.
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

    export interface MappedEditsRequest {
        readonly codeBlocks: { code: string; resource: Uri; markdownBeforeBlock?: string }[];
        // for every prior response that contains codeblocks, make sure we pass the code as well as the resources based on the reported codemapper URIs
        readonly conversation: (ConversationRequest | ConversationResponse)[];
    }

    export interface MappedEditsResponseStream {
        textEdit(target: Uri, edits: TextEdit | TextEdit[]): void;
    }

    export interface MappedEditsResult {
        readonly errorMessage?: string;
    }

    /**
     * Interface for providing mapped edits for a given document.
     */
    export interface MappedEditsProvider2 {
        provideMappedEdits(
            request: MappedEditsRequest,
            result: MappedEditsResponseStream,
            token: CancellationToken
        ): ProviderResult<MappedEditsResult>;
    }

    export namespace chat {
        export function registerMappedEditsProvider(documentSelector: DocumentSelector, provider: MappedEditsProvider): Disposable;
        export function registerMappedEditsProvider2(provider: MappedEditsProvider2): Disposable;
    }
}
