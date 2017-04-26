import "mocha";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as fs from "fs";
import * as os from "os";
import * as URI from "urijs";

import { FileSystem2 } from "../common/filesystem2";
import { FileSystemNode } from './node-filesystem2';

const root: uri.URI = new URI(`file://${os.tmpdir()}/node-fs-root`);
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

describe('NodeFileSystem', () => {

    describe('01 #getFileStat', () => {

        it('Should be rejected if not file exists under the given URI.', () => {
            const uri = root.clone().segment("/myfile.txt");
            expect(fs.existsSync(uri.path())).to.be.false;

            return createFileSystem().getFileStat(uri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it('Should return a proper result for a file.', () => {
            const uri = root.clone().segment("/myfile.txt");
            fs.writeFileSync(uri.path(), "hello");
            expect(fs.statSync(uri.path()).isFile()).to.be.true;

            return createFileSystem().getFileStat(uri.toString()).then(stat => {
                expect(stat.isDirectory).to.be.false;
                expect(stat.uri).to.eq(uri.toString());
            });
        });

        it('Should return a proper result for a directory.', () => {
            const uri_1 = root.clone().segment("/myfile.txt");
            const uri_2 = root.clone().segment("/myfile2.txt");
            fs.writeFileSync(uri_1.path(), "hello");
            fs.writeFileSync(uri_2.path(), "hello");
            expect(fs.statSync(uri_1.path()).isFile()).to.be.true;
            expect(fs.statSync(uri_2.path()).isFile()).to.be.true;

            return createFileSystem().getFileStat(root.toString()).then(stat => {
                expect(stat.hasChildren).to.be.true;
                expect(stat.children!.length).to.equal(2);
            });
        });

    });

    describe('02 #resolveContent', () => {

        it('Should be rejected with an error when trying to resolve the content of a non-existing file.', () => {
            const uri = root.clone().segment("/foo.txt");
            expect(fs.existsSync(uri.path())).to.be.false;

            return createFileSystem().resolveContent(uri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it('Should be rejected with an error when trying to resolve the content of a directory.', () => {
            const uri = root.clone().segment("/foo");
            fs.mkdirSync(uri.path());
            expect(fs.existsSync(uri.path())).to.be.true;
            expect(fs.statSync(uri.path()).isDirectory()).to.be.true;

            return createFileSystem().resolveContent(uri.toString()).should.eventually.be.rejectedWith(Error);
        });

        it('Should be rejected with an error if the desired encoding cannot be handled.', () => {
            const uri = root.clone().segment("/foo.txt");
            fs.writeFileSync(uri.path(), "foo", { encoding: "utf8" });
            expect(fs.existsSync(uri.path())).to.be.true;
            expect(fs.statSync(uri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(uri.path(), { encoding: "utf8" })).to.be.equal("foo");

            return createFileSystem().resolveContent(uri.toString(), { encoding: 'unknownEncoding' }).should.eventually.be.rejectedWith(Error);
        })

        it('Should be return with the content for an existing file.', () => {
            const uri = root.clone().segment("/foo.txt");
            fs.writeFileSync(uri.path(), "foo", { encoding: "utf8" });
            expect(fs.existsSync(uri.path())).to.be.true;
            expect(fs.statSync(uri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(uri.path(), { encoding: "utf8" })).to.be.equal("foo");

            return createFileSystem().resolveContent(uri.toString()).should.eventually.have.property('content').that.is.equal("foo");
        });

        it('Should be return with the stat object for an existing file.', () => {
            const uri = root.clone().segment("/foo.txt");
            fs.writeFileSync(uri.path(), "foo", { encoding: "utf8" });
            expect(fs.existsSync(uri.path())).to.be.true;
            expect(fs.statSync(uri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(uri.path(), { encoding: "utf8" })).to.be.equal("foo");

            const content = createFileSystem().resolveContent(uri.toString());
            return Promise.all([
                content.should.eventually.be.fulfilled,
                content.should.eventually.have.be.an('object'),
                content.should.eventually.have.property('stat'),
                content.should.eventually.have.property('stat').that.has.property('uri').that.is.equal(uri.toString()),
                content.should.eventually.have.property('stat').that.has.property('size').that.is.greaterThan(1),
                content.should.eventually.have.property('stat').that.has.property('lastModification').that.is.greaterThan(1),
                content.should.eventually.have.property('stat').that.has.property('isDirectory').that.is.false,
                content.should.eventually.have.property('stat').that.not.have.property('hasChildren'),
                content.should.eventually.have.property('stat').that.not.have.property('children'),
            ]);
        });

    });

    describe('03 #setContent', () => {

        it('Should be rejected with an error when trying to set the content of a non-existing file.', () => {
            const uri = root.clone().segment("/foo.txt");
            expect(fs.existsSync(uri.path())).to.be.false;

            const stat = {
                uri: uri.toString(),
                lastModification: new Date().getTime(),
                isDirectory: false
            };
            return createFileSystem().setContent(stat, "foo").should.eventually.be.rejectedWith(Error);
        });

        it('Should be rejected with an error when trying to set the content of a directory.', () => {
            const uri = root.clone().segment("/foo");
            fs.mkdirSync(uri.path());
            expect(fs.existsSync(uri.path())).to.be.true;
            expect(fs.statSync(uri.path()).isDirectory()).to.be.true;

            const fileSystem = createFileSystem();
            return fileSystem.getFileStat(uri.toString()).then(stat => {
                fileSystem.setContent(stat, "foo").should.be.eventually.be.rejectedWith(Error);
            });
        });

        it('Should be rejected with an error when trying to set the content of a file which is out-of-sync.', () => {
            const uri = root.clone().segment("/foo.txt");
            fs.writeFileSync(uri.path(), "foo", { encoding: "utf8" });
            expect(fs.existsSync(uri.path())).to.be.true;
            expect(fs.statSync(uri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(uri.path(), { encoding: "utf8" })).to.be.equal("foo");

            const fileSystem = createFileSystem();
            return fileSystem.getFileStat(uri.toString()).then(stat => {
                // Make sure current file stat is out-of-sync.
                // Here the content is modified in the way that file sizes will differ.
                fs.writeFileSync(uri.path(), "fooo", { encoding: "utf8" });
                expect(fs.readFileSync(uri.path(), { encoding: "utf8" })).to.be.equal("fooo");

                fileSystem.setContent(stat, "baz").should.be.eventually.be.rejectedWith(Error);
            });
        });

        it('Should be rejected with an error when trying to set the content when the desired encoding cannot be handled.', () => {
            const uri = root.clone().segment("/foo.txt");
            fs.writeFileSync(uri.path(), "foo", { encoding: "utf8" });
            expect(fs.existsSync(uri.path())).to.be.true;
            expect(fs.statSync(uri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(uri.path(), { encoding: "utf8" })).to.be.equal("foo");

            const fileSystem = createFileSystem();
            return fileSystem.getFileStat(uri.toString()).then(stat => {
                fileSystem.setContent(stat, "baz", { encoding: 'unknownEncoding' }).should.be.eventually.be.rejectedWith(Error);
            });
        });

        it('Should return with a stat representing the latest state of the successfully modified file.', () => {
            const uri = root.clone().segment("/foo.txt");
            fs.writeFileSync(uri.path(), "foo", { encoding: "utf8" });
            expect(fs.existsSync(uri.path())).to.be.true;
            expect(fs.statSync(uri.path()).isFile()).to.be.true;
            expect(fs.readFileSync(uri.path(), { encoding: "utf8" })).to.be.equal("foo");

            const fileSystem = createFileSystem();
            return fileSystem.getFileStat(uri.toString()).then(stat => {
                fileSystem.setContent(stat, "baz").then(stat => {
                    expect(fs.readFileSync(uri.path(), { encoding: "utf8" })).to.be.equal("baz");
                });
            });
        });


    });

});

process.on('unhandledRejection', (reason: any) => {
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
                fs.chmodSync(currentPath, parseInt('0777', 8));
                fs.unlinkSync(currentPath);
            }
        });
        fs.chmodSync(path, parseInt('0777', 8));
        fs.rmdirSync(path);
    }
}
