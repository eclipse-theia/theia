import "mocha";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as fs from "fs";
import * as os from "os";
import {FileChangeEvent, FileSystem, FileChangeType} from "../common/file-system";
import {NodeFileSystem} from "./node-fs";
import {Path} from "../common/path";

const root = `${os.tmpdir()}/node-fs-root`;
const expect = chai.expect;
let undefinedPath: Path;

before(() => {
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

    describe('01 #mkdir(Path)', () => {
        it('Should return with true on successful folder creation.', () => {
            expect(createFileSystem().mkdir(Path.fromString('foo'))).to.eventually.be.true;
        });
    });

    describe('02 #mkdir(Path)', () => {
        it('Should be rejected with false for undefined path argument.', () => {
            expect(createFileSystem().mkdir(undefinedPath)).to.eventually.be.rejectedWith(false);
        });
    });

    describe('03 #mkdir(Path)', () => {
        it('Should fire an \'ADDED\' file change event on successful folder creation.', () => {
            const path = Path.fromString('foo');
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

    describe('04 #mkdir(Path)', () => {
        it('Should be rejected with false when the folder already exists.', () => {
            const path = Path.fromString('foo');
            expect(createFileSystem().mkdir(path)).to.eventually.be.true;
            expect(createFileSystem().mkdir(path)).to.eventually.be.rejectedWith(false);
        });
    });

    describe('05 #mkdir(Path)', () => {
        it('Should create a directory and not a file.', () => {
            const path = Path.fromString('foo');
            const fileSystem = createFileSystem();
            expect(fileSystem.mkdir(path)).to.eventually.be.true;
            expect(fileSystem.dirExists(path)).to.eventually.be.true;
            expect(fileSystem.fileExists(path)).to.eventually.be.false;
        });
    });

    describe('06 #mkdir(Path)', () => {
        it('Should be rejected with false when creating nested directories recursively.', () => {
            const path = Path.fromString('foo').append('bar');
            const fileSystem = createFileSystem();
            expect(fileSystem.mkdir(path)).to.eventually.be.rejectedWith(false);
            expect(fileSystem.dirExists(path)).to.eventually.be.false;
            expect(fileSystem.fileExists(path)).to.eventually.be.false;
        });
    });

    describe('01 #ls(Path)', () => {
        it('Should be rejected with an empty array for undefined path argument.', () => {
            expect(createFileSystem().ls(undefinedPath)).to.eventually.be.rejectedWith([]);
        });
    });

    describe('02 #ls(Path)', () => {
        it('Should be rejected with an empty array if the path argument points to a file instead of a folder.', () => {
            const path = Path.fromString('foo.txt');
            fs.writeFileSync(toRawPath(path), 'Some data');
            expect(fs.statSync(toRawPath(path)).isFile()).to.be.true;

            expect(createFileSystem().ls(path)).to.eventually.be.rejectedWith([]);
        });
    });

    describe('03 #ls(Path)', () => {
        it('Should return with an empty array if the directory is empty.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;

            expect(createFileSystem().ls(path)).to.eventually.be.empty;
        });
    });

    describe('04 #ls(Path)', () => {
        it('Should return with an array of directory paths in the folder.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.mkdirSync(toRawPath(path, 'bar'));

            createFileSystem().ls(path).then(result => {
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

            createFileSystem().ls(path).then(result => {
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

            createFileSystem().ls(path).then(result => {
                expect(result).to.have.length(2);
                expect(result[0]).to.be.deep.equal(path.append('bar.txt'));
                expect(result[1]).to.be.deep.equal(path.append('baz'));
            });
        });
    });

    describe('01 #rename(Path, Path)', () => {
        it('Should be rejected with false when old path argument is undefined.', () => {
            expect(createFileSystem().rename(undefinedPath, Path.fromString('foo'))).to.eventually.be.rejectedWith(false);
        });
    });

    describe('02 #rename(Path, Path)', () => {
        it('Should be rejected with false when new path argument is undefined.', () => {
            expect(createFileSystem().rename(Path.fromString('foo'), undefinedPath)).to.eventually.be.rejectedWith(false);
        });
    });

    describe('03 #rename(Path, Path)', () => {
        it('Should be rejected return false when both arguments are undefined.', () => {
            expect(createFileSystem().rename(undefinedPath, undefinedPath)).to.eventually.be.rejectedWith(false);
        });
    });

    describe('04 #rename(Path, Path)', () => {
        it('Should return true when renaming a directory succeeded.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;

            const fileSystem = createFileSystem();
            fileSystem.rename(path, Path.fromString('bar')).then(result => {
                expect(result).to.be.true;
                expect(fileSystem.exists(Path.fromString('bar'))).to.eventually.be.true;
                expect(fileSystem.dirExists(Path.fromString('bar'))).to.eventually.be.true;
                expect(fileSystem.exists(path)).to.eventually.be.false;
                expect(fileSystem.dirExists(path)).to.eventually.be.false;
            });
        });
    });

    describe('05 #rename(Path, Path)', () => {
        it('Should return true when renaming a file succeeded.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path, 'bar.txt'), 'Some data');
            expect(fs.statSync(toRawPath(path, 'bar.txt')).isFile()).to.be.true;

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

    describe('06 #rename(Path, Path)', () => {
        it('Should fire a \'DELETED\' and an \'ADDED\' event when the rename was successful.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            fs.writeFileSync(toRawPath(path, 'bar.txt'), 'Some data');
            expect(fs.statSync(toRawPath(path, 'bar.txt')).isFile()).to.be.true;

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

    describe('07 #rename(Path, Path)', () => {
        it('Should be rejected with false when the resource to rename does not exist.', () => {
            const path = Path.fromString('foo');
            fs.mkdirSync(toRawPath(path));
            expect(fs.statSync(toRawPath(path)).isDirectory()).to.be.true;
            expect(fs.existsSync(toRawPath(path, 'bar.txt'))).to.be.false;

            expect(createFileSystem().rename(path.append('bar.txt'), path.append('baz.txt'))).to.eventually.be.rejectedWith(false);
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
            expect(fileSystem.rename(path.append('bar.txt'), path.append('baz.txt'))).to.eventually.be.true;
            expect(fileSystem.fileExists(path.append('bar.txt'))).to.eventually.be.false;
            expect(fileSystem.fileExists(path.append('baz.txt'))).to.eventually.be.true;
            expect(fileSystem.readFile(path.append('baz.txt'), 'utf8')).to.eventually.be.equal('Some data');
        });
    });

});

function toRawPath(path: Path, ...rest: string[]): string {
    return `${root}/${path.segments.join('/')}${rest && rest.length > 0 ? '/' : ''}${rest.join('/')}`;
}

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