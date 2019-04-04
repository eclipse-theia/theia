/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import * as os from 'os';
import * as temp from 'temp';
import * as chai from 'chai';
import * as fs from 'fs-extra';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node';
import { isWindows } from '@theia/core/lib/common/os';
import { FileSystem } from '../common/filesystem';
import { FileSystemNode } from './node-filesystem';
import { expectThrowsAsync } from '@theia/core/lib/common/test/expect';

// tslint:disable:no-unused-expression

const expect = chai.expect;
const track = temp.track();

describe('NodeFileSystem', function () {

    let root: URI;
    let fileSystem: FileSystem;

    this.timeout(10000);

    beforeEach(() => {
        root = FileUri.create(fs.realpathSync(temp.mkdirSync('node-fs-root')));
        fileSystem = createFileSystem();
    });

    afterEach(async () => {
        track.cleanupSync();
    });

    describe('01 #getFileStat', () => {

        it('Should return undefined if not file exists under the given URI.', async () => {
            const uri = root.resolve('foo.txt');
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            const fileStat = await fileSystem.getFileStat(uri.toString());
            expect(fileStat).to.be.undefined;
        });

        it('Should return a proper result for a file.', async () => {
            const uri = root.resolve('foo.txt');
            fs.writeFileSync(FileUri.fsPath(uri), 'foo');
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;

            const stat = await fileSystem.getFileStat(uri.toString());
            expect(stat).to.not.be.undefined;
            expect(stat!.isDirectory).to.be.false;
            expect(stat!.uri).to.eq(uri.toString());
        });

        it('Should return a proper result for a directory.', async () => {
            const uri_1 = root.resolve('foo.txt');
            const uri_2 = root.resolve('bar.txt');
            fs.writeFileSync(FileUri.fsPath(uri_1), 'foo');
            fs.writeFileSync(FileUri.fsPath(uri_2), 'bar');
            expect(fs.statSync(FileUri.fsPath(uri_1)).isFile()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri_2)).isFile()).to.be.true;

            const stat = await fileSystem.getFileStat(root.toString());
            expect(stat).to.not.be.undefined;
            expect(stat!.children!.length).to.equal(2);

        });

    });

    describe('02 #resolveContent', () => {

        it('Should be rejected with an error when trying to resolve the content of a non-existing file.', async () => {
            const uri = root.resolve('foo.txt');
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            await expectThrowsAsync(fileSystem.resolveContent(uri.toString()), Error);
        });

        it('Should be rejected with an error when trying to resolve the content of a directory.', async () => {
            const uri = root.resolve('foo');
            fs.mkdirSync(FileUri.fsPath(uri));
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).to.be.true;

            await expectThrowsAsync(fileSystem.resolveContent(uri.toString()), Error);
        });

        it('Should be rejected with an error if the desired encoding cannot be handled.', async () => {
            const uri = root.resolve('foo.txt');
            fs.writeFileSync(FileUri.fsPath(uri), 'foo', { encoding: 'utf8' });
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: 'utf8' })).to.be.equal('foo');

            await expectThrowsAsync(fileSystem.resolveContent(uri.toString(), { encoding: 'unknownEncoding' }), Error);
        });

        it('Should be return with the content for an existing file.', async () => {
            const uri = root.resolve('foo.txt');
            fs.writeFileSync(FileUri.fsPath(uri), 'foo', { encoding: 'utf8' });
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: 'utf8' }))
                .to.be.equal('foo');

            const content = await fileSystem.resolveContent(uri.toString());
            expect(content).to.have.property('content')
                .that.is.equal('foo');
        });

        it('Should be return with the stat object for an existing file.', async () => {
            const uri = root.resolve('foo.txt');
            fs.writeFileSync(FileUri.fsPath(uri), 'foo', { encoding: 'utf8' });
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: 'utf8' }))
                .to.be.equal('foo');

            const content = await fileSystem.resolveContent(uri.toString());
            expect(content).to.be.an('object');
            expect(content).to.have.property('stat');
            expect(content).to.have.property('stat')
                .that.has.property('uri')
                .that.is.equal(uri.toString());
            expect(content).to.have.property('stat')
                .that.has.property('size')
                .that.is.greaterThan(1);
            expect(content).to.have.property('stat')
                .that.has.property('lastModification')
                .that.is.greaterThan(1);
            expect(content).to.have.property('stat')
                .that.has.property('isDirectory')
                .that.is.false;
            expect(content).to.have.property('stat')
                .that.not.have.property('children');
        });

    });

    describe('03 #setContent', () => {

        it('Should be rejected with an error when trying to set the content of a non-existing file.', async () => {
            const uri = root.resolve('foo.txt');
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            const stat = {
                uri: uri.toString(),
                lastModification: new Date().getTime(),
                isDirectory: false
            };

            await expectThrowsAsync(fileSystem.setContent(stat, 'foo'), Error);
        });

        it('Should be rejected with an error when trying to set the content of a directory.', async () => {
            const uri = root.resolve('foo');
            fs.mkdirSync(FileUri.fsPath(uri));
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).to.be.true;

            const stat = await fileSystem.getFileStat(uri.toString());
            expect(stat).to.not.be.undefined;
            await expectThrowsAsync(fileSystem.setContent(stat!, 'foo'), Error);
        });

        it('Should be rejected with an error when trying to set the content of a file which is out-of-sync.', async () => {
            const uri = root.resolve('foo.txt');
            fs.writeFileSync(FileUri.fsPath(uri), 'foo', { encoding: 'utf8' });
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: 'utf8' }))
                .to.be.equal('foo');

            const stat = await fileSystem.getFileStat(uri.toString());
            // Make sure current file stat is out-of-sync.
            // Here the content is modified in the way that file sizes will differ.
            fs.writeFileSync(FileUri.fsPath(uri), 'longer', { encoding: 'utf8' });
            expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: 'utf8' }))
                .to.be.equal('longer');
            expect(stat).to.not.be.undefined;
            await expectThrowsAsync(fileSystem.setContent(stat!, 'baz'), Error);
        });

        it('Should be rejected with an error when trying to set the content when the desired encoding cannot be handled.', async () => {
            const uri = root.resolve('foo.txt');
            fs.writeFileSync(FileUri.fsPath(uri), 'foo', { encoding: 'utf8' });
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: 'utf8' })).to.be.equal('foo');

            const stat = await fileSystem.getFileStat(uri.toString());
            expect(stat).to.not.be.undefined;
            await expectThrowsAsync(fileSystem.setContent(stat!, 'baz', { encoding: 'unknownEncoding' }), Error);

        });

        it('Should return with a stat representing the latest state of the successfully modified file.', async () => {
            const uri = root.resolve('foo.txt');
            fs.writeFileSync(FileUri.fsPath(uri), 'foo', { encoding: 'utf8' });
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: 'utf8' })).to.be.equal('foo');

            const currentStat = await fileSystem.getFileStat(uri.toString());
            expect(currentStat).to.not.be.undefined;

            await fileSystem.setContent(currentStat!, 'baz');
            expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: 'utf8' }))
                .to.be.equal('baz');

        });

    });

    describe('04 #move', () => {

        it('Should be rejected with an error if no file exists under the source location.', async () => {
            const sourceUri = root.resolve('foo.txt');
            const targetUri = root.resolve('bar.txt');
            expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.false;

            await expectThrowsAsync(fileSystem.move(sourceUri.toString(), targetUri.toString()), Error);
        });

        it("Should be rejected with an error if target exists and overwrite is not set to \'true\'.", async () => {
            const sourceUri = root.resolve('foo.txt');
            const targetUri = root.resolve('bar.txt');
            fs.writeFileSync(FileUri.fsPath(sourceUri), 'foo');
            fs.writeFileSync(FileUri.fsPath(targetUri), 'bar');
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isFile()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isFile()).to.be.true;

            await expectThrowsAsync(fileSystem.move(sourceUri.toString(), targetUri.toString()), Error);
        });

        it('Moving a file to an empty directory. Should be rejected with an error because files cannot be moved to an existing directory locations.', async () => {
            const sourceUri = root.resolve('foo.txt');
            const targetUri = root.resolve('bar');
            fs.writeFileSync(FileUri.fsPath(sourceUri), 'foo');
            fs.mkdirSync(FileUri.fsPath(targetUri));
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(sourceUri), 'utf8')).to.be.equal('foo');
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;
            expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.be.empty;

            await expectThrowsAsync(fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }), Error);
        });

        it('Moving a file to a non-empty directory. Should be rejected with and error because files cannot be moved to an existing directory locations.', async () => {
            const sourceUri = root.resolve('foo.txt');
            const targetUri = root.resolve('bar');
            const targetFileUri_01 = targetUri.resolve('bar_01.txt');
            const targetFileUri_02 = targetUri.resolve('bar_02.txt');
            fs.writeFileSync(FileUri.fsPath(sourceUri), 'foo');
            fs.mkdirSync(FileUri.fsPath(targetUri));
            fs.writeFileSync(FileUri.fsPath(targetFileUri_01), 'bar_01');
            fs.writeFileSync(FileUri.fsPath(targetFileUri_02), 'bar_02');
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(sourceUri), 'utf8')).to.be.equal('foo');
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(targetFileUri_01), 'utf8')).to.be.equal('bar_01');
            expect(fs.readFileSync(FileUri.fsPath(targetFileUri_02), 'utf8')).to.be.equal('bar_02');
            expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.include('bar_01.txt').and.to.include('bar_02.txt');

            await expectThrowsAsync(fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }), Error);
        });

        it('Moving an empty directory to file. Should be rejected with an error because directories and cannot be moved to existing file locations.', async () => {
            const sourceUri = root.resolve('foo');
            const targetUri = root.resolve('bar.txt');
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            fs.writeFileSync(FileUri.fsPath(targetUri), 'bar');
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(targetUri), 'utf8')).to.be.equal('bar');
            expect(fs.readdirSync(FileUri.fsPath(sourceUri))).to.be.empty;

            await expectThrowsAsync(fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }), Error);
        });

        it('Moving a non-empty directory to file. Should be rejected with an error because directories cannot be moved to existing file locations.', async () => {
            const sourceUri = root.resolve('foo');
            const targetUri = root.resolve('bar.txt');
            const sourceFileUri_01 = sourceUri.resolve('foo_01.txt');
            const sourceFileUri_02 = sourceUri.resolve('foo_02.txt');
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            fs.writeFileSync(FileUri.fsPath(targetUri), 'bar');
            fs.writeFileSync(FileUri.fsPath(sourceFileUri_01), 'foo_01');
            fs.writeFileSync(FileUri.fsPath(sourceFileUri_02), 'foo_02');
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(targetUri), 'utf8')).to.be.equal('bar');
            expect(fs.readdirSync(FileUri.fsPath(sourceUri))).to.include('foo_01.txt').and.to.include('foo_02.txt');

            await expectThrowsAsync(fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }), Error);
        });

        it('Moving file to file. Should overwrite the target file content and delete the source file.', async () => {
            const sourceUri = root.resolve('foo.txt');
            const targetUri = root.resolve('bar.txt');
            fs.writeFileSync(FileUri.fsPath(sourceUri), 'foo');
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isFile()).to.be.true;
            expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.false;

            const stat = await fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true });
            expect(stat).is.an('object')
                .and.has.property('uri')
                .that.equals(targetUri.toString());
            expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.false;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(targetUri), 'utf8'))
                .to.be.equal('foo');
        });

        it('Moving an empty directory to an empty directory. Should remove the source directory.', async () => {
            const sourceUri = root.resolve('foo');
            const targetUri = root.resolve('bar');
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            fs.mkdirSync(FileUri.fsPath(targetUri));
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;
            expect(fs.readdirSync(FileUri.fsPath(sourceUri))).to.be.empty;
            expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.be.empty;

            const stat = await fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true });
            expect(stat).is.an('object')
                .and.has.property('uri')
                .that.equals(targetUri.toString());
            expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.false;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;
            expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.be.empty;
        });

        it('Moving an empty directory to a non-empty directory. Should be rejected because the target folder is not empty.', async () => {
            const sourceUri = root.resolve('foo');
            const targetUri = root.resolve('bar');
            const targetFileUri_01 = targetUri.resolve('bar_01.txt');
            const targetFileUri_02 = targetUri.resolve('bar_02.txt');
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            fs.mkdirSync(FileUri.fsPath(targetUri));
            fs.writeFileSync(FileUri.fsPath(targetFileUri_01), 'bar_01');
            fs.writeFileSync(FileUri.fsPath(targetFileUri_02), 'bar_02');
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;
            expect(fs.readdirSync(FileUri.fsPath(sourceUri))).to.be.empty;
            expect(fs.readFileSync(FileUri.fsPath(targetFileUri_01), 'utf8')).to.be.equal('bar_01');
            expect(fs.readFileSync(FileUri.fsPath(targetFileUri_02), 'utf8')).to.be.equal('bar_02');
            expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.include('bar_01.txt').and.to.include('bar_02.txt');

            await expectThrowsAsync(fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }), Error);
        });

        it('Moving a non-empty directory to an empty directory. Source folder and its content should be moved to the target location.', async function () {
            if (isWindows) {
                // https://github.com/theia-ide/theia/issues/2088
                this.skip();
                return;
            }
            const sourceUri = root.resolve('foo');
            const targetUri = root.resolve('bar');
            const sourceFileUri_01 = sourceUri.resolve('foo_01.txt');
            const sourceFileUri_02 = sourceUri.resolve('foo_02.txt');
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            fs.mkdirSync(FileUri.fsPath(targetUri));
            fs.writeFileSync(FileUri.fsPath(sourceFileUri_01), 'foo_01');
            fs.writeFileSync(FileUri.fsPath(sourceFileUri_02), 'foo_02');
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;
            expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.be.empty;
            expect(fs.readdirSync(FileUri.fsPath(sourceUri))).to.include('foo_01.txt').and.to.include('foo_02.txt');
            expect(fs.readFileSync(FileUri.fsPath(sourceFileUri_01), 'utf8')).to.be.equal('foo_01');
            expect(fs.readFileSync(FileUri.fsPath(sourceFileUri_02), 'utf8')).to.be.equal('foo_02');

            const stat = await fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true });
            expect(stat).is.an('object').and.has.property('uri').that.equals(targetUri.toString());
            expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.false;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;
            expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.include('foo_01.txt').and.to.include('foo_02.txt');
            expect(fs.readFileSync(FileUri.fsPath(targetUri.resolve('foo_01.txt')), 'utf8')).to.be.equal('foo_01');
            expect(fs.readFileSync(FileUri.fsPath(targetUri.resolve('foo_02.txt')), 'utf8')).to.be.equal('foo_02');
        });

        it('Moving a non-empty directory to a non-empty directory. Should be rejected because the target location is not empty.', async () => {
            const sourceUri = root.resolve('foo');
            const targetUri = root.resolve('bar');
            const sourceFileUri_01 = sourceUri.resolve('foo_01.txt');
            const sourceFileUri_02 = sourceUri.resolve('foo_02.txt');
            const targetFileUri_01 = targetUri.resolve('bar_01.txt');
            const targetFileUri_02 = targetUri.resolve('bar_02.txt');
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            fs.mkdirSync(FileUri.fsPath(targetUri));
            fs.writeFileSync(FileUri.fsPath(sourceFileUri_01), 'foo_01');
            fs.writeFileSync(FileUri.fsPath(sourceFileUri_02), 'foo_02');
            fs.writeFileSync(FileUri.fsPath(targetFileUri_01), 'bar_01');
            fs.writeFileSync(FileUri.fsPath(targetFileUri_02), 'bar_02');
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(sourceFileUri_01), 'utf8')).to.be.equal('foo_01');
            expect(fs.readFileSync(FileUri.fsPath(sourceFileUri_02), 'utf8')).to.be.equal('foo_02');
            expect(fs.readFileSync(FileUri.fsPath(targetFileUri_01), 'utf8')).to.be.equal('bar_01');
            expect(fs.readFileSync(FileUri.fsPath(targetFileUri_02), 'utf8')).to.be.equal('bar_02');
            expect(fs.readdirSync(FileUri.fsPath(sourceUri))).to.include('foo_01.txt').and.to.include('foo_02.txt');
            expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.include('bar_01.txt').and.to.include('bar_02.txt');

            await expectThrowsAsync(fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }), Error);
        });

    });

    describe('05 #copy', () => {

        it('Copy a file from non existing location. Should be rejected with an error. Nothing to copy.', async () => {
            const sourceUri = root.resolve('foo');
            const targetUri = root.resolve('bar');
            fs.mkdirSync(FileUri.fsPath(targetUri));
            expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.false;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;

            await expectThrowsAsync(fileSystem.copy(sourceUri.toString(), targetUri.toString()), Error);
        });

        it('Copy a file to existing location without overwrite enabled. Should be rejected with an error.', async () => {
            const sourceUri = root.resolve('foo');
            const targetUri = root.resolve('bar');
            fs.mkdirSync(FileUri.fsPath(targetUri));
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;

            await expectThrowsAsync(fileSystem.copy(sourceUri.toString(), targetUri.toString()), Error);
        });

        it('Copy a file to existing location with the same file name. Should be rejected with an error.', async () => {
            const sourceUri = root.resolve('foo');
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;

            await expectThrowsAsync(fileSystem.copy(sourceUri.toString(), sourceUri.toString()), Error);
        });

        it('Copy an empty directory to a non-existing location. Should return with the file stat representing the new file at the target location.', async () => {
            const sourceUri = root.resolve('foo');
            const targetUri = root.resolve('bar');
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.false;

            const stat = await fileSystem.copy(sourceUri.toString(), targetUri.toString());
            expect(stat).to.be.an('object');
            expect(stat).to.have.property('uri')
                .that.is.equal(targetUri.toString());
            expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.true;
            expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.true;
        });

        it('Copy an empty directory to a non-existing, nested location. Should return with the file stat representing the new file at the target location.', async () => {
            const sourceUri = root.resolve('foo');
            const targetUri = root.resolve('nested/path/to/bar');
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.false;

            const stat = await fileSystem.copy(sourceUri.toString(), targetUri.toString());
            expect(stat).to.be.an('object');
            expect(stat).to.have.property('uri')
                .that.is.equal(targetUri.toString());
            expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.true;
            expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.true;
        });

        it('Copy a directory with content to a non-existing location. Should return with the file stat representing the new file at the target location.', async () => {
            const sourceUri = root.resolve('foo');
            const targetUri = root.resolve('bar');
            const subSourceUri = sourceUri.resolve('foo_01.txt');
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            fs.writeFileSync(FileUri.fsPath(subSourceUri), 'foo');
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(subSourceUri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(subSourceUri), 'utf8')).to.be.equal('foo');
            expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.false;

            const stat = await fileSystem.copy(sourceUri.toString(), targetUri.toString());
            expect(stat).to.be.an('object');
            expect(stat).to.have.property('uri').that.is.equal(targetUri.toString());
            expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.true;
            expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.true;
            expect(fs.readdirSync(FileUri.fsPath(sourceUri))).to.contain('foo_01.txt');
            expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.contain('foo_01.txt');
            expect(fs.readFileSync(FileUri.fsPath(subSourceUri), 'utf8')).to.be.equal('foo');
            expect(fs.readFileSync(FileUri.fsPath(targetUri.resolve('foo_01.txt')), 'utf8')).to.be.equal('foo');
        });

        it('Copy a directory with content to a non-existing, nested location. Should return with the file stat representing the new file at the target location.', async () => {
            const sourceUri = root.resolve('foo');
            const targetUri = root.resolve('nested/path/to/bar');
            const subSourceUri = sourceUri.resolve('foo_01.txt');
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            fs.writeFileSync(FileUri.fsPath(subSourceUri), 'foo');
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(subSourceUri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(subSourceUri), 'utf8')).to.be.equal('foo');
            expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.false;

            const stat = await fileSystem.copy(sourceUri.toString(), targetUri.toString());
            expect(stat).to.be.an('object');
            expect(stat).to.have.property('uri')
                .that.is.equal(targetUri.toString());
            expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.true;
            expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.true;
            expect(fs.readdirSync(FileUri.fsPath(sourceUri))).to.contain('foo_01.txt');
            expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.contain('foo_01.txt');
            expect(fs.readFileSync(FileUri.fsPath(subSourceUri), 'utf8')).to.be.equal('foo');
            expect(fs.readFileSync(FileUri.fsPath(targetUri.resolve('foo_01.txt')), 'utf8')).to.be.equal('foo');
        });

    });

    describe('07 #createFile', () => {

        it('Should be rejected with an error if a file already exists with the given URI.', async () => {
            const uri = root.resolve('foo.txt');
            fs.writeFileSync(FileUri.fsPath(uri), 'foo');
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;

            await expectThrowsAsync(fileSystem.createFile(uri.toString()), Error);
        });

        it('Should be rejected with an error if the encoding is given but cannot be handled.', async () => {
            const uri = root.resolve('foo.txt');
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            await expectThrowsAsync(fileSystem.createFile(uri.toString(), { encoding: 'unknownEncoding' }), Error);
        });

        it('Should create an empty file without any contents by default.', async () => {
            const uri = root.resolve('foo.txt');
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            const stat = await fileSystem.createFile(uri.toString());
            expect(stat).is.an('object');
            expect(stat).has.property('uri').that.is.equal(uri.toString());
            expect(stat).not.has.property('children');
            expect(fs.readFileSync(FileUri.fsPath(uri), 'utf8')).to.be.empty;
        });

        it('Should create a file with the desired content.', async () => {
            const uri = root.resolve('foo.txt');
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            const stat = await fileSystem.createFile(uri.toString(), { content: 'foo' });
            expect(stat).is.an('object');
            expect(stat).has.property('uri')
                .that.is.equal(uri.toString());
            expect(stat).not.has.property('children');
            expect(fs.readFileSync(FileUri.fsPath(uri), 'utf8'))
                .to.be.equal('foo');
        });

        it('Should create a file with the desired content into a non-existing, nested location.', async () => {
            const uri = root.resolve('foo/bar/baz.txt');
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            const stat = await fileSystem.createFile(uri.toString(), { content: 'foo' });
            expect(stat).is.an('object');
            expect(stat).has.property('uri')
                .that.is.equal(uri.toString());
            expect(stat).not.has.property('children');
            expect(fs.readFileSync(FileUri.fsPath(uri), 'utf8'))
                .to.be.equal('foo');
        });

        it('Should create a file with the desired content and encoding.', async () => {
            const uri = root.resolve('foo.txt');
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            const stat = await fileSystem.createFile(uri.toString(), { content: 'foo', encoding: 'utf8' });
            expect(stat).is.an('object');
            expect(stat).has.property('uri')
                .that.is.equal(uri.toString());
            expect(stat).not.has.property('children');
            expect(fs.readFileSync(FileUri.fsPath(uri), 'utf8'))
                .to.be.equal('foo');
        });

    });

    describe('08 #createFolder', () => {

        it('Should be rejected with an error if a FILE already exist under the desired URI.', async () => {
            const uri = root.resolve('foo');
            fs.writeFileSync(FileUri.fsPath(uri), 'some content');
            expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).to.be.false;

            await expectThrowsAsync(fileSystem.createFolder(uri.toString()), Error);
        });

        it('Should NOT be rejected with an error if a DIRECTORY already exist under the desired URI.', async () => {
            const uri = root.resolve('foo');
            fs.mkdirSync(FileUri.fsPath(uri));
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.true;

            const stat = await fileSystem.createFolder(uri.toString());
            expect(stat).to.be.an('object');
            expect(stat).to.have.property('uri')
                .that.equals(uri.toString());
            expect(stat).to.have.property('children')
                .that.is.empty;
        });

        it('Should create a directory and return with the stat object on successful directory creation.', async () => {
            const uri = root.resolve('foo');
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            const stat = await fileSystem.createFolder(uri.toString());
            expect(stat).to.be.an('object');
            expect(stat).to.have.property('uri')
                .that.equals(uri.toString());
            expect(stat).to.have.property('children')
                .that.is.empty;
        });

        it('Should create all the missing directories and return with the stat object on successful creation.', async () => {
            const uri = root.resolve('foo/bar/foobar/barfoo');
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            const stat = await fileSystem.createFolder(uri.toString());
            expect(stat).to.be.an('object');
            expect(stat).to.have.property('uri')
                .that.equals(uri.toString());
            expect(stat).to.have.property('children')
                .that.is.empty;
        });

    });

    describe('09 #touch', () => {

        it('Should create a new file if it does not exist yet.', async () => {
            const uri = root.resolve('foo.txt');
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            const stat = await fileSystem.touchFile(uri.toString());
            expect(stat).is.an('object');
            expect(stat).has.property('uri')
                .that.equals(uri.toString());
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;
        });

        it('Should update the modification timestamp on an existing file.', async () => {
            const uri = root.resolve('foo.txt');
            fs.writeFileSync(FileUri.fsPath(uri), 'foo');
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;

            const initialStat = await fileSystem.getFileStat(uri.toString());
            expect(initialStat).to.not.be.undefined;

            expect(initialStat).is.an('object');
            expect(initialStat).has.property('uri').that.equals(uri.toString());
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;

            // https://nodejs.org/en/docs/guides/working-with-different-filesystems/#timestamp-resolution
            await sleep(1000);

            const updatedStat = await fileSystem.touchFile(uri.toString());
            expect(updatedStat).is.an('object');
            expect(updatedStat).has.property('uri').that.equals(uri.toString());
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;
            expect(updatedStat.lastModification).to.be.greaterThan(initialStat!.lastModification);
        });

    });

    describe('#10 delete', () => {

        it('Should be rejected when the file to delete does not exist.', async () => {
            const uri = root.resolve('foo.txt');
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            await expectThrowsAsync(fileSystem.delete(uri.toString(), { moveToTrash: false }), Error);
        });

        it('Should delete the file.', async () => {
            const uri = root.resolve('foo.txt');
            fs.writeFileSync(FileUri.fsPath(uri), 'foo');
            expect(fs.readFileSync(FileUri.fsPath(uri), 'utf8')).to.be.equal('foo');

            await fileSystem.delete(uri.toString(), { moveToTrash: false });
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;
        });

        it('Should delete a directory without content.', async () => {
            const uri = root.resolve('foo');
            fs.mkdirSync(FileUri.fsPath(uri));
            expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).to.be.true;

            await fileSystem.delete(uri.toString(), { moveToTrash: false });
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;
        });

        it('Should delete a directory with all its content.', async () => {
            const uri = root.resolve('foo');
            const subUri = uri.resolve('bar.txt');
            fs.mkdirSync(FileUri.fsPath(uri));
            fs.writeFileSync(FileUri.fsPath(subUri), 'bar');
            expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(subUri), 'utf8')).to.be.equal('bar');

            await fileSystem.delete(uri.toString(), { moveToTrash: false });
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;
            expect(fs.existsSync(FileUri.fsPath(subUri))).to.be.false;
        });

    });

    describe('#11 getEncoding', () => {

        it('Should be rejected with an error if no file exists under the given URI.', async () => {
            const uri = root.resolve('foo.txt');
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            await expectThrowsAsync(fileSystem.getEncoding(uri.toString()), Error);
        });

        it('Should be rejected with an error if the URI points to a directory instead of a file.', async () => {
            const uri = root.resolve('foo');
            fs.mkdirSync(FileUri.fsPath(uri));
            expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).to.be.true;

            await expectThrowsAsync(fileSystem.getEncoding(uri.toString()), Error);
        });

        it('Should return with the encoding of the file.', async () => {
            const uri = root.resolve('foo.txt');
            fs.writeFileSync(FileUri.fsPath(uri), 'foo');
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;

            const encoding = await fileSystem.getEncoding(uri.toString());
            expect(encoding).to.be.equal('utf8');
        });

    });

    describe('#14 roots', async () => {

        it('should not throw error', async () => {
            expect(await createFileSystem().getRoots()).to.be.not.empty;
        });

    });

    describe('#15 currentUserHome', async () => {

        it('should exist', async () => {
            const userHome = await createFileSystem().getCurrentUserHome();
            expect(userHome).to.not.be.undefined;
            const actual = userHome!.uri.toString();
            const expected = FileUri.create(os.homedir()).toString();
            expect(expected).to.be.equal(actual);
        });

    });

    describe('#16 drives', async () => {

        it('should list URIs of the drives', async function () {
            this.timeout(10_000);
            const drives = await createFileSystem().getDrives();
            expect(drives).to.be.not.empty;
        });

    });

    describe('#17 fsPath', async () => {

        it('should return undefined', async function () {
            expect(await createFileSystem().getFsPath('http://www.theia-ide.org')).to.be.undefined;
        });

        it('should return a platform specific path', async function () {
            if (isWindows) {
                expect(await createFileSystem().getFsPath('file:///C:/user/theia')).to.be.equal('c:\\user\\theia');
                expect(await createFileSystem().getFsPath('file:///C%3A/user/theia')).to.be.equal('c:\\user\\theia');
            } else {
                expect(await createFileSystem().getFsPath('file:///user/home/theia')).to.be.equal('/user/home/theia');
            }
        });
    });

    function createFileSystem(): FileSystem {
        return new FileSystemNode();
    }

    function sleep(time: number) {
        return new Promise(resolve => setTimeout(resolve, time));
    }

});

// tslint:disable-next-line:no-any
process.on('unhandledRejection', (reason: any) => {
    console.error('Unhandled promise rejection: ' + reason);
});
