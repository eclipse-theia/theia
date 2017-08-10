/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as fs from 'fs';
import * as chai from 'chai';
import * as path from 'path';
import * as temp from 'temp';
import { FileStatus } from '../common';
import { DugiteGit } from './dugite-git';
import { setupRepository } from './test/fixture-helper';
import { FileUri } from '@theia/core/lib/node/file-uri';

const expect = chai.expect;
const track = temp.track();

const git = new DugiteGit();

describe('dugite-git', async () => {


    after(async () => {
        track.cleanupSync();
    });

    describe('status', async () => {

        let repositoryLocation: string;

        beforeEach(async () => {
            repositoryLocation = setupRepository('git_repo_01', track.mkdirSync());
        });

        it('missing', async () => {
            try {
                await git.status({ localUri: 'missing' });
                throw new Error('Expected an error when getting the status of an absent Git clone.');
            } catch (error) {
                expect(error.message).to.be.equal('Unable to find path to repository on disk.');
            }
        });

        it('clean', async () => {
            const result = await git.status({ localUri: repositoryLocation });
            expect(result).to.be.not.undefined;
            expect(result.changes).to.be.empty;
        });

        it('added', async () => {
            const newFilePath = path.join(repositoryLocation, 'foo.txt');
            fs.writeFileSync(newFilePath, 'foo');
            expect(fs.existsSync(newFilePath)).to.be.true;

            const result = await git.status({ localUri: repositoryLocation });
            expect(result).to.be.not.undefined;
            expect(result.changes).to.be.not.empty;
            expect(result.changes[0].status).to.be.equal(FileStatus.New);
            expect(FileUri.fsPath(result.changes[0].uri)).to.be.equal(newFilePath);
        });

        it('deleted', async () => {
            const deletedFilePath = path.join(repositoryLocation, 'A.txt');
            fs.unlinkSync(deletedFilePath);
            expect(fs.existsSync(deletedFilePath)).to.be.false;

            const result = await git.status({ localUri: repositoryLocation });
            expect(result).to.be.not.undefined;
            expect(result.changes).to.be.not.empty;
            expect(result.changes[0].status).to.be.equal(FileStatus.Deleted);
            expect(FileUri.fsPath(result.changes[0].uri)).to.be.equal(deletedFilePath);
        });

    });


});
