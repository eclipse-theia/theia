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

import chai from 'chai';
import sinon from 'sinon';
import { CommonCommands } from '../browser/common-commands.js';
import { enableJSDOM } from '../browser/test/jsdom.js';
import { CommandRegistry } from '../common/command.js';
import { ElectronClipboardCommandContribution } from './electron-clipboard-command-contribution.js';

const expect = chai.expect;

describe('ElectronClipboardCommandContribution', () => {
    let disableJSDOM: () => void;
    let registry: CommandRegistry;
    let copyOrCutSelection: sinon.SinonStub;
    let fallback: sinon.SinonStub;
    let windowFocusService: { focusedWindow: Window | undefined };

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    beforeEach(() => {
        registry = new CommandRegistry();
        fallback = sinon.stub();
        registry.registerCommand(CommonCommands.COPY, { execute: fallback });
        registry.registerCommand(CommonCommands.CUT, { execute: fallback });
        copyOrCutSelection = sinon.stub().resolves();
        Object.defineProperty(window, 'electronTheiaCore', {
            configurable: true,
            value: { copyOrCutSelection }
        });
        const contribution = new ElectronClipboardCommandContribution();
        windowFocusService = { focusedWindow: window };
        Object.assign(contribution, { windowFocusService });
        contribution.registerCommands(registry);
    });

    afterEach(() => {
        document.body.replaceChildren();
        Reflect.deleteProperty(window, 'electronTheiaCore');
        sinon.restore();
    });

    for (const [command, id] of [['copy', CommonCommands.COPY.id], ['cut', CommonCommands.CUT.id]] as const) {
        it(`uses native ${command} for a number input`, async () => {
            const input = document.createElement('input');
            input.type = 'number';
            input.value = '12345';
            document.body.append(input);
            input.focus();

            await registry.executeCommand(id);

            expect(copyOrCutSelection.calledOnceWithExactly(command)).to.be.true;
            expect(fallback.called).to.be.false;
        });

        it(`leaves ${command} for text inputs to the existing handler`, async () => {
            const input = document.createElement('input');
            input.value = '12345';
            document.body.append(input);
            input.focus();
            input.setSelectionRange(1, 3);

            await registry.executeCommand(id);

            expect(fallback.calledOnce).to.be.true;
            expect(copyOrCutSelection.called).to.be.false;
        });
    }

    it('sends the command from the focused secondary window', async () => {
        const frame = document.createElement('iframe');
        document.body.append(frame);
        const secondaryWindow = frame.contentWindow;
        if (!secondaryWindow) {
            throw new Error('Secondary window was not created');
        }
        const secondaryCopyOrCut = sinon.stub().resolves();
        Object.defineProperty(secondaryWindow, 'electronTheiaCore', {
            configurable: true,
            value: { copyOrCutSelection: secondaryCopyOrCut }
        });
        const input = secondaryWindow.document.createElement('input');
        input.type = 'number';
        secondaryWindow.document.body.append(input);
        input.focus();
        windowFocusService.focusedWindow = secondaryWindow;

        await registry.executeCommand(CommonCommands.COPY.id);

        expect(secondaryCopyOrCut.calledOnceWithExactly('copy')).to.be.true;
        expect(copyOrCutSelection.called).to.be.false;
    });

    it('propagates a native command failure', async () => {
        const input = document.createElement('input');
        input.type = 'number';
        document.body.append(input);
        input.focus();
        const failure = new Error('native command failed');
        copyOrCutSelection.rejects(failure);

        try {
            await registry.executeCommand(CommonCommands.COPY.id);
            expect.fail('Expected the command to fail');
        } catch (error) {
            expect(error).to.equal(failure);
        }
    });
});
