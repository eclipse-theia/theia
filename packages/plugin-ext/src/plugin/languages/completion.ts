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

import URI from 'vscode-uri/lib/umd';
import * as theia from '@theia/plugin';
import { CompletionList, Range, SnippetString } from '../types-impl';
import { DocumentsExtImpl } from '../documents';
import * as Converter from '../type-converters';
import { mixin } from '../../common/types';
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
        return Promise.resolve(this.delegate.provideCompletionItems(doc, pos, token, context)).then(value => {
            const id = this.cacheId++;

            const toDispose = new DisposableCollection();
            this.disposables.set(id, toDispose);

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
            this.cache.set(id, list.items);

            return result;
        });
    }

    resolveCompletionItem(resource: URI, position: Position, completion: Completion, token: theia.CancellationToken): Promise<Completion> {
        if (typeof this.delegate.resolveCompletionItem !== 'function') {
            return Promise.resolve(completion);
        }

        const { parentId, id } = (<CompletionDto>completion);
        const item = this.cache.has(parentId) && this.cache.get(parentId)![id];
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

    async releaseCompletionItems(id: number): Promise<void> {
        this.cache.delete(id);
        const toDispose = this.disposables.get(id);
        if (toDispose) {
            toDispose.dispose();
            this.disposables.delete(id);
        }
    }

    private convertCompletionItem(item: theia.CompletionItem, position: theia.Position, defaultRange: theia.Range, id: number, parentId: number): CompletionDto | undefined {
        if (typeof item.label !== 'string' || item.label.length === 0) {
            console.warn('Invalid Completion Item -> must have at least a label');
            return undefined;
        }

        const toDispose = this.disposables.get(parentId);
        if (!toDispose) {
            throw Error('DisposableCollection is missing...');
        }

        const range = item.textEdit ? item.textEdit.range : item.range || defaultRange;
        if (range && (!range.isSingleLine || range.start.line !== position.line)) {
            console.warn('Invalid Completion Item -> must be single line and on the same line');
            return undefined;
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
            range: Converter.fromRange(range),
            additionalTextEdits: item.additionalTextEdits && item.additionalTextEdits.map(Converter.fromTextEdit),
            command: this.commands.converter.toSafeCommand(item.command, toDispose),
            commitCharacters: item.commitCharacters
        };
    }

    static hasResolveSupport(provider: theia.CompletionItemProvider): boolean {
        return typeof provider.resolveCompletionItem === 'function';
    }
}
