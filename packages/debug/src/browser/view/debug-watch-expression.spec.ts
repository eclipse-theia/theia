// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { DebugSession } from '../debug-session.js';
import { DebugWatchExpression } from './debug-watch-expression.js';

disableJSDOM();

interface TestSession {
    capabilities: DebugProtocol.Capabilities;
    currentFrame: { raw: { id: number }, forgetScopes: () => void };
    requests: Array<{ command: string, args: unknown }>;
    forgottenScopes: number;
    changes: number;
    value: string;
}

function createSession(capabilities: DebugProtocol.Capabilities = { supportsSetExpression: true }): TestSession {
    const session: TestSession = {
        capabilities,
        currentFrame: { raw: { id: 7 }, forgetScopes: () => session.forgottenScopes++ },
        requests: [],
        forgottenScopes: 0,
        changes: 0,
        value: '42'
    };
    return session;
}

function createWatchExpression(session: TestSession): DebugWatchExpression {
    const debugSession = {
        capabilities: session.capabilities,
        currentFrame: session.currentFrame,
        sendRequest: async (command: string, args: { value: string }) => {
            session.requests.push({ command, args });
            session.value = args.value;
            return { body: { value: args.value } };
        },
        evaluate: async () => ({ result: session.value, variablesReference: 0 }),
        fireDidChange: () => session.changes++
    } as unknown as DebugSession;
    return new DebugWatchExpression({
        id: 1,
        expression: 'counter',
        session: () => debugSession,
        remove: () => undefined,
        onDidChange: () => undefined
    });
}

describe('DebugWatchExpression', () => {

    describe('setValue', () => {

        it('sets the value with a setExpression request in the current frame', async () => {
            const session = createSession();
            const watchExpression = createWatchExpression(session);
            await watchExpression.evaluate();

            await watchExpression.setValue('100');

            expect(session.requests).to.deep.equal([{ command: 'setExpression', args: { expression: 'counter', value: '100', frameId: 7 } }]);
            expect(watchExpression.value).to.equal('100');
        });

        it('refreshes the scopes of the current frame and notifies the session', async () => {
            const session = createSession();
            const watchExpression = createWatchExpression(session);
            await watchExpression.evaluate();

            await watchExpression.setValue('100');

            expect(session.forgottenScopes).to.equal(1);
            expect(session.changes).to.equal(1);
        });

        it('does nothing if the debug adapter does not support setExpression', async () => {
            const session = createSession({});
            const watchExpression = createWatchExpression(session);
            await watchExpression.evaluate();

            await watchExpression.setValue('100');

            expect(session.requests).to.be.empty;
            expect(watchExpression.value).to.equal('42');
        });

        it('does nothing if the value is unchanged', async () => {
            const session = createSession();
            const watchExpression = createWatchExpression(session);
            await watchExpression.evaluate();

            await watchExpression.setValue('42');

            expect(session.requests).to.be.empty;
        });

    });

    describe('readOnly', () => {

        it('is read-only if the debug adapter marks the result as read-only', async () => {
            const session = createSession();
            const watchExpression = createWatchExpression(session);
            watchExpression['setResult']({ result: '42', variablesReference: 0, presentationHint: { attributes: ['readOnly'] } });

            expect(watchExpression.readOnly).to.be.true;
        });

        it('is not read-only by default', async () => {
            const session = createSession();
            const watchExpression = createWatchExpression(session);
            await watchExpression.evaluate();

            expect(watchExpression.readOnly).to.be.false;
        });

    });

});
