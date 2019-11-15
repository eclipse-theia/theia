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
import { DebugProtocol } from 'vscode-debugprotocol/lib/debugProtocol';
import { SingleTextInputDialog } from '@theia/core/lib/browser';
import { ConsoleItem, CompositeConsoleItem } from '@theia/console/lib/browser/console-session';
import { DebugSession } from '../debug-session';
import { Severity } from '@theia/core/lib/common/severity';

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

    render(): React.ReactNode {
        return undefined;
    }

    get hasElements(): boolean {
        return !!this.variablesReference;
    }

    protected elements: Promise<ExpressionContainer[]> | undefined;
    async getElements(): Promise<IterableIterator<ExpressionContainer>> {
        if (!this.hasElements || !this.session) {
            return [][Symbol.iterator]();
        }
        if (!this.elements) {
            this.elements = this.doResolve();
        }
        return (await this.elements)[Symbol.iterator]();
    }
    protected async doResolve(): Promise<ExpressionContainer[]> {
        const result: ExpressionContainer[] = [];
        if (this.namedVariables) {
            await this.fetch(result, 'named');
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
                    result.push(new DebugVirtualVariable({
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
            const response = await this.session!.sendRequest('variables', { variablesReference, filter, start, count });
            const { variables } = response.body;
            const names = new Set<string>();
            for (const variable of variables) {
                if (!names.has(variable.name)) {
                    result.push(new DebugVariable(this.session, variable, this));
                    names.add(variable.name);
                }
            }
        } catch (e) {
            result.push({
                severity: Severity.Error,
                visible: !!e.message,
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

export class DebugVariable extends ExpressionContainer {

    static booleanRegex = /^true|false$/i;
    static stringRegex = /^(['"]).*\1$/;

    constructor(
        protected readonly session: DebugSession | undefined,
        protected readonly variable: DebugProtocol.Variable,
        protected readonly parent: ExpressionContainer
    ) {
        super({
            session,
            variablesReference: variable.variablesReference,
            namedVariables: variable.namedVariables,
            indexedVariables: variable.indexedVariables
        });
    }

    get name(): string {
        return this.variable.name;
    }
    protected _type: string | undefined;
    get type(): string | undefined {
        return this._type || this.variable.type;
    }
    protected _value: string | undefined;
    get value(): string {
        return this._value || this.variable.value;
    }

    render(): React.ReactNode {
        const { type, value, name } = this;
        return <div className={this.variableClassName}>
            <span title={type || name} className='name' ref={this.setNameRef}>{name}{!!value && ': '}</span>
            <span title={value} ref={this.setValueRef}>{value}</span>
        </div>;
    }

    protected get variableClassName(): string {
        const { type, value } = this;
        const classNames = ['theia-debug-console-variable'];
        if (type === 'number' || type === 'boolean' || type === 'string') {
            classNames.push(type);
        } else if (!isNaN(+value)) {
            classNames.push('number');
        } else if (DebugVariable.booleanRegex.test(value)) {
            classNames.push('boolean');
        } else if (DebugVariable.stringRegex.test(value)) {
            classNames.push('string');
        }
        return classNames.join(' ');
    }

    get supportSetVariable(): boolean {
        return !!this.session && !!this.session.capabilities.supportsSetVariable;
    }
    async setValue(value: string): Promise<void> {
        if (!this.session) {
            return;
        }
        const { name, parent } = this;
        const variablesReference = parent['variablesReference'];
        try {
            const response = await this.session.sendRequest('setVariable', { variablesReference, name, value });
            this._value = response.body.value;
            this._type = response.body.type;
            this.variablesReference = response.body.variablesReference || 0;
            this.namedVariables = response.body.namedVariables;
            this.indexedVariables = response.body.indexedVariables;
            this.elements = undefined;
            this.session['fireDidChange']();
        } catch (error) {
            console.error(error);
        }
    }

    get supportCopyValue(): boolean {
        return !!this.valueRef && document.queryCommandSupported('copy');
    }
    copyValue(): void {
        const selection = document.getSelection();
        if (this.valueRef && selection) {
            selection.selectAllChildren(this.valueRef);
            document.execCommand('copy');
        }
    }
    protected valueRef: HTMLSpanElement | undefined;
    protected setValueRef = (valueRef: HTMLSpanElement | null) => this.valueRef = valueRef || undefined;

    get supportCopyAsExpression(): boolean {
        return !!this.nameRef && document.queryCommandSupported('copy');
    }
    copyAsExpression(): void {
        const selection = document.getSelection();
        if (this.nameRef && selection) {
            selection.selectAllChildren(this.nameRef);
            document.execCommand('copy');
        }
    }
    protected nameRef: HTMLSpanElement | undefined;
    protected setNameRef = (nameRef: HTMLSpanElement | null) => this.nameRef = nameRef || undefined;

    async open(): Promise<void> {
        const input = new SingleTextInputDialog({
            title: `Set ${this.name} Value`,
            initialValue: this.value
        });
        const newValue = await input.open();
        if (newValue) {
            await this.setValue(newValue);
        }
    }

}

export class DebugVirtualVariable extends ExpressionContainer {

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

    severity?: Severity;
    static notAvailable = 'not available';

    protected _value = ExpressionItem.notAvailable;
    get value(): string {
        return this._value;
    }

    protected _available = false;
    get available(): boolean {
        return this._available;
    }

    constructor(
        protected readonly expression: string,
        protected readonly session: DebugSession | undefined
    ) {
        super({ session });
    }

    render(): React.ReactNode {
        const valueClassNames: string[] = [];
        if (!this._available) {
            valueClassNames.push(ConsoleItem.errorClassName);
            valueClassNames.push('theia-debug-console-unavailable');
        }
        return <div className={'theia-debug-console-expression'}>
            <div>{this.expression}</div>
            <div className={valueClassNames.join(' ')}>{this._value}</div>
        </div>;
    }

    async evaluate(context: string = 'repl'): Promise<void> {
        if (this.session) {
            try {
                const { expression } = this;
                const body = await this.session.evaluate(expression, context);
                if (body) {
                    this._value = body.result;
                    this._available = true;
                    this.variablesReference = body.variablesReference;
                    this.namedVariables = body.namedVariables;
                    this.indexedVariables = body.indexedVariables;
                    this.elements = undefined;
                    this.severity = Severity.Log;
                }
            } catch (err) {
                this._value = err.message;
                this._available = false;
                this.severity = Severity.Error;
            }
        } else {
            this._value = 'Please start a debug session to evaluate';
            this._available = false;
            this.severity = Severity.Error;
        }
    }

}

export class DebugScope extends ExpressionContainer {

    constructor(
        protected readonly raw: DebugProtocol.Scope,
        protected readonly session: DebugSession
    ) {
        super({
            session,
            variablesReference: raw.variablesReference,
            namedVariables: raw.namedVariables,
            indexedVariables: raw.indexedVariables
        });
    }

    render(): React.ReactNode {
        return this.raw.name;
    }

}
