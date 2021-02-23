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

import * as React from '@theia/core/shared/react';
import { TreeSource, TreeElement } from '@theia/core/lib/browser/source-tree';
import { ExpressionContainer, ExpressionItem, DebugVariable } from '../console/debug-console-items';
import { DebugSessionManager } from '../debug-session-manager';
import { injectable, inject } from '@theia/core/shared/inversify';

@injectable()
export class DebugHoverSource extends TreeSource {

    @inject(DebugSessionManager)
    protected readonly sessions: DebugSessionManager;

    protected _expression: ExpressionItem | DebugVariable | undefined;
    get expression(): ExpressionItem | DebugVariable | undefined {
        return this._expression;
    }

    protected elements: TreeElement[] = [];
    getElements(): IterableIterator<TreeElement> {
        return this.elements[Symbol.iterator]();
    }

    protected renderTitle(element: ExpressionItem | DebugVariable): React.ReactNode {
        return <div className='theia-debug-hover-title' title={element.value}>{element.value}</div>;
    }

    reset(): void {
        this._expression = undefined;
        this.elements = [];
        this.fireDidChange();
    }

    async evaluate(expression: string): Promise<boolean> {
        const evaluated = await this.doEvaluate(expression);
        const elements = evaluated && await evaluated.getElements();
        this._expression = evaluated;
        this.elements = elements ? [...elements] : [];
        this.fireDidChange();
        return !!evaluated;
    }
    protected async doEvaluate(expression: string): Promise<ExpressionItem | DebugVariable | undefined> {
        const { currentSession } = this.sessions;
        if (!currentSession) {
            return undefined;
        }
        if (currentSession.capabilities.supportsEvaluateForHovers) {
            const item = new ExpressionItem(expression, () => currentSession);
            await item.evaluate('hover');
            return item.available && item || undefined;
        }
        return this.findVariable(expression.split('.').map(word => word.trim()).filter(word => !!word));
    }
    protected async findVariable(namesToFind: string[]): Promise<DebugVariable | undefined> {
        const { currentFrame } = this.sessions;
        if (!currentFrame) {
            return undefined;
        }
        let variable: DebugVariable | undefined;
        const scopes = await currentFrame.getScopes();
        for (const scope of scopes) {
            const found = await this.doFindVariable(scope, namesToFind);
            if (!variable) {
                variable = found;
            } else if (found && found.value !== variable.value) {
                // only show if all expressions found have the same value
                return undefined;
            }
        }
        return variable;
    }
    protected async doFindVariable(owner: ExpressionContainer, namesToFind: string[]): Promise<DebugVariable | undefined> {
        const elements = await owner.getElements();
        const variables: DebugVariable[] = [];
        for (const element of elements) {
            if (element instanceof DebugVariable && element.name === namesToFind[0]) {
                variables.push(element);
            }
        }
        if (variables.length !== 1) {
            return undefined;
        }
        if (namesToFind.length === 1) {
            return variables[0];
        } else {
            return this.doFindVariable(variables[0], namesToFind.slice(1));
        }
    }

}
