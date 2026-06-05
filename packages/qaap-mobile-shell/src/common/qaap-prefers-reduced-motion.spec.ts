// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { resolveScrollBehavior } from './qaap-prefers-reduced-motion';

describe('qaap-prefers-reduced-motion', () => {

    it('resolveScrollBehavior uses auto when reduced motion is preferred', () => {
        expect(resolveScrollBehavior('smooth', true)).to.equal('auto');
    });

    it('resolveScrollBehavior keeps the preferred behavior otherwise', () => {
        expect(resolveScrollBehavior('smooth', false)).to.equal('smooth');
        expect(resolveScrollBehavior('auto', false)).to.equal('auto');
    });
});
