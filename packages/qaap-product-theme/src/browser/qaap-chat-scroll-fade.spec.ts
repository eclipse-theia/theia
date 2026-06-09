// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { resolveChatScrollFadeState } from './qaap-chat-scroll-fade';

describe('qaap-chat-scroll-fade', () => {

    it('hides both fades when content does not scroll', () => {
        expect(resolveChatScrollFadeState(0, 100, 100)).to.deep.equal({
            showTop: false,
            showBottom: false,
        });
    });

    it('shows only the bottom fade at the top of a long thread', () => {
        expect(resolveChatScrollFadeState(0, 500, 100)).to.deep.equal({
            showTop: false,
            showBottom: true,
        });
    });

    it('shows only the top fade at the bottom of a long thread', () => {
        expect(resolveChatScrollFadeState(400, 500, 100)).to.deep.equal({
            showTop: true,
            showBottom: false,
        });
    });

    it('shows both fades in the middle of a long thread', () => {
        expect(resolveChatScrollFadeState(200, 500, 100)).to.deep.equal({
            showTop: true,
            showBottom: true,
        });
    });

});
