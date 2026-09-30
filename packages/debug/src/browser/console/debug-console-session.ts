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
import { generateUuid } from '@theia/core/lib/common/uuid';
import { ExpressionContainer, ExpressionItem } from './debug-console-items';
import { Severity } from '@theia/core/lib/common/severity';
import { inject, injectable, postConstruct, named } from '@theia/core/shared/inversify';
import { DebugSessionManager } from '../debug-session-manager';
import { DebugPreferences } from '../../common/debug-preferences';
import * as monaco from '@theia/monaco-editor-core';
import { LanguageSelector } from '@theia/monaco-editor-core/esm/vs/editor/common/languageSelector';
import { Disposable, ILogger } from '@theia/core';

export const DebugConsoleSessionFactory = Symbol('DebugConsoleSessionFactory');

export type DebugConsoleSessionFactory = (debugSession: DebugSession) => DebugConsoleSession;

@injectable()
export class DebugConsoleSession extends ConsoleSession {

    static uri = new URI().withScheme('debugconsole');

    @inject(DebugSessionManager) protected readonly sessionManager: DebugSessionManager;

    @inject(ILogger) @named('debug:DebugConsoleSession')
    protected readonly logger: ILogger;

    @inject(DebugPreferences)
    protected readonly preferences: DebugPreferences;

    /**
     * The console has an identity of its own, independent of the sessions that run in it: it outlives the session it
     * was created for and is reused by a later one.
     */
    override id = generateUuid();

    protected items: ConsoleItem[] = [];

    protected _terminated = false;

    protected _debugSession: DebugSession | undefined;

    protected _label = '';

    protected _configurationName: string | undefined;

    // content buffer for [append](#append) method
    protected uncompletedItemContent: string | undefined;

    protected readonly completionKinds = new Map<DebugProtocol.CompletionItemType | undefined, monaco.languages.CompletionItemKind>();

    /**
     * The debug session this console currently belongs to, or `undefined` once that session has terminated.
     *
     * The reference is dropped on termination so that the console does not keep the whole session graph alive
     * while it preserves the output of that session.
     */
    get debugSession(): DebugSession | undefined {
        return this._debugSession;
    }

    /**
     * The label of the session this console belongs to, retained after that session has terminated.
     */
    get label(): string {
        return this._label;
    }

    /**
     * The name of the configuration this console was started for, used to match a restarted session to its console.
     */
    get configurationName(): string | undefined {
        return this._configurationName;
    }

    get terminated(): boolean {
        return this._terminated;
    }

    markTerminated(): void {
        if (!this._terminated) {
            this._terminated = true;
            // Release the session: from here on the console only holds the output it has already collected.
            this._debugSession = undefined;
            this.fireDidChange();
        }
    }

    /**
     * Runs the given session in this console, whether it is the session the console was created for or a later one
     * reusing it. Counterpart of {@link markTerminated}.
     *
     * The output of any previous session is dropped: it belongs to that run, and keeping it would merge two runs into
     * one view with no boundary between them. The filter and severity stay, since they are the view the user has set
     * up for this configuration.
     */
    startFor(session: DebugSession): void {
        this.items = [];
        this.uncompletedItemContent = undefined;
        this._debugSession = session;
        this._label = session.label;
        this._configurationName = session.configuration.name;
        this._terminated = false;
        this.fireDidChange();
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
        return this.items.filter(e => this.matchesFilter(e))[Symbol.iterator]();
    }

    protected matchesFilter(item: ConsoleItem): boolean {
        if (this.severity && item.severity !== this.severity) {
            return false;
        }
        if (this.filterText) {
            const text = this.getItemText(item).toLowerCase();
            const parsedFilters = this.parseFilterText(this.filterText.toLowerCase());

            if (parsedFilters.include.length > 0) {
                const matchesAnyInclude = parsedFilters.include.some(filter => text.includes(filter));
                if (!matchesAnyInclude) {
                    return false;
                }
            }

            for (const filter of parsedFilters.exclude) {
                if (text.includes(filter)) {
                    return false;
                }
            }
        }
        return true;
    }

    protected parseFilterText(filterText: string): { include: string[]; exclude: string[] } {
        const include: string[] = [];
        const exclude: string[] = [];

        const terms = filterText.split(',').map(term => term.trim()).filter(term => term.length > 0);

        for (const term of terms) {
            if (term.startsWith('!') && term.length > 1) {
                exclude.push(term.substring(1));
            } else {
                include.push(term);
            }
        }

        return { include, exclude };
    }

    protected getItemText(item: ConsoleItem): string {
        if (item instanceof AnsiConsoleItem) {
            return item.content;
        }
        if (item instanceof ExpressionItem) {
            return `${item.expression} ${item.value}`;
        }
        return '';
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
        const debugSession = this._debugSession;
        const currentSession = this.sessionManager.currentSession;
        if (!debugSession || !currentSession) {
            return undefined;
        }
        if (currentSession.id === debugSession.id) {
            // perfect match
            return debugSession;
        }
        const parentSession = currentSession.findConsoleParent();
        if (parentSession?.id === debugSession.id) {
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
        this.appendItems([expression]);
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

        this.appendItems([new AnsiConsoleItem(this.uncompletedItemContent, Severity.Info)]);
        this.fireDidChange();
    }

    appendLine(value: string): void {
        this.appendItems([new AnsiConsoleItem(value, Severity.Info)]);
        this.fireDidChange();
    }

    /**
     * Appends items, dropping the oldest ones so that the console stays within `debug.console.maximumLines`.
     */
    protected appendItems(items: ConsoleItem[]): void {
        for (const item of items) {
            this.items.push(item);
        }
        const maximumLines = this.preferences['debug.console.maximumLines'];
        if (maximumLines > 0 && this.items.length > maximumLines) {
            this.items.splice(0, this.items.length - maximumLines);
        }
    }

    async logOutput(session: DebugSession, event: DebugProtocol.OutputEvent): Promise<void> {
        const body = event.body;
        const { category, variablesReference } = body;
        if (category === 'telemetry') {
            this.logger.debug(`telemetry/${event.body.output}`, event.body.data);
            return;
        }
        const severity = category === 'stderr' ? Severity.Error : event.body.category === 'console' ? Severity.Warning : Severity.Info;
        if (variablesReference) {
            // Resolve the session by id rather than capturing it, so that the items do not keep it alive once it is gone.
            const { id } = session;
            const sessionProvider = () => this.sessionManager.getSession(id);
            const items = await new ExpressionContainer({ session: sessionProvider, variablesReference }).getElements();
            this.appendItems(Array.from(items, item => Object.assign(item, { severity })));
        } else if (typeof body.output === 'string') {
            this.appendItems(body.output.split('\n').map(line => new AnsiConsoleItem(line, severity)));
        }
        this.fireDidChange();
    }

    protected override fireDidChange = throttle(() => super.fireDidChange(), 50);

}
