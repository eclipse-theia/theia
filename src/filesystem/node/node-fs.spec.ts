import "mocha";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as fs from "fs";
import * as os from "os";
import { FileChangeEvent, FileSystem, FileChangeType, FileSystemWatcher } from "../common/file-system";
import { NodeFileSystem } from "./node-fs";
import { Path } from "../common/path";

const root = `${os.tmpdir()}/node-fs-root`;
const expect = chai.expect;
let undefinedPath: Path;
let undefinedData: string;

before(() => {
    chai.config.showDiff = true;
    chai.config.includeStack = true;
    chai.should();
    chai.use(chaiAsPromised);
});

beforeEach(() => {
    deleteFolderRecursive(root);
    fs.mkdirSync(root);
    expect(fs.existsSync(root)).to.be.true;
    expect(fs.readdirSync(root)).to.be.empty;
});

describe('NodeFileSystem', () => {

    describe('01 #exists(Path)', () => {
        it('Should be rejected when path argument is undefined.', () => {
            return createFileSystem().exists(undefinedPath).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('02 #exists(Path)', () => {
        it('Should return with true for an existing directory resource path.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.existsSync(toRawPath(path))).to.be.true;
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;

            return createFileSystem().exists(path).should.eventually.be.true;
        });
    });

    describe('02 #exists(Path)', () => {
        it('Should return with true for an existing file resource path.', () => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some content.');
            expect(fs.existsSync(toRawPath(path))).to.be.true;
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;

            return createFileSystem().exists(path).should.eventually.be.true;
        });
    });

    describe('03 #exists(Path)', () => {
        it('Should return with false for a missing resource path.', () => {
            const path = Path.fromString('foo.txt');
            return createFileSystem().exists(path).should.eventually.be.false;
        });
    });

    describe('04 #exists(Path)', () => {
        it('Should return with false for a missing, nested resource path.', () => {
            const path = Path.fromString('foo').append('bar.txt');
            return createFileSystem().exists(path).should.eventually.be.false;
        });
    });

    describe('01 #fileExists(Path)', () => {
        it('Should be rejected for undefined resource path argument.', () => {
            return createFileSystem().fileExists(undefinedPath).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('02 #fileExists(Path)', () => {
        it('Should returns with true for an existing file resource path.', () => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some content.');
            expect(fs.existsSync(toRawPath(path))).to.be.true;
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;

            return createFileSystem().fileExists(path).should.eventually.be.true;
        });
    });

    describe('03 #fileExists(Path)', () => {
        it('Should returns with true for an existing, nested file resource path.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.existsSync(toRawPath(path))).to.be.true;
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path.append('bar.txt')), 'Some content.');
            expect(fs.existsSync(toRawPath(path.append('bar.txt')))).to.be.true;
            expect(fs.statSync(toRawPath(path.append('bar.txt'))).isFile()).to.be.true;

            return createFileSystem().fileExists(path.append('bar.txt')).should.eventually.be.true;
        });
    });

    describe('04 #fileExists(Path)', () => {
        it('Should returns with false for an existing directory resource path.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.existsSync(toRawPath(path))).to.be.true;
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;

            return createFileSystem().fileExists(path).should.eventually.be.false;
        });
    });

    describe('05 #fileExists(Path)', () => {
        it('Should returns with false for an existing, nested directory resource path.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.existsSync(toRawPath(path))).to.be.true;
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.mkdirSync(toRawPath(path.append('bar')));
            expect(fs.existsSync(toRawPath(path.append('bar')))).to.be.true;
            expect(fs.statSync(toRawPath(path.append('bar'))).isDirectory()).to.be.true;

            return createFileSystem().fileExists(path.append('bar')).should.eventually.be.false;
        });
    });

    describe('06 #fileExists(Path)', () => {
        it('Should return with false for a missing resource path.', () => {
            const path = Path.fromString('foo.txt');
            return createFileSystem().fileExists(path).should.eventually.be.false;
        });
    });

    describe('07 #fileExists(Path)', () => {
        it('Should return with false for a missing, nested resource path.', () => {
            const path = Path.fromString('foo').append('bar.txt');
            return createFileSystem().fileExists(path).should.eventually.be.false;
        });
    });

    describe('01 #dirExists(Path)', () => {
        it('Should be rejected for undefined resource path argument.', () => {
            return createFileSystem().dirExists(undefinedPath).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('02 #dirExists(Path)', () => {
        it('Should returns with true for an existing directory resource path.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.existsSync(toRawPath(path))).to.be.true;
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;

            return createFileSystem().dirExists(path).should.eventually.be.true;
        });
    });

    describe('03 #dirExists(Path)', () => {
        it('Should returns with true for an existing, nested directory resource path.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.existsSync(toRawPath(path))).to.be.true;
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.mkdirSync(toRawPath(path.append('bar')));
            expect(fs.existsSync(toRawPath(path.append('bar')))).to.be.true;
            expect(fs.statSync(toRawPath(path.append('bar'))).isDirectory()).to.be.true;

            return createFileSystem().dirExists(path.append('bar')).should.eventually.be.true;
        });
    });

    describe('04 #dirExists(Path)', () => {
        it('Should returns with false for an existing file resource path.', () => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some content.');
            expect(fs.existsSync(toRawPath(path))).to.be.true;
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;

            return createFileSystem().dirExists(path).should.eventually.be.false;
        });
    });

    describe('05 #dirExists(Path)', () => {
        it('Should returns with false for an existing, nested file resource path.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.existsSync(toRawPath(path))).to.be.true;
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path.append('bar.txt')), 'Some content.');
            expect(fs.existsSync(toRawPath(path.append('bar.txt')))).to.be.true;
            expect(fs.statSync(toRawPath(path.append('bar.txt'))).isFile()).to.be.true;

            return createFileSystem().dirExists(path.append('bar.txt')).should.eventually.be.false;
        });
    });

    describe('06 #dirExists(Path)', () => {
        it('Should return with false for a missing resource path.', () => {
            const path = Path.fromString('foo');
            return createFileSystem().dirExists(path).should.eventually.be.false;
        });
    });

    describe('07 #dirExists(Path)', () => {
        it('Should return with false for a missing, nested resource path.', () => {
            const path = Path.fromString('foo').append('bar');
            return createFileSystem().dirExists(path).should.eventually.be.false;
        });
    });

    describe('01 #mkdir(Path)', () => {
        it('Should return with true on successful folder creation.', () => {
            return createFileSystem().mkdir(Path.fromString('foo')).should.eventually.be.true;
        });
    });

    describe('02 #mkdir(Path)', () => {
        it('Should be rejected with false for undefined path argument.', () => {
            return createFileSystem().mkdir(undefinedPath).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('03 #mkdir(Path)', () => {
        it('Should fire an \'ADDED\' file change event on successful folder creation.', () => {
            const path = Path.fromString('foo');
            const fileSystem = createFileSystem();
            const events = attachWatcher(fileSystem);

            return fileSystem.mkdir(path).then(result => {
                expect(result).to.be.true;
                expect(events).to.have.length(1);
                expect(events[0].changes).to.have.length(1);
                expect(events[0].changes[0].type).to.be.equal(FileChangeType.ADDED);
                expect(events[0].changes[0].path).to.be.deep.equal(path).notify;
            });
        });
    });

    describe('04 #mkdir(Path)', () => {
        it('Should be rejected with false when the folder already exists.', () => {
            const path = Path.fromString('foo');
            return Promise.all([
                createFileSystem().mkdir(path).should.eventually.be.true,
                createFileSystem().mkdir(path).should.eventually.be.rejectedWith(false)
            ]);
        });
    });

    describe('05 #mkdir(Path)', () => {
        it('Should create a directory and not a file.', () => {
            const path = Path.fromString('foo');
            const fileSystem = createFileSystem();
            return Promise.all([
                fileSystem.mkdir(path).should.eventually.be.true,
                fileSystem.dirExists(path).should.eventually.be.true,
                fileSystem.fileExists(path).should.eventually.be.false
            ]);
        });
    });

    describe('06 #mkdir(Path)', () => {
        it('Should be rejected when creating nested directories recursively.', () => {
            const path = Path.fromString('foo').append('bar');
            const fileSystem = createFileSystem();
            return Promise.all([
                fileSystem.mkdir(path).should.eventually.be.rejectedWith(Error),
                fileSystem.dirExists(path).should.eventually.be.false,
                fileSystem.fileExists(path).should.eventually.be.false
            ]);
        });
    });

    describe('01 #ls(Path)', () => {
        it('Should be rejected for undefined path argument.', () => {
            return createFileSystem().ls(undefinedPath).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('02 #ls(Path)', () => {
        it('Should be rejected if the path argument points to a file instead of a folder.', () => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some data');
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;

            return createFileSystem().ls(path).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('03 #ls(Path)', () => {
        it('Should return with an empty array if the directory is empty.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;

            return createFileSystem().ls(path).should.eventually.be.empty;
        });
    });

    describe('04 #ls(Path)', () => {
        it('Should return with an array of directory paths in the folder.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.mkdirSync(toRawPath(path, 'bar'));

            return createFileSystem().ls(path).then(result => {
                expect(result).to.have.length(1);
                expect(result[0]).to.be.deep.equal(path.append('bar'));
            });
        });
    });

    describe('05 #ls(Path)', () => {
        it('Should return with an array of file paths in the folder.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path, 'bar.txt'), 'Some data');
            expect(fs.statSync(toRawPath(path, 'bar.txt')).isFile()).to.be.true;

            return createFileSystem().ls(path).then(result => {
                expect(result).to.have.length(1);
                expect(result[0]).to.be.deep.equal(path.append('bar.txt'));
            });
        });
    });

    describe('06 #ls(Path)', () => {
        it('Should not list resources recursively.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path, 'bar.txt'), 'Some data');
            expect(fs.statSync(toRawPath(path, 'bar.txt')).isFile()).to.be.true;
            fs.mkdirSync(toRawPath(path, 'baz'));
            expect(fs.statSync(toRawPath(path, 'baz')).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path, 'baz', 'bar.txt'), 'Some data');
            expect(fs.statSync(toRawPath(path, 'baz', 'bar.txt')).isFile()).to.be.true;

            return createFileSystem().ls(path).then(result => {
                expect(result).to.have.length(2);
                expect(result[0]).to.be.deep.equal(path.append('bar.txt'));
                expect(result[1]).to.be.deep.equal(path.append('baz'));
            });
        });
    });

    describe('01 #rm(Path)', () => {
        it('Should be rejected when path is undefined.', () => {
            return createFileSystem().rm(undefinedPath).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('02 #rm(Path)', () => {
        it('Should be rejected when path does not exist.', () => {
            return createFileSystem().rm(Path.fromString('foo')).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('03 #rm(Path)', () => {
        it('Should be rejected when nested path does not exist.', () => {
            return createFileSystem().rm(Path.fromString('foo').append('bar')).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('04 #rm(Path)', () => {
        it('Should be rejected when path points to a directory resource.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;

            return createFileSystem().rm(path).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('05 #rm(Path)', () => {
        it('Should be rejected when path points to a nested directory resource.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.mkdirSync(toRawPath(path.append('bar')));
            expect(fs.statSync(toRawPath(path.append('bar'))).isDirectory()).to.be.true;

            return createFileSystem().rm(path.append('bar')).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('06 #rm(Path)', () => {
        it('Should return true when the file deletion was successful.', () => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some content.');
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;

            return createFileSystem().rm(path).should.eventually.be.true;
        });
    });

    describe('07 #rm(Path)', () => {
        it('File should not exist after the deletion of the file resource.', done => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some content.');
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;

            const fileSystem = createFileSystem();
            fileSystem.rm(path).then(() => {
                fileSystem.fileExists(path).should.eventually.be.false.notify(done);
            });
        });
    });

    describe('08 #rm(Path)', () => {
        it('Should fire a file change event when the file deletion was successful.', () => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some content.');
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;

            const fileSystem = createFileSystem();
            const events = attachWatcher(fileSystem);
            return fileSystem.rm(path).then(() => {
                expect(events).to.have.length(1);
                expect(events[0].changes).to.have.length(1);
                expect(events[0].changes[0].path).to.be.deep.equal(path);
                expect(events[0].changes[0].type).to.be.deep.equal(FileChangeType.DELETED);
            });
        });
    });

    describe('09 #rm(Path)', () => {
        it('Should return true when the nested file deletion was successful.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path.append('bar.txt')), 'Some content.');
            expect(fs.statSync(toRawPath(path.append('bar.txt'))).isFile()).to.be.true;

            return createFileSystem().rm(path.append('bar.txt')).should.eventually.be.true;
        });
    });

    describe('10 #rm(Path)', () => {
        it('File should not exist after the deletion of the nested file resource.', done => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path.append('bar.txt')), 'Some content.');
            expect(fs.statSync(toRawPath(path.append('bar.txt'))).isFile()).to.be.true;

            const fileSystem = createFileSystem();
            fileSystem.rm(path.append('bar.txt')).then(result => {
                fileSystem.fileExists(path.append('bar.txt')).should.eventually.be.false.notify(done);
            });
        });
    });

    describe('01 #rmdir(Path)', () => {
        it('Should be rejected when path is undefined.', () => {
            return createFileSystem().rmdir(undefinedPath).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('02 #rmdir(Path)', () => {
        it('Should be rejected when path does not exist.', () => {
            return createFileSystem().rmdir(Path.fromString('foo')).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('03 #rmdir(Path)', () => {
        it('Should be rejected when nested path does not exist.', () => {
            return createFileSystem().rmdir(Path.fromString('foo').append('bar')).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('04 #rmdir(Path)', () => {
        it('Should be rejected when path points to a file resource.', () => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some content.');
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;

            return createFileSystem().rmdir(path).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('05 #rmdir(Path)', () => {
        it('Should be rejected when path points to a nested file resource.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path.append('bar.txt')), 'Some content');
            expect(fs.statSync(toRawPath(path.append('bar.txt'))).isFile()).to.be.true;

            return createFileSystem().rmdir(path.append('bar.txt')).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('06 #rmdir(Path)', () => {
        it('Should return true when the directory deletion was successful.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;

            return createFileSystem().rmdir(path).should.eventually.be.true;
        });
    });

    describe('07 #rmdir(Path)', () => {
        it('Directory should not exist after the deletion.', done => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;

            const fileSystem = createFileSystem();
            fileSystem.rmdir(path).then(() => {
                fileSystem.dirExists(path).should.eventually.be.false.notify(done);
            });
        });
    });

    describe('08 #rmdir(Path)', () => {
        it('Should fire a file change event when the directory deletion was successful.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;

            const fileSystem = createFileSystem();
            const events = attachWatcher(fileSystem);
            return fileSystem.rmdir(path).then(() => {
                expect(events).to.have.length(1);
                expect(events[0].changes).to.have.length(1);
                expect(events[0].changes[0].path).to.be.deep.equal(path);
                expect(events[0].changes[0].type).to.be.deep.equal(FileChangeType.DELETED);
            });
        });
    });

    describe('09 #rmdir(Path)', () => {
        it('Should return true when the recursive deletion was successful.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path.append('bar.txt')), 'Some content.');
            expect(fs.statSync(toRawPath(path.append('bar.txt'))).isFile()).to.be.true;
            fs.mkdirSync(toRawPath(path.append('baz')));
            expect(fs.statSync(toRawPath(path.append('baz'))).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path.append('baz').append('qux.txt')), 'Another content.');
            expect(fs.statSync(toRawPath(path.append('baz').append('qux.txt'))).isFile()).to.be.true;

            return createFileSystem().rmdir(path).should.eventually.be.true;
        });
    });

    describe('10 #rmdir(Path)', () => {
        it('Directory and its content should not exist after the successful recursive deletion.', done => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path.append('bar.txt')), 'Some content.');
            expect(fs.statSync(toRawPath(path.append('bar.txt'))).isFile()).to.be.true;
            fs.mkdirSync(toRawPath(path.append('baz')));
            expect(fs.statSync(toRawPath(path.append('baz'))).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path.append('baz').append('qux.txt')), 'Another content.');
            expect(fs.statSync(toRawPath(path.append('baz').append('qux.txt'))).isFile()).to.be.true;

            const fileSystem = createFileSystem();
            fileSystem.rmdir(path).then(result => {
                fileSystem.dirExists(path).should.eventually.be.false;
                fileSystem.fileExists(path.append('bar.txt')).should.eventually.be.false;
                fileSystem.dirExists(path.append('baz')).should.eventually.be.false;
                fileSystem.fileExists(path.append('baz').append('qux.txt')).should.eventually.be.false.notify(done);
            });
        });
    });

    describe('11 #rmdir(Path)', () => {
        it('Should fire file change event on successful recursive directory deletion.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path.append('bar.txt')), 'Some content.');
            expect(fs.statSync(toRawPath(path.append('bar.txt'))).isFile()).to.be.true;
            fs.mkdirSync(toRawPath(path.append('baz')));
            expect(fs.statSync(toRawPath(path.append('baz'))).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path.append('baz').append('qux.txt')), 'Another content.');
            expect(fs.statSync(toRawPath(path.append('baz').append('qux.txt'))).isFile()).to.be.true;

            const fileSystem = createFileSystem();
            const events = attachWatcher(fileSystem);
            return fileSystem.rmdir(path).then(result => {
                expect(events).to.have.length(1);
                expect(events[0].changes).to.have.length(4);
                expect(events[0].changes.map(change => change.path)).to.include(path)
                    .and.to.include(path.append('baz'))
                    .and.to.include(path.append('bar.txt'))
                    .and.to.include(path.append('baz').append('qux.txt'));
                expect(events[0].changes.map(change => change.type)).to.contain(FileChangeType.DELETED);
                expect(events[0].changes.map(change => change.type)).to.not.contain(FileChangeType.ADDED);
                expect(events[0].changes.map(change => change.type)).to.not.contain(FileChangeType.UPDATED);
            });
        });
    });

    describe('01 #rename(Path, Path)', () => {
        it('Should be rejected when old path argument is undefined.', () => {
            return createFileSystem().rename(undefinedPath, Path.fromString('foo')).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('02 #rename(Path, Path)', () => {
        it('Should be rejected when new path argument is undefined.', () => {
            return createFileSystem().rename(Path.fromString('foo'), undefinedPath).should.eventually.be.rejectedWith(false);
        });
    });

    describe('03 #rename(Path, Path)', () => {
        it('Should be rejected return false when both arguments are undefined.', () => {
            return createFileSystem().rename(undefinedPath, undefinedPath).should.eventually.be.rejectedWith(false);
        });
    });

    describe('04 #rename(Path, Path)', () => {
        it('Should return true when renaming a directory succeeded.', done => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;

            const fileSystem = createFileSystem();
            fileSystem.rename(path, Path.fromString('bar')).then(result => {
                expect(result).to.be.true;
                fileSystem.exists(Path.fromString('bar')).should.eventually.be.true;
                fileSystem.dirExists(Path.fromString('bar')).should.eventually.be.true;
                fileSystem.exists(path).should.eventually.be.false;
                fileSystem.dirExists(path).should.eventually.be.false.notify(done);
            });
        });
    });

    describe('05 #rename(Path, Path)', () => {
        it('Should return true when renaming a file succeeded.', done => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path, 'bar.txt'), 'Some data');
            expect(fs.statSync(toRawPath(path, 'bar.txt')).isFile()).to.be.true;

            const fileSystem = createFileSystem();
            fileSystem.rename(path.append('bar.txt'), path.append('baz.txt')).then(result => {
                expect(result).to.be.true;
                fileSystem.exists(path.append('baz.txt')).should.eventually.be.true;
                fileSystem.fileExists(path.append('baz.txt')).should.eventually.be.true;
                fileSystem.exists(path.append('bar.txt')).should.eventually.be.false;
                fileSystem.fileExists(path.append('bar.txt')).should.eventually.be.false.notify(done);
            });
        });
    });

    describe('06 #rename(Path, Path)', () => {
        it('Should fire a \'DELETED\' and an \'ADDED\' event when the rename was successful.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path, 'bar.txt'), 'Some data');
            expect(fs.statSync(toRawPath(path, 'bar.txt')).isFile()).to.be.true;

            const fileSystem = createFileSystem();
            const events = attachWatcher(fileSystem);
            return fileSystem.rename(path.append('bar.txt'), path.append('baz.txt')).then(result => {
                expect(result).to.be.true;
                expect(events).to.have.length(1);
                expect(events[0].changes).to.have.length(2);
                expect(events[0].changes[0].type).be.equal(FileChangeType.DELETED);
                expect(events[0].changes[0].path).be.deep.equal(path.append('bar.txt'));
                expect(events[0].changes[1].type).be.equal(FileChangeType.ADDED);
                expect(events[0].changes[1].path).be.deep.equal(path.append('baz.txt'));
            });
        });
    });

    describe('07 #rename(Path, Path)', () => {
        it('Should be rejected with false when the resource to rename does not exist.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            expect(fs.existsSync(toRawPath(path, 'bar.txt'))).to.be.false;

            return createFileSystem().rename(path.append('bar.txt'), path.append('baz.txt')).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('08 #rename(Path, Path)', () => {
        it('Should simply overwrite a resource already exists under the \'newPath\'.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path, 'bar.txt'), 'Some data');
            expect(fs.statSync(toRawPath(path, 'bar.txt')).isFile()).to.be.true;
            fs.writeFileSync(toRawPath(path, 'baz.txt'), 'Some other data');
            expect(fs.statSync(toRawPath(path, 'baz.txt')).isFile()).to.be.true;

            const fileSystem = createFileSystem();
            return Promise.all([
                fileSystem.rename(path.append('bar.txt'), path.append('baz.txt')).should.eventually.be.true,
                fileSystem.fileExists(path.append('bar.txt')).should.eventually.be.false,
                fileSystem.fileExists(path.append('baz.txt')).should.eventually.be.true,
                fileSystem.readFile(path.append('baz.txt'), 'utf8').should.eventually.be.equal('Some data')
            ]);
        });
    });

    describe('01 #writeFile(Path, string, string)', () => {
        it('Should be rejected when path is undefined.', () => {
            return createFileSystem().writeFile(undefinedPath, 'Some content').should.eventually.be.rejectedWith(Error);
        });
    });

    describe('02 #writeFile(Path, string, string)', () => {
        it('Should be rejected when data is undefined.', () => {
            return createFileSystem().writeFile(Path.fromString('foo.txt'), undefinedData).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('03 #writeFile(Path, string, string)', () => {
        it('Should be rejected when encoding cannot be interpreted.', () => {
            return createFileSystem().writeFile(Path.fromString('foo.txt'), 'Some content', 'My-Fake-Encoding').should.eventually.be.rejectedWith(Error);
        });
    });

    describe('04 #writeFile(Path, string, string)', () => {
        it('Should return with true after successfully creating a new file.', done => {
            const path = Path.fromString('foo.txt');
            const fileSystem = createFileSystem();
            fileSystem.writeFile(Path.fromString('foo.txt'), 'Some content').then(result => {
                expect(result).to.be.true;
                fileSystem.readFile(path).should.eventually.be.equal('Some content').notify(done);
            });
        });
    });

    describe('05 #writeFile(Path, string, string)', () => {
        it('Should overwrite the content of an existing file.', done => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some content');
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;
            expect(fs.readFileSync(toRawPath(path), { encoding: 'utf8' })).to.be.equal('Some content');

            const fileSystem = createFileSystem();
            fileSystem.writeFile(path, 'Another content').then(result => {
                expect(result).to.be.true;
                fileSystem.readFile(path).should.eventually.be.equal('Another content').notify(done);
            });
        });
    });

    describe('06 #writeFile(Path, string, string)', () => {
        it('Should be rejected when trying to write the content of a directory.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;

            return createFileSystem().writeFile(path, 'Some content').should.eventually.be.rejectedWith(Error);
        });
    });

    describe('07 #writeFile(Path, string, string)', () => {
        it('Should be rejected when no write access is avilable on the file.', () => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some content');
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;
            expect(fs.readFileSync(toRawPath(path), { encoding: 'utf8' })).to.be.equal('Some content');
            fs.chmodSync(toRawPath(path), parseInt('444', 8));
            try {
                fs.writeFileSync(toRawPath(path), 'This content must not get into the file');
                expect.fail('Expected a write protection on the file.');
            } catch (err) {
                // Expected.
                expect(err).to.instanceOf(Error);
                expect((<Error>err).message).to.contain('EACCES');
                expect(fs.readFileSync(toRawPath(path), { encoding: 'utf8' })).to.be.equal('Some content');
            }

            return createFileSystem().writeFile(path, 'New content').should.eventually.be.rejectedWith(Error);
        });
    });

    describe('01 #readFile(Path, string, string)', () => {
        it('Should be rejected when path is undefined.', () => {
            return createFileSystem().readFile(undefinedPath).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('02 #readFile(Path, string, string)', () => {
        it('Should be rejected when path points to a directory.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;

            return createFileSystem().readFile(path).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('03 #readFile(Path, string, string)', () => {
        it('Should be rejected when encoding cannot be interpreted.', () => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some content');
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;
            expect(fs.readFileSync(toRawPath(path), { encoding: 'utf8' })).to.be.equal('Some content');

            return createFileSystem().readFile(path, 'My-Fake-Encoding').should.eventually.be.rejectedWith(Error);
        });
    });

    describe('04 #readFile(Path, string, string)', () => {
        it('Should be rejected if no read access is available.', () => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some content');
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;
            expect(fs.readFileSync(toRawPath(path), { encoding: 'utf8' })).to.be.equal('Some content');

            return createFileSystem().readFile(path).should.eventually.be.equal('Some content');
        });
    });

    describe('05 #readFile(Path, string, string)', () => {
        it('Should return with the file content.', () => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some content');
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;
            expect(fs.readFileSync(toRawPath(path), { encoding: 'utf8' })).to.be.equal('Some content');
            fs.chmodSync(toRawPath(path), parseInt('333', 8));
            try {
                fs.readFileSync(toRawPath(path));
                expect.fail('Expected a read protection on the file.');
            } catch (err) {
                // Expected.
                expect(err).to.instanceOf(Error);
                expect((<Error>err).message).to.contain('EACCES');
            }

            return createFileSystem().readFile(path).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('01 #chmod(Path, number)', () => {
        it('Should be rejected when path is undefined.', () => {
            return createFileSystem().chmod(undefinedPath, 123).should.eventually.be.rejectedWith(Error);
        });
    });

    describe('02 #chmod(Path, number)', () => {
        it('Resource should not be readable if the read access is removed.', done => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some content');
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;
            expect(fs.readFileSync(toRawPath(path), { encoding: 'utf8' })).to.be.equal('Some content');

            const fileSystem = createFileSystem();
            fileSystem.chmod(path, parseInt('333', 8)).then(() => {
                fileSystem.readFile(path).should.eventually.be.rejectedWith(Error).notify(done);
            })
        });
    });

    describe('03 #chmod(Path, number)', () => {
        it('Resource should not be writeable if the write access is removed.', done => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some content');
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;
            expect(fs.readFileSync(toRawPath(path), { encoding: 'utf8' })).to.be.equal('Some content');

            const fileSystem = createFileSystem();
            fileSystem.chmod(path, parseInt('444', 8)).then(() => {
                fileSystem.writeFile(path, 'New content').should.eventually.be.rejectedWith(Error).notify(done);
            })
        });
    });

    describe('04 #chmod(Path, number)', () => {
        it('Resource should be readable if the read access is granted.', done => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some content');
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;
            expect(fs.readFileSync(toRawPath(path), { encoding: 'utf8' })).to.be.equal('Some content');
            fs.chmodSync(toRawPath(path), parseInt('333', 8));
            try {
                fs.readFileSync(toRawPath(path));
                expect.fail('Expected a read protection on the file.');
            } catch (err) {
                // Expected.
                expect(err).to.instanceOf(Error);
                expect((<Error>err).message).to.contain('EACCES');
            }

            const fileSystem = createFileSystem();
            fileSystem.chmod(path, parseInt('777', 8)).then(() => {
                fileSystem.readFile(path).should.eventually.be.equal('Some content').notify(done);
            })
        });
    });

    describe('05 #chmod(Path, number)', () => {
        it('Resource should be readable if the read access is granted.', done => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some content');
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;
            expect(fs.readFileSync(toRawPath(path), { encoding: 'utf8' })).to.be.equal('Some content');
            fs.chmodSync(toRawPath(path), parseInt('444', 8));
            try {
                fs.writeFileSync(toRawPath(path), 'This content must not get into the file');
                expect.fail('Expected a write protection on the file.');
            } catch (err) {
                // Expected.
                expect(err).to.instanceOf(Error);
                expect((<Error>err).message).to.contain('EACCES');
                expect(fs.readFileSync(toRawPath(path), { encoding: 'utf8' })).to.be.equal('Some content');
            }

            const fileSystem = createFileSystem();
            fileSystem.chmod(path, parseInt('777', 8)).then(() => {
                fileSystem.writeFile(path, 'New content').then(() => {
                    fileSystem.readFile(path).should.eventually.be.equal('New content').notify(done);
                });
            })
        });
    });

});

process.on('unhandledRejection', (reason: any) => {
    console.error("Unhandled promise rejection: " + reason);
});

function toRawPath(path: Path, ...rest: string[]): string {
    return `${root}/${path.segments.join('/')}${rest && rest.length > 0 ? '/' : ''}${rest.join('/')}`;
}

function attachWatcher(fileSystem: FileSystem): FileChangeEvent[] {
    const events: FileChangeEvent[] = [];
    fileSystem.watch((event: FileChangeEvent): void => { events.push(event); });
    return events;
}

function createFileSystem(): FileSystem {
    return new NodeFileSystem(Path.fromString(root));
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