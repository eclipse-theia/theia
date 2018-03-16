/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import { ContentLines } from './content-lines';
import { expect } from 'chai';
chai.use(require('chai-string'));

describe("content-lines", () => {

    it("array like access of lines without splitting", () => {
        const raw = "abc\ndef\n123\n456";
        const linesArray = ContentLines.arrayLike(ContentLines.fromString(raw));
        expect(linesArray[0]).to.be.equal('abc');
        expect(linesArray[1]).to.be.equal('def');
        expect(linesArray[2]).to.be.equal('123');
        expect(linesArray[3]).to.be.equal('456');
    });

});
