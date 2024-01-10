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
// code copied and modified from https://github.com/microsoft/vscode/blob/1.77.0/src/vscode-dts/vscode.proposed.editSessionIdentityProvider.d.ts

export module '@theia/plugin' {

    // https://github.com/microsoft/vscode/issues/157734

    export namespace workspace {
        /**
         * An event that is emitted when an edit session identity is about to be requested.
         */
        export const onWillCreateEditSessionIdentity: Event<EditSessionIdentityWillCreateEvent>;

        /**
         *
         * @param scheme The URI scheme that this provider can provide edit session identities for.
         * @param provider A provider which can convert URIs for workspace folders of scheme @param scheme to
         * an edit session identifier which is stable across machines. This enables edit sessions to be resolved.
         */
        export function registerEditSessionIdentityProvider(scheme: string, provider: EditSessionIdentityProvider): Disposable;
    }

    export interface EditSessionIdentityProvider {
        /**
         *
         * @param workspaceFolder The workspace folder to provide an edit session identity for.
         * @param token A cancellation token for the request.
         * @returns A string representing the edit session identity for the requested workspace folder.
         */
        provideEditSessionIdentity(workspaceFolder: WorkspaceFolder, token: CancellationToken): ProviderResult<string>;

        /**
         *
         * @param identity1 An edit session identity.
         * @param identity2 A second edit session identity to compare to @param identity1.
         * @param token A cancellation token for the request.
         * @returns An {@link EditSessionIdentityMatch} representing the edit session identity match confidence for the provided identities.
         */
        provideEditSessionIdentityMatch(identity1: string, identity2: string, token: CancellationToken): ProviderResult<EditSessionIdentityMatch>;
    }

    export enum EditSessionIdentityMatch {
        Complete = 100,
        Partial = 50,
        None = 0
    }

    export interface EditSessionIdentityWillCreateEvent {

        /**
         * A cancellation token.
         */
        readonly token: CancellationToken;

        /**
         * The workspace folder to create an edit session identity for.
         */
        readonly workspaceFolder: WorkspaceFolder;

        /**
         * Allows to pause the event until the provided thenable resolves.
         *
         * *Note:* This function can only be called during event dispatch.
         *
         * @param thenable A thenable that delays saving.
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        waitUntil(thenable: Thenable<any>): void;
    }
}
