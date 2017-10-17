/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'mocha';
import * as chai from 'chai';
import { GitIgnoreImpl } from './git-ignore';

const expect = chai.expect;

describe('git-ignore', () => {
    it('shall respect nested ignore files', () => {
        const parent = new GitIgnoreImpl(`
            foo.txt
        `);
        const nested = new GitIgnoreImpl(`
            !foo.txt
        `, parent);
        expect(parent.isFiltered('foo.txt')).eq(true);
        expect(nested.isFiltered('foo.txt')).eq(false);
    });
});
