// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH and others.
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
import { ImageContextVariable, IMAGE_CONTEXT_VARIABLE } from './image-context-variable';

describe('ImageContextVariable', () => {
    describe('getOrigin', () => {
        it("should default missing origin to 'context'", () => {
            const arg = JSON.stringify({
                data: 'AAA',
                mimeType: 'image/png'
            });
            expect(ImageContextVariable.getOrigin(arg)).to.equal('context');
        });

        it("should return 'context' on parse failure", () => {
            expect(ImageContextVariable.getOrigin('{not json')).to.equal('context');
        });

        it("should return 'temporary' when origin is temporary", () => {
            const arg = JSON.stringify({
                data: 'AAA',
                mimeType: 'image/png',
                origin: 'temporary'
            });
            expect(ImageContextVariable.getOrigin(arg)).to.equal('temporary');
        });
    });

    describe('parseArg', () => {
        it('should throw on parse failure', () => {
            expect(() => ImageContextVariable.parseArg('{not json')).to.throw('Failed to parse JSON argument string');
        });

        it('should not clear required fields when optional origin is missing', () => {
            const arg = JSON.stringify({
                data: 'AAA',
                mimeType: 'image/png'
            });
            const parsed = ImageContextVariable.parseArg(arg);
            expect(parsed.data).to.equal('AAA');
            expect(parsed.mimeType).to.equal('image/png');
            expect(parsed.origin).to.equal(undefined);
        });
    });

    describe('parseRequest', () => {
        it('should return undefined for non-imageContext requests even if arg is invalid JSON', () => {
            const parsed = ImageContextVariable.parseRequest({
                variable: { ...IMAGE_CONTEXT_VARIABLE, id: 'other', name: 'other' },
                arg: '{not json'
            });
            expect(parsed).to.equal(undefined);
        });
    });
});
