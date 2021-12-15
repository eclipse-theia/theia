/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable } from '@theia/core/shared/inversify';
import { Disposable } from '@theia/core/lib/common/disposable';
import { SymbolKind, Range, TextDocumentPositionParams } from '@theia/core/shared/vscode-languageserver-protocol';

@injectable()
export class TypeHierarchyRegistry {

    protected readonly providers = new Map<string, TypeHierarchyProvider>();

    async get(languageId: string | undefined): Promise<TypeHierarchyProvider | undefined> {
        return languageId ? this.providers.get(languageId) : undefined;
    }

    register(provider: TypeHierarchyProvider): Disposable {
        const { languageId } = provider;
        if (this.providers.has(languageId)) {
            throw new Error(`type hierarchy provider for '${languageId}' language is already registered`);
        }
        this.providers.set(languageId, provider);
        return Disposable.create(() => this.providers.delete(languageId));
    }

}

export interface TypeHierarchyProvider extends Disposable {
    readonly languageId: string;
    get(params: TypeHierarchyParams): Promise<TypeHierarchyItem | undefined>;
    resolve(params: ResolveTypeHierarchyItemParams): Promise<TypeHierarchyItem | undefined>;

}

/**
 * The type hierarchy params is an extension of the `TextDocumentPositionParams` with optional properties
 * which can be used to eagerly resolve the item when requesting from the server.
 */
export interface TypeHierarchyParams extends TextDocumentPositionParams {

    /**
     * The hierarchy levels to resolve. `0` indicates no level. When not defined, it is treated as `0`.
     */
    resolve?: number;

    /**
     * The direction of the hierarchy levels to resolve.
     */
    direction?: TypeHierarchyDirection

}

export const enum TypeHierarchyDirection {

    /**
     * Flag for retrieving/resolving the subtypes.
     */
    Children,

    /**
     * Flag to use when retrieving/resolving the supertypes.
     */
    Parents,

    /**
     * Flag for resolving both the super- and subtypes.
     */
    Both

}

/**
 * Parameters for the `typeHierarchy/resolve` request.
 */
export interface ResolveTypeHierarchyItemParams {

    /**
     * The item to resolve.
     */
    item: TypeHierarchyItem;

    /**
     * The hierarchy levels to resolve. `0` indicates no level.
     */
    resolve: number;

    /**
     * The direction of the hierarchy levels to resolve.
     */
    direction: TypeHierarchyDirection;
}

export interface TypeHierarchyItem {

    /**
     * The human readable name of the hierarchy item.
     */
    name: string;

    /**
     * Optional detail for the hierarchy item. It can be, for instance, the signature of a function or method.
     */
    detail?: string;

    /**
     * The kind of the hierarchy item. For instance, class or interface.
     */
    kind: SymbolKind;

    /**
     * `true` if the hierarchy item is deprecated. Otherwise, `false`. It is `false` by default.
     */
    deprecated?: boolean;

    /**
     * The URI of the text document where this type hierarchy item belongs to.
     */
    uri: string;

    /**
     * The range enclosing this type hierarchy item not including leading/trailing whitespace but everything else
     * like comments. This information is typically used to determine if the clients cursor is inside the type
     * hierarchy item to reveal in the symbol in the UI.
     */
    range: Range;

    /**
     * The range that should be selected and revealed when this type hierarchy item is being picked, e.g the name
     * of a function. Must be contained by the `range`.
     */
    selectionRange: Range;

    /**
     * If this type hierarchy item is resolved, it contains the direct parents. Could be empty if the item does
     * not have any direct parents. If not defined, the parents have not been resolved yet.
     */
    parents?: TypeHierarchyItem[];

    /**
     * If this type hierarchy item is resolved, it contains the direct children of the current item. Could be
     * empty if the item does not have any descendants. If not defined, the children have not been resolved.
     */
    children?: TypeHierarchyItem[];

    /**
     * An optional data field can be used to identify a type hierarchy item in a resolve request.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data?: any;
}
