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
// code copied and modified from https://github.com/microsoft/vscode/blob/1.77.0/src/vscode-dts/vscode.proposed.extensionsAny.d.ts

export module '@theia/plugin' {

    export interface Extension<T> {

        /**
         * `true` when the extension is associated to another extension host.
         *
         * *Note* that an extension from another extension host cannot export
         * API, e.g {@link Extension.exports its exports} are always `undefined`.
         */
        readonly isFromDifferentExtensionHost: boolean;
    }

    export namespace extensions {

        /**
         * Get an extension by its full identifier in the form of: `publisher.name`.
         *
         * @param extensionId An extension identifier.
         * @param includeDifferentExtensionHosts Include extensions from different extension host
         * @return An extension or `undefined`.
         *
         * *Note* In Theia, includeDifferentExtensionHosts will always be set to false, as we only support one host currently.
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        export function getExtension<T = any>(extensionId: string, includeDifferentExtensionHosts: boolean): Extension<T> | undefined;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        export function getExtension<T = any>(extensionId: string, includeDifferentExtensionHosts: true): Extension<T | undefined> | undefined;

        /**
         * All extensions across all extension hosts.
         *
         * @see {@link Extension.isFromDifferentExtensionHost}
         */
        export const allAcrossExtensionHosts: readonly Extension<void>[];

    }

}
