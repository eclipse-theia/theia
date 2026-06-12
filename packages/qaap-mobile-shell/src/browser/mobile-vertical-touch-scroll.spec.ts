// *****************************************************************************
// Copyright (C) 2026 theia-ide and others.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as fs from 'fs';
import * as path from 'path';
import { expect } from 'chai';
import { MOBILE_VERTICAL_SCROLL_SELECTORS } from './mobile-vertical-touch-scroll';

/** Overlay scroll hosts added with product UI — must stay registered in touch-scroll CSS. */
const OVERLAY_SCROLL_HOSTS = [
    '.theia-mobile-work-hub-sessions-sidebar-scroll',
    '.theia-mobile-sticky-composer-sheet-list',
    '.theia-qaap-approval-policy-sheet-list',
    '.qaap-project-bootstrap-picker',
] as const;

describe('mobile-vertical-touch-scroll', () => {

    it('registers overlay scroll hosts for MutationObserver patching', () => {
        for (const selector of OVERLAY_SCROLL_HOSTS) {
            expect(MOBILE_VERTICAL_SCROLL_SELECTORS).to.include(selector);
        }
    });

    it('lists the same overlay scroll hosts in qaap-mobile-touch-scroll.css', () => {
        const cssPath = path.join(__dirname, '..', '..', 'src', 'browser', 'style', 'qaap-mobile-touch-scroll.css');
        const css = fs.readFileSync(cssPath, 'utf8');
        for (const selector of OVERLAY_SCROLL_HOSTS) {
            expect(css, `missing ${selector} in qaap-mobile-touch-scroll.css`).to.include(selector);
        }
    });

});
