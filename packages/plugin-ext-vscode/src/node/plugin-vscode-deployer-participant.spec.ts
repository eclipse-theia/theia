// *****************************************************************************
// Copyright (C) 2026 Yash Kakade and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import * as os from 'os';
import * as path from 'path';
import * as fs from '@theia/core/shared/fs-extra';
import { FileUri } from '@theia/core/lib/node';
import { PluginDeployerStartContext } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { ArchiveFile } from '@theia/filesystem/lib/node/archive/archive-extractor';
import { PluginVSCodeDeployerParticipant } from './plugin-vscode-deployer-participant.js';

describe('PluginVSCodeDeployerParticipant', () => {

    let tmpDir: string;
    let deploymentDir: string;
    let userExtensionsDir: string;
    let participant: PluginVSCodeDeployerParticipant;

    /** The identity in the `package.json` of each VSIX file by its file name. A file without an identity has no valid `package.json`. */
    const identities = new Map<string, { publisher: string, name: string, version: string }>([
        ['deployed.vsix', { publisher: 'foo', name: 'deployed', version: '1.0.0' }],
        ['new.vsix', { publisher: 'foo', name: 'new', version: '1.0.0' }],
        ['other-version.vsix', { publisher: 'foo', name: 'deployed', version: '2.0.0' }]
    ]);

    const dropInEntry = (file: string) => FileUri.create(path.join(userExtensionsDir, file)).withScheme('local-file').toString();

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'vsix-participant-'));
        // The participant reads these directories back through a URI, which lowercases a Windows drive letter.
        deploymentDir = FileUri.fsPath(FileUri.create(path.join(tmpDir, 'deployed')));
        userExtensionsDir = FileUri.fsPath(FileUri.create(path.join(tmpDir, 'extensions')));
        await fs.ensureDir(path.join(deploymentDir, 'foo.deployed@1.0.0'));
        for (const file of [...identities.keys(), 'broken.vsix', 'readme.txt']) {
            await fs.outputFile(path.join(userExtensionsDir, file), '');
        }
        participant = new PluginVSCodeDeployerParticipant();
        Object.assign(participant, {
            logger: { info: () => { } },
            environments: {
                getDeploymentDirUri: async () => FileUri.create(deploymentDir),
                getUserExtensionsDirUri: async () => FileUri.create(userExtensionsDir)
            },
            archiveExtractor: {
                readFiles: async (vsixPath: string): Promise<ArchiveFile[]> => {
                    const identity = identities.get(path.basename(vsixPath));
                    return identity ? [{ path: 'extension/package.json', data: Buffer.from(JSON.stringify(identity)) } as ArchiveFile] : [];
                }
            }
        });
    });

    afterEach(() => fs.remove(tmpDir));

    it('leaves out drop-in VSIX files that are already deployed, so that they are not replaced at every start', async () => {
        const context: PluginDeployerStartContext = { userEntries: [], systemEntries: [] };
        await participant.onWillStart(context);

        expect(context.userEntries[0]).to.equal(FileUri.create(deploymentDir).withScheme('local-dir').toString());
        expect(context.userEntries.slice(1).sort()).to.deep.equal(['broken.vsix', 'new.vsix', 'other-version.vsix'].map(dropInEntry).sort());
    });
});
