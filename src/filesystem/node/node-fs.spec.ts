import "mocha";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as fs from "fs";
import * as os from "os";
import * as process from "process";
import {FileChangeEvent, FileSystem, FileChangeType} from "../common/file-system";
import {NodeFileSystem} from "./node-fs";
import {Path} from "../common/path";

const root = `${os.tmpdir()}/node-fs-root`;
const rootPath = Path.fromString(root);
const expect = chai.expect;
let undefinedPath: Path;

before(() => {
    chai.use(chaiAsPromised);
});

beforeEach(() => {
    deleteFolderRecursive(root);
    fs.mkdirSync(root);
    expect(fs.existsSync(root)).to.be.true;
    expect(fs.readdirSync(root)).to.be.empty;
});

describe('NodeFileSystem', () => {

    describe('#mkdir(Path)', () => {
        it('Should return with true on successful folder creation.', () => {
            expect(createFileSystem().mkdir(rootPath.append('foo'))).to.eventually.be.true;
        });
    });

    describe('#mkdir(Path)', () => {
        it('Should return with false with undefined path argument.', () => {
            expect(createFileSystem().mkdir(undefinedPath)).to.eventually.be.false;
        });
    });

    describe('#mkdir(Path)', () => {
        it('Should fire an \'ADDED\' file change event on successful folder creation.', () => {
            const path = rootPath.append('foo');
            const fileSystem = createFileSystem();
            const events = attachWatcher(fileSystem);
            fileSystem.mkdir(path).then(result => {
                expect(result).to.be.true;
                expect(events).to.have.length(1);
                expect(events[0].changes).to.have.length(1);
                expect(events[0].changes[0].type).to.be.equal(FileChangeType.ADDED);
                expect(events[0].changes[0].path).to.be.deep.equal(path);
            });
        });
    });

    describe('#mkdir(Path)', () => {
        it('Should be rejected when the folder already exists.', () => {
            const path = rootPath.append('foo');
            expect(createFileSystem().mkdir(path)).to.eventually.be.true;
            expect(createFileSystem().mkdir(path)).to.eventually.be.rejected;
        });
    });

    describe('#mkdir(Path)', () => {
        it('Should create a directory and not a file.', () => {
            const path = rootPath.append('foo');
            const fileSystem = createFileSystem();
            expect(fileSystem.mkdir(path)).to.eventually.be.true;
            expect(fileSystem.dirExists(path)).to.eventually.be.true;
            expect(fileSystem.fileExists(path)).to.eventually.be.false;
        });
    });

    describe('#mkdir(Path)', () => {
        it('Should fail when creating nested directories recursively.', () => {
            const path = rootPath.append('foo', 'bar');
            const fileSystem = createFileSystem();
            expect(fileSystem.mkdir(path)).to.eventually.be.rejected;
            expect(fileSystem.dirExists(path)).to.eventually.be.false;
            expect(fileSystem.fileExists(path)).to.eventually.be.false;
        });
    });

    describe('#ls(Path)', () => {
        it('Should return with an empty array with undefined path argument.', () => {
            expect(createFileSystem().ls(undefinedPath)).to.eventually.be.empty;
        });
    });

    describe('#ls(Path)', () => {
        it('Should return with an empty array if the path argument points to a file instead of a folder.', () => {
            const path = rootPath.append('foo.txt');
            fs.writeFileSync(path.toString(), 'Some data');
            expect(fs.statSync(path.toString()).isFile()).to.be.true;

            expect(createFileSystem().ls(path)).to.eventually.be.empty;
        });
    });

    describe('#ls(Path)', () => {
        it('Should return with an empty array if the directory is empty.', () => {
            const path = rootPath.append('foo');
            fs.mkdirSync(path.toString());
            expect(fs.statSync(path.toString()).isDirectory()).to.be.true;

            expect(createFileSystem().ls(path)).to.eventually.be.empty;
        });
    });

    describe('#ls(Path)', () => {
        it('Should return with an array of directory paths in the folder.', () => {
            const path = rootPath.append('foo');
            fs.mkdirSync(path.toString());
            expect(fs.statSync(path.toString()).isDirectory()).to.be.true;
            fs.mkdirSync(path.append('bar').toString());

            createFileSystem().ls(path).then(result => {
                expect(result).to.have.length(1);
                expect(result[0]).to.be.deep.equal(path.append('bar'));
            });
        });
    });

    describe('#ls(Path)', () => {
        it('Should return with an array of file paths in the folder.', () => {
            const path = rootPath.append('foo');
            fs.mkdirSync(path.toString());
            expect(fs.statSync(path.toString()).isDirectory()).to.be.true;
            fs.writeFileSync(path.append('bar.txt').toString(), 'Some data');
            expect(fs.statSync(path.append('bar.txt').toString()).isFile()).to.be.true;

            createFileSystem().ls(path).then(result => {
                expect(result).to.have.length(1);
                expect(result[0]).to.be.deep.equal(path.append('bar.txt'));
            });
        });
    });

    describe('#ls(Path)', () => {
        it('Should not list resources recursively.', () => {
            const path = rootPath.append('foo');
            fs.mkdirSync(path.toString());
            expect(fs.statSync(path.toString()).isDirectory()).to.be.true;
            fs.writeFileSync(path.append('bar.txt').toString(), 'Some data');
            expect(fs.statSync(path.append('bar.txt').toString()).isFile()).to.be.true;
            fs.mkdirSync(path.append('baz').toString());
            expect(fs.statSync(path.append('baz').toString()).isDirectory()).to.be.true;
            fs.writeFileSync(path.append('baz', 'bar.txt').toString(), 'Some data');
            expect(fs.statSync(path.append('baz', 'bar.txt').toString()).isFile()).to.be.true;

            createFileSystem().ls(path).then(result => {
                expect(result).to.have.length(2);
                expect(result[0]).to.be.deep.equal(path.append('bar.txt'));
                expect(result[1]).to.be.deep.equal(path.append('baz'));
            });
        });
    });

    describe('#rename(Path, Path)', () => {
        it('Should return false when old path is undefined.', () => {
            expect(createFileSystem().rename(undefinedPath, rootPath.append('foo'))).to.eventually.be.false;
        });
    });

    describe('#rename(Path, Path)', () => {
        it('Should return false when new path is undefined.', () => {
            expect(createFileSystem().rename(rootPath.append('foo'), undefinedPath)).to.eventually.be.false;
        });
    });

    describe('#rename(Path, Path)', () => {
        it('Should return false when both arguments are undefined.', () => {
            expect(createFileSystem().rename(undefinedPath, undefinedPath)).to.eventually.be.false;
        });
    });

    describe('#rename(Path, Path)', () => {
        it('Should return true when renaming a directory succeeded.', () => {
            const path = rootPath.append('foo');
            fs.mkdirSync(path.toString());
            expect(fs.statSync(path.toString()).isDirectory()).to.be.true;

            const fileSystem = createFileSystem();
            fileSystem.rename(path, rootPath.append('bar')).then(result => {
                expect(result).to.be.true;
                expect(fileSystem.exists(rootPath.append('bar'))).to.eventually.be.true;
                expect(fileSystem.dirExists(rootPath.append('bar'))).to.eventually.be.true;
                expect(fileSystem.exists(path)).to.eventually.be.false;
                expect(fileSystem.dirExists(path)).to.eventually.be.false;
            });
        });
    });

    describe('#rename(Path, Path)', () => {
        it('Should return true when renaming a file succeeded.', () => {
            const path = rootPath.append('foo');
            fs.mkdirSync(path.toString());
            expect(fs.statSync(path.toString()).isDirectory()).to.be.true;
            fs.writeFileSync(path.append('bar.txt').toString(), 'Some data');
            expect(fs.statSync(path.append('bar.txt').toString()).isFile()).to.be.true;

            const fileSystem = createFileSystem();
            fileSystem.rename(path.append('bar.txt'), path.append('baz.txt')).then(result => {
                expect(result).to.be.true;
                expect(fileSystem.exists(path.append('baz.txt'))).to.eventually.be.true;
                expect(fileSystem.fileExists(path.append('baz.txt'))).to.eventually.be.true;
                expect(fileSystem.exists(path.append('bar.txt'))).to.eventually.be.false;
                expect(fileSystem.fileExists(path.append('bar.txt'))).to.eventually.be.false;
            });
        });
    });

    describe('#rename(Path, Path)', () => {
        it('Should fire a \'DELETED\' and an \'ADDED\' event when the rename was successful.', () => {
            const path = rootPath.append('foo');
            fs.mkdirSync(path.toString());
            expect(fs.statSync(path.toString()).isDirectory()).to.be.true;
            fs.writeFileSync(path.append('bar.txt').toString(), 'Some data');
            expect(fs.statSync(path.append('bar.txt').toString()).isFile()).to.be.true;

            const fileSystem = createFileSystem();
            const events = attachWatcher(fileSystem);
            fileSystem.rename(path.append('bar.txt'), path.append('baz.txt')).then(result => {
                expect(result).to.be.true;
                expect(events).to.have.length(1);
                expect(events[0].changes).to.have.length(2);
                expect(events[0].changes[0].type).to.be.equal(FileChangeType.DELETED);
                expect(events[0].changes[0].path).to.be.deep.equal(path.append('bar.txt'));
                expect(events[0].changes[1].type).to.be.equal(FileChangeType.ADDED);
                expect(events[0].changes[1].path).to.be.deep.equal(path.append('baz.txt'));
            });
        });
    });

    describe('#rename(Path, Path)', () => {
        it('Should rejected when the resource to rename does not exist.', () => {
            const path = rootPath.append('foo');
            fs.mkdirSync(path.toString());
            expect(fs.statSync(path.toString()).isDirectory()).to.be.true;
            expect(fs.existsSync(path.append('bar.txt').toString())).to.be.false;

            expect(createFileSystem().rename(path.append('bar.txt'), path.append('baz.txt'))).to.eventually.be.rejected;
        });
    });

    describe('#rename(Path, Path)', () => {
        it('Should be rejected when a resource already exists under the \'newPath\'.', () => {
            const path = rootPath.append('foo');
            fs.mkdirSync(path.toString());
            expect(fs.statSync(path.toString()).isDirectory()).to.be.true;
            fs.writeFileSync(path.append('bar.txt').toString(), 'Some data');
            expect(fs.statSync(path.append('bar.txt').toString()).isFile()).to.be.true;
            fs.writeFileSync(path.append('baz.txt').toString(), 'Some other data');
            expect(fs.statSync(path.append('baz.txt').toString()).isFile()).to.be.true;

            const fileSystem = createFileSystem();
            expect(fileSystem.rename(path.append('bar.txt'), path.append('baz.txt'))).to.eventually.be.rejected;
            expect(fileSystem.fileExists(path.append('bar.txt'))).to.eventually.be.true;
            expect(fileSystem.fileExists(path.append('baz.txt'))).to.eventually.be.true;
        });
    });

});

process.on('unhandledRejection', (reason: any) => {
    const error = new Error(reason);
    console.error(error);
    throw error;
});

function attachWatcher(fileSystem: FileSystem): FileChangeEvent[] {
    const events: FileChangeEvent[] = [];
    fileSystem.watch((event: FileChangeEvent): void =>  { events.push(event); });
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
                fs.unlinkSync(currentPath);
            }
        });
        fs.rmdirSync(path);
    }
}