// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
// code copied and modified from https://github.com/microsoft/vscode/blob/1.79.0/src/vscode-dts/vscode.proposed.dropMetadata.d.ts

export module '@theia/plugin' {

    // https://github.com/microsoft/vscode/issues/179430

    export interface DocumentDropEdit {

        /**
         * Human readable label that describes the edit.
         */
        label?: string;

        /**
         * The mime type from the {@link DataTransfer} that this edit applies.
         */
        handledMimeType?: string;

        /**
         * Controls the ordering or multiple paste edits. If this provider yield to edits, it will be shown lower in the list.
         */
        yieldTo?: ReadonlyArray<
            | { readonly extensionId: string; readonly providerId: string }
            | { readonly mimeType: string }
        >;
    }

    export interface DocumentDropEditProviderMetadata {
        /**
         * Identifies the provider.
         *
         * This id is used when users configure the default provider for drop.
         *
         * This id should be unique within the extension but does not need to be unique across extensions.
         */
        readonly id: string;

        /**
         * List of data transfer types that the provider supports.
         *
         * This can either be an exact mime type such as `image/png`, or a wildcard pattern such as `image/*`.
         *
         * Use `text/uri-list` for resources dropped from the explorer or other tree views in the workbench.
         *
         * Use `files` to indicate that the provider should be invoked if any {@link DataTransferFile files} are present in the {@link DataTransfer}.
         * Note that {@link DataTransferFile} entries are only created when dropping content from outside the editor, such as
         * from the operating system.
         */
        readonly dropMimeTypes: readonly string[];
    }

    export namespace languages {
        export function registerDocumentDropEditProvider(selector: DocumentSelector, provider: DocumentDropEditProvider, metadata?: DocumentDropEditProviderMetadata): Disposable;
    }
}
