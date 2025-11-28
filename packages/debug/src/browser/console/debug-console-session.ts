// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import throttle = require('@theia/core/shared/lodash.throttle');
import { DebugProtocol } from '@vscode/debugprotocol/lib/debugProtocol';
import { ConsoleSession, ConsoleItem } from '@theia/console/lib/browser/console-session';
import { AnsiConsoleItem } from '@theia/console/lib/browser/ansi-console-item';
import { DebugSession } from '../debug-session';
import URI from '@theia/core/lib/common/uri';
import { ExpressionContainer, ExpressionItem } from './debug-console-items';
import { Severity } from '@theia/core/lib/common/severity';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { DebugSessionManager } from '../debug-session-manager';
import * as monaco from '@theia/monaco-editor-core';
import { LanguageSelector } from '@theia/monaco-editor-core/esm/vs/editor/common/languageSelector';
import { Disposable } from '@theia/core';

export const DebugConsoleSessionFactory = Symbol('DebugConsoleSessionFactory');

export type DebugConsoleSessionFactory = (debugSession: DebugSession) => DebugConsoleSession;

@injectable()
export class DebugConsoleSession extends ConsoleSession {

    static uri = new URI().withScheme('debugconsole');

    @inject(DebugSessionManager) protected readonly sessionManager: DebugSessionManager;

    protected items: ConsoleItem[] = [];

    protected _debugSession: DebugSession;

    // content buffer for [append](#append) method
    protected uncompletedItemContent: string | undefined;

    protected readonly completionKinds = new Map<DebugProtocol.CompletionItemType | undefined, monaco.languages.CompletionItemKind>();

    get debugSession(): DebugSession {
        return this._debugSession;
    }

    set debugSession(value: DebugSession) {
        this._debugSession = value;
        this.id = value.id;
    }

    @postConstruct()
    init(): void {
        this.completionKinds.set('method', monaco.languages.CompletionItemKind.Method);
        this.completionKinds.set('function', monaco.languages.CompletionItemKind.Function);
        this.completionKinds.set('constructor', monaco.languages.CompletionItemKind.Constructor);
        this.completionKinds.set('field', monaco.languages.CompletionItemKind.Field);
        this.completionKinds.set('variable', monaco.languages.CompletionItemKind.Variable);
        this.completionKinds.set('class', monaco.languages.CompletionItemKind.Class);
        this.completionKinds.set('interface', monaco.languages.CompletionItemKind.Interface);
        this.completionKinds.set('module', monaco.languages.CompletionItemKind.Module);
        this.completionKinds.set('property', monaco.languages.CompletionItemKind.Property);
        this.completionKinds.set('unit', monaco.languages.CompletionItemKind.Unit);
        this.completionKinds.set('value', monaco.languages.CompletionItemKind.Value);
        this.completionKinds.set('enum', monaco.languages.CompletionItemKind.Enum);
        this.completionKinds.set('keyword', monaco.languages.CompletionItemKind.Keyword);
        this.completionKinds.set('snippet', monaco.languages.CompletionItemKind.Snippet);
        this.completionKinds.set('text', monaco.languages.CompletionItemKind.Text);
        this.completionKinds.set('color', monaco.languages.CompletionItemKind.Color);
        this.completionKinds.set('file', monaco.languages.CompletionItemKind.File);
        this.completionKinds.set('reference', monaco.languages.CompletionItemKind.Reference);
        this.completionKinds.set('customcolor', monaco.languages.CompletionItemKind.Color);
        this.toDispose.push((monaco.languages.registerCompletionItemProvider as (languageId: LanguageSelector, provider: monaco.languages.CompletionItemProvider) => Disposable)({
            scheme: DebugConsoleSession.uri.scheme,
            hasAccessToAllModels: true
        }, {
            triggerCharacters: ['.'],
            provideCompletionItems: (model, position) => this.completions(model, position),
        }));
        this.toDispose.push(this.sessionManager.onDidResolveLazyVariable(() => this.fireDidChange()));
    }

    getElements(): IterableIterator<ConsoleItem> {
        return this.items.filter(e => !this.severity || e.severity === this.severity)[Symbol.iterator]();
    }

    protected async completions(model: monaco.editor.ITextModel, position: monaco.Position): Promise<monaco.languages.CompletionList | undefined> {
        const completionSession = this.findCompletionSession();
        if (completionSession) {
            const column = position.column;
            const lineNumber = position.lineNumber;
            const word = model.getWordAtPosition({ column, lineNumber });
            const overwriteBefore = word ? word.word.length : 0;
            const text = model.getValue();
            const items = await completionSession.completions(text, column, lineNumber);
            const suggestions = items.map(item => this.asCompletionItem(text, position, overwriteBefore, item));
            return { suggestions };
        }
        return undefined;
    }

    protected findCurrentSession(): DebugSession | undefined {
        const currentSession = this.sessionManager.currentSession;
        if (!currentSession) {
            return undefined;
        }
        if (currentSession.id === this.debugSession.id) {
            // perfect match
            return this.debugSession;
        }
        const parentSession = currentSession.findConsoleParent();
        if (parentSession?.id === this.debugSession.id) {
            // child of our session
            return currentSession;
        }
        return undefined;
    }

    protected findCompletionSession(): DebugSession | undefined {
        let completionSession: DebugSession | undefined = this.findCurrentSession();
        while (completionSession !== undefined) {
            if (completionSession.capabilities.supportsCompletionsRequest) {
                return completionSession;
            }
            completionSession = completionSession.parentSession;
        }
        return completionSession;
    }

    protected asCompletionItem(text: string, position: monaco.Position, overwriteBefore: number, item: DebugProtocol.CompletionItem): monaco.languages.CompletionItem {
        return {
            label: item.label,
            insertText: item.text || item.label,
            kind: this.completionKinds.get(item.type) || monaco.languages.CompletionItemKind.Property,
            filterText: (item.start && item.length) ? text.substring(item.start, item.start + item.length).concat(item.label) : undefined,
            range: monaco.Range.fromPositions(position.delta(0, -(item.length || overwriteBefore)), position),
            sortText: item.sortText
        };
    }

    async execute(value: string): Promise<void> {
        const expression = new ExpressionItem(value, () => this.findCurrentSession());
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

        this.items.push(new AnsiConsoleItem(this.uncompletedItemContent, Severity.Info));
        this.fireDidChange();
    }

    appendLine(value: string): void {
        this.items.push(new AnsiConsoleItem(value, Severity.Info));
        this.fireDidChange();
    }

    async logOutput(session: DebugSession, event: DebugProtocol.OutputEvent): Promise<void> {
        const body = event.body;
        const { category, variablesReference } = body;
        if (category === 'telemetry') {
            console.debug(`telemetry/${event.body.output}`, event.body.data);
            return;
        }
        const severity = category === 'stderr' ? Severity.Error : event.body.category === 'console' ? Severity.Warning : Severity.Info;
        if (variablesReference) {
            const items = await new ExpressionContainer({ session: () => session, variablesReference }).getElements();
            for (const item of items) {
                this.items.push(Object.assign(item, { severity }));
            }
        } else if (typeof body.output === 'string') {
            for (const line of body.output.split('\n')) {
                this.items.push(new AnsiConsoleItem(line, severity));
            }
        }
        this.fireDidChange();
    }

    protected override fireDidChange = throttle(() => super.fireDidChange(), 50);

}
