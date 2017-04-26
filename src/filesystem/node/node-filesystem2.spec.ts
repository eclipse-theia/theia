import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as fs from "fs";
import * as os from "os";
import URI from "../../application/common/uri";

import { FileSystem2 } from "../common/filesystem2";
import { FileSystemNode } from "./node-filesystem2";

const root: URI = new URI(`file://${os.tmpdir()}/node-fs-root`);
const expect = chai.expect;

before(() => {
    chai.config.showDiff = true;
    chai.config.includeStack = true;
    chai.should();
    chai.use(chaiAsPromised);
});

beforeEach(() => {
    deleteFolderRecursive(root.path());
    fs.mkdirSync(root.path());
    expect(fs.existsSync(root.path())).to.be.true;
    expect(fs.readdirSync(root.path())).to.be.empty;
});

describe("NodeFileSystem", () => {

    describe("01 #getFileStat", () => {

        it("Should be rejected if not file exists under the given URI.", () => {
            const uri = root.append("foo.txt");
            expect(fs.existsSync(uri.path())).to.be.false;

            return createFileSystem().getFileStat(uri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it("Should return a proper result for a file.", () => {
            const uri = root.append("foo.txt");
            fs.writeFileSync(uri.path(), "foo");
            expect(fs.statSync(uri.path()).isFile()).to.be.true;

            return createFileSystem().getFileStat(uri.toString()).then(stat => {
                expect(stat.isDirectory).to.be.false;
                expect(stat.uri).to.eq(uri.toString());
            });
        });

        it("Should return a proper result for a directory.", () => {
            const uri_1 = root.append("foo.txt");
            const uri_2 = root.append("bar.txt");
            fs.writeFileSync(uri_1.path(), "foo");
            fs.writeFileSync(uri_2.path(), "bar");
            expect(fs.statSync(uri_1.path()).isFile()).to.be.true;
            expect(fs.statSync(uri_2.path()).isFile()).to.be.true;

            return createFileSystem().getFileStat(root.toString()).then(stat => {
                expect(stat.hasChildren).to.be.true;
                expect(stat.children!.length).to.equal(2);
            });
        });

    });

    describe("02 #resolveContent", () => {

        it("Should be rejected with an error when trying to resolve the content of a non-existing file.", () => {
            const uri = root.append("foo.txt");
            expect(fs.existsSync(uri.path())).to.be.false;

            return createFileSystem().resolveContent(uri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it("Should be rejected with an error when trying to resolve the content of a directory.", () => {
            const uri = root.append("foo");
            fs.mkdirSync(uri.path());
            expect(fs.existsSync(uri.path())).to.be.true;
            expect(fs.statSync(uri.path()).isDirectory()).to.be.true;

            return createFileSystem().resolveContent(uri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it("Should be rejected with an error if the desired encoding cannot be handled.", () => {
            const uri = root.append("foo.txt");
            fs.writeFileSync(uri.path(), "foo", { encoding: "utf8" });
            expect(fs.existsSync(uri.path())).to.be.true;
            expect(fs.statSync(uri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(uri.path(), { encoding: "utf8" })).to.be.equal("foo");

            return createFileSystem().resolveContent(uri.toString(), { encoding: "unknownEncoding" }).should.eventually.be.rejectedWith(Error);
        })

        it("Should be return with the content for an existing file.", () => {
            const uri = root.append("foo.txt");
            fs.writeFileSync(uri.path(), "foo", { encoding: "utf8" });
            expect(fs.existsSync(uri.path())).to.be.true;
            expect(fs.statSync(uri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(uri.path(), { encoding: "utf8" })).to.be.equal("foo");

            return createFileSystem().resolveContent(uri.toString()).should.eventually.have.property("content").that.is.equal("foo");
        });

        it("Should be return with the stat object for an existing file.", () => {
            const uri = root.append("foo.txt");
            fs.writeFileSync(uri.path(), "foo", { encoding: "utf8" });
            expect(fs.existsSync(uri.path())).to.be.true;
            expect(fs.statSync(uri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(uri.path(), { encoding: "utf8" })).to.be.equal("foo");

            const content = createFileSystem().resolveContent(uri.toString());
            return Promise.all([
                content.should.eventually.be.fulfilled,
                content.should.eventually.have.be.an("object"),
                content.should.eventually.have.property("stat"),
                content.should.eventually.have.property("stat").that.has.property("uri").that.is.equal(uri.toString()),
                content.should.eventually.have.property("stat").that.has.property("size").that.is.greaterThan(1),
                content.should.eventually.have.property("stat").that.has.property("lastModification").that.is.greaterThan(1),
                content.should.eventually.have.property("stat").that.has.property("isDirectory").that.is.false,
                content.should.eventually.have.property("stat").that.not.have.property("hasChildren"),
                content.should.eventually.have.property("stat").that.not.have.property("children"),
            ]);
        });

    });

    describe("03 #setContent", () => {

        it("Should be rejected with an error when trying to set the content of a non-existing file.", () => {
            const uri = root.append("foo.txt");
            expect(fs.existsSync(uri.path())).to.be.false;

            const stat = {
                uri: uri.toString(),
                lastModification: new Date().getTime(),
                isDirectory: false
            };
            return createFileSystem().setContent(stat, "foo").should.eventually.be.rejectedWith(Error);
        });

        it("Should be rejected with an error when trying to set the content of a directory.", () => {
            const uri = root.append("foo");
            fs.mkdirSync(uri.path());
            expect(fs.existsSync(uri.path())).to.be.true;
            expect(fs.statSync(uri.path()).isDirectory()).to.be.true;

            const fileSystem = createFileSystem();
            return fileSystem.getFileStat(uri.toString()).then(stat => {
                fileSystem.setContent(stat, "foo").should.be.eventually.be.rejectedWith(Error);
            });
        });

        it("Should be rejected with an error when trying to set the content of a file which is out-of-sync.", () => {
            const uri = root.append("foo.txt");
            fs.writeFileSync(uri.path(), "foo", { encoding: "utf8" });
            expect(fs.existsSync(uri.path())).to.be.true;
            expect(fs.statSync(uri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(uri.path(), { encoding: "utf8" })).to.be.equal("foo");

            const fileSystem = createFileSystem();
            return fileSystem.getFileStat(uri.toString()).then(stat => {
                // Make sure current file stat is out-of-sync.
                // Here the content is modified in the way that file sizes will differ.
                fs.writeFileSync(uri.path(), "longer", { encoding: "utf8" });
                expect(fs.readFileSync(uri.path(), { encoding: "utf8" })).to.be.equal("longer");

                fileSystem.setContent(stat, "baz").should.be.eventually.be.rejectedWith(Error);
            });
        });

        it("Should be rejected with an error when trying to set the content when the desired encoding cannot be handled.", () => {
            const uri = root.append("foo.txt");
            fs.writeFileSync(uri.path(), "foo", { encoding: "utf8" });
            expect(fs.existsSync(uri.path())).to.be.true;
            expect(fs.statSync(uri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(uri.path(), { encoding: "utf8" })).to.be.equal("foo");

            const fileSystem = createFileSystem();
            return fileSystem.getFileStat(uri.toString()).then(stat => {
                fileSystem.setContent(stat, "baz", { encoding: "unknownEncoding" }).should.be.eventually.be.rejectedWith(Error);
            });
        });

        it("Should return with a stat representing the latest state of the successfully modified file.", () => {
            const uri = root.append("foo.txt");
            fs.writeFileSync(uri.path(), "foo", { encoding: "utf8" });
            expect(fs.existsSync(uri.path())).to.be.true;
            expect(fs.statSync(uri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(uri.path(), { encoding: "utf8" })).to.be.equal("foo");

            const fileSystem = createFileSystem();
            return fileSystem.getFileStat(uri.toString()).then(currentStat => {
                return fileSystem.setContent(currentStat, "baz");
            }).then(newStat => {
                expect(fs.readFileSync(uri.path(), { encoding: "utf8" })).to.be.equal("baz");
            });
        });

    });

    describe("04 #move", () => {

        it("Should be rejected with an error if no file exists under the source location.", () => {
            const sourceUri = root.append("foo.txt");
            const targetUri = root.append("bar.txt");
            expect(fs.existsSync(sourceUri.path())).to.be.false;

            return createFileSystem().move(sourceUri.toString(), targetUri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it("Should be rejected with an error if target exists and overwrite is not set to \'true\'.", () => {
            const sourceUri = root.append("foo.txt");
            const targetUri = root.append("bar.txt");
            fs.writeFileSync(sourceUri.path(), "foo");
            fs.writeFileSync(targetUri.path(), "bar");
            expect(fs.statSync(sourceUri.path()).isFile()).to.be.true;
            expect(fs.statSync(targetUri.path()).isFile()).to.be.true;

            return createFileSystem().move(sourceUri.toString(), targetUri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it("Moving a file to an empty directory. Should be rejected with an error because files cannot be moved to an existing directory locations.", () => {
            const sourceUri = root.append("foo.txt");
            const targetUri = root.append("bar");
            fs.writeFileSync(sourceUri.path(), "foo");
            fs.mkdirSync(targetUri.path());
            expect(fs.statSync(sourceUri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(sourceUri.path(), "utf8")).to.be.equal("foo");
            expect(fs.statSync(targetUri.path()).isDirectory()).to.be.true;
            expect(fs.readdirSync(targetUri.path())).to.be.empty;

            return createFileSystem().move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).should.eventually.be.rejectedWith(Error);
        });

        it("Moving a file to a non-empty directory. Should be rejected with and error because files cannot be moved to an existing directory locations.", () => {
            const sourceUri = root.append("foo.txt");
            const targetUri = root.append("bar");
            const targetFileUri_01 = targetUri.append("bar_01.txt");
            const targetFileUri_02 = targetUri.append("bar_02.txt");
            fs.writeFileSync(sourceUri.path(), "foo");
            fs.mkdirSync(targetUri.path());
            fs.writeFileSync(targetFileUri_01.path(), "bar_01");
            fs.writeFileSync(targetFileUri_02.path(), "bar_02");
            expect(fs.statSync(sourceUri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(sourceUri.path(), "utf8")).to.be.equal("foo");
            expect(fs.statSync(targetUri.path()).isDirectory()).to.be.true;
            expect(fs.readFileSync(targetFileUri_01.path(), "utf8")).to.be.equal("bar_01");
            expect(fs.readFileSync(targetFileUri_02.path(), "utf8")).to.be.equal("bar_02");
            expect(fs.readdirSync(targetUri.path())).to.include("bar_01.txt").and.to.include("bar_02.txt");

            return createFileSystem().move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).should.eventually.be.rejectedWith(Error);
        });

        it("Moving an empty directory to file. Should be rejected with an error because directories and cannot be moved to existing file locations.", () => {
            const sourceUri = root.append("foo");
            const targetUri = root.append("bar.txt");
            fs.mkdirSync(sourceUri.path());
            fs.writeFileSync(targetUri.path(), "bar");
            expect(fs.statSync(sourceUri.path()).isDirectory()).to.be.true;
            expect(fs.statSync(targetUri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(targetUri.path(), "utf8")).to.be.equal("bar");
            expect(fs.readdirSync(sourceUri.path())).to.be.empty;

            return createFileSystem().move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).should.eventually.be.rejectedWith(Error);
        });

        it("Moving a non-empty directory to file. Should be rejected with an error because directories cannot be moved to existing file locations.", () => {
            const sourceUri = root.append("foo");
            const targetUri = root.append("bar.txt");
            const sourceFileUri_01 = sourceUri.append("foo_01.txt");
            const sourceFileUri_02 = sourceUri.append("foo_02.txt");
            fs.mkdirSync(sourceUri.path());
            fs.writeFileSync(targetUri.path(), "bar");
            fs.writeFileSync(sourceFileUri_01.path(), "foo_01");
            fs.writeFileSync(sourceFileUri_02.path(), "foo_02");
            expect(fs.statSync(sourceUri.path()).isDirectory()).to.be.true;
            expect(fs.statSync(targetUri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(targetUri.path(), "utf8")).to.be.equal("bar");
            expect(fs.readdirSync(sourceUri.path())).to.include("foo_01.txt").and.to.include("foo_02.txt");

            return createFileSystem().move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).should.eventually.be.rejectedWith(Error);
        });

        it("Moving file to file. Should overwrite the target file content and delete the source file.", () => {
            const sourceUri = root.append("foo.txt");
            const targetUri = root.append("bar.txt");
            fs.writeFileSync(sourceUri.path(), "foo");
            expect(fs.statSync(sourceUri.path()).isFile()).to.be.true;
            expect(fs.existsSync(targetUri.path())).to.be.false;

            return createFileSystem().move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).then(stat => {
                expect(stat).is.an("object").and.has.property("uri").that.equals(targetUri.toString());
                expect(fs.existsSync(sourceUri.path())).to.be.false;
                expect(fs.statSync(targetUri.path()).isFile()).to.be.true;
                expect(fs.readFileSync(targetUri.path(), "utf8")).to.be.equal("foo");
            });
        });

        it("Moving an empty directory to an empty directory. Should remove the source directory.", () => {
            const sourceUri = root.append("foo");
            const targetUri = root.append("bar");
            fs.mkdirSync(sourceUri.path());
            fs.mkdirSync(targetUri.path());
            expect(fs.statSync(sourceUri.path()).isDirectory()).to.be.true;
            expect(fs.statSync(targetUri.path()).isDirectory()).to.be.true;
            expect(fs.readdirSync(sourceUri.path())).to.be.empty;
            expect(fs.readdirSync(targetUri.path())).to.be.empty;

            return createFileSystem().move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).then(stat => {
                expect(stat).is.an("object").and.has.property("uri").that.equals(targetUri.toString());
                expect(fs.existsSync(sourceUri.path())).to.be.false;
                expect(fs.statSync(targetUri.path()).isDirectory()).to.be.true;
                expect(fs.readdirSync(targetUri.path())).to.be.empty;
            });
        });

        it("Moving an empty directory to a non-empty directory. Should be rejected because the target folder is not empty.", () => {
            const sourceUri = root.append("foo");
            const targetUri = root.append("bar");
            const targetFileUri_01 = targetUri.append("bar_01.txt");
            const targetFileUri_02 = targetUri.append("bar_02.txt");
            fs.mkdirSync(sourceUri.path());
            fs.mkdirSync(targetUri.path());
            fs.writeFileSync(targetFileUri_01.path(), "bar_01");
            fs.writeFileSync(targetFileUri_02.path(), "bar_02");
            expect(fs.statSync(sourceUri.path()).isDirectory()).to.be.true;
            expect(fs.statSync(targetUri.path()).isDirectory()).to.be.true;
            expect(fs.readdirSync(sourceUri.path())).to.be.empty;
            expect(fs.readFileSync(targetFileUri_01.path(), "utf8")).to.be.equal("bar_01");
            expect(fs.readFileSync(targetFileUri_02.path(), "utf8")).to.be.equal("bar_02");
            expect(fs.readdirSync(targetUri.path())).to.include("bar_01.txt").and.to.include("bar_02.txt");

            return createFileSystem().move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).should.eventually.be.rejectedWith(Error);
        });

        it("Moving a non-empty directory to an empty directory. Source folder and its content should be moved to the target location.", () => {
            const sourceUri = root.append("foo");
            const targetUri = root.append("bar");
            const sourceFileUri_01 = sourceUri.append("foo_01.txt");
            const sourceFileUri_02 = sourceUri.append("foo_02.txt");
            fs.mkdirSync(sourceUri.path());
            fs.mkdirSync(targetUri.path());
            fs.writeFileSync(sourceFileUri_01.path(), "foo_01");
            fs.writeFileSync(sourceFileUri_02.path(), "foo_02");
            expect(fs.statSync(sourceUri.path()).isDirectory()).to.be.true;
            expect(fs.statSync(targetUri.path()).isDirectory()).to.be.true;
            expect(fs.readdirSync(targetUri.path())).to.be.empty;
            expect(fs.readdirSync(sourceUri.path())).to.include("foo_01.txt").and.to.include("foo_02.txt");
            expect(fs.readFileSync(sourceFileUri_01.path(), "utf8")).to.be.equal("foo_01");
            expect(fs.readFileSync(sourceFileUri_02.path(), "utf8")).to.be.equal("foo_02");

            return createFileSystem().move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).then(stat => {
                expect(stat).is.an("object").and.has.property("uri").that.equals(targetUri.toString());
                expect(fs.existsSync(sourceUri.path())).to.be.false;
                expect(fs.statSync(targetUri.path()).isDirectory()).to.be.true;
                expect(fs.readdirSync(targetUri.path())).to.include("foo_01.txt").and.to.include("foo_02.txt");
                expect(fs.readFileSync(targetUri.append("foo_01.txt").path(), "utf8")).to.be.equal("foo_01");
                expect(fs.readFileSync(targetUri.append("foo_02.txt").path(), "utf8")).to.be.equal("foo_02");
            });
        });

        it("Moving a non-empty directory to a non-empty directory. Should be rejected because the target location is not empty.", () => {
            const sourceUri = root.append("foo");
            const targetUri = root.append("bar");
            const sourceFileUri_01 = sourceUri.append("foo_01.txt");
            const sourceFileUri_02 = sourceUri.append("foo_02.txt");
            const targetFileUri_01 = targetUri.append("bar_01.txt");
            const targetFileUri_02 = targetUri.append("bar_02.txt");
            fs.mkdirSync(sourceUri.path());
            fs.mkdirSync(targetUri.path());
            fs.writeFileSync(sourceFileUri_01.path(), "foo_01");
            fs.writeFileSync(sourceFileUri_02.path(), "foo_02");
            fs.writeFileSync(targetFileUri_01.path(), "bar_01");
            fs.writeFileSync(targetFileUri_02.path(), "bar_02");
            expect(fs.statSync(sourceUri.path()).isDirectory()).to.be.true;
            expect(fs.statSync(targetUri.path()).isDirectory()).to.be.true;
            expect(fs.readFileSync(sourceFileUri_01.path(), "utf8")).to.be.equal("foo_01");
            expect(fs.readFileSync(sourceFileUri_02.path(), "utf8")).to.be.equal("foo_02");
            expect(fs.readFileSync(targetFileUri_01.path(), "utf8")).to.be.equal("bar_01");
            expect(fs.readFileSync(targetFileUri_02.path(), "utf8")).to.be.equal("bar_02");
            expect(fs.readdirSync(sourceUri.path())).to.include("foo_01.txt").and.to.include("foo_02.txt");
            expect(fs.readdirSync(targetUri.path())).to.include("bar_01.txt").and.to.include("bar_02.txt");

            return createFileSystem().move(sourceUri.toString(), targetUri.toString(), { overwrite: true }).should.eventually.be.rejectedWith(Error);
        });

    });

    describe("05 #copy", () => {

        it("Copy a file from non existing location. Should be rejected with an error. Nothing to copy.", () => {
            const sourceUri = root.append("foo");
            const targetUri = root.append("bar");
            fs.mkdirSync(targetUri.path());
            expect(fs.existsSync(sourceUri.path())).to.be.false;
            expect(fs.statSync(targetUri.path()).isDirectory()).to.be.true;

            return createFileSystem().copy(sourceUri.toString(), targetUri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it("Copy a file to existing location without overwrite enabled. Should be rejected with an error.", () => {
            const sourceUri = root.append("foo");
            const targetUri = root.append("bar");
            fs.mkdirSync(targetUri.path());
            fs.mkdirSync(sourceUri.path());
            expect(fs.statSync(sourceUri.path()).isDirectory()).to.be.true;
            expect(fs.statSync(targetUri.path()).isDirectory()).to.be.true;

            return createFileSystem().copy(sourceUri.toString(), targetUri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it("Copy an empty directory to a non-existing location. Should return with the file stat representing the new file at the target location.", () => {
            const sourceUri = root.append("foo");
            const targetUri = root.append("bar");
            fs.mkdirSync(sourceUri.path());
            expect(fs.statSync(sourceUri.path()).isDirectory()).to.be.true;
            expect(fs.existsSync(targetUri.path())).to.be.false;

            return createFileSystem().copy(sourceUri.toString(), targetUri.toString()).then(stat => {
                expect(stat).to.be.an("object");
                expect(stat).to.have.property("uri").that.is.equal(targetUri.toString());
                expect(fs.existsSync(sourceUri.path())).to.be.true;
                expect(fs.existsSync(targetUri.path())).to.be.true;
            });
        });

        it("Copy an empty directory to a non-existing, nested location. Should return with the file stat representing the new file at the target location.", () => {
            const sourceUri = root.append("foo");
            const targetUri = root.append("nested/path/to/bar");
            fs.mkdirSync(sourceUri.path());
            expect(fs.statSync(sourceUri.path()).isDirectory()).to.be.true;
            expect(fs.existsSync(targetUri.path())).to.be.false;

            return createFileSystem().copy(sourceUri.toString(), targetUri.toString()).then(stat => {
                expect(stat).to.be.an("object");
                expect(stat).to.have.property("uri").that.is.equal(targetUri.toString());
                expect(fs.existsSync(sourceUri.path())).to.be.true;
                expect(fs.existsSync(targetUri.path())).to.be.true;
            });
        });

        it("Copy a directory with content to a non-existing location. Should return with the file stat representing the new file at the target location.", () => {
            const sourceUri = root.append("foo");
            const targetUri = root.append("bar");
            const subSourceUri = sourceUri.append("foo_01.txt");
            fs.mkdirSync(sourceUri.path());
            fs.writeFileSync(subSourceUri.path(), "foo");
            expect(fs.statSync(sourceUri.path()).isDirectory()).to.be.true;
            expect(fs.statSync(subSourceUri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(subSourceUri.path(), "utf8")).to.be.equal("foo");
            expect(fs.existsSync(targetUri.path())).to.be.false;

            return createFileSystem().copy(sourceUri.toString(), targetUri.toString()).then(stat => {
                expect(stat).to.be.an("object");
                expect(stat).to.have.property("uri").that.is.equal(targetUri.toString());
                expect(fs.existsSync(sourceUri.path())).to.be.true;
                expect(fs.existsSync(targetUri.path())).to.be.true;
                expect(fs.readdirSync(sourceUri.path())).to.contain("foo_01.txt");
                expect(fs.readdirSync(targetUri.path())).to.contain("foo_01.txt");
                expect(fs.readFileSync(subSourceUri.path(), "utf8")).to.be.equal("foo");
                expect(fs.readFileSync(targetUri.append("foo_01.txt").path(), "utf8")).to.be.equal("foo");
            });
        });

        it("Copy a directory with content to a non-existing, nested location. Should return with the file stat representing the new file at the target location.", () => {
            const sourceUri = root.append("foo");
            const targetUri = root.append("nested/path/to/bar");
            const subSourceUri = sourceUri.append("foo_01.txt");
            fs.mkdirSync(sourceUri.path());
            fs.writeFileSync(subSourceUri.path(), "foo");
            expect(fs.statSync(sourceUri.path()).isDirectory()).to.be.true;
            expect(fs.statSync(subSourceUri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(subSourceUri.path(), "utf8")).to.be.equal("foo");
            expect(fs.existsSync(targetUri.path())).to.be.false;

            return createFileSystem().copy(sourceUri.toString(), targetUri.toString()).then(stat => {
                expect(stat).to.be.an("object");
                expect(stat).to.have.property("uri").that.is.equal(targetUri.toString());
                expect(fs.existsSync(sourceUri.path())).to.be.true;
                expect(fs.existsSync(targetUri.path())).to.be.true;
                expect(fs.readdirSync(sourceUri.path())).to.contain("foo_01.txt");
                expect(fs.readdirSync(targetUri.path())).to.contain("foo_01.txt");
                expect(fs.readFileSync(subSourceUri.path(), "utf8")).to.be.equal("foo");
                expect(fs.readFileSync(targetUri.append("foo_01.txt").path(), "utf8")).to.be.equal("foo");
            });
        });

    });

    describe("06 #getWorkspaceRoot", () => {

        it("Should be rejected when the workspace root does not exist.", () => {
            return new FileSystemNode("some/missing/path").getWorkspaceRoot().should.eventually.be.rejectedWith(Error);
        });

        it("Should be return with the stat of the root. The root stat has information of its direct descendants but not the children of the descendants.", () => {
            const uri_1 = root.append("foo");
            const uri_2 = root.append("bar");
            const uri_1_01 = uri_1.append("foo_01.txt");
            const uri_1_02 = uri_1.append("foo_02.txt");
            const uri_2_01 = uri_2.append("bar_01.txt");
            const uri_2_02 = uri_2.append("bar_02.txt");
            fs.mkdirSync(uri_1.path());
            fs.mkdirSync(uri_2.path());
            fs.writeFileSync(uri_1_01.path(), "foo_01");
            fs.writeFileSync(uri_1_02.path(), "foo_02");
            fs.writeFileSync(uri_2_01.path(), "bar_01");
            fs.writeFileSync(uri_2_02.path(), "bar_02");
            expect(fs.statSync(uri_1.path()).isDirectory()).to.be.true;
            expect(fs.statSync(uri_2.path()).isDirectory()).to.be.true;
            expect(fs.readFileSync(uri_1_01.path(), "utf8")).to.be.equal("foo_01");
            expect(fs.readFileSync(uri_1_02.path(), "utf8")).to.be.equal("foo_02");
            expect(fs.readFileSync(uri_2_01.path(), "utf8")).to.be.equal("bar_01");
            expect(fs.readFileSync(uri_2_02.path(), "utf8")).to.be.equal("bar_02");
            expect(fs.readdirSync(uri_1.path())).to.include("foo_01.txt").and.to.include("foo_02.txt");
            expect(fs.readdirSync(uri_2.path())).to.include("bar_01.txt").and.to.include("bar_02.txt");

            return createFileSystem().getWorkspaceRoot().then(stat => {
                expect(stat).to.be.an("object");
                expect(stat).to.have.property("uri").that.equals(root.toString());
                expect(stat).to.have.property("hasChildren").that.be.true;
                expect(stat).to.have.property("children").that.is.not.undefined;
                expect(stat).to.have.property("children").that.has.lengthOf(2);
                expect(stat.children!.map(childStat => childStat.uri)).to.contain(uri_1.toString()).and.contain(uri_2.toString());
                expect(stat.children!.find(childStat => childStat.uri === uri_1.toString())).to.be.not.undefined;
                expect(stat.children!.find(childStat => childStat.uri === uri_2.toString())).to.be.not.undefined;
                expect(stat.children!.find(childStat => childStat.uri === uri_1.toString())!.children).to.be.undefined;
                expect(stat.children!.find(childStat => childStat.uri === uri_2.toString())!.children).to.be.undefined;
            });
        });

    });

    describe("07 #createFile", () => {

        it("Should be rejected with an error if a file already exists with the given URI.", () => {
            const uri = root.append("foo.txt");
            fs.writeFileSync(uri.path(), "foo");
            expect(fs.statSync(uri.path()).isFile()).to.be.true;

            return createFileSystem().createFile(uri.toString()).should.be.eventually.rejectedWith(Error);
        });

        it("Should be rejected with an error if the encoding is given but cannot be handled.", () => {
            const uri = root.append("foo.txt");
            expect(fs.existsSync(uri.path())).to.be.false;

            return createFileSystem().createFile(uri.toString(), { encoding: "unknownEncoding" }).should.be.eventually.rejectedWith(Error);
        });

        it("Should create an empty file without any contents by default.", () => {
            const uri = root.append("foo.txt");
            expect(fs.existsSync(uri.path())).to.be.false;

            return createFileSystem().createFile(uri.toString()).then(stat => {
                expect(stat).is.an("object");
                expect(stat).has.property("uri").that.is.equal(uri.toString());
                expect(stat).not.has.property("children");
                expect(stat).not.has.property("hasChildren");
                expect(fs.readFileSync(uri.path(), "utf8")).to.be.empty;
            });
        });

        it("Should create a file with the desired content.", () => {
            const uri = root.append("foo.txt");
            expect(fs.existsSync(uri.path())).to.be.false;

            return createFileSystem().createFile(uri.toString(), { content: "foo" }).then(stat => {
                expect(stat).is.an("object");
                expect(stat).has.property("uri").that.is.equal(uri.toString());
                expect(stat).not.has.property("children");
                expect(stat).not.has.property("hasChildren");
                expect(fs.readFileSync(uri.path(), "utf8")).to.be.equal("foo");
            });
        });

        it("Should create a file with the desired content and encoding.", () => {
            const uri = root.append("foo.txt");
            expect(fs.existsSync(uri.path())).to.be.false;

            return createFileSystem().createFile(uri.toString(), { content: "foo", encoding: "utf8" }).then(stat => {
                expect(stat).is.an("object");
                expect(stat).has.property("uri").that.is.equal(uri.toString());
                expect(stat).not.has.property("children");
                expect(stat).not.has.property("hasChildren");
                expect(fs.readFileSync(uri.path(), "utf8")).to.be.equal("foo");
            });
        });

        // TODO nested file creation

    });

    describe("08 #createFolder", () => {

        it("Should be rejected with an error if a directory already exist under the desired URI.", () => {
            const uri = root.append("foo");
            fs.mkdirSync(uri.path());
            expect(fs.statSync(uri.path()).isDirectory()).to.be.true;

            return createFileSystem().createFolder(uri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it("Should create a directory and return with the stat object on successful directory creation.", () => {
            const uri = root.append("foo");
            expect(fs.existsSync(uri.path())).to.be.false;

            return createFileSystem().createFolder(uri.toString()).then(stat => {
                expect(stat).to.be.an("object");
                expect(stat).to.have.property("uri").that.equals(uri.toString());
                expect(stat).to.have.property("hasChildren").that.is.false;
                expect(stat).to.have.property("children").that.is.empty;
            });
        });

        it("Should create a directory and return with the stat object on successful directory creation.", () => {
            const uri = root.append("foo/bar");
            expect(fs.existsSync(uri.path())).to.be.false;

            return createFileSystem().createFolder(uri.toString()).then(stat => {
                expect(stat).to.be.an("object");
                expect(stat).to.have.property("uri").that.equals(uri.toString());
                expect(stat).to.have.property("hasChildren").that.is.false;
                expect(stat).to.have.property("children").that.is.empty;
            });
        });

    });

});

process.on("unhandledRejection", (reason: any) => {
    console.error("Unhandled promise rejection: " + reason);
});

function createFileSystem(): FileSystem2 {
    return new FileSystemNode(root.toString());
}

function deleteFolderRecursive(path: string) {
    if (fs.existsSync(path)) {
        fs.readdirSync(path).forEach((file) => {
            const currentPath = `${path}/${file}`;
            if (fs.lstatSync(currentPath).isDirectory()) {
                deleteFolderRecursive(currentPath);
            } else {
                fs.chmodSync(currentPath, parseInt("0777", 8));
                fs.unlinkSync(currentPath);
            }
        });
        fs.chmodSync(path, parseInt("0777", 8));
        fs.rmdirSync(path);
    }
}
