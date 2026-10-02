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
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import 'reflect-metadata';

import { expect } from 'chai';
import { DebugProtocol } from '@vscode/debugprotocol/lib/debugProtocol';
import { ExpressionContainer } from './debug-console-items';
import { DebugConsoleSession } from './debug-console-session';
import { DebugSession } from '../debug-session';

disableJSDOM();

/**
 * The variables the fake adapter answers with, so that an output event with a variables reference resolves to an
 * expandable item, as it does when a program logs an object rather than a string.
 */
const VARIABLES: Record<number, DebugProtocol.Variable[]> = {
    1: [{ name: 'logged', value: 'Object', variablesReference: 2 }],
    2: [{ name: 'answer', value: '42', variablesReference: 0 }]
};

class TestDebugSessionManager {

    protected readonly sessions = new Map<string, DebugSession>();

    currentSession: DebugSession | undefined;

    getSession(id: string): DebugSession | undefined {
        return this.sessions.get(id);
    }

    add(session: DebugSession): void {
        this.sessions.set(session.id, session);
        this.currentSession = session;
    }

    /** Mirrors `DebugSessionManager.cleanup`, which drops the session before announcing its destruction. */
    remove(id: string): void {
        this.sessions.delete(id);
        if (this.currentSession?.id === id) {
            this.currentSession = undefined;
        }
    }

}

describe('DebugConsoleSession', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    let manager: TestDebugSessionManager;
    let consoleSession: DebugConsoleSession;
    let maximumLines: number;

    const createDebugSession = (id: string, configurationName: string): DebugSession => ({
        id,
        label: configurationName,
        configuration: { name: configurationName, type: 'node', request: 'launch' },
        autoExpandLazyVariables: false,
        sendRequest: async (_command: string, args: { variablesReference: number }) => ({
            body: { variables: VARIABLES[args.variablesReference] ?? [] }
        })
    } as unknown as DebugSession);

    const outputEvent = (body: Partial<DebugProtocol.OutputEvent['body']>): DebugProtocol.OutputEvent =>
        ({ event: 'output', body: { category: 'stdout', ...body } } as DebugProtocol.OutputEvent);

    const contentsOf = (session: DebugConsoleSession): string[] =>
        Array.from(session.getElements(), item => (item as { content?: string }).content ?? '');

    beforeEach(() => {
        manager = new TestDebugSessionManager();
        maximumLines = 10000;
        consoleSession = new DebugConsoleSession();
        // The class uses property injection, and `init()` only registers a Monaco completion provider.
        Object.assign(consoleSession as unknown as Record<string, unknown>, {
            sessionManager: manager,
            logger: { debug: () => { } },
            preferences: { get 'debug.console.maximumLines'(): number { return maximumLines; } }
        });
    });

    describe('when the session terminates', () => {

        it('releases the session but keeps its output', async () => {
            const session = createDebugSession('session-1', 'Launch Program');
            manager.add(session);
            consoleSession.startFor(session);
            await consoleSession.logOutput(session, outputEvent({ output: 'hello' }));

            expect(consoleSession.debugSession).to.equal(session);

            manager.remove(session.id);
            consoleSession.markTerminated();

            expect(consoleSession.terminated).to.be.true;
            expect(consoleSession.debugSession).to.be.undefined;
            expect(contentsOf(consoleSession)).to.deep.equal(['hello']);
        });

        it('keeps the label and the configuration of the released session', () => {
            const session = createDebugSession('session-1', 'Launch Program');
            manager.add(session);
            consoleSession.startFor(session);

            manager.remove(session.id);
            consoleSession.markTerminated();

            expect(consoleSession.label).to.equal('Launch Program');
            expect(consoleSession.configurationName).to.equal('Launch Program');
        });

        it('keeps what was expanded while the session ran', async () => {
            const session = createDebugSession('session-1', 'Launch Program');
            manager.add(session);
            consoleSession.startFor(session);
            // An output event carrying a variables reference, as sent for a logged object, yields expandable items
            // that resolve their children through the session.
            await consoleSession.logOutput(session, outputEvent({ variablesReference: 1 }));

            const [logged] = Array.from(consoleSession.getElements()) as ExpressionContainer[];
            expect(Array.from(await logged.getElements())).to.have.lengthOf(1, 'expandable while the session runs');

            manager.remove(session.id);
            consoleSession.markTerminated();

            expect(Array.from(consoleSession.getElements())).to.have.lengthOf(1, 'output is preserved');
            expect(Array.from(await logged.getElements())).to.have.lengthOf(1, 'expanded children are preserved');
        });

        it('does not retain the session through the items it logged', async () => {
            const session = createDebugSession('session-1', 'Launch Program');
            manager.add(session);
            consoleSession.startFor(session);
            await consoleSession.logOutput(session, outputEvent({ variablesReference: 1 }));

            const [logged] = Array.from(consoleSession.getElements()) as ExpressionContainer[];

            manager.remove(session.id);
            consoleSession.markTerminated();

            // Nothing was expanded before the session ended, so there is nothing cached to fall back on. The item
            // resolves its session by id through the manager, which has dropped it, rather than holding on to it,
            // so it has nothing left to ask.
            expect(Array.from(await logged.getElements())).to.be.empty;
        });

    });

    describe('when a session reuses the console', () => {

        it('drops the output of the previous run and runs the new session', async () => {
            const first = createDebugSession('session-1', 'Launch Program');
            manager.add(first);
            consoleSession.startFor(first);
            await consoleSession.logOutput(first, outputEvent({ output: 'first run' }));
            manager.remove(first.id);
            consoleSession.markTerminated();

            const second = createDebugSession('session-2', 'Launch Program');
            manager.add(second);
            consoleSession.startFor(second);

            expect(consoleSession.terminated).to.be.false;
            expect(consoleSession.debugSession).to.equal(second);
            expect(contentsOf(consoleSession)).to.be.empty;

            await consoleSession.logOutput(second, outputEvent({ output: 'second run' }));
            expect(contentsOf(consoleSession)).to.deep.equal(['second run']);
        });

        it('keeps the id it was created with, so that it is not the id of either session', () => {
            const first = createDebugSession('session-1', 'Launch Program');
            consoleSession.startFor(first);
            const id = consoleSession.id;

            consoleSession.markTerminated();
            consoleSession.startFor(createDebugSession('session-2', 'Launch Program'));

            expect(consoleSession.id).to.equal(id);
            expect(consoleSession.id).to.not.equal('session-1');
            expect(consoleSession.id).to.not.equal('session-2');
        });

    });

    describe('output limit', () => {

        it('drops the oldest lines beyond `debug.console.maximumLines`', async () => {
            maximumLines = 3;
            const session = createDebugSession('session-1', 'Launch Program');
            manager.add(session);
            consoleSession.startFor(session);

            await consoleSession.logOutput(session, outputEvent({ output: 'one\ntwo\nthree\nfour' }));
            expect(contentsOf(consoleSession)).to.deep.equal(['two', 'three', 'four']);

            consoleSession.appendLine('five');
            expect(contentsOf(consoleSession)).to.deep.equal(['three', 'four', 'five']);
        });

    });

});
