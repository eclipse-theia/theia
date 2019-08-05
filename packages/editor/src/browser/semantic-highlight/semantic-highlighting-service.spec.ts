/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { SemanticHighlightingService } from './semantic-highlighting-service';

disableJSDOM();

describe('semantic-highlighting-service', () => {

    before(() => disableJSDOM = enableJSDOM());

    after(() => disableJSDOM());

    it('encode-decode', () => {
        const input = [2, 5, 0, 12, 15, 1, 7, 1000, 1];
        const expected = SemanticHighlightingService.Token.fromArray(input);
        const encoded = SemanticHighlightingService.encode(expected);
        const actual = SemanticHighlightingService.decode(encoded);
        expect(actual).to.be.deep.equal(expected);
    });

    it('should fill with zeros when right shift for the decode phase', function (): void {
        this.timeout(10_000);
        const input: number[] = [];
        for (let i = 0; i < 65_536; i++) {
            input.push(...[i, i, i]);
        }
        const expected = SemanticHighlightingService.Token.fromArray(input);
        const encoded = SemanticHighlightingService.encode(expected);
        const actual = SemanticHighlightingService.decode(encoded);
        expect(actual).to.be.deep.equal(expected);
    });

});
