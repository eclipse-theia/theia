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

import { injectable, inject, postConstruct } from 'inversify';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { MessageType } from '@theia/core/lib/common';
import { ConsoleSession, ConsoleItem } from '@theia/console/lib/browser/console-session';
import { AnsiConsoleItem } from '@theia/console/lib/browser/ansi-console-item';
import { DebugSession } from '../debug-session';
import { DebugSessionManager } from '../debug-session-manager';
import { Languages, CompletionItem, CompletionItemKind, Position, Range, TextEdit, Workspace, TextDocument, CompletionParams } from '@theia/languages/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { ExpressionContainer, ExpressionItem } from './debug-console-items';

@injectable()
export class DebugConsoleSession extends ConsoleSession {

    static uri = new URI().withScheme('debugconsole');

    readonly id = 'debug';
    protected items: ConsoleItem[] = [];

    // content buffer for [append](#append) method
    protected uncompletedItemContent: string | undefined;

    @inject(DebugSessionManager)
    protected readonly manager: DebugSessionManager;

    @inject(Languages)
    protected readonly languages: Languages;

    @inject(Workspace)
    protected readonly workspace: Workspace;

    protected readonly completionKinds = new Map<DebugProtocol.CompletionItemType | undefined, CompletionItemKind>();

    @postConstruct()
    init(): void {
        this.toDispose.push(this.manager.onDidCreateDebugSession(session => {
            if (this.manager.sessions.length === 1) {
                this.clear();
            }
            session.on('output', event => this.logOutput(session, event));
        }));
        this.completionKinds.set('method', CompletionItemKind.Method);
        this.completionKinds.set('function', CompletionItemKind.Function);
        this.completionKinds.set('constructor', CompletionItemKind.Constructor);
        this.completionKinds.set('field', CompletionItemKind.Field);
        this.completionKinds.set('variable', CompletionItemKind.Variable);
        this.completionKinds.set('class', CompletionItemKind.Class);
        this.completionKinds.set('interface', CompletionItemKind.Interface);
        this.completionKinds.set('module', CompletionItemKind.Module);
        this.completionKinds.set('property', CompletionItemKind.Property);
        this.completionKinds.set('unit', CompletionItemKind.Unit);
        this.completionKinds.set('value', CompletionItemKind.Value);
        this.completionKinds.set('enum', CompletionItemKind.Enum);
        this.completionKinds.set('keyword', CompletionItemKind.Keyword);
        this.completionKinds.set('snippet', CompletionItemKind.Snippet);
        this.completionKinds.set('text', CompletionItemKind.Text);
        this.completionKinds.set('color', CompletionItemKind.Color);
        this.completionKinds.set('file', CompletionItemKind.File);
        this.completionKinds.set('reference', CompletionItemKind.Reference);
        this.completionKinds.set('customcolor', CompletionItemKind.Color);
        if (this.languages.registerCompletionItemProvider) {
            this.toDispose.push(this.languages.registerCompletionItemProvider([DebugConsoleSession.uri], {
                provideCompletionItems: params => this.completions(params)
            }, '.'));
        }
    }

    getElements(): IterableIterator<ConsoleItem> {
        return this.items[Symbol.iterator]();
    }

    protected async completions({ textDocument: { uri }, position }: CompletionParams): Promise<CompletionItem[]> {
        const session = this.manager.currentSession;
        if (session && session.capabilities.supportsCompletionsRequest) {
            const model = monaco.editor.getModel(monaco.Uri.parse(uri));
            if (model) {
                const column = position.character + 1;
                const lineNumber = position.line + 1;
                const word = model.getWordAtPosition({ column, lineNumber });
                const prefixLength = word ? word.word.length : 0;
                const text = model.getValue();
                const document = TextDocument.create(uri, model.getModeId(), model.getVersionId(), text);
                const items = await session.completions(text, column, lineNumber);
                return items.map(item => this.asCompletionItem(document, position, prefixLength, item));
            }
        }
        return [];
    }

    protected asCompletionItem(document: TextDocument, position: Position, prefixLength: number, item: DebugProtocol.CompletionItem): CompletionItem {
        const { label, text, type, length } = item;
        const newText = text || label;
        const start = document.positionAt(document.offsetAt(position) - (length || prefixLength));
        const replaceRange = Range.create(start, position);
        const textEdit = TextEdit.replace(replaceRange, newText);
        return {
            label,
            textEdit,
            kind: this.completionKinds.get(type)
        };
    }

    async execute(value: string): Promise<void> {
        const expression = new ExpressionItem(value, this.manager.currentSession);
        this.items.push(expression);
        await expression.evaluate();
        this.fireDidChange();
    }

    clear(): void {
        this.items = [];
        this.fireDidChange();
    }

    append(value: string): void {
        if (!value) {
            return;
        }

        const lastItem = this.items.slice(-1)[0];
        if (lastItem instanceof AnsiConsoleItem && lastItem.content === this.uncompletedItemContent) {
            this.items.pop();
            this.uncompletedItemContent += value;
        } else {
            this.uncompletedItemContent = value;
        }

        this.items.push(new AnsiConsoleItem(this.uncompletedItemContent, MessageType.Info));
        this.fireDidChange();
    }

    appendLine(value: string): void {
        this.items.push(new AnsiConsoleItem(value, MessageType.Info));
        this.fireDidChange();
    }

    protected async logOutput(session: DebugSession, event: DebugProtocol.OutputEvent): Promise<void> {
        const body = event.body;
        const { category, variablesReference } = body;
        if (category === 'telemetry') {
            console.debug(`telemetry/${event.body.output}`, event.body.data);
            return;
        }
        const severity = category === 'stderr' ? MessageType.Error : event.body.category === 'console' ? MessageType.Warning : MessageType.Info;
        if (variablesReference) {
            const items = await new ExpressionContainer({ session, variablesReference }).getElements();
            this.items.push(...items);
        } else if (typeof body.output === 'string') {
            for (const line of body.output.split('\n')) {
                this.items.push(new AnsiConsoleItem(line, severity));
            }
        }
        this.fireDidChange();
    }

    protected fireDidChange(): void {
        this.onDidChangeEmitter.fire(undefined);
    }

}
