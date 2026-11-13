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

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Widget } from '@theia/core/lib/browser/widgets/widget';
import { TerminalCollection, TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import type { TerminalManagerWidget as TerminalManagerWidgetType } from './terminal-manager-widget.js';
import { TerminalManagerTreeTypes } from './terminal-manager-types.js';

disableJSDOM();

describe('TerminalManagerWidget', () => {
    let TerminalManagerWidget: typeof TerminalManagerWidgetType;

    before(async () => {
        disableJSDOM = enableJSDOM();
        // The widget imports xterm, which probes the canvas API during module loading.
        // These tests do not render a terminal, and JSDOM has no canvas backend.
        const canvasContext = sinon.stub(HTMLCanvasElement.prototype, 'getContext');
        try {
            ({ TerminalManagerWidget } = await import('./terminal-manager-widget.js'));
        } finally {
            canvasContext.restore();
        }
    });
    after(() => disableJSDOM());

    describe('placeTerminal', () => {
        const tasksPageId = TerminalManagerTreeTypes.toCollectionPageId('tasks');
        let placements: { pageId?: string, collection?: TerminalCollection }[];
        let widget: TerminalManagerWidgetType;

        beforeEach(() => {
            placements = [];
            widget = Object.create(TerminalManagerWidget.prototype);
            widget.addTerminalPage = (_widget: Widget, pageId?: string, collection?: TerminalCollection) => {
                placements.push({ pageId, collection });
            };
        });

        const taskTerminal = (collection?: TerminalCollection): TerminalWidget => ({ kind: 'task', collection } as TerminalWidget);

        it('places a terminal on the page of its collection', () => {
            const collection = { id: 'tasks', label: 'Tasks' };
            widget.placeTerminal(taskTerminal(collection));
            expect(placements).to.deep.equal([{ pageId: tasksPageId, collection }]);
        });

        it('places a new terminal without a collection on a new page, whatever its kind', () => {
            widget.placeTerminal(taskTerminal());
            expect(placements).to.deep.equal([{ pageId: undefined, collection: undefined }]);
        });

        it('infers the collection of a terminal without one from its kind when asked to', () => {
            widget.placeTerminal(taskTerminal(), true);
            expect(placements).to.have.length(1);
            expect(placements[0].pageId).to.equal(tasksPageId);
            expect(placements[0].collection?.id).to.equal('tasks');
        });
    });
});
