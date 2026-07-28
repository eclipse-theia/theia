// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// https://www.eclipse.org/legal/epl-2.0.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';

const { toNormalizedKeyboardInput } = require('../../../../../src/main/browser/webview/pre/main.js');

describe('webview keyboard transport', () => {
    it('serializes explicit AltGraph and normalized keyboard fields', () => {
        const input = toNormalizedKeyboardInput({
            key: '[',
            keyCode: 56,
            code: 'Digit8',
            shiftKey: false,
            altKey: false,
            ctrlKey: true,
            metaKey: false,
            repeat: true,
            isComposing: false,
            location: 2,
            getModifierState: (modifier: string) => modifier === 'AltGraph'
        });

        expect(input).to.deep.equal({
            key: '[',
            keyCode: 56,
            code: 'Digit8',
            shiftKey: false,
            altKey: false,
            ctrlKey: true,
            metaKey: false,
            altGraph: true,
            repeat: true,
            isComposing: false,
            location: 2
        });
        expect(input).not.to.have.property('getModifierState');
    });
});
