// *****************************************************************************
// Copyright (C) 2026 Alec Timison.
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

import { enableJSDOM } from '../test/jsdom';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { Widget } from '@theia/core/shared/@lumino/widgets';
import * as sinon from 'sinon';
import { DisposableCollection } from '../../common/disposable';
import { ApplicationShell } from './application-shell';
disableJSDOM();

describe('ApplicationShell', () => {
    let toTearDown: () => void;

    beforeEach(() => {
        toTearDown = enableJSDOM();
    });

    afterEach(() => {
        sinon.restore();
        toTearDown();
    });

    it('cancels the previous activation check', () => {
        const shell = Object.create(ApplicationShell.prototype) as ApplicationShell;
        Object.assign(shell, {
            toDisposeOnActivationCheck: new DisposableCollection(),
            logger: { warn: sinon.stub() }
        });
        const assertActivated = (shell as unknown as { assertActivated(widget: Widget): void }).assertActivated.bind(shell);
        const firstWidget = new Widget();
        const secondWidget = new Widget();
        const request = {} as ReturnType<typeof window.setTimeout>;
        sinon.stub(globalThis, 'setTimeout').returns(request);
        sinon.stub(window, 'setTimeout').returns(request);
        const clearTimeout = sinon.stub(window, 'clearTimeout');
        window.cancelAnimationFrame = sinon.stub();

        assertActivated(firstWidget);
        assertActivated(secondWidget);

        expect(clearTimeout.callCount).to.equal(1);
        expect(clearTimeout.firstCall.args[0]).to.equal(request);
        firstWidget.dispose();
        secondWidget.dispose();
    });
});
