import { FileSystemNode } from './node-filesystem2';
import "mocha";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
import * as fs from "fs";
import * as os from "os";
import * as URI from "urijs";

import { FileSystem } from "../common/filesystem";

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
    describe('01 #getFileStat(uri)', () => {
        it('Should return a proper result for a file.', () => {
            let uri = root.clone().segment("/myfile.txt")
            fs.writeFile(uri.path(), "hello")
            return createFileSystem().getFileStat(uri.toString()).then( stat => {
                expect(stat.isDirectory).to.be.false
                expect(stat.uri).to.eq(uri.toString())
            })
        });
        it('Should return a proper result for a directory.', () => {
            let uri = root.clone().segment("/myfile.txt")
            fs.writeFile(uri.path(), "hello")
            fs.writeFile(root.clone().segment("/myfile2.txt").path(), "hello")
            return createFileSystem().getFileStat(root.toString()).then( stat => {
                expect(stat.hasChildren).to.be.true
                expect(stat.children!.length).to.eq(2)
            })
        });
    });

});

process.on('unhandledRejection', (reason: any) => {
    console.error("Unhandled promise rejection: " + reason);
});

function createFileSystem(): FileSystem {
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
