/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { URI } from '@theia/core/shared/vscode-uri';
import * as theia from '@theia/plugin';
import { CompletionItemTag, CompletionList, Range, SnippetString } from '../types-impl';
import { DocumentsExtImpl } from '../documents';
import * as Converter from '../type-converters';
import { Position } from '../../common/plugin-api-rpc';
import { CompletionContext, CompletionResultDto, Completion, CompletionDto, CompletionItemInsertTextRule } from '../../common/plugin-api-rpc-model';
import { CommandRegistryImpl } from '../command-registry';
import { DisposableCollection } from '@theia/core/lib/common/disposable';

export class CompletionAdapter {
    private cacheId = 0;
    private readonly cache = new Map<number, theia.CompletionItem[]>();
    private readonly disposables = new Map<number, DisposableCollection>();

    constructor(
        private readonly delegate: theia.CompletionItemProvider,
        private readonly documents: DocumentsExtImpl,
        private readonly commands: CommandRegistryImpl
    ) { }

    provideCompletionItems(resource: URI, position: Position, context: CompletionContext, token: theia.CancellationToken): Promise<CompletionResultDto | undefined> {
        const document = this.documents.getDocumentData(resource);
        if (!document) {
            return Promise.reject(new Error(`There are no document for  ${resource}`));
        }

        const doc = document.document;

        const pos = Converter.toPosition(position);

        // The default insert/replace ranges. It's important to compute them
        // before asynchronously asking the provider for its results. See
        // https://github.com/microsoft/vscode/issues/83400#issuecomment-546851421
        const replacing = doc.getWordRangeAtPosition(pos) || new Range(pos, pos);
        const inserting = replacing.with({ end: pos });

        return Promise.resolve(this.delegate.provideCompletionItems(doc, pos, token, context)).then(value => {
            const id = this.cacheId++;

            const toDispose = new DisposableCollection();
            this.disposables.set(id, toDispose);

            const result: CompletionResultDto = {
                id,
                completions: [],
                defaultRange: {
                    insert: Converter.fromRange(inserting),
                    replace: Converter.fromRange(replacing)
                }
            };

            let list: CompletionList;
            if (!value) {
                return undefined;
            } else if (Array.isArray(value)) {
                list = new CompletionList(value);
            } else {
                list = value;
                result.incomplete = list.isIncomplete;
            }

            for (let i = 0; i < list.items.length; i++) {
                const suggestion = this.convertCompletionItem(list.items[i], i, id, inserting, replacing);
                if (suggestion) {
                    result.completions.push(suggestion);
                }
            }
            this.cache.set(id, list.items);

            return result;
        });
    }

    async resolveCompletionItem(parentId: number, id: number, token: theia.CancellationToken): Promise<Completion | undefined> {
        if (typeof this.delegate.resolveCompletionItem !== 'function') {
            return undefined;
        }
        const item = this.cache.get(parentId)?.[id];
        if (!item) {
            return undefined;
        }
        const resolvedItem = await this.delegate.resolveCompletionItem(item, token);
        if (!resolvedItem) {
            return undefined;
        }
        return this.convertCompletionItem(resolvedItem, id, parentId);
    }

    async releaseCompletionItems(id: number): Promise<void> {
        this.cache.delete(id);
        const toDispose = this.disposables.get(id);
        if (toDispose) {
            toDispose.dispose();
            this.disposables.delete(id);
        }
    }

    private convertCompletionItem(item: theia.CompletionItem, id: number, parentId: number,
        defaultInserting?: theia.Range, defaultReplacing?: theia.Range): CompletionDto | undefined {
        if (typeof item.label !== 'string' || item.label.length === 0) {
            console.warn('Invalid Completion Item -> must have at least a label');
            return undefined;
        }

        const toDispose = this.disposables.get(parentId);
        if (!toDispose) {
            throw Error('DisposableCollection is missing...');
        }

        let insertText = item.label;
        let insertTextRules = item.keepWhitespace ? CompletionItemInsertTextRule.KeepWhitespace : 0;
        if (item.textEdit) {
            insertText = item.textEdit.newText;
        } else if (typeof item.insertText === 'string') {
            insertText = item.insertText;
        } else if (item.insertText instanceof SnippetString) {
            insertText = item.insertText.value;
            insertTextRules |= CompletionItemInsertTextRule.InsertAsSnippet;
        }

        let range: Completion['range'] | undefined;
        const itemRange = item.textEdit?.range || item.range;
        if (Range.isRange(itemRange)) {
            range = Converter.fromRange(itemRange);
        } else if (itemRange && (!defaultInserting?.isEqual(itemRange.inserting) || !defaultReplacing?.isEqual(itemRange.replacing))) {
            range = {
                insert: Converter.fromRange(itemRange.inserting),
                replace: Converter.fromRange(itemRange.replacing)
            };
        }

        const tags = (!!item.tags?.length || item.deprecated === true)
            ? [CompletionItemTag.Deprecated]
            : undefined;

        return {
            id,
            parentId,
            label: item.label,
            kind: Converter.fromCompletionItemKind(item.kind),
            detail: item.detail,
            documentation: item.documentation,
            filterText: item.filterText,
            sortText: item.sortText,
            preselect: item.preselect,
            insertText,
            insertTextRules,
            range,
            additionalTextEdits: item.additionalTextEdits && item.additionalTextEdits.map(Converter.fromTextEdit),
            command: this.commands.converter.toSafeCommand(item.command, toDispose),
            commitCharacters: item.commitCharacters,
            tags
        };
    }

    static hasResolveSupport(provider: theia.CompletionItemProvider): boolean {
        return typeof provider.resolveCompletionItem === 'function';
    }
}
