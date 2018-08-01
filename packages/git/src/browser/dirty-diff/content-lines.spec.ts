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

import * as chai from 'chai';
import { ContentLines } from './content-lines';
import { expect } from 'chai';
chai.use(require('chai-string'));

describe('content-lines', () => {

    it('array-like access of lines without splitting', () => {
        const raw = 'abc\ndef\n123\n456';
        const linesArray = ContentLines.arrayLike(ContentLines.fromString(raw));
        expect(linesArray[0]).to.be.equal('abc');
        expect(linesArray[1]).to.be.equal('def');
        expect(linesArray[2]).to.be.equal('123');
        expect(linesArray[3]).to.be.equal('456');
    });

    it('works with CRLF', () => {
        const raw = 'abc\ndef\r\n123\r456';
        const linesArray = ContentLines.arrayLike(ContentLines.fromString(raw));
        expect(linesArray[0]).to.be.equal('abc');
        expect(linesArray[1]).to.be.equal('def');
        expect(linesArray[2]).to.be.equal('123');
        expect(linesArray[3]).to.be.equal('456');
    });

});
