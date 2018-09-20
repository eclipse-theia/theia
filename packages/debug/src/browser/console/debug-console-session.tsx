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

import * as React from 'react';
import { injectable, inject, postConstruct } from 'inversify';
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { Event, Emitter, MessageType } from '@theia/core/lib/common';
import { ConsoleSession, ConsoleItem, CompositeConsoleItem } from '@theia/console/lib/browser/console-session';
import { AnsiConsoleItem } from '@theia/console/lib/browser/ansi-console-item';
import { DebugSession } from '../debug-model';
import { DebugSessionManager } from '../debug-session';
import { DebugSelectionService, DebugSelection } from '../view/debug-selection-service';
import { Languages, CompletionItem, CompletionItemKind, Position, Range, TextEdit, Workspace, TextDocument, CompletionParams } from '@theia/languages/lib/browser';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class DebugConsoleSession implements ConsoleSession {

    static uri = new URI().withScheme('debugconsole');

    id = 'debug';
    name = 'Debug';
    items: ConsoleItem[] = [];
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    @inject(DebugSessionManager)
    protected readonly manager: DebugSessionManager;

    @inject(DebugSelectionService)
    protected readonly selection: DebugSelectionService;

    @inject(Languages)
    protected readonly languages: Languages;

    @inject(Workspace)
    protected readonly workspace: Workspace;

    protected readonly completionKinds = new Map<DebugProtocol.CompletionItemType | undefined, CompletionItemKind>();

    @postConstruct()
    init(): void {
        this.manager.onDidCreateDebugSession(session => {
            if (this.manager.findAll().length === 1) {
                this.clear();
            }
            session.onDidOutput(event => this.logOutput(session, event));
        });
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
            this.languages.registerCompletionItemProvider([DebugConsoleSession.uri], {
                provideCompletionItems: params => this.completions(params)
            }, '.');
        }
    }

    protected async completions({ textDocument: { uri }, position }: CompletionParams): Promise<CompletionItem[]> {
        const session = this.manager.getActiveDebugSession();
        if (session) {
            const { capabilities } = session.state;
            const selection = this.selection.get(session.sessionId);
            const frameId = selection && selection.frame && selection.frame.id;
            if (capabilities.supportsCompletionsRequest) {
                const model = monaco.editor.getModel(monaco.Uri.parse(uri));
                if (model) {
                    const column = position.character + 1;
                    const lineNumber = position.line + 1;
                    const word = model.getWordAtPosition({ column, lineNumber });
                    const prefixLength = word ? word.word.length : 0;
                    const text = model.getValue();
                    const document = TextDocument.create(uri, model.getModeId(), model.getVersionId(), text);
                    const response = await session.completions({ frameId, text, column, line: lineNumber });
                    return response.body.targets.map(item => this.asCompletionItem(document, position, prefixLength, item));
                }
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
        const session = this.manager.getActiveDebugSession();
        const selection = session && this.selection.get(session!.sessionId);
        const expression = new ExpressionItem(value, session, selection);
        this.items.push(expression);
        await expression.evaluate();
        this.fireDidChange();
    }

    clear(): void {
        this.items = [];
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
            const items = await new ExpressionContainer({ session, variablesReference }).resolve();
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

export class ExpressionContainer implements CompositeConsoleItem {

    private static readonly BASE_CHUNK_SIZE = 100;

    protected readonly session: DebugSession | undefined;
    protected variablesReference: number;
    protected namedVariables: number | undefined;
    protected indexedVariables: number | undefined;
    protected readonly startOfVariables: number;

    constructor(options: ExpressionContainer.Options) {
        this.session = options.session;
        this.variablesReference = options.variablesReference || 0;
        this.namedVariables = options.namedVariables;
        this.indexedVariables = options.indexedVariables;
        this.startOfVariables = options.startOfVariables || 0;
    }

    get empty(): boolean {
        return false;
    }

    render(): React.ReactNode {
        return undefined;
    }

    get hasChildren(): boolean {
        return !!this.variablesReference;
    }

    protected items: Promise<ConsoleItem[]> | undefined;
    async resolve(): Promise<ConsoleItem[]> {
        if (!this.hasChildren || !this.session) {
            return [];
        }
        if (this.items) {
            return this.items;
        }
        return this.items || (this.items = this.doResolve());
    }
    protected async doResolve(): Promise<ConsoleItem[]> {
        const result: ConsoleItem[] = [];
        if (this.namedVariables) {
            this.fetch(result, 'named');
        }
        if (this.indexedVariables) {
            let chunkSize = ExpressionContainer.BASE_CHUNK_SIZE;
            while (this.indexedVariables > chunkSize * ExpressionContainer.BASE_CHUNK_SIZE) {
                chunkSize *= ExpressionContainer.BASE_CHUNK_SIZE;
            }
            if (this.indexedVariables > chunkSize) {
                const numberOfChunks = Math.ceil(this.indexedVariables / chunkSize);
                for (let i = 0; i < numberOfChunks; i++) {
                    const start = this.startOfVariables + i * chunkSize;
                    const count = Math.min(chunkSize, this.indexedVariables - i * chunkSize);
                    const { session, variablesReference } = this;
                    result.push(new VirtualVariableItem({
                        session, variablesReference,
                        namedVariables: 0,
                        indexedVariables: count,
                        startOfVariables: start,
                        name: `[${start}..${start + count - 1}]`
                    }));
                }
                return result;
            }
        }
        await this.fetch(result, 'indexed', this.startOfVariables, this.indexedVariables);
        return result;
    }

    protected fetch(result: ConsoleItem[], filter: 'named'): Promise<void>;
    protected fetch(result: ConsoleItem[], filter: 'indexed', start: number, count?: number): Promise<void>;
    protected async fetch(result: ConsoleItem[], filter: 'indexed' | 'named', start?: number, count?: number): Promise<void> {
        try {
            const { variablesReference } = this;
            const response = await this.session!.variables({ variablesReference, filter, start, count });
            const { variables } = response.body;
            const names = new Set<string>();
            for (const variable of variables) {
                if (!names.has(variable.name)) {
                    result.push(new VariableItem(this.session!, variable));
                    names.add(variable.name);
                }
            }
        } catch (e) {
            result.push({
                severity: MessageType.Error,
                empty: !!e.message,
                render: () => e.message
            });
        }
    }

}
export namespace ExpressionContainer {
    export interface Options {
        session: DebugSession | undefined,
        variablesReference?: number
        namedVariables?: number
        indexedVariables?: number
        startOfVariables?: number
    }
}

export class VariableItem extends ExpressionContainer {

    static booleanRegex = /^true|false$/i;
    static stringRegex = /^(['"]).*\1$/;

    constructor(
        protected readonly session: DebugSession | undefined,
        protected readonly variable: DebugProtocol.Variable
    ) {
        super({
            session,
            variablesReference: variable.variablesReference,
            namedVariables: variable.namedVariables,
            indexedVariables: variable.indexedVariables
        });
    }

    render(): React.ReactNode {
        const { type, value, name } = this.variable;
        return <div className={this.variableClassName}>
            <span title={type || name} className='name'>{name}{!!value && ': '}</span>
            <span title={value} >{value}</span>
        </div>;
    }

    protected get variableClassName(): string {
        const { type, value } = this.variable;
        const classNames = ['theia-debug-console-variable'];
        if (type === 'number' || type === 'boolean' || type === 'string') {
            classNames.push(type);
        } else if (!isNaN(+value)) {
            classNames.push('number');
        } else if (VariableItem.booleanRegex.test(value)) {
            classNames.push('boolean');
        } else if (VariableItem.stringRegex.test(value)) {
            classNames.push('string');
        }
        return classNames.join(' ');
    }

}

export class VirtualVariableItem extends ExpressionContainer {

    constructor(
        protected readonly options: VirtualVariableItem.Options
    ) {
        super(options);
    }

    render(): React.ReactNode {
        return this.options.name;
    }
}
export namespace VirtualVariableItem {
    export interface Options extends ExpressionContainer.Options {
        name: string
    }
}

export class ExpressionItem extends ExpressionContainer {

    static notAvailable = 'not available';

    protected value = ExpressionItem.notAvailable;
    protected available = false;

    constructor(
        protected readonly expression: string,
        protected readonly session: DebugSession | undefined,
        protected readonly selection: DebugSelection | undefined
    ) {
        super({ session });
    }

    render(): React.ReactNode {
        const valueClassNames: string[] = [];
        if (!this.available) {
            valueClassNames.push(ConsoleItem.errorClassName);
            valueClassNames.push('theia-debug-console-unavailable');
        }
        return <div className={'theia-debug-console-expression'}>
            <div>{this.expression}</div>
            <div className={valueClassNames.join(' ')}>{this.value}</div>
        </div>;
    }

    async evaluate(): Promise<void> {
        if (this.session) {
            try {
                const { expression } = this;
                const frameId = this.selection && this.selection.frame && this.selection.frame.id;
                const response = await this.session.evaluate({
                    expression,
                    frameId,
                    context: 'repl'
                });
                const body = response.body;
                if (body) {
                    this.value = body.result;
                    this.available = true;
                    this.variablesReference = body.variablesReference;
                    this.namedVariables = body.namedVariables;
                    this.indexedVariables = body.indexedVariables;
                    this.items = undefined;
                }
            } catch (err) {
                this.value = err.message;
                this.available = false;
            }
        } else {
            this.value = 'Please start a debug session to evaluate';
            this.available = false;
        }
    }

}
