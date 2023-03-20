// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { SingleTextInputDialog } from '@theia/core/lib/browser/dialogs';
import { ExpressionItem, DebugSessionProvider } from '../console/debug-console-items';
import { DebugProtocol } from '@vscode/debugprotocol';
import { codicon, TREE_NODE_SEGMENT_GROW_CLASS } from '@theia/core/lib/browser';
import { nls } from '@theia/core';

export class DebugWatchExpression extends ExpressionItem {

    readonly id: number;
    protected isError: boolean;

    constructor(protected readonly options: {
        id: number,
        expression: string,
        session: DebugSessionProvider,
        remove: () => void,
        onDidChange: () => void
    }) {
        super(options.expression, options.session);
        this.id = options.id;
    }

    override async evaluate(): Promise<void> {
        await super.evaluate('watch');
    }

    protected override setResult(body?: DebugProtocol.EvaluateResponse['body'], error?: string): void {
        if (!this.options.session()) {
            return;
        }
        super.setResult(body, error);
        this.isError = !!error;
        this.options.onDidChange();
    }

    override render(): React.ReactNode {
        return <div className='theia-debug-console-variable theia-debug-watch-expression'>
            <div className={TREE_NODE_SEGMENT_GROW_CLASS}>
                <span title={this.type || this._expression} className='name'>{this._expression}: </span>
                <span title={this._value} ref={this.setValueRef} className={this.isError ? 'watch-error' : ''}>{this._value}</span>
            </div>
            <div className={codicon('close', true)} title={nls.localizeByDefault('Remove Expression')} onClick={this.options.remove} />
        </div>;
    }

    async open(): Promise<void> {
        const input = new SingleTextInputDialog({
            title: nls.localizeByDefault('Edit Expression'),
            initialValue: this.expression,
            placeholder: nls.localizeByDefault('Expression to watch')
        });
        const newValue = await input.open();
        if (newValue !== undefined) {
            this._expression = newValue;
            await this.evaluate();
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

}
