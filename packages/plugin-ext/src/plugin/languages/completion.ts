/********************************************************************************
 * Copyright (C) 2018-2019 Red Hat, Inc. and others.
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

import URI from 'vscode-uri/lib/umd';
import * as theia from '@theia/plugin';
import { CompletionList, Range, SnippetString } from '../types-impl';
import { DocumentsExtImpl } from '../documents';
import * as Converter from '../type-converters';
import { mixin } from '../../common/types';
import { Position } from '../../api/plugin-api';
import { CompletionContext, CompletionResultDto, Completion, CompletionDto } from '../../api/model';
import { DisposableCollection } from '@theia/core/lib/common/disposable';

export class CompletionAdapter {
    private cacheId = 0;
    private cache = new Map<string, Map<number, theia.CompletionItem[]>>();

    protected readonly toDispose = new DisposableCollection();

    constructor(private readonly delegate: theia.CompletionItemProvider,
        private readonly documents: DocumentsExtImpl) {
        this.toDispose.push(
            this.documents.onDidRemoveDocument(
                document => this.clearCache(document.uri.toString())
            )
        );
    }

    provideCompletionItems(resource: URI, position: Position, context: CompletionContext, token: theia.CancellationToken): Promise<CompletionResultDto | undefined> {
        const document = this.documents.getDocumentData(resource);
        if (!document) {
            return Promise.reject(new Error(`There are no document for  ${resource}`));
        }

        const doc = document.document;
        const pos = Converter.toPosition(position);
        return Promise.resolve(this.delegate.provideCompletionItems(doc, pos, token, context)).then(value => {
            this.clearCache(doc.uri.toString());

            const id = this.cacheId++;
            const result: CompletionResultDto = {
                id,
                completions: [],
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

            const wordRangeBeforePos = (doc.getWordRangeAtPosition(pos) as Range || new Range(pos, pos))
                .with({ end: pos });

            for (let i = 0; i < list.items.length; i++) {
                const suggestion = this.convertCompletionItem(list.items[i], pos, wordRangeBeforePos, i, id);
                if (suggestion) {
                    result.completions.push(suggestion);
                }
            }
            let docCache = this.cache.get(doc.uri.toString());
            if (!docCache) {
                docCache = new Map<number, theia.CompletionItem[]>();
                this.cache.set(doc.uri.toString(), docCache);
            }
            docCache.set(id, list.items);

            return result;
        });
    }

    resolveCompletionItem(resource: URI, position: Position, completion: Completion, token: theia.CancellationToken): Promise<Completion> {
        if (typeof this.delegate.resolveCompletionItem !== 'function') {
            return Promise.resolve(completion);
        }

        const { parentId, id } = (<CompletionDto>completion);
        const item = this.getCompletionItemFromCache(parentId, id);
        if (!item) {
            return Promise.resolve(completion);
        }

        return Promise.resolve(this.delegate.resolveCompletionItem(item, token)).then(resolvedItem => {

            if (!resolvedItem) {
                return completion;
            }

            const doc = this.documents.getDocumentData(resource)!.document;
            const pos = Converter.toPosition(position);
            const wordRangeBeforePos = (doc.getWordRangeAtPosition(pos) as Range || new Range(pos, pos)).with({ end: pos });
            const newCompletion = this.convertCompletionItem(resolvedItem, pos, wordRangeBeforePos, id, parentId);
            if (newCompletion) {
                mixin(completion, newCompletion, true);
            }

            return completion;
        });
    }

    releaseCompletionItems(id: number) {
        this.clearCacheForId(id);
        return Promise.resolve();
    }

    private convertCompletionItem(item: theia.CompletionItem, position: theia.Position, defaultRange: theia.Range, id: number, parentId: number): CompletionDto | undefined {
        if (typeof item.label !== 'string' || item.label.length === 0) {
            console.warn('Invalid Completion Item -> must have at least a label');
            return undefined;
        }

        const result: CompletionDto = {
            id,
            parentId,
            label: item.label,
            type: Converter.fromCompletionItemKind(item.kind),
            detail: item.detail,
            documentation: item.documentation,
            filterText: item.filterText,
            sortText: item.sortText,
            preselect: item.preselect,
            insertText: '',
            additionalTextEdits: item.additionalTextEdits && item.additionalTextEdits.map(Converter.fromTextEdit),
            command: undefined,   // TODO: implement this: this.commands.toInternal(item.command),
            commitCharacters: item.commitCharacters
        };

        if (typeof item.insertText === 'string') {
            result.insertText = item.insertText;
            result.snippetType = 'internal';

        } else if (item.insertText instanceof SnippetString) {
            result.insertText = item.insertText.value;
            result.snippetType = 'textmate';

        } else {
            result.insertText = item.label;
            result.snippetType = 'internal';
        }

        let range: theia.Range;
        if (item.range) {
            range = item.range;
        } else {
            range = defaultRange;
        }
        result.overwriteBefore = position.character - range.start.character;
        result.overwriteAfter = range.end.character - position.character;

        if (!range.isSingleLine || range.start.line !== position.line) {
            console.warn('Invalid Completion Item -> must be single line and on the same line');
            return undefined;
        }

        return result;
    }

    static hasResolveSupport(provider: theia.CompletionItemProvider): boolean {
        return typeof provider.resolveCompletionItem === 'function';
    }

    private clearCache(affectedUri?: string): void {
        if (affectedUri) {
            const cacheToClear = this.cache.get(affectedUri);
            if (cacheToClear) {
                cacheToClear.clear();
            }
        }
    }

    private clearCacheForId(id: number): void {
        for (const uri of this.cache.keys()) {
            const docCache = this.cache.get(uri);
            if (docCache) {
                if (docCache.has(id)) {
                    docCache.delete(id);
                }
            }
        }
    }

    private getCompletionItemFromCache(parentId: number, id: number): theia.CompletionItem | undefined {
        for (const uri of this.cache.keys()) {
            const docCache = this.cache.get(uri);
            if (docCache) {
                const items = docCache.get(parentId);
                if (items) {
                    return items[id];
                }
            }
        }
        return undefined;
    }
}
