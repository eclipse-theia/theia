/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

/**
 * @deprecated use MonacoSnippetSuggestProvider instead
 */
export class TextmateSnippetCompletionProvider implements monaco.languages.CompletionItemProvider {

    private items: monaco.languages.CompletionItem[];

    constructor(protected config: TextmateSnippets, protected mdLanguage: string = '') {
        this.items = [];
        for (const name of Object.keys(config)) {
            const textmateSnippet = config[name];
            const insertText = Array.isArray(textmateSnippet.body) ? textmateSnippet.body.join('\n') : textmateSnippet.body;
            this.items.push({
                label: textmateSnippet.prefix,
                detail: textmateSnippet.description,
                kind: monaco.languages.CompletionItemKind.Snippet,
                documentation: {
                    value: '```' + this.mdLanguage + '\n' + this.replaceVariables(insertText) + '```'
                },
                insertText: insertText,
                range: undefined!
            });
        }
    }

    protected replaceVariables(textmateSnippet: string): string {
        return new monaco.snippetParser.SnippetParser().parse(textmateSnippet).toString();
    }

    provideCompletionItems(document: monaco.editor.ITextModel,
        position: monaco.Position,
        context: monaco.languages.CompletionContext,
        token: monaco.CancellationToken): monaco.languages.CompletionList {
        return {
            suggestions: this.items
        };
    }
}

/**
 * @deprecated use JsonSerializedSnippets & MonacoSnippetSuggestProvider instead
 */
export interface TextmateSnippets {
    [name: string]: TextmateSnippet;
}

/**
 * @deprecated use JsonSerializedSnippet & MonacoSnippetSuggestProvider instead
 */
export interface TextmateSnippet {
    readonly prefix: string,
    readonly body: string[],
    readonly description: string
}
