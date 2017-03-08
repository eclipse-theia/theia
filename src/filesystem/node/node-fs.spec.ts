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

    describe('#isRoot(Path)', () => {
        it('Should be true when path equals to the root.', () => {
            expect(createFileSystem().isRoot(rootPath)).to.be.true;
        });
    });

    describe('#isRoot(Path)', () => {
        it('Should be false when path does not equal to the root.', () => {
            expect(createFileSystem().isRoot(rootPath.append('foo'))).to.be.false;
        });
    });

    describe('#isRoot(Path)', () => {
        it('Should be false when path is undefined.', () => {
            expect(createFileSystem().isRoot(undefinedPath)).to.be.false;
        });
    });

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
                expect(events[0].changes[0].path).to.be.equal(path);
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
            //expect(fileSystem.fileExists(path)).to.eventually.be.false;
        });
    });

});

process.on('unhandledRejection', (reason: any) => {
    console.error(new Error(reason));
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