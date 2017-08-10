/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import { DugiteGit } from './dugite-git';

const expect = chai.expect;
const git = new DugiteGit();

describe('dugite-git', async () => {

    it('status 01 - missing', async () => {
        try {
            await git.status({ localUri: 'missing' });
        } catch (error) {
            expect(error.message).to.be.equal('Unable to find path to repository on disk.');
        }
    });

    it('status 02 - untouched', async () => {
        try {
            const result = await git.status({ localUri: '' });
            console.log(result);
        } catch (error) {
            expect(error.message).to.be.equal('Unable to find path to repository on disk.');
        }
    });

});
