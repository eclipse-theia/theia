// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import {
    QAAP_PREVIEW_INSPECTOR_PANEL_ROOT_CLASS,
    ensurePreviewInspectorPanelRoot,
} from './preview-inspector-panel-root';

disableJSDOM();

describe('preview-inspector-panel-root', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    it('ensurePreviewInspectorPanelRoot returns a stable child of the slot', () => {
        const slot = document.createElement('aside');
        document.body.append(slot);
        const first = ensurePreviewInspectorPanelRoot(slot);
        const second = ensurePreviewInspectorPanelRoot(slot);
        expect(first).to.equal(second);
        expect(slot.querySelectorAll(`:scope > .${QAAP_PREVIEW_INSPECTOR_PANEL_ROOT_CLASS}`).length).to.equal(1);
    });
});
