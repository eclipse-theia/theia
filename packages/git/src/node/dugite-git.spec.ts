import * as path from 'path';
import * as temp from 'temp';
import * as fs from 'fs-extra';
import { expect } from 'chai';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { DugiteGit } from './dugite-git';
import { initRepository, createTestRepository } from 'dugite-extra/lib/command/test-helper';
import { WorkspaceServer } from '@theia/workspace/lib/common/workspace-protocol';

const track = temp.track();

describe('git', async () => {

    after(async () => {
        track.cleanupSync();
    });

    describe('repositories', async () => {

        it('should discover all nested repositories', async () => {

            const root = track.mkdirSync('discovery-test');
            fs.mkdirSync(path.join(root, 'A'));
            fs.mkdirSync(path.join(root, 'B'));
            fs.mkdirSync(path.join(root, 'C'));
            await initRepository(path.join(root, 'A'));
            await initRepository(path.join(root, 'B'));
            await initRepository(path.join(root, 'C'));
            const git = await createGit(root);
            const repositories = await git.repositories();
            expect(repositories.map(r => path.basename(FileUri.fsPath(r.localUri))).sort()).to.deep.equal(['A', 'B', 'C']);

        });

    });

    describe('status', async () => {

        it('modifying a staged file should result in two changes', async function () {

            // Init repository.
            const root = await createTestRepository(track.mkdirSync('status-test'));
            const localUri = FileUri.create(root).toString();
            const repository = { localUri };
            const git = await createGit(root);

            // // Check status. Expect empty.
            let status = await git.status(repository);
            expect(status.changes).to.be.empty;

            // Modify a file.
            const filePath = path.join(root, 'A.txt');
            const fileUri = FileUri.create(filePath).toString();
            fs.writeFileSync(filePath, 'new content');
            expect(fs.readFileSync(filePath, { encoding: 'utf8' })).to.be.equal('new content');
            await git.add(repository, fileUri);

            // Check the status again. Expect one single change.
            status = await git.status(repository);
            expect(status.changes).to.be.have.lengthOf(1);
            expect(status.changes[0].uri).to.be.equal(fileUri);
            expect(status.changes[0].staged).to.be.true;

            // Change the same file again.
            fs.writeFileSync(filePath, 'yet another new content');
            expect(fs.readFileSync(filePath, { encoding: 'utf8' })).to.be.equal('yet another new content');

            // We expect two changes; one is staged, the other is in the working directory.
            this.skip();
            // status = await git.status(repository);
            // expect(status.changes).to.be.have.lengthOf(2);
            // expect(status.changes[0].uri).to.be.equal(fileUri);
            // expect(status.changes[0].staged).to.be.true;

        });

    });

});

async function createGit(fsRoot: string = ''): Promise<DugiteGit> {
    const workspace = await createWorkspace(fsRoot);
    return new DugiteGit(workspace);
}

async function createWorkspace(fsRoot: string): Promise<WorkspaceServer> {
    return {

        async getRoot(): Promise<string> {
            return FileUri.create(fsRoot).toString();
        },

        async setRoot(uri: string): Promise<void> {
            // NOOP
        }

    };
}
