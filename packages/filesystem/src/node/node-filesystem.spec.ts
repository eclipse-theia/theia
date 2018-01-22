/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as os from 'os';
import * as temp from 'temp';
import * as chai from 'chai';
import * as fs from 'fs-extra';
import * as chaiAsPromised from 'chai-as-promised';
import URI from "@theia/core/lib/common/uri";
import { FileUri } from "@theia/core/lib/node";
import { FileSystem } from "../common/filesystem";
import { FileSystemNode } from "./node-filesystem";

// tslint:disable:no-unused-expression

const expect = chai.expect;
const track = temp.track();

describe("NodeFileSystem", function () {

    let root: URI;
    let fileSystem: FileSystem;

    this.timeout(10000);

    before(() => {
        chai.config.showDiff = true;
        chai.config.includeStack = true;
        chai.should();
        chai.use(chaiAsPromised);
    });

    beforeEach(() => {
        root = FileUri.create(fs.realpathSync(temp.mkdirSync('node-fs-root')));
        fileSystem = createFileSystem();
    });

    afterEach(async () => {
        track.cleanupSync();
    });

    describe("01 #getFileStat", () => {

        it("Should be rejected if not file exists under the given URI.", () => {
            const uri = root.resolve("foo.txt");
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            return fileSystem.getFileStat(uri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it("Should return a proper result for a file.", () => {
            const uri = root.resolve("foo.txt");
            fs.writeFileSync(FileUri.fsPath(uri), "foo");
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;

            return fileSystem.getFileStat(uri.toString()).then(stat => {
                expect(stat.isDirectory).to.be.false;
                expect(stat.uri).to.eq(uri.toString());
            });
        });

        it("Should return a proper result for a directory.", () => {
            const uri_1 = root.resolve("foo.txt");
            const uri_2 = root.resolve("bar.txt");
            fs.writeFileSync(FileUri.fsPath(uri_1), "foo");
            fs.writeFileSync(FileUri.fsPath(uri_2), "bar");
            expect(fs.statSync(FileUri.fsPath(uri_1)).isFile()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri_2)).isFile()).to.be.true;

            return fileSystem.getFileStat(root.toString()).then(stat => {
                expect(stat.children!.length).to.equal(2);
            });
        });

    });

    describe("02 #resolveContent", () => {

        it("Should be rejected with an error when trying to resolve the content of a non-existing file.", () => {
            const uri = root.resolve("foo.txt");
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            return fileSystem.resolveContent(uri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it("Should be rejected with an error when trying to resolve the content of a directory.", () => {
            const uri = root.resolve("foo");
            fs.mkdirSync(FileUri.fsPath(uri));
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).to.be.true;

            return fileSystem.resolveContent(uri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it("Should be rejected with an error if the desired encoding cannot be handled.", () => {
            const uri = root.resolve("foo.txt");
            fs.writeFileSync(FileUri.fsPath(uri), "foo", { encoding: "utf8" });
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: "utf8" })).to.be.equal("foo");

            return fileSystem.resolveContent(uri.toString(), { encoding: "unknownEncoding" }).should.eventually.be.rejectedWith(Error);
        });

        it("Should be return with the content for an existing file.", () => {
            const uri = root.resolve("foo.txt");
            fs.writeFileSync(FileUri.fsPath(uri), "foo", { encoding: "utf8" });
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: "utf8" })).to.be.equal("foo");

            return fileSystem.resolveContent(uri.toString()).should.eventually.have.property("content").that.is.equal("foo");
        });

        it("Should be return with the stat object for an existing file.", () => {
            const uri = root.resolve("foo.txt");
            fs.writeFileSync(FileUri.fsPath(uri), "foo", { encoding: "utf8" });
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: "utf8" })).to.be.equal("foo");

            const content = fileSystem.resolveContent(uri.toString());
            return Promise.all([
                content.should.eventually.be.fulfilled,
                content.should.eventually.have.be.an("object"),
                content.should.eventually.have.property("stat"),
                content.should.eventually.have.property("stat").that.has.property("uri").that.is.equal(uri.toString()),
                content.should.eventually.have.property("stat").that.has.property("size").that.is.greaterThan(1),
                content.should.eventually.have.property("stat").that.has.property("lastModification").that.is.greaterThan(1),
                content.should.eventually.have.property("stat").that.has.property("isDirectory").that.is.false,
                content.should.eventually.have.property("stat").that.not.have.property("children"),
            ]);
        });

    });

    describe("03 #setContent", () => {

        it("Should be rejected with an error when trying to set the content of a non-existing file.", () => {
            const uri = root.resolve("foo.txt");
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            const stat = {
                uri: uri.toString(),
                lastModification: new Date().getTime(),
                isDirectory: false
            };
            return fileSystem.setContent(stat, "foo").should.eventually.be.rejectedWith(Error);
        });

        it("Should be rejected with an error when trying to set the content of a directory.", () => {
            const uri = root.resolve("foo");
            fs.mkdirSync(FileUri.fsPath(uri));
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).to.be.true;

            return fileSystem.getFileStat(uri.toString()).then(stat => {
                fileSystem.setContent(stat, "foo").should.be.eventually.be.rejectedWith(Error);
            });
        });

        it("Should be rejected with an error when trying to set the content of a file which is out-of-sync.", () => {
            const uri = root.resolve("foo.txt");
            fs.writeFileSync(FileUri.fsPath(uri), "foo", { encoding: "utf8" });
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: "utf8" })).to.be.equal("foo");

            return fileSystem.getFileStat(uri.toString()).then(stat => {
                // Make sure current file stat is out-of-sync.
                // Here the content is modified in the way that file sizes will differ.
                fs.writeFileSync(FileUri.fsPath(uri), "longer", { encoding: "utf8" });
                expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: "utf8" })).to.be.equal("longer");

                fileSystem.setContent(stat, "baz").should.be.eventually.be.rejectedWith(Error);
            });
        });

        it("Should be rejected with an error when trying to set the content when the desired encoding cannot be handled.", () => {
            const uri = root.resolve("foo.txt");
            fs.writeFileSync(FileUri.fsPath(uri), "foo", { encoding: "utf8" });
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: "utf8" })).to.be.equal("foo");

            return fileSystem.getFileStat(uri.toString()).then(stat => {
                fileSystem.setContent(stat, "baz", { encoding: "unknownEncoding" }).should.be.eventually.be.rejectedWith(Error);
            });
        });

        it("Should return with a stat representing the latest state of the successfully modified file.", () => {
            const uri = root.resolve("foo.txt");
            fs.writeFileSync(FileUri.fsPath(uri), "foo", { encoding: "utf8" });
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.true;
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: "utf8" })).to.be.equal("foo");

            return fileSystem.getFileStat(uri.toString()).then(currentStat =>
                fileSystem.setContent(currentStat, "baz")
            ).then(newStat => {
                expect(fs.readFileSync(FileUri.fsPath(uri), { encoding: "utf8" })).to.be.equal("baz");
            });
        });

    });

    describe("04 #move", () => {

        it("Should be rejected with an error if no file exists under the source location.", () => {
            const sourceUri = root.resolve("foo.txt");
            const targetUri = root.resolve("bar.txt");
            expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.false;

            return fileSystem.move(sourceUri.toString(), targetUri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it("Should be rejected with an error if target exists and overwrite is not set to \'true\'.", () => {
            const sourceUri = root.resolve("foo.txt");
            const targetUri = root.resolve("bar.txt");
            fs.writeFileSync(FileUri.fsPath(sourceUri), "foo");
            fs.writeFileSync(FileUri.fsPath(targetUri), "bar");
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isFile()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isFile()).to.be.true;

            return fileSystem.move(sourceUri.toString(), targetUri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it("Moving a file to an empty directory. Should be rejected with an error because files cannot be moved to an existing directory locations.", () => {
            const sourceUri = root.resolve("foo.txt");
            const targetUri = root.resolve("bar");
            fs.writeFileSync(FileUri.fsPath(sourceUri), "foo");
            fs.mkdirSync(FileUri.fsPath(targetUri));
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(sourceUri), "utf8")).to.be.equal("foo");
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;
            expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.be.empty;

            return fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).should.eventually.be.rejectedWith(Error);
        });

        it("Moving a file to a non-empty directory. Should be rejected with and error because files cannot be moved to an existing directory locations.", () => {
            const sourceUri = root.resolve("foo.txt");
            const targetUri = root.resolve("bar");
            const targetFileUri_01 = targetUri.resolve("bar_01.txt");
            const targetFileUri_02 = targetUri.resolve("bar_02.txt");
            fs.writeFileSync(FileUri.fsPath(sourceUri), "foo");
            fs.mkdirSync(FileUri.fsPath(targetUri));
            fs.writeFileSync(FileUri.fsPath(targetFileUri_01), "bar_01");
            fs.writeFileSync(FileUri.fsPath(targetFileUri_02), "bar_02");
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(sourceUri), "utf8")).to.be.equal("foo");
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(targetFileUri_01), "utf8")).to.be.equal("bar_01");
            expect(fs.readFileSync(FileUri.fsPath(targetFileUri_02), "utf8")).to.be.equal("bar_02");
            expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.include("bar_01.txt").and.to.include("bar_02.txt");

            return fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).should.eventually.be.rejectedWith(Error);
        });

        it("Moving an empty directory to file. Should be rejected with an error because directories and cannot be moved to existing file locations.", () => {
            const sourceUri = root.resolve("foo");
            const targetUri = root.resolve("bar.txt");
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            fs.writeFileSync(FileUri.fsPath(targetUri), "bar");
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(targetUri), "utf8")).to.be.equal("bar");
            expect(fs.readdirSync(FileUri.fsPath(sourceUri))).to.be.empty;

            return fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).should.eventually.be.rejectedWith(Error);
        });

        it("Moving a non-empty directory to file. Should be rejected with an error because directories cannot be moved to existing file locations.", () => {
            const sourceUri = root.resolve("foo");
            const targetUri = root.resolve("bar.txt");
            const sourceFileUri_01 = sourceUri.resolve("foo_01.txt");
            const sourceFileUri_02 = sourceUri.resolve("foo_02.txt");
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            fs.writeFileSync(FileUri.fsPath(targetUri), "bar");
            fs.writeFileSync(FileUri.fsPath(sourceFileUri_01), "foo_01");
            fs.writeFileSync(FileUri.fsPath(sourceFileUri_02), "foo_02");
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(targetUri), "utf8")).to.be.equal("bar");
            expect(fs.readdirSync(FileUri.fsPath(sourceUri))).to.include("foo_01.txt").and.to.include("foo_02.txt");

            return fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).should.eventually.be.rejectedWith(Error);
        });

        it("Moving file to file. Should overwrite the target file content and delete the source file.", () => {
            const sourceUri = root.resolve("foo.txt");
            const targetUri = root.resolve("bar.txt");
            fs.writeFileSync(FileUri.fsPath(sourceUri), "foo");
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isFile()).to.be.true;
            expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.false;

            return fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).then(stat => {
                expect(stat).is.an("object").and.has.property("uri").that.equals(targetUri.toString());
                expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.false;
                expect(fs.statSync(FileUri.fsPath(targetUri)).isFile()).to.be.true;
                expect(fs.readFileSync(FileUri.fsPath(targetUri), "utf8")).to.be.equal("foo");
            });
        });

        it("Moving an empty directory to an empty directory. Should remove the source directory.", () => {
            const sourceUri = root.resolve("foo");
            const targetUri = root.resolve("bar");
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            fs.mkdirSync(FileUri.fsPath(targetUri));
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;
            expect(fs.readdirSync(FileUri.fsPath(sourceUri))).to.be.empty;
            expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.be.empty;

            return fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).then(stat => {
                expect(stat).is.an("object").and.has.property("uri").that.equals(targetUri.toString());
                expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.false;
                expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;
                expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.be.empty;
            });
        });

        it("Moving an empty directory to a non-empty directory. Should be rejected because the target folder is not empty.", () => {
            const sourceUri = root.resolve("foo");
            const targetUri = root.resolve("bar");
            const targetFileUri_01 = targetUri.resolve("bar_01.txt");
            const targetFileUri_02 = targetUri.resolve("bar_02.txt");
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            fs.mkdirSync(FileUri.fsPath(targetUri));
            fs.writeFileSync(FileUri.fsPath(targetFileUri_01), "bar_01");
            fs.writeFileSync(FileUri.fsPath(targetFileUri_02), "bar_02");
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;
            expect(fs.readdirSync(FileUri.fsPath(sourceUri))).to.be.empty;
            expect(fs.readFileSync(FileUri.fsPath(targetFileUri_01), "utf8")).to.be.equal("bar_01");
            expect(fs.readFileSync(FileUri.fsPath(targetFileUri_02), "utf8")).to.be.equal("bar_02");
            expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.include("bar_01.txt").and.to.include("bar_02.txt");

            return fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).should.eventually.be.rejectedWith(Error);
        });

        it("Moving a non-empty directory to an empty directory. Source folder and its content should be moved to the target location.", () => {
            const sourceUri = root.resolve("foo");
            const targetUri = root.resolve("bar");
            const sourceFileUri_01 = sourceUri.resolve("foo_01.txt");
            const sourceFileUri_02 = sourceUri.resolve("foo_02.txt");
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            fs.mkdirSync(FileUri.fsPath(targetUri));
            fs.writeFileSync(FileUri.fsPath(sourceFileUri_01), "foo_01");
            fs.writeFileSync(FileUri.fsPath(sourceFileUri_02), "foo_02");
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;
            expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.be.empty;
            expect(fs.readdirSync(FileUri.fsPath(sourceUri))).to.include("foo_01.txt").and.to.include("foo_02.txt");
            expect(fs.readFileSync(FileUri.fsPath(sourceFileUri_01), "utf8")).to.be.equal("foo_01");
            expect(fs.readFileSync(FileUri.fsPath(sourceFileUri_02), "utf8")).to.be.equal("foo_02");

            return fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).then(stat => {
                expect(stat).is.an("object").and.has.property("uri").that.equals(targetUri.toString());
                expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.false;
                expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;
                expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.include("foo_01.txt").and.to.include("foo_02.txt");
                expect(fs.readFileSync(FileUri.fsPath(targetUri.resolve("foo_01.txt")), "utf8")).to.be.equal("foo_01");
                expect(fs.readFileSync(FileUri.fsPath(targetUri.resolve("foo_02.txt")), "utf8")).to.be.equal("foo_02");
            });
        });

        it("Moving a non-empty directory to a non-empty directory. Should be rejected because the target location is not empty.", () => {
            const sourceUri = root.resolve("foo");
            const targetUri = root.resolve("bar");
            const sourceFileUri_01 = sourceUri.resolve("foo_01.txt");
            const sourceFileUri_02 = sourceUri.resolve("foo_02.txt");
            const targetFileUri_01 = targetUri.resolve("bar_01.txt");
            const targetFileUri_02 = targetUri.resolve("bar_02.txt");
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            fs.mkdirSync(FileUri.fsPath(targetUri));
            fs.writeFileSync(FileUri.fsPath(sourceFileUri_01), "foo_01");
            fs.writeFileSync(FileUri.fsPath(sourceFileUri_02), "foo_02");
            fs.writeFileSync(FileUri.fsPath(targetFileUri_01), "bar_01");
            fs.writeFileSync(FileUri.fsPath(targetFileUri_02), "bar_02");
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(sourceFileUri_01), "utf8")).to.be.equal("foo_01");
            expect(fs.readFileSync(FileUri.fsPath(sourceFileUri_02), "utf8")).to.be.equal("foo_02");
            expect(fs.readFileSync(FileUri.fsPath(targetFileUri_01), "utf8")).to.be.equal("bar_01");
            expect(fs.readFileSync(FileUri.fsPath(targetFileUri_02), "utf8")).to.be.equal("bar_02");
            expect(fs.readdirSync(FileUri.fsPath(sourceUri))).to.include("foo_01.txt").and.to.include("foo_02.txt");
            expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.include("bar_01.txt").and.to.include("bar_02.txt");

            return fileSystem.move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).should.eventually.be.rejectedWith(Error);
        });

    });

    describe("05 #copy", () => {

        it("Copy a file from non existing location. Should be rejected with an error. Nothing to copy.", () => {
            const sourceUri = root.resolve("foo");
            const targetUri = root.resolve("bar");
            fs.mkdirSync(FileUri.fsPath(targetUri));
            expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.false;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;

            return fileSystem.copy(sourceUri.toString(), targetUri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it("Copy a file to existing location without overwrite enabled. Should be rejected with an error.", () => {
            const sourceUri = root.resolve("foo");
            const targetUri = root.resolve("bar");
            fs.mkdirSync(FileUri.fsPath(targetUri));
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(targetUri)).isDirectory()).to.be.true;

            return fileSystem.copy(sourceUri.toString(), targetUri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it("Copy an empty directory to a non-existing location. Should return with the file stat representing the new file at the target location.", () => {
            const sourceUri = root.resolve("foo");
            const targetUri = root.resolve("bar");
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.false;

            return fileSystem.copy(sourceUri.toString(), targetUri.toString()).then(stat => {
                expect(stat).to.be.an("object");
                expect(stat).to.have.property("uri").that.is.equal(targetUri.toString());
                expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.true;
                expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.true;
            });
        });

        it("Copy an empty directory to a non-existing, nested location. Should return with the file stat representing the new file at the target location.", () => {
            const sourceUri = root.resolve("foo");
            const targetUri = root.resolve("nested/path/to/bar");
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.false;

            return fileSystem.copy(sourceUri.toString(), targetUri.toString()).then(stat => {
                expect(stat).to.be.an("object");
                expect(stat).to.have.property("uri").that.is.equal(targetUri.toString());
                expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.true;
                expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.true;
            });
        });

        it("Copy a directory with content to a non-existing location. Should return with the file stat representing the new file at the target location.", () => {
            const sourceUri = root.resolve("foo");
            const targetUri = root.resolve("bar");
            const subSourceUri = sourceUri.resolve("foo_01.txt");
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            fs.writeFileSync(FileUri.fsPath(subSourceUri), "foo");
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(subSourceUri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(subSourceUri), "utf8")).to.be.equal("foo");
            expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.false;

            return fileSystem.copy(sourceUri.toString(), targetUri.toString()).then(stat => {
                expect(stat).to.be.an("object");
                expect(stat).to.have.property("uri").that.is.equal(targetUri.toString());
                expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.true;
                expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.true;
                expect(fs.readdirSync(FileUri.fsPath(sourceUri))).to.contain("foo_01.txt");
                expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.contain("foo_01.txt");
                expect(fs.readFileSync(FileUri.fsPath(subSourceUri), "utf8")).to.be.equal("foo");
                expect(fs.readFileSync(FileUri.fsPath(targetUri.resolve("foo_01.txt")), "utf8")).to.be.equal("foo");
            });
        });

        it("Copy a directory with content to a non-existing, nested location. Should return with the file stat representing the new file at the target location.", () => {
            const sourceUri = root.resolve("foo");
            const targetUri = root.resolve("nested/path/to/bar");
            const subSourceUri = sourceUri.resolve("foo_01.txt");
            fs.mkdirSync(FileUri.fsPath(sourceUri));
            fs.writeFileSync(FileUri.fsPath(subSourceUri), "foo");
            expect(fs.statSync(FileUri.fsPath(sourceUri)).isDirectory()).to.be.true;
            expect(fs.statSync(FileUri.fsPath(subSourceUri)).isFile()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(subSourceUri), "utf8")).to.be.equal("foo");
            expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.false;

            return fileSystem.copy(sourceUri.toString(), targetUri.toString()).then(stat => {
                expect(stat).to.be.an("object");
                expect(stat).to.have.property("uri").that.is.equal(targetUri.toString());
                expect(fs.existsSync(FileUri.fsPath(sourceUri))).to.be.true;
                expect(fs.existsSync(FileUri.fsPath(targetUri))).to.be.true;
                expect(fs.readdirSync(FileUri.fsPath(sourceUri))).to.contain("foo_01.txt");
                expect(fs.readdirSync(FileUri.fsPath(targetUri))).to.contain("foo_01.txt");
                expect(fs.readFileSync(FileUri.fsPath(subSourceUri), "utf8")).to.be.equal("foo");
                expect(fs.readFileSync(FileUri.fsPath(targetUri.resolve("foo_01.txt")), "utf8")).to.be.equal("foo");
            });
        });

    });

    describe("07 #createFile", () => {

        it("Should be rejected with an error if a file already exists with the given URI.", () => {
            const uri = root.resolve("foo.txt");
            fs.writeFileSync(FileUri.fsPath(uri), "foo");
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;

            return fileSystem.createFile(uri.toString()).should.be.eventually.rejectedWith(Error);
        });

        it("Should be rejected with an error if the encoding is given but cannot be handled.", () => {
            const uri = root.resolve("foo.txt");
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            return fileSystem.createFile(uri.toString(), { encoding: "unknownEncoding" }).should.be.eventually.rejectedWith(Error);
        });

        it("Should create an empty file without any contents by default.", () => {
            const uri = root.resolve("foo.txt");
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            return fileSystem.createFile(uri.toString()).then(stat => {
                expect(stat).is.an("object");
                expect(stat).has.property("uri").that.is.equal(uri.toString());
                expect(stat).not.has.property("children");
                expect(fs.readFileSync(FileUri.fsPath(uri), "utf8")).to.be.empty;
            });
        });

        it("Should create a file with the desired content.", () => {
            const uri = root.resolve("foo.txt");
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            return fileSystem.createFile(uri.toString(), { content: "foo" }).then(stat => {
                expect(stat).is.an("object");
                expect(stat).has.property("uri").that.is.equal(uri.toString());
                expect(stat).not.has.property("children");
                expect(fs.readFileSync(FileUri.fsPath(uri), "utf8")).to.be.equal("foo");
            });
        });

        it("Should create a file with the desired content into a non-existing, nested location.", () => {
            const uri = root.resolve("foo/bar/baz.txt");
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            return fileSystem.createFile(uri.toString(), { content: "foo" }).then(stat => {
                expect(stat).is.an("object");
                expect(stat).has.property("uri").that.is.equal(uri.toString());
                expect(stat).not.has.property("children");
                expect(fs.readFileSync(FileUri.fsPath(uri), "utf8")).to.be.equal("foo");
            });
        });

        it("Should create a file with the desired content and encoding.", () => {
            const uri = root.resolve("foo.txt");
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            return fileSystem.createFile(uri.toString(), { content: "foo", encoding: "utf8" }).then(stat => {
                expect(stat).is.an("object");
                expect(stat).has.property("uri").that.is.equal(uri.toString());
                expect(stat).not.has.property("children");
                expect(fs.readFileSync(FileUri.fsPath(uri), "utf8")).to.be.equal("foo");
            });
        });

    });

    describe("08 #createFolder", () => {

        it("Should be rejected with an error if a directory already exist under the desired URI.", () => {
            const uri = root.resolve("foo");
            fs.mkdirSync(FileUri.fsPath(uri));
            expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).to.be.true;

            return fileSystem.createFolder(uri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it("Should create a directory and return with the stat object on successful directory creation.", () => {
            const uri = root.resolve("foo");
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            return fileSystem.createFolder(uri.toString()).then(stat => {
                expect(stat).to.be.an("object");
                expect(stat).to.have.property("uri").that.equals(uri.toString());
                expect(stat).to.have.property("children").that.is.empty;
            });
        });

        it("Should create a directory and return with the stat object on successful directory creation.", () => {
            const uri = root.resolve("foo/bar");
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            return fileSystem.createFolder(uri.toString()).then(stat => {
                expect(stat).to.be.an("object");
                expect(stat).to.have.property("uri").that.equals(uri.toString());
                expect(stat).to.have.property("children").that.is.empty;
            });
        });

    });

    describe("09 #touch", () => {

        it("Should create a new file if it does not exist yet.", () => {
            const uri = root.resolve("foo.txt");
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            return fileSystem.touchFile(uri.toString()).then(stat => {
                expect(stat).is.an("object");
                expect(stat).has.property("uri").that.equals(uri.toString());
                expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;
            });
        });

        it("Should update the modification timestamp on an existing file.", done => {
            const uri = root.resolve("foo.txt");
            fs.writeFileSync(FileUri.fsPath(uri), "foo");
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;

            fileSystem.getFileStat(uri.toString()).then(initialStat => {
                expect(initialStat).is.an("object");
                expect(initialStat).has.property("uri").that.equals(uri.toString());
                expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;
                return initialStat;
            }).then(initialStat => {
                // https://nodejs.org/en/docs/guides/working-with-different-filesystems/#timestamp-resolution
                sleep(1000).then(() => {
                    fileSystem.touchFile(uri.toString()).then(updatedStat => {
                        expect(updatedStat).is.an("object");
                        expect(updatedStat).has.property("uri").that.equals(uri.toString());
                        expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;
                        expect(updatedStat.lastModification).to.be.greaterThan(initialStat.lastModification);
                        done();
                    });
                });
            });
        });

    });

    describe("#10 delete", () => {

        it("Should be rejected when the file to delete does not exist.", () => {
            const uri = root.resolve("foo.txt");
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            return fileSystem.delete(uri.toString(), { moveToTrash: false }).should.be.eventually.rejectedWith(Error);
        });

        it("Should delete the file.", () => {
            const uri = root.resolve("foo.txt");
            fs.writeFileSync(FileUri.fsPath(uri), "foo");
            expect(fs.readFileSync(FileUri.fsPath(uri), "utf8")).to.be.equal("foo");

            return fileSystem.delete(uri.toString(), { moveToTrash: false }).then(() => {
                expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;
            });
        });

        it("Should delete a directory without content.", () => {
            const uri = root.resolve("foo");
            fs.mkdirSync(FileUri.fsPath(uri));
            expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).to.be.true;

            return fileSystem.delete(uri.toString(), { moveToTrash: false }).then(() => {
                expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;
            });
        });

        it("Should delete a directory with all its content.", () => {
            const uri = root.resolve("foo");
            const subUri = uri.resolve("bar.txt");
            fs.mkdirSync(FileUri.fsPath(uri));
            fs.writeFileSync(FileUri.fsPath(subUri), "bar");
            expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).to.be.true;
            expect(fs.readFileSync(FileUri.fsPath(subUri), "utf8")).to.be.equal("bar");

            return fileSystem.delete(uri.toString(), { moveToTrash: false }).then(() => {
                expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;
                expect(fs.existsSync(FileUri.fsPath(subUri))).to.be.false;
            });
        });

    });

    describe("#11 getEncoding", () => {

        it("Should be rejected with an error if no file exists under the given URI.", () => {
            const uri = root.resolve("foo.txt");
            expect(fs.existsSync(FileUri.fsPath(uri))).to.be.false;

            return fileSystem.getEncoding(uri.toString()).should.be.eventually.rejectedWith(Error);
        });

        it("Should be rejected with an error if the URI points to a directory instead of a file.", () => {
            const uri = root.resolve("foo");
            fs.mkdirSync(FileUri.fsPath(uri));
            expect(fs.statSync(FileUri.fsPath(uri)).isDirectory()).to.be.true;

            return fileSystem.getEncoding(uri.toString()).should.be.eventually.rejectedWith(Error);
        });

        it("Should return with the encoding of the file.", () => {
            const uri = root.resolve("foo.txt");
            fs.writeFileSync(FileUri.fsPath(uri), "foo");
            expect(fs.statSync(FileUri.fsPath(uri)).isFile()).to.be.true;

            return fileSystem.getEncoding(uri.toString()).should.be.eventually.be.equal("utf8");
        });

    });

    describe("#14 roots", async () => {

        it("should not throw error", async () => {
            expect(await createFileSystem().getRoots()).to.be.not.empty;
        });

    });

    describe("#15 currentUserHome", async () => {

        it("should exist", async () => {
            const actual = (await createFileSystem().getCurrentUserHome()).uri.toString();
            const expected = FileUri.create(os.homedir()).toString();
            expect(expected).to.be.equal(actual);
        });

    });

    function createFileSystem(): FileSystem {
        return new FileSystemNode();
    }

    function sleep(time: number) {
        return new Promise(resolve => setTimeout(resolve, time));
    }

});

process.on("unhandledRejection", (reason: any) => {
    console.error("Unhandled promise rejection: " + reason);
});
