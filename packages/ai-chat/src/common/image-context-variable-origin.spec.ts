// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { expect } from 'chai';
import { AIVariableResolutionRequest } from '@theia/ai-core';
import { ImageContextVariable, IMAGE_CONTEXT_VARIABLE } from './image-context-variable';

describe('ImageContextVariable origin', () => {
    it('defaults to context when origin is missing', () => {
        expect(ImageContextVariable.getOrigin(JSON.stringify({ data: 'a', mimeType: 'image/png' }))).to.equal('context');
    });

    it('returns temporary when origin is temporary', () => {
        expect(ImageContextVariable.getOrigin(JSON.stringify({ data: 'a', mimeType: 'image/png', origin: 'temporary' }))).to.equal('temporary');
    });

    it('returns context for unknown origin values', () => {
        expect(ImageContextVariable.getOrigin(JSON.stringify({ data: 'a', mimeType: 'image/png', origin: 'other' }))).to.equal('context');
    });

    it('returns context on invalid JSON', () => {
        expect(ImageContextVariable.getOrigin('{')).to.equal('context');
    });

    it('getOriginSafe returns undefined for non-image requests', () => {
        expect(ImageContextVariable.getOriginSafe({ variable: { id: 'other', name: 'other', description: '' }, arg: 'x' })).to.be.undefined;
    });

    it('getOriginSafe returns undefined if request shape is invalid', () => {
        // missing arg
        expect(ImageContextVariable.getOriginSafe({ variable: IMAGE_CONTEXT_VARIABLE } as unknown as AIVariableResolutionRequest)).to.be.undefined;
    });
});
