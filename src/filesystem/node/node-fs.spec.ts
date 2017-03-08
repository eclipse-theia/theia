import * as chai from "chai";
import * as os from "os";
import * as fs from "fs";
import * as process from "process";
import * as chaiAsPromised from "chai-as-promised";
import "mocha";
import {Path} from "../common/path";
import {NodeFileSystem} from "./node-fs";

const rootPath = `${os.tmpdir()}/node-fs-root`;
const expect = chai.expect;


before(() => {
    chai.use(chaiAsPromised);
});

beforeEach(() => {
    deleteFolderRecursive(rootPath);
    fs.mkdirSync(rootPath);
    expect(fs.existsSync(rootPath)).to.be.true;
    expect(fs.readdirSync(rootPath)).to.be.empty;
});

describe('NodeFileSystem', () => {

    describe('#isRoot()', () => {
        it('Should be true when path equals to the root.', () => {
            expect(createFileSystem().isRoot(Path.fromString(rootPath))).to.be.true
        });
    });

    describe('#mkdir()', () => {
        it('Should return with true on successful folder creation.', () => {
            const fileSystem = createFileSystem();
            const path = Path.fromString(rootPath + '/foo');
            expect(fileSystem.mkdir(path)).to.eventually.be.true;
            expect(fileSystem.exists(path)).to.eventually.be.true;
            expect(fileSystem.dirExists(path)).to.eventually.be.true;
            expect(fileSystem.fileExists(path)).to.eventually.be.false;
        });
    });

});

process.on('unhandledRejection', (reason: any) => {
    console.error(new Error(reason));
});

function createFileSystem() {
    return new NodeFileSystem(Path.fromString(rootPath));
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