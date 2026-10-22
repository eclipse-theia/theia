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
import { DebugSession } from '../debug-session';
import { DebugStackFrame } from './debug-stack-frame';
import { DebugThread } from './debug-thread';

disableJSDOM();

describe('DebugStackFrame', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    let requests: string[];

    function createFrame(capabilities: DebugProtocol.Capabilities, canRestart?: boolean): DebugStackFrame {
        requests = [];
        const session = { capabilities, sendRequest: async (command: string) => { requests.push(command); } } as unknown as DebugSession;
        const frame = new DebugStackFrame({ id: 1 } as unknown as DebugThread, session, 'frame');
        frame.update({ raw: { id: 1, name: 'main', line: 1, column: 1, canRestart } });
        return frame;
    }

    it('cannot be restarted if the debug adapter does not support restarting frames', () => {
        const frame = createFrame({});
        expect(frame.supportsRestartFrame).to.be.false;
        expect(frame.isRestartable).to.be.false;
    });

    it('can be restarted if the debug adapter supports it and the frame does not say otherwise', () => {
        const frame = createFrame({ supportsRestartFrame: true });
        expect(frame.supportsRestartFrame).to.be.true;
        expect(frame.isRestartable).to.be.true;
    });

    it('cannot be restarted if the frame is marked as not restartable', () => {
        const frame = createFrame({ supportsRestartFrame: true }, false);
        expect(frame.supportsRestartFrame).to.be.true;
        expect(frame.isRestartable).to.be.false;
    });

    it('sends a restartFrame request if it can be restarted', async () => {
        const frame = createFrame({ supportsRestartFrame: true });
        await frame.restart();
        expect(requests).to.deep.equal(['restartFrame']);
    });

    it('does not send a restartFrame request if it cannot be restarted', async () => {
        await createFrame({}).restart();
        expect(requests).to.be.empty;
        await createFrame({ supportsRestartFrame: true }, false).restart();
        expect(requests).to.be.empty;
    });
});
