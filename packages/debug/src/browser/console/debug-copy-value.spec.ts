// *****************************************************************************
// Copyright (C) 2026 Karthik Harikrishnan and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// http://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { DebugProtocol } from '@vscode/debugprotocol';
import { DebugSession } from '../debug-session';
import { DebugWatchExpression } from '../view/debug-watch-expression';
import { DebugVariable, ExpressionContainer } from './debug-console-items';

disableJSDOM();

interface TestSession extends Pick<DebugSession, 'capabilities' | 'evaluate'> { }

class TestDebugWatchExpression extends DebugWatchExpression {

    setValue(value: string): void {
        this._value = value;
    }
}

function createVariable(session: TestSession, overrides: Partial<DebugProtocol.Variable> = { evaluateName: 'object.value' }): DebugVariable {
    const sessionProvider = () => session as DebugSession;
    const parent = new ExpressionContainer({ session: sessionProvider, id: 'parent' });
    const variable: DebugProtocol.Variable = {
        name: 'value',
        value: 'truncated',
        variablesReference: 0,
        ...overrides
    };
    return new DebugVariable(sessionProvider, variable, parent);
}

function createWatchExpression(session: TestSession): TestDebugWatchExpression {
    const watchExpression = new TestDebugWatchExpression({
        id: 1,
        expression: 'object.value',
        session: () => session as DebugSession,
        remove: () => undefined,
        onDidChange: () => undefined
    });
    watchExpression.setValue('truncated');
    return watchExpression;
}

describe('Debugger Copy Value', () => {

    it('evaluates a variable using the clipboard context when supported', async () => {
        const evaluations: Array<{ expression: string; context?: string }> = [];
        const session: TestSession = {
            capabilities: { supportsClipboardContext: true },
            evaluate: async (expression, context) => {
                evaluations.push({ expression, context });
                return { result: 'full value', variablesReference: 0 };
            }
        };
        const value = await createVariable(session).getValueToCopy();

        expect(evaluations).to.deep.equal([{ expression: 'object.value', context: 'clipboard' }]);
        expect(value).to.equal('full value');
    });

    it('uses the variables context when the clipboard context is unsupported', async () => {
        const evaluations: Array<{ expression: string; context?: string }> = [];
        const session: TestSession = {
            capabilities: {},
            evaluate: async (expression, context) => {
                evaluations.push({ expression, context });
                return { result: 'full value', variablesReference: 0 };
            }
        };
        const value = await createVariable(session).getValueToCopy();

        expect(evaluations).to.deep.equal([{ expression: 'object.value', context: 'variables' }]);
        expect(value).to.equal('full value');
    });

    it('copies the rendered variable value when evaluateName is unavailable', async () => {
        let evaluated = false;
        const session: TestSession = {
            capabilities: { supportsClipboardContext: true },
            evaluate: async () => {
                evaluated = true;
                return { result: 'full value', variablesReference: 0 };
            }
        };
        const value = await createVariable(session, { evaluateName: undefined }).getValueToCopy();

        expect(evaluated).to.be.false;
        expect(value).to.equal('truncated');
    });

    it('copies the rendered variable value when evaluation fails', async () => {
        const session: TestSession = {
            capabilities: { supportsClipboardContext: true },
            evaluate: async () => { throw new Error('evaluation failed'); }
        };
        const value = await createVariable(session).getValueToCopy();

        expect(value).to.equal('truncated');
    });

    it('evaluates a watch expression using the watch context', async () => {
        const evaluations: Array<{ expression: string; context?: string }> = [];
        const session: TestSession = {
            capabilities: {},
            evaluate: async (expression, context) => {
                evaluations.push({ expression, context });
                return { result: 'full value', variablesReference: 0 };
            }
        };
        const value = await createWatchExpression(session).getValueToCopy();

        expect(evaluations).to.deep.equal([{ expression: 'object.value', context: 'watch' }]);
        expect(value).to.equal('full value');
    });

    it('copies the rendered watch value when evaluation fails', async () => {
        const session: TestSession = {
            capabilities: { supportsClipboardContext: true },
            evaluate: async () => { throw new Error('evaluation failed'); }
        };
        const value = await createWatchExpression(session).getValueToCopy();

        expect(value).to.equal('truncated');
    });
});
