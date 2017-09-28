import * as path from 'path';
import * as temp from 'temp';
import * as fs from 'fs-extra';
import { expect } from 'chai';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { DugiteGit } from './dugite-git';
import { WorkingDirectoryStatus } from '../common/model';
import { initRepository, createTestRepository } from 'dugite-extra/lib/command/test-helper';
import { WorkspaceServer } from '@theia/workspace/lib/common/workspace-protocol';

const track = temp.track();

describe('git', async () => {

    after(async () => {
        track.cleanupSync();
    });

    describe('repositories', async () => {

        it('should discover all nested repositories', async () => {

            const root = track.mkdirSync('discovery-test-1');
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

        it('should discover all nested repositories and the root repository which is at the workspace root', async () => {

            const root = track.mkdirSync('discovery-test-2');
            fs.mkdirSync(path.join(root, 'BASE'));
            fs.mkdirSync(path.join(root, 'BASE', 'A'));
            fs.mkdirSync(path.join(root, 'BASE', 'B'));
            fs.mkdirSync(path.join(root, 'BASE', 'C'));
            await initRepository(path.join(root, 'BASE'));
            await initRepository(path.join(root, 'BASE', 'A'));
            await initRepository(path.join(root, 'BASE', 'B'));
            await initRepository(path.join(root, 'BASE', 'C'));
            const git = await createGit(path.join(root, 'BASE'));
            const repositories = await git.repositories();
            expect(repositories.map(r => path.basename(FileUri.fsPath(r.localUri))).sort()).to.deep.equal(['A', 'B', 'BASE', 'C']);

        });

        it('should discover all nested repositories and the container repository', async () => {

            const root = track.mkdirSync('discovery-test-3');
            fs.mkdirSync(path.join(root, 'BASE'));
            fs.mkdirSync(path.join(root, 'BASE', 'WS_ROOT'));
            fs.mkdirSync(path.join(root, 'BASE', 'WS_ROOT', 'A'));
            fs.mkdirSync(path.join(root, 'BASE', 'WS_ROOT', 'B'));
            fs.mkdirSync(path.join(root, 'BASE', 'WS_ROOT', 'C'));
            await initRepository(path.join(root, 'BASE'));
            await initRepository(path.join(root, 'BASE', 'WS_ROOT', 'A'));
            await initRepository(path.join(root, 'BASE', 'WS_ROOT', 'B'));
            await initRepository(path.join(root, 'BASE', 'WS_ROOT', 'C'));
            const git = await createGit(path.join(root, 'BASE', 'WS_ROOT'));
            const repositories = await git.repositories();
            const repositoryNames = repositories.map(r => path.basename(FileUri.fsPath(r.localUri)));
            expect(repositoryNames.shift()).to.equal('BASE'); // The first must be the container repository.
            expect(repositoryNames.sort()).to.deep.equal(['A', 'B', 'C']);

        });

    });

    describe('status', async () => {

        it('modifying a staged file should result in two changes', async () => {

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
            status = await git.status(repository);
            expect(status.changes).to.be.have.lengthOf(2);
            expect(status.changes.map(f => f.uri)).to.be.deep.equal([fileUri, fileUri]);
            expect(status.changes.map(f => f.staged).sort()).to.be.deep.equal([false, true]);

        });

    });

    describe('WorkingDirectoryStatus#equals', async () => {

        it('staged change should matter', async () => {

            const left: WorkingDirectoryStatus = JSON.parse(`
            {
                "exists":true,
                "branch":"GH-165",
                "upstreamBranch":"origin/GH-165",
                "aheadBehind":{
                   "ahead":0,
                   "behind":0
                },
                "changes":[
                   {
                      "uri":"bar.foo",
                      "status":0,
                      "staged":false
                   }
                ],
                "currentHead":"a274d43dbfba5d1ff9d52db42dc90c6f03071656"
             }
            `);

            const right: WorkingDirectoryStatus = JSON.parse(`
            {
                "exists":true,
                "branch":"GH-165",
                "upstreamBranch":"origin/GH-165",
                "aheadBehind":{
                   "ahead":0,
                   "behind":0
                },
                "changes":[
                   {
                      "uri":"bar.foo",
                      "status":0,
                      "staged":true
                   }
                ],
                "currentHead":"a274d43dbfba5d1ff9d52db42dc90c6f03071656"
             }
            `);

            expect(WorkingDirectoryStatus.equals(left, right)).to.be.false;

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
