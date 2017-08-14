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
import { FileStatus, WorkingDirectoryStatus } from '../common';
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
            const status = await git.status({ localUri: repositoryLocation });
            expect(status).to.be.not.undefined;
            expect(status.changes).to.be.empty;
        });

        it('new', async () => {
            const newFilePath = path.join(repositoryLocation, 'X.txt');
            fs.writeFileSync(newFilePath, 'X');
            expect(fs.existsSync(newFilePath)).to.be.true;

            const status = await git.status({ localUri: repositoryLocation });
            expect(status).to.be.not.undefined;
            expect(status.changes).to.be.not.empty;
            expect(status.changes[0].status).to.be.equal(FileStatus.New);
            expect(FileUri.fsPath(status.changes[0].uri)).to.be.equal(newFilePath);
        });

        it('deleted', async () => {
            const deletedFilePath = path.join(repositoryLocation, 'A.txt');
            fs.unlinkSync(deletedFilePath);
            expect(fs.existsSync(deletedFilePath)).to.be.false;

            const status = await git.status({ localUri: repositoryLocation });
            expect(status).to.be.not.undefined;
            expect(status.changes).to.be.not.empty;
            expect(status.changes[0].status).to.be.equal(FileStatus.Deleted);
            expect(FileUri.fsPath(status.changes[0].uri)).to.be.equal(deletedFilePath);
        });

        it('modified', async () => {
            const modifiedFilePath = path.join(repositoryLocation, 'A.txt');
            fs.writeFileSync(modifiedFilePath, 'A');
            expect(fs.readFileSync(modifiedFilePath, 'utf-8')).to.be.equal('A');

            const status = await git.status({ localUri: repositoryLocation });
            expect(status).to.be.not.undefined;
            expect(status.changes).to.be.not.empty;
            expect(status.changes[0].status).to.be.equal(FileStatus.Modified);
            expect(FileUri.fsPath(status.changes[0].uri)).to.be.equal(modifiedFilePath);
        });

        it('renamed', async () => {
            const oldFilePath = path.join(repositoryLocation, 'A.txt');
            const newFilePath = path.join(repositoryLocation, 'X.txt');
            expect(fs.existsSync(oldFilePath)).to.be.true;
            expect(fs.existsSync(newFilePath)).to.be.false;
            fs.renameSync(oldFilePath, newFilePath);
            expect(fs.existsSync(oldFilePath)).to.be.false;
            expect(fs.existsSync(newFilePath)).to.be.true;

            const status = await git.status({ localUri: repositoryLocation });
            expect(status).to.be.not.undefined;
            expect(status.changes).to.be.not.empty;
            expect(status.changes[0].status).to.be.equal(FileStatus.Deleted);
            expect(FileUri.fsPath(status.changes[0].uri)).to.be.equal(oldFilePath);
            expect(status.changes[1].status).to.be.equal(FileStatus.New);
            expect(FileUri.fsPath(status.changes[1].uri)).to.be.equal(newFilePath);
        });

    });

    describe('statusChange', async () => {

        let repositoryLocation: string;

        beforeEach(async () => {
            repositoryLocation = setupRepository('git_repo_01', track.mkdirSync());
        });

        it('modified', function (done) {
            this.timeout(5000);
            const newFilePath = path.join(repositoryLocation, 'A.txt');
            const repository = { localUri: repositoryLocation };
            const listener = (status: WorkingDirectoryStatus) => {
                git.off('statusChange', repository, listener).then(() => {
                    expect(status.changes.length).to.be.equal(1);
                    expect(status.changes.filter((file) => file.status === FileStatus.Modified).map(file => FileUri.fsPath(file.uri))).to.contain(newFilePath);
                    done();
                });
            }
            git.on('statusChange', repository, listener).then(() => {
                fs.writeFileSync(newFilePath, 'X');
                expect(fs.readFileSync(newFilePath, 'utf-8')).to.be.equal('X');
            });
        });

    });


    describe('stage', async () => {

        let repositoryLocation: string;

        beforeEach(async () => {
            repositoryLocation = setupRepository('git_repo_01', track.mkdirSync());
        });

        it('clean', async () => {
            const repository = { localUri: repositoryLocation };
            const result = await git.stagedFiles(repository);

            expect(result).to.be.empty;
        });

        it('new', async () => {
            const newFilePath = path.join(repositoryLocation, 'X.txt');
            fs.writeFileSync(newFilePath, 'X');
            expect(fs.existsSync(newFilePath)).to.be.true;

            const repository = { localUri: repositoryLocation };
            await git.stage(repository, FileUri.create(newFilePath).toString());
            const result = await git.stagedFiles(repository);

            expect(result.length).to.be.equal(1);
            expect(FileUri.fsPath(result[0].uri)).to.be.equal(newFilePath);
            expect(result[0].status).to.be.equal(FileStatus.New);
        });

        it('deleted', async () => {
            const deletedFilePath = path.join(repositoryLocation, 'A.txt');
            fs.unlinkSync(deletedFilePath);
            expect(fs.existsSync(deletedFilePath)).to.be.false;

            const repository = { localUri: repositoryLocation };
            await git.stage(repository, FileUri.create(deletedFilePath).toString());
            const result = await git.stagedFiles(repository);

            expect(result.length).to.be.equal(1);
            expect(FileUri.fsPath(result[0].uri)).to.be.equal(deletedFilePath);
            expect(result[0].status).to.be.equal(FileStatus.Deleted);
        });

        it('modified', async () => {
            const filePath = path.join(repositoryLocation, 'A.txt');
            fs.writeFileSync(filePath, 'X');
            expect(fs.readFileSync(filePath, 'utf-8')).to.be.equal('X');

            const repository = { localUri: repositoryLocation };
            await git.stage(repository, FileUri.create(filePath).toString());
            const result = await git.stagedFiles(repository);

            expect(result.length).to.be.equal(1);
            expect(FileUri.fsPath(result[0].uri)).to.be.equal(filePath);
            expect(result[0].status).to.be.equal(FileStatus.Modified);
        });

        it('renamed', async () => {
            const oldFilePath = path.join(repositoryLocation, 'A.txt');
            const newFilePath = path.join(repositoryLocation, 'X.txt');
            expect(fs.existsSync(oldFilePath)).to.be.true;
            expect(fs.existsSync(newFilePath)).to.be.false;
            fs.renameSync(oldFilePath, newFilePath);
            expect(fs.existsSync(oldFilePath)).to.be.false;
            expect(fs.existsSync(newFilePath)).to.be.true;

            const repository = { localUri: repositoryLocation };
            await git.stage(repository, [FileUri.create(oldFilePath).toString(), FileUri.create(newFilePath).toString()]);
            const result = await git.stagedFiles(repository);

            expect(result.length).to.be.equal(1);
            const fileChange = result[0];
            expect(fileChange.oldUri).to.be.not.undefined;
            expect(FileUri.fsPath(fileChange.uri)).to.be.equal(newFilePath);
            if (!fileChange.oldUri) {
                throw new Error(`Expected the old URI to be defined after renaming.`);
            } else {
                expect(FileUri.fsPath(fileChange.oldUri)).to.be.equal(oldFilePath);
                expect(result[0].status).to.be.equal(FileStatus.Renamed);
            }
        });

        it('rejected', async () => {
            const filePath = path.join(repositoryLocation, 'X.txt');
            expect(fs.existsSync(filePath)).to.be.false;

            const repository = { localUri: repositoryLocation };
            try {
                await git.stage(repository, FileUri.create(filePath).toString());
                throw new Error('Expected an error when staging a file which does not exist in the working directory.');
            } catch (error) {
                expect(error.message).to.be.equal(`The following files cannot be staged because those do not exist in the working directory as changed files: ${filePath}`);
            }
        });

    });


});
