// *****************************************************************************
// Copyright (C) 2026 JuliaHub and others.
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
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { SplitPanel, Widget } from '@lumino/widgets';
import { SplitPositionHandler } from './split-panels';

disableJSDOM();

describe('SplitPositionHandler', () => {

    beforeEach(() => disableJSDOM = enableJSDOM());
    afterEach(() => disableJSDOM());

    function createPanel(): SplitPanel {
        const panel = new SplitPanel();
        panel.addWidget(new Widget());
        panel.addWidget(new Widget());
        Widget.attach(panel, document.body);
        return panel;
    }

    it('drops a move on a panel disposed before the move starts and keeps running the moves queued after it', async () => {
        const handler = new SplitPositionHandler();
        const disposed = createPanel();
        const kept = createPanel();

        const droppedMove = handler.setSplitHandlePosition(disposed, 0, 10, { duration: 0 });
        const keptMove = handler.setSplitHandlePosition(kept, 0, 20, { duration: 0 });
        disposed.dispose();

        let dropped = false;
        await droppedMove.catch(() => dropped = true);
        expect(dropped).to.be.true;
        expect(await keptMove).to.equal(20);
        kept.dispose();
    });

});
