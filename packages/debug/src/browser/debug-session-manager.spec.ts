// *****************************************************************************
// Copyright (C) 2026 Vinay Kaushal and others.
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

import { expect } from 'chai';
import { DebugProtocol } from '@vscode/debugprotocol';
import { Emitter } from '@theia/core/lib/common/event';
import { DebugSession, DebugState } from './debug-session';
import { DebugSessionManager } from './debug-session-manager';
import { DebugStackFrame } from './model/debug-stack-frame';

disableJSDOM();

describe('DebugSessionManager', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    describe('restart frame context keys', () => {

        let keys: Map<string, unknown>;
        let manager: DebugSessionManager;

        // A `DebugSessionManager` without its injected services: `fireDidChange` only uses the fields set here
        beforeEach(() => {
            keys = new Map();
            manager = Object.create(DebugSessionManager.prototype) as DebugSessionManager;
            const fields = manager as unknown as Record<string, unknown>;
            for (const key of ['debugType', 'inDebugMode', 'debugState', 'restartFrameSupported', 'stackFrameSupportsRestart']) {
                fields[`${key}Key`] = { set: (value: unknown) => keys.set(key, value) };
            }
            fields.onDidChangeEmitter = new Emitter();
        });

        function focus(session: DebugSession | undefined): void {
            (manager as unknown as Record<string, unknown>)._currentSession = session;
            (manager as unknown as { fireDidChange(current: DebugSession | undefined): void }).fireDidChange(session);
        }

        function createSession(capabilities: DebugProtocol.Capabilities, frame?: Partial<DebugStackFrame>): DebugSession {
            return {
                capabilities,
                configuration: { type: 'node' },
                state: DebugState.Stopped,
                currentThread: { currentFrame: frame }
            } as unknown as DebugSession;
        }

        it('reflects the current session and frame', () => {
            focus(createSession({ supportsRestartFrame: true }, { isRestartable: true }));
            expect(keys.get('restartFrameSupported')).to.be.true;
            expect(keys.get('stackFrameSupportsRestart')).to.be.true;

            focus(createSession({ supportsRestartFrame: true }, { isRestartable: false }));
            expect(keys.get('restartFrameSupported')).to.be.true;
            expect(keys.get('stackFrameSupportsRestart')).to.be.false;
        });

        it('is reset when the session does not support restarting frames, has no frame, or has ended', () => {
            focus(createSession({ supportsRestartFrame: true }, { isRestartable: true }));
            focus(createSession({}));
            expect(keys.get('restartFrameSupported')).to.be.false;
            expect(keys.get('stackFrameSupportsRestart')).to.be.false;

            focus(createSession({ supportsRestartFrame: true }, { isRestartable: true }));
            focus(undefined);
            expect(keys.get('restartFrameSupported')).to.be.false;
            expect(keys.get('stackFrameSupportsRestart')).to.be.false;
        });

        it('follows a change of the capabilities of the current session', () => {
            const session = createSession({}, { isRestartable: false });
            focus(session);
            expect(keys.get('restartFrameSupported')).to.be.false;

            session.capabilities.supportsRestartFrame = true;
            focus(session);
            expect(keys.get('restartFrameSupported')).to.be.true;
        });
    });
});
