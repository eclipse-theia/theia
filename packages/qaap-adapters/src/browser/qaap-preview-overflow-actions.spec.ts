// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { buildPreviewOverflowMenuItems } from './qaap-preview-overflow-actions';

describe('qaap-preview-overflow-actions', () => {

    it('buildPreviewOverflowMenuItems includes all Cursor-style preview actions', () => {
        const ids = buildPreviewOverflowMenuItems({ bookmarkBarVisible: () => false }).map(item => item.id);
        expect(ids).to.deep.equal([
            'take-screenshot',
            'hard-reload',
            'copy-url',
            'bookmark-bar',
            'inspector-side',
            'inspector-bottom',
            'clear-history',
            'clear-cookies',
            'clear-cache',
        ]);
    });

    it('bookmark bar label reflects visibility', () => {
        const hidden = buildPreviewOverflowMenuItems({ bookmarkBarVisible: () => false })
            .find(item => item.id === 'bookmark-bar');
        const shown = buildPreviewOverflowMenuItems({ bookmarkBarVisible: () => true })
            .find(item => item.id === 'bookmark-bar');
        expect(hidden?.label).to.contain('Show');
        expect(shown?.label).to.contain('Hide');
        expect(shown?.checked).to.equal(true);
    });
});
