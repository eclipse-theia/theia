import * as path from 'path';
import * as temp from 'temp';
import * as fs from 'fs-extra';
import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { DugiteGit } from './dugite-git';
import { initRepository } from 'dugite-extra/lib/command/test-helper';
import { WorkspaceServer } from '@theia/workspace/lib/common/workspace-protocol';

const track = temp.track();

describe('git', async () => {

    after(async () => {
        track.cleanupSync();
    });

    it('repositories', async () => {
        const root = track.mkdirSync();
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

async function createGit(root: string = ''): Promise<DugiteGit> {
    const workspace = await createWorkspace(root);
    return new DugiteGit(workspace);
}

async function createWorkspace(root: string): Promise<WorkspaceServer> {
    return {

        async getRoot(): Promise<string> {
            return new URI(root).toString();
        },

        async setRoot(uri: string): Promise<void> {
            // NOOP
        }

    };
}
