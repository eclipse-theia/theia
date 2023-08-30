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

// code copied and modified from https://github.com/microsoft/vscode/blob/release/1.79/src/vscode-dts/vscode.proposed.shareProvider.d.ts

// https://github.com/microsoft/vscode/issues/176316 @joyceerhl

export module '@theia/plugin' {

    /**
     * Data about an item which can be shared.
     */
    export interface ShareableItem {
        /**
         * A resource in the workspace that can be shared.
         */
        resourceUri: Uri;

        /**
         * If present, a selection within the `resourceUri`.
         */
        selection?: Range;
    }

    /**
     * A provider which generates share links for resources in the editor.
     */
    export interface ShareProvider {

        /**
         * A unique ID for the provider.
         * This will be used to activate specific extensions contributing share providers if necessary.
         */
        readonly id: string;

        /**
         * A label which will be used to present this provider's options in the UI.
         */
        readonly label: string;

        /**
         * The order in which the provider should be listed in the UI when there are multiple providers.
         */
        readonly priority: number;

        /**
         *
         * @param item Data about an item which can be shared.
         * @param token A cancellation token.
         * @returns A {@link Uri} representing an external link or sharing text. The provider result
         * will be copied to the user's clipboard and presented in a confirmation dialog.
         */
        provideShare(item: ShareableItem, token: CancellationToken): ProviderResult<Uri | string>;
    }

    export namespace window {

        /**
         * Register a share provider. An extension may register multiple share providers.
         * There may be multiple share providers for the same {@link ShareableItem}.
         * @param selector A document selector to filter whether the provider should be shown for a {@link ShareableItem}.
         * @param provider A share provider.
         */
        export function registerShareProvider(selector: DocumentSelector, provider: ShareProvider): Disposable;
    }

    export interface TreeItem {

        /**
         * An optional property which, when set, inlines a `Share` option in the context menu for this tree item.
         */
        shareableItem?: ShareableItem;
    }
}
