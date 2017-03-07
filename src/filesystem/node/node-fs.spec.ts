import * as chai from 'chai';
import * as os from 'os';
import * as fs from 'fs';
import * as process from 'process';
import 'mocha';
import {Path} from "../common/path";
import {NodeFileSystem} from "./node-fs";

const rootPath = `${os.tmpdir()}/node-fs-root`;
const expect = chai.expect;


before(() => {

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
            fileSystem.mkdir(path).then(result => expect(result).to.be.true);
            fileSystem.exists(path).then(result => expect(result).to.be.true);
            fileSystem.dirExists(path).then(result => expect(result).to.be.true);
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