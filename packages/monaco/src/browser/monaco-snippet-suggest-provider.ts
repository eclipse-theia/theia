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
import { injectable } from 'inversify';

@injectable()
export class MonacoSnippetSuggestProvider implements monaco.modes.ISuggestSupport {

    protected readonly snippets = new Map<string, MonacoSnippetSuggestion[]>();

    push(...snippets: Snippet[]): void {
        for (const snippet of snippets) {
            for (const scope of snippet.scopes) {
                const languageSnippets = this.snippets.get(scope) || [];
                languageSnippets.push(new MonacoSnippetSuggestion(snippet));
                this.snippets.set(scope, languageSnippets);
            }
        }
    }

    async provideCompletionItems(model: monaco.editor.ITextModel): Promise<monaco.modes.ISuggestResult> {
        const languageId = model.getModeId(); // TODO: look up a language id at the position
        const suggestions = this.snippets.get(languageId) || [];
        return { suggestions };
    }

    resolveCompletionItem(_: monaco.editor.ITextModel, __: monaco.Position, item: monaco.modes.ISuggestion): monaco.modes.ISuggestion {
        return item instanceof MonacoSnippetSuggestion ? item.resolve() : item;
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

    insertText: string;
    documentation?: monaco.IMarkdownString;

    constructor(protected readonly snippet: Snippet) {
        this.label = snippet.prefix;
        this.detail = `${snippet.description || snippet.name} (${snippet.source})"`;
        this.insertText = snippet.body;
        this.sortText = `z-${snippet.prefix}`;
    }

    protected resolved = false;
    resolve(): MonacoSnippetSuggestion {
        if (!this.resolved) {
            const codeSnippet = new monaco.snippetParser.SnippetParser().parse(this.snippet.body).toString();
            this.insertText = codeSnippet;
            this.documentation = { value: '```\n' + codeSnippet + '```' };
            this.resolved = true;
        }
        return this;
    }

}
