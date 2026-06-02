// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    clampPreviewInspectorHeight,
    clampPreviewInspectorWidth,
    QAAP_PREVIEW_INSPECTOR_HEIGHT_MIN_PX,
    QAAP_PREVIEW_INSPECTOR_WIDTH_MIN_PX,
} from './qaap-preview-inspector-panel-size';

describe('qaap-preview-inspector-panel-size', () => {

    it('clamps inspector width to container bounds', () => {
        expect(clampPreviewInspectorWidth(100)).to.equal(QAAP_PREVIEW_INSPECTOR_WIDTH_MIN_PX);
        expect(clampPreviewInspectorWidth(900, 400)).to.equal(Math.round(400 * 0.88));
    });

    it('clamps inspector height to container bounds', () => {
        expect(clampPreviewInspectorHeight(100)).to.equal(QAAP_PREVIEW_INSPECTOR_HEIGHT_MIN_PX);
        expect(clampPreviewInspectorHeight(900, 500)).to.equal(Math.round(500 * 0.82));
    });
});
