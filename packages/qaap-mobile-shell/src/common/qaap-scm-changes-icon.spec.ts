// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { QAAP_SCM_CHANGES_SVG_MARKUP } from './qaap-scm-changes-icon';

describe('qaap-scm-changes-icon', () => {

    it('uses the Cursor Changes glyph (minus, plus, frame)', () => {
        const paths = QAAP_SCM_CHANGES_SVG_MARKUP.match(/<path d="/g);
        expect(paths).to.have.length(3);
        expect(QAAP_SCM_CHANGES_SVG_MARKUP).to.include('9.72363');
        expect(QAAP_SCM_CHANGES_SVG_MARKUP).to.include('4.22363');
        expect(QAAP_SCM_CHANGES_SVG_MARKUP).to.include('12.1963');
    });
});
