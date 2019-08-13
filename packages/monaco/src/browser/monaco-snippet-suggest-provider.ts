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
import * as jsoncparser from 'jsonc-parser';
import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { FileSystem, FileSystemError } from '@theia/filesystem/lib/common';

@injectable()
export class MonacoSnippetSuggestProvider implements monaco.modes.ISuggestSupport {

    @inject(FileSystem)
    protected readonly filesystem: FileSystem;

    protected readonly snippets = new Map<string, Snippet[]>();
    protected readonly pendingSnippets = new Map<string, Promise<void>[]>();

    async provideCompletionItems(model: monaco.editor.ITextModel, position: monaco.Position, context: monaco.modes.SuggestContext): Promise<monaco.modes.ISuggestResult> {
        const languageId = model.getModeId(); // TODO: look up a language id at the position
        await this.loadSnippets(languageId);
        const snippetsForLanguage = this.snippets.get(languageId) || [];
        const suggestions: MonacoSnippetSuggestion[] = [];
        const lineContent = model.getLineContent(position.lineNumber);
        const positionEndsInEmptyChar = lineContent.substr(0, position.column - 1).match(/\s$/);
        const prefixWordArray: monaco.editor.IWordAtPosition[] = [];
        const posCursor = { lineNumber: position.lineNumber, column: 1 };
        while (posCursor.column <= position.column) {
            const word = model.getWordAtPosition(posCursor);
            if (word) {
                prefixWordArray.push(word);
                posCursor.column = word.endColumn + 1;
                continue;
            }
            posCursor.column++;
        }
        const lastWordEndColumn = prefixWordArray ? prefixWordArray[prefixWordArray.length - 1].endColumn : position.column;
        const snippetsNotAdded = [...snippetsForLanguage];
        snippetsForLanguage.forEach(snippet => {
            // longest match the prefix line content
            prefixWordArray.forEach(word => {
                const logestMatchedPrefixContent: string = lineContent.substr(word.startColumn - 1, lastWordEndColumn - word.startColumn);
                if (snippetsNotAdded.indexOf(snippet) >= 0 && this.isPatternInText(logestMatchedPrefixContent, snippet.prefix, true)) {
                    const overwriteBefore = position.column - word.startColumn;
                    // only the word that cursor is located can be fully replaced
                    const overwriteAfter = lastWordEndColumn > position.column ? lastWordEndColumn - position.column : 0;
                    suggestions.push(new MonacoSnippetSuggestion(snippet,
                        monaco.Range.fromPositions(new monaco.Position(position.lineNumber, word.startColumn), position),
                        overwriteBefore, overwriteAfter));
                    snippetsNotAdded.splice(snippetsNotAdded.indexOf(snippet), 1);
                }
            });
        });

        if (!prefixWordArray || positionEndsInEmptyChar) {
            // only triggered by empty characters like whitespace, table; prevent adding suggestion when triggered by non-empty special characters like: ".","@"
            snippetsNotAdded.forEach(snippetNotAdded => {
                suggestions.push(new MonacoSnippetSuggestion(snippetNotAdded, monaco.Range.fromPositions(position), 0, 0));
            });
            snippetsNotAdded.length = 0;
        }

        suggestions.sort(MonacoSnippetSuggestion.compareByLabel);
        return { suggestions };
    }

    resolveCompletionItem(textModel: monaco.editor.ITextModel, position: monaco.Position, item: monaco.modes.ISuggestion): monaco.modes.ISuggestion {
        return item instanceof MonacoSnippetSuggestion ? item.resolve() : item;
    }

    protected async loadSnippets(scope: string): Promise<void> {
        const pending: Promise<void>[] = [];
        pending.push(...(this.pendingSnippets.get(scope) || []));
        pending.push(...(this.pendingSnippets.get('*') || []));
        if (pending.length) {
            await Promise.all(pending);
        }
    }

    fromURI(uri: string | URI, options: SnippetLoadOptions): Promise<void> {
        const pending = this.loadURI(uri, options);
        const { language } = options;
        const scopes = Array.isArray(language) ? language : !!language ? [language] : ['*'];
        for (const scope of scopes) {
            const pendingSnippets = this.pendingSnippets.get(scope) || [];
            pendingSnippets.push(pending);
            this.pendingSnippets.set(scope, pendingSnippets);
        }
        return pending;
    }
    /**
     * should NOT throw to prevent load erros on suggest
     */
    protected async loadURI(uri: string | URI, options: SnippetLoadOptions): Promise<void> {
        try {
            const { content } = await this.filesystem.resolveContent(uri.toString(), { encoding: 'utf-8' });
            const snippets = content && jsoncparser.parse(content, undefined, { disallowComments: false });
            this.fromJSON(snippets, options);
        } catch (e) {
            if (!FileSystemError.FileNotFound.is(e) && !FileSystemError.FileIsDirectory.is(e)) {
                console.error(e);
            }
        }
    }

