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

import {
    LanguagesExt,
    PLUGIN_RPC_CONTEXT,
    LanguagesMain,
    SerializedLanguageConfiguration,
    SerializedRegExp,
    SerializedOnEnterRule,
    SerializedIndentationRule,
    Position
} from '../api/plugin-api';
import { RPCProtocol } from '../api/rpc-protocol';
import * as theia from '@theia/plugin';
import { DocumentsExtImpl } from './documents';
import { Disposable, CompletionList, Range, SnippetString } from './types-impl';
import URI from 'vscode-uri/lib/umd';
import { match as matchGlobPattern } from '../common/glob';
import { UriComponents } from '../common/uri-components';
import { CompletionContext, CompletionResultDto, Completion, SerializedDocumentFilter, CompletionDto } from '../api/model';
import * as Converter from './type-converters';
import { mixin } from '../common/types';

type Adapter = CompletionAdapter;

export class LanguagesExtImpl implements LanguagesExt {

    private proxy: LanguagesMain;

    private callId = 0;
    private adaptersMap = new Map<number, Adapter>();

    constructor(rpc: RPCProtocol, private readonly documents: DocumentsExtImpl) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.LANGUAGES_MAIN);
    }

    getLanguages(): Promise<string[]> {
        return this.proxy.$getLanguages();
    }

    setLanguageConfiguration(language: string, configuration: theia.LanguageConfiguration): theia.Disposable {
        const { wordPattern } = configuration;

        if (wordPattern) {
            this.documents.setWordDefinitionFor(language, wordPattern);
        } else {
            // tslint:disable-next-line:no-null-keyword
            this.documents.setWordDefinitionFor(language, null);
        }

        const callId = this.nextCallId();

        const config: SerializedLanguageConfiguration = {
            brackets: configuration.brackets,
            comments: configuration.comments,
            onEnterRules: serializeEnterRules(configuration.onEnterRules),
            wordPattern: serializeRegExp(configuration.wordPattern),
            indentationRules: serializeIndentation(configuration.indentationRules)
        };

        this.proxy.$setLanguageConfiguration(callId, language, config);
        return this.createDisposable(callId);

    }

    private nextCallId(): number {
        return this.callId++;
    }

    private createDisposable(callId: number): theia.Disposable {
        return new Disposable(() => {
            this.adaptersMap.delete(callId);
            this.proxy.$unregister(callId);
        });
    }

    private addNewAdapter(adapter: Adapter): number {
        const callId = this.nextCallId();
        this.adaptersMap.set(callId, adapter);
        return callId;
    }

    private withAdapter<A, R>(handle: number, ctor: { new(...args: any[]): A }, callback: (adapter: A) => Promise<R>): Promise<R> {
        const adapter = this.adaptersMap.get(handle);
        if (!(adapter instanceof ctor)) {
            return Promise.reject(new Error('no adapter found'));
        }
        return callback(<A>adapter);
    }

    private transformDocumentSelector(selector: theia.DocumentSelector): SerializedDocumentFilter[] {
        if (Array.isArray(selector)) {
            return selector.map(sel => this.doTransformDocumentSelector(sel)!);
        }

        return [this.doTransformDocumentSelector(selector)!];
    }

    private doTransformDocumentSelector(selector: string | theia.DocumentFilter): SerializedDocumentFilter | undefined {
        if (typeof selector === 'string') {
            return {
                $serialized: true,
                language: selector
            };
        }

        if (selector) {
            return {
                $serialized: true,
                language: selector.language,
                scheme: selector.scheme,
                pattern: selector.pattern
            };
        }

        return undefined;
    }

    // ### Completion begin
    $provideCompletionItems(handle: number, resource: UriComponents, position: Position, context: CompletionContext): Promise<CompletionResultDto | undefined> {
        return this.withAdapter(handle, CompletionAdapter, adapter => adapter.provideCompletionItems(URI.revive(resource), position, context));
    }

    $resolveCompletionItem(handle: number, resource: UriComponents, position: Position, completion: Completion): Promise<Completion> {
        return this.withAdapter(handle, CompletionAdapter, adapter => adapter.resolveCompletionItem(URI.revive(resource), position, completion));
    }

    $releaseCompletionItems(handle: number, id: number): void {
        this.withAdapter(handle, CompletionAdapter, adapter => adapter.releaseCompletionItems(id));
    }

    registerCompletionItemProvider(selector: theia.DocumentSelector, provider: theia.CompletionItemProvider, triggerCharacters: string[]): theia.Disposable {
        const callId = this.addNewAdapter(new CompletionAdapter(provider, this.documents));
        this.proxy.$registerCompletionSupport(callId, this.transformDocumentSelector(selector), triggerCharacters, CompletionAdapter.hasResolveSupport(provider));
        return this.createDisposable(callId);
    }
    // ### Completion end

}

