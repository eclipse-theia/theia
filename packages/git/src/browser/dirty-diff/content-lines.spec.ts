/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License'); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContentLines } from './content-lines';

describe("content-lines", () => {

    test("array like access of lines without splitting", () => {
        const raw = "abc\ndef\n123\n456";
        const linesArray = ContentLines.arrayLike(ContentLines.fromString(raw));
        expect(linesArray[0]).toEqual('abc');
        expect(linesArray[1]).toEqual('def');
        expect(linesArray[2]).toEqual('123');
        expect(linesArray[3]).toEqual('456');
    });

});
