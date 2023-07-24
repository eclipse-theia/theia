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

// code copied and modified from https://github.com/microsoft/vscode/blob/1.79.0/src/vscode-dts/vscode.proposed.canonicalUriProvider.d.ts

export module '@theia/plugin' {

    // https://github.com/microsoft/vscode/issues/180582

    export namespace workspace {
        /**
         *
         * @param scheme The URI scheme that this provider can provide canonical URIs for.
         * A canonical URI represents the conversion of a resource's alias into a source of truth URI.
         * Multiple aliases may convert to the same source of truth URI.
         * @param provider A provider which can convert URIs of scheme @param scheme to
         * a canonical URI which is stable across machines.
         */
        export function registerCanonicalUriProvider(scheme: string, provider: CanonicalUriProvider): Disposable;

        /**
         *
         * @param uri The URI to provide a canonical URI for.
         * @param token A cancellation token for the request.
         */
        export function getCanonicalUri(uri: Uri, options: CanonicalUriRequestOptions, token: CancellationToken): ProviderResult<Uri>;
    }

    export interface CanonicalUriProvider {
        /**
         *
         * @param uri The URI to provide a canonical URI for.
         * @param options Options that the provider should honor in the URI it returns.
         * @param token A cancellation token for the request.
         * @returns The canonical URI for the requested URI or undefined if no canonical URI can be provided.
         */
        provideCanonicalUri(uri: Uri, options: CanonicalUriRequestOptions, token: CancellationToken): ProviderResult<Uri>;
    }

    export interface CanonicalUriRequestOptions {
        /**
         *
         * The desired scheme of the canonical URI.
         */
        targetScheme: string;
    }
}