function serializeEnterRules(rules?: theia.OnEnterRule[]): SerializedOnEnterRule[] | undefined {
    if (typeof rules === 'undefined' || rules === null) {
        return undefined;
    }

    return rules.map(r =>
        ({
            action: r.action,
            beforeText: serializeRegExp(r.beforeText),
            afterText: serializeRegExp(r.afterText)
        } as SerializedOnEnterRule));
}

function serializeRegExp(regexp?: RegExp): SerializedRegExp | undefined {
    if (typeof regexp === 'undefined' || regexp === null) {
        return undefined;
    }

    return {
        pattern: regexp.source,
        flags: (regexp.global ? 'g' : '') + (regexp.ignoreCase ? 'i' : '') + (regexp.multiline ? 'm' : '')
    };
}

function serializeIndentation(indentationRules?: theia.IndentationRule): SerializedIndentationRule | undefined {
    if (typeof indentationRules === 'undefined' || indentationRules === null) {
        return undefined;
    }

    return {
        increaseIndentPattern: serializeRegExp(indentationRules.increaseIndentPattern),
        decreaseIndentPattern: serializeRegExp(indentationRules.decreaseIndentPattern),
        indentNextLinePattern: serializeRegExp(indentationRules.indentNextLinePattern),
        unIndentedLinePattern: serializeRegExp(indentationRules.unIndentedLinePattern)
    };
}

export interface RelativePattern {
    base: string;
    pattern: string;
    pathToRelative(from: string, to: string): string;
}
export interface LanguageFilter {
    language?: string;
    scheme?: string;
    pattern?: string | RelativePattern;
    hasAccessToAllModels?: boolean;
}
export type LanguageSelector = string | LanguageFilter | (string | LanguageFilter)[];

export function score(selector: LanguageSelector | undefined, candidateUri: URI, candidateLanguage: string, candidateIsSynchronized: boolean): number {

    if (Array.isArray(selector)) {
        let ret = 0;
        for (const filter of selector) {
            const value = score(filter, candidateUri, candidateLanguage, candidateIsSynchronized);
            if (value === 10) {
                return value;
            }
            if (value > ret) {
                ret = value;
            }
        }
        return ret;

    } else if (typeof selector === 'string') {

        if (!candidateIsSynchronized) {
            return 0;
        }

        if (selector === '*') {
            return 5;
        } else if (selector === candidateLanguage) {
            return 10;
        } else {
            return 0;
        }

    } else if (selector) {
        const { language, pattern, scheme, hasAccessToAllModels } = selector;

        if (!candidateIsSynchronized && !hasAccessToAllModels) {
            return 0;
        }

        let result = 0;

        if (scheme) {
            if (scheme === candidateUri.scheme) {
                result = 10;
            } else if (scheme === '*') {
                result = 5;
            } else {
                return 0;
            }
        }

        if (language) {
            if (language === candidateLanguage) {
                result = 10;
            } else if (language === '*') {
                result = Math.max(result, 5);
            } else {
                return 0;
            }
        }

        if (pattern) {
            if (pattern === candidateUri.fsPath || matchGlobPattern(pattern, candidateUri.fsPath)) {
                result = 10;
            } else {
                return 0;
            }
        }

        return result;

    } else {
        return 0;
    }
}

class CompletionAdapter {
    private cacheId = 0;
    private cache = new Map<number, theia.CompletionItem[]>();

    constructor(private readonly delegate: theia.CompletionItemProvider,
        private readonly documents: DocumentsExtImpl) {

    }

    provideCompletionItems(resource: URI, position: Position, context: CompletionContext): Promise<CompletionResultDto | undefined> {
        const document = this.documents.getDocumentData(resource);
        if (!document) {
            return Promise.reject(new Error(`There are no document for  ${resource}`));
        }

        const doc = document.document;

        const pos = Converter.toPosition(position);
        return Promise.resolve(this.delegate.provideCompletionItems(doc, pos, undefined, context)).then(value => {
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
            this.cache.set(id, list.items);

            return result;
        });
    }

    resolveCompletionItem(resource: URI, position: Position, completion: Completion): Promise<Completion> {

        if (typeof this.delegate.resolveCompletionItem !== 'function') {
            return Promise.resolve(completion);
        }

        const { parentId, id } = (<CompletionDto>completion);
        const item = this.cache.has(parentId) && this.cache.get(parentId)![id];
        if (!item) {
            return Promise.resolve(completion);
        }

        return Promise.resolve(this.delegate.resolveCompletionItem(item, undefined)).then(resolvedItem => {

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
        this.cache.delete(id);
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
}
