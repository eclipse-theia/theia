// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the
// Eclipse Public License v. 2.0 are satisfied: GNU General Public License,
// version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ContributionProvider } from '@theia/core';
import { inject, injectable, named, postConstruct } from '@theia/core/shared/inversify';

/**
 * A change operation to be applied to content by a {@link ContentChangeApplier}.
 */
export interface ChangeOperation {
    kind: string;
}

/**
 * A provider capable of applying a content change operation.
 *
 * Implementations of this interface are responsible for modifying
 * a given content string based on the corresponding {@link ChangeOperation}.
 *
 * @template T The type of change operation.
 */
export interface ContentChangeApplier<T extends ChangeOperation> {
    /**
     * The kind of change operation that this applier can handle.
     */
    kind: T['kind'];
    /**
     * Applies a change operation to the provided content.
     *
     * @param content The original content.
     * @param operation The change operation to apply.
     * @returns The updated content.
     */
    applyChange(content: string, operation: T): string;
}

export const ContentChangeApplier = Symbol('ContentChangeApplier');

/**
 * A service that applies content changes using registered ContentChangeApplier contributions.
 *
 * This class collects multiple implementations of the {@link ContentChangeApplier}
 * interface and applies a series of change operations to a given content string.
 */
@injectable()
export class ContentChangeApplierService {

    @inject(ContributionProvider)
    @named(ContentChangeApplier)
    public providers: ContributionProvider<ContentChangeApplier<ChangeOperation>>;

    private readonly applierMap = new Map<string, ContentChangeApplier<ChangeOperation>>();

    @postConstruct()
    init(): void {
        this.providers.getContributions().forEach(provider => {
            this.registerContentChangeApplier(provider.kind, provider);
        });
    }
    /**
     * Registers a {@link ContentChangeApplier} for a specific operation kind.
     *
     * @param kind The change operation kind (e.g. 'replace', 'diffBased')
     * @param provider The ContentChangeApplier implementation that handles operations of that kind.
     */
    registerContentChangeApplier(kind: string, provider: ContentChangeApplier<ChangeOperation>): void {
        this.applierMap.set(kind, provider);
    }

    /**
     * Applies an array of changes to the given content.
     *
     * Each change operation in the array is applied sequentially to update the content.
     *
     * @param content The initial content.
     * @param changes An array of change operations.
     * @returns The modified content after all operations have been applied.
     * @throws Error If a change operation's kind does not have a registered ContentChangeApplier.
     */
    public applyChangesToContent(content: string, changes: ChangeOperation[]): string {
        for (const operation of changes) {
            const applier = this.applierMap.get(operation.kind);
            if (!applier) {
                throw new Error(`No ContentChangeApplier found for operation kind: ${operation.kind}`);
            }
            content = applier.applyChange(content, operation);
        }
        return content;
    }
}
