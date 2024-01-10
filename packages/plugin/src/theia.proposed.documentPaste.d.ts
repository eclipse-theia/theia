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
// code copied and modified from https://github.com/microsoft/vscode/blob/1.79.0/src/vscode-dts/vscode.proposed.documentPaste.d.ts

export module '@theia/plugin' {

    /**
     * Provider invoked when the user copies and pastes code.
     */
    export interface DocumentPasteEditProvider {

        /**
         * Optional method invoked after the user copies text in a file.
         *
         * During {@link prepareDocumentPaste}, an extension can compute metadata that is attached to
         * a {@link DataTransfer} and is passed back to the provider in {@link provideDocumentPasteEdits}.
         *
         * @param document Document where the copy took place.
         * @param ranges Ranges being copied in the `document`.
         * @param dataTransfer The data transfer associated with the copy. You can store additional values on this for later use in  {@link provideDocumentPasteEdits}.
         * @param token A cancellation token.
         */
        prepareDocumentPaste?(document: TextDocument, ranges: readonly Range[], dataTransfer: DataTransfer, token: CancellationToken): void | Thenable<void>;

        /**
         * Invoked before the user pastes into a document.
         *
         * In this method, extensions can return a workspace edit that replaces the standard pasting behavior.
         *
         * @param document Document being pasted into
         * @param ranges Currently selected ranges in the document.
         * @param dataTransfer The data transfer associated with the paste.
         * @param token A cancellation token.
         *
         * @return Optional workspace edit that applies the paste. Return undefined to use standard pasting.
         */
        provideDocumentPasteEdits?(document: TextDocument, ranges: readonly Range[], dataTransfer: DataTransfer, token: CancellationToken): ProviderResult<DocumentPasteEdit>;
    }

    /**
     * An operation applied on paste
     */
    class DocumentPasteEdit {
        /**
         * Human readable label that describes the edit.
         */
        label: string;

        /**
         * Controls the ordering or multiple paste edits. If this provider yield to edits, it will be shown lower in the list.
         */
        yieldTo?: ReadonlyArray<
            | { readonly extensionId: string; readonly providerId: string }
            | { readonly mimeType: string }
        >;

        /**
         * The text or snippet to insert at the pasted locations.
         */
        insertText: string | SnippetString;

        /**
         * An optional additional edit to apply on paste.
         */
        additionalEdit?: WorkspaceEdit;

        /**
         * @param insertText The text or snippet to insert at the pasted locations.
         *
         * TODO: Reverse args, but this will break existing consumers :(
         */
        constructor(insertText: string | SnippetString, id: string, label: string);
    }

    interface DocumentPasteProviderMetadata {
        /**
         * Identifies the provider.
         *
         * This id is used when users configure the default provider for paste.
         *
         * This id should be unique within the extension but does not need to be unique across extensions.
         */
        readonly id: string;

        /**
         * Mime types that {@link DocumentPasteEditProvider.prepareDocumentPaste provideDocumentPasteEdits} may add on copy.
         */
        readonly copyMimeTypes?: readonly string[];

        /**
         * Mime types that {@link DocumentPasteEditProvider.provideDocumentPasteEdits provideDocumentPasteEdits} should be invoked for.
         *
         * This can either be an exact mime type such as `image/png`, or a wildcard pattern such as `image/*`.
         *
         * Use `text/uri-list` for resources dropped from the explorer or other tree views in the workbench.
         *
         * Use `files` to indicate that the provider should be invoked if any {@link DataTransferFile files} are present in the {@link DataTransfer}.
         * Note that {@link DataTransferFile} entries are only created when dropping content from outside the editor, such as
         * from the operating system.
         */
        readonly pasteMimeTypes?: readonly string[];
    }

    namespace languages {
        export function registerDocumentPasteEditProvider(selector: DocumentSelector, provider: DocumentPasteEditProvider, metadata: DocumentPasteProviderMetadata): Disposable;
    }
}
