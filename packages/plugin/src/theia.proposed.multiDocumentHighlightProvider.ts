// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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
// code copied and modified from https://github.com/microsoft/vscode/blob/1.85.1/src/vscode-dts/vscode.proposed.multiDocumentHighlightProvider.d.ts

declare module '@theia/plugin' {

    /**
     * Represents a collection of document highlights from multiple documents.
     */
    export class MultiDocumentHighlight {

        /**
         * The URI of the document containing the highlights.
         */
        uri: Uri;

        /**
         * The highlights for the document.
         */
        highlights: DocumentHighlight[];

        /**
         * Creates a new instance of MultiDocumentHighlight.
         * @param uri The URI of the document containing the highlights.
         * @param highlights The highlights for the document.
         */
        constructor(uri: Uri, highlights: DocumentHighlight[]);
    }

    export interface MultiDocumentHighlightProvider {

        /**
         * Provide a set of document highlights, like all occurrences of a variable or
         * all exit-points of a function.
         *
         * @param document The document in which the command was invoked.
         * @param position The position at which the command was invoked.
         * @param otherDocuments An array of additional valid documents for which highlights should be provided.
         * @param token A cancellation token.
         * @returns A Map containing a mapping of the Uri of a document to the document highlights or a thenable that resolves to such. The lack of a result can be
         * signaled by returning `undefined`, `null`, or an empty map.
         */
        provideMultiDocumentHighlights(document: TextDocument, position: Position, otherDocuments: TextDocument[], token: CancellationToken):
            ProviderResult<MultiDocumentHighlight[]>;
    }

    namespace languages {

        /**
         * Register a multi document highlight provider.
         *
         * Multiple providers can be registered for a language. In that case providers are sorted
         * by their {@link languages.match score} and groups sequentially asked for document highlights.
         * The process stops when a provider returns a `non-falsy` or `non-failure` result.
         *
         * @param selector A selector that defines the documents this provider is applicable to.
         * @param provider A multi-document highlight provider.
         * @returns A {@link Disposable} that unregisters this provider when being disposed.
         * @stubbed
         */
        export function registerMultiDocumentHighlightProvider(selector: DocumentSelector, provider: MultiDocumentHighlightProvider): Disposable;
    }

}