    fromJSON(snippets: JsonSerializedSnippets | undefined, { language, source }: SnippetLoadOptions): void {
        this.parseSnippets(snippets, (name, snippet) => {
            let { prefix, body, description } = snippet;
            if (Array.isArray(body)) {
                body = body.join('\n');
            }
            if (typeof prefix !== 'string' || typeof body !== 'string') {
                return;
            }
            const scopes: string[] = [];
            if (language) {
                if (Array.isArray(language)) {
                    scopes.push(...language);
                } else {
                    scopes.push(language);
                }
            } else if (typeof snippet.scope === 'string') {
                for (const rawScope of snippet.scope.split(',')) {
                    const scope = rawScope.trim();
                    if (scope) {
                        scopes.push(scope);
                    }
                }
            }
            this.push({
                scopes,
                name,
                prefix,
                description,
                body,
                source
            });
        });
    }
    protected parseSnippets(snippets: JsonSerializedSnippets | undefined, accept: (name: string, snippet: JsonSerializedSnippet) => void): void {
        if (typeof snippets === 'object') {
            // tslint:disable-next-line:forin
            for (const name in snippets) {
                const scopeOrTemplate = snippets[name];
                if (JsonSerializedSnippet.is(scopeOrTemplate)) {
                    accept(name, scopeOrTemplate);
                } else {
                    this.parseSnippets(scopeOrTemplate, accept);
                }
            }
        }
    }

    push(...snippets: Snippet[]): void {
        for (const snippet of snippets) {
            for (const scope of snippet.scopes) {
                const languageSnippets = this.snippets.get(scope) || [];
                languageSnippets.push(snippet);
                this.snippets.set(scope, languageSnippets);
            }
        }
    }

    isPatternInText(pattern: string, text: string, ignoreCase: boolean): boolean {
        pattern = ignoreCase ? pattern.toLowerCase() : pattern;
        text = ignoreCase ? text.toLowerCase() : text;
        let patternPos = 0;
        for (let textPos = 0; textPos < text.length && patternPos < pattern.length; textPos++) {
            patternPos += pattern[patternPos] === text[textPos] ? 1 : 0;
        }
        return patternPos === pattern.length;
    }

}

export interface SnippetLoadOptions {
    language?: string | string[]
    source: string
}

export interface JsonSerializedSnippets {
    [name: string]: JsonSerializedSnippet | { [name: string]: JsonSerializedSnippet };
}
export interface JsonSerializedSnippet {
    body: string | string[];
    scope: string;
    prefix: string;
    description: string;
}
export namespace JsonSerializedSnippet {
    export function is(obj: Object | undefined): obj is JsonSerializedSnippet {
        return typeof obj === 'object' && 'body' in obj && 'prefix' in obj;
    }
}

export interface Snippet {
    readonly scopes: string[]
    readonly name: string
    readonly prefix: string
    readonly description: string
    readonly body: string
    readonly source: string
}

export class MonacoSnippetSuggestion implements monaco.modes.ISuggestion {

    readonly label: string;
    readonly detail: string;
    readonly sortText: string;
    readonly noAutoAccept = true;
    readonly type: 'snippet' = 'snippet';
    readonly snippetType: 'textmate' = 'textmate';
    readonly range: monaco.IRange;
    readonly overwriteBefore?: number;
    readonly overwriteAfter?: number;

    insertText: string;
    documentation?: monaco.IMarkdownString;

    constructor(protected readonly snippet: Snippet, range: monaco.IRange, overwriteBefore: number, overwriteAfter: number) {
        this.label = snippet.prefix;
        this.detail = `${snippet.description || snippet.name} (${snippet.source})`;
        this.insertText = snippet.body;
        this.sortText = `z-${snippet.prefix}`;
        this.range = range;
        this.overwriteBefore = overwriteBefore;
        this.overwriteAfter = overwriteAfter;
    }

    protected resolved = false;
    resolve(): MonacoSnippetSuggestion {
        if (!this.resolved) {
            const codeSnippet = new monaco.snippetParser.SnippetParser().parse(this.snippet.body).toString();
            this.documentation = { value: '```\n' + codeSnippet + '```' };
            this.resolved = true;
        }
        return this;
    }

    static compareByLabel(a: MonacoSnippetSuggestion, b: MonacoSnippetSuggestion): number {
        return a.label > b.label ? 1 : a.label < b.label ? -1 : 0;
    }

}
