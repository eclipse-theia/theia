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
import { Emitter } from '@theia/core/lib/common/event';
import { ConsoleSessionManager } from '@theia/console/lib/browser/console-session-manager';
import { DebugConsoleContribution } from './debug-console-contribution';
import { DebugConsoleSession } from './debug-console-session';
import { DebugSession } from '../debug-session';
import { DidChangeActiveDebugSession } from '../debug-session-manager';

disableJSDOM();

class TestDebugSessionManager {

    readonly onDidCreateDebugSessionEmitter = new Emitter<DebugSession>();
    readonly onDidCreateDebugSession = this.onDidCreateDebugSessionEmitter.event;
    readonly onDidDestroyDebugSessionEmitter = new Emitter<DebugSession>();
    readonly onDidDestroyDebugSession = this.onDidDestroyDebugSessionEmitter.event;
    readonly onDidChangeActiveDebugSession = new Emitter<DidChangeActiveDebugSession>().event;

    protected readonly running = new Map<string, DebugSession>();

    currentSession: DebugSession | undefined;

    get sessions(): DebugSession[] {
        return Array.from(this.running.values());
    }

    getSession(id: string): DebugSession | undefined {
        return this.running.get(id);
    }

    start(session: DebugSession): void {
        this.running.set(session.id, session);
        this.currentSession = session;
        this.onDidCreateDebugSessionEmitter.fire(session);
    }

    /** Mirrors `DebugSessionManager.cleanup`, which drops the session before announcing its destruction. */
    destroy(session: DebugSession): void {
        this.running.delete(session.id);
        if (this.currentSession?.id === session.id) {
            this.currentSession = this.sessions[0];
        }
        this.onDidDestroyDebugSessionEmitter.fire(session);
    }

}

describe('DebugConsoleContribution', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    let debugSessionManager: TestDebugSessionManager;
    let consoleSessionManager: ConsoleSessionManager;
    let contribution: DebugConsoleContribution;

    /** A session whose console is merged into that of `consoleParent`, if given. */
    const createDebugSession = (id: string, consoleParent?: DebugSession): DebugSession => ({
        id,
        label: id,
        configuration: { name: id, type: 'node', request: 'launch' },
        options: {},
        parentSession: consoleParent,
        findConsoleParent: () => consoleParent,
        on: () => { }
    } as unknown as DebugSession);

    const consoleOf = (session: DebugSession): DebugConsoleSession =>
        consoleSessionManager.all.find((candidate): candidate is DebugConsoleSession =>
            candidate instanceof DebugConsoleSession && candidate.debugSession?.id === session.id)!;

    /** The session that console input is evaluated in. */
    const evaluationSessionOf = (consoleSession: DebugConsoleSession): DebugSession | undefined =>
        (consoleSession as unknown as { findCurrentSession(): DebugSession | undefined }).findCurrentSession();

    beforeEach(() => {
        debugSessionManager = new TestDebugSessionManager();
        consoleSessionManager = new ConsoleSessionManager();
        contribution = new DebugConsoleContribution();
        // The class uses property injection; `init()` only subscribes to the managers.
        Object.assign(contribution as unknown as Record<string, unknown>, {
            consoleSessionManager,
            debugSessionManager,
            resources: { add: () => { } },
            debugConsoleSessionFactory: (session: DebugSession) => {
                const consoleSession = new DebugConsoleSession();
                Object.assign(consoleSession as unknown as Record<string, unknown>, { sessionManager: debugSessionManager });
                consoleSession.startFor(session);
                return consoleSession;
            }
        });
        (contribution as unknown as { init(): void }).init();
    });

    afterEach(() => contribution.dispose());

    it('terminates the console when its session ends', () => {
        const session = createDebugSession('parent');
        debugSessionManager.start(session);
        const consoleSession = consoleOf(session);

        debugSessionManager.destroy(session);

        expect(consoleSession.terminated).to.be.true;
        expect(consoleSession.debugSession).to.be.undefined;
    });

    it('keeps the console of a session running while a child merged into it outlives that session', () => {
        const parent = createDebugSession('parent');
        debugSessionManager.start(parent);
        const consoleSession = consoleOf(parent);
        const child = createDebugSession('child', parent);
        debugSessionManager.start(child);

        debugSessionManager.destroy(parent);

        expect(consoleSession.terminated).to.be.false;
        expect(evaluationSessionOf(consoleSession)).to.equal(child);

        debugSessionManager.destroy(child);

        expect(consoleSession.terminated).to.be.true;
        expect(consoleSession.debugSession).to.be.undefined;
    });

    it('keeps the console of a session running when a child merged into it ends first', () => {
        const parent = createDebugSession('parent');
        debugSessionManager.start(parent);
        const consoleSession = consoleOf(parent);
        const child = createDebugSession('child', parent);
        debugSessionManager.start(child);

        debugSessionManager.destroy(child);

        expect(consoleSession.terminated).to.be.false;
        expect(consoleSession.debugSession).to.equal(parent);

        debugSessionManager.destroy(parent);

        expect(consoleSession.terminated).to.be.true;
    });

    it('does not let a restarted configuration take over a console still used by a child', () => {
        const parent = createDebugSession('parent');
        debugSessionManager.start(parent);
        const consoleSession = consoleOf(parent);
        debugSessionManager.start(createDebugSession('child', parent));
        debugSessionManager.destroy(parent);

        const restarted = createDebugSession('parent-restarted');
        restarted.configuration.name = parent.configuration.name;
        debugSessionManager.start(restarted);

        expect(consoleSession.debugSession).to.equal(parent);
        expect(consoleOf(restarted)).to.not.equal(consoleSession);
    });

});
