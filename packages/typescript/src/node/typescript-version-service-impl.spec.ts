/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as os from 'os';
import * as path from 'path';
import * as assert from 'assert';
import URI from '@theia/core/lib/common/uri';
import { isWindows } from '@theia/core/lib/common/os';
import { FileUri } from '@theia/core/lib/node';
import { TypescriptVersionServiceImpl, TypescriptVersionURI } from './typescript-version-service-impl';

describe('TypescriptVersionServiceImpl', function() {

    const projectUri = FileUri.create(path.resolve(__dirname, '../../../..'));
    let impl: TypescriptVersionServiceImpl;

    beforeEach(() => {
        impl = new TypescriptVersionServiceImpl();
        (impl as any).applicationPackage = {
            projectPath: FileUri.fsPath(projectUri)
        };
    });
    afterEach(() => {
        impl = undefined!;
    });

    it('resolveBundledVersionInApplicationPath', async () => {
        const version = await impl['resolveBundledVersionInApplicationPath']();
        assert.equal(projectUri.relative(new URI(version!.uri)), 'node_modules/typescript/lib');
    });

    it('resolveBundledVersionWithRequire', async () => {
        const version = await impl['resolveBundledVersionWithRequire']();
        assert.equal(projectUri.relative(new URI(version!.uri)), 'node_modules/typescript/lib');
    });

    it('resolveBundledVersionAsExecutable', async () => {
        const version = await impl['resolveBundledVersionAsExecutable']();
        assert.equal(TypescriptVersionURI.getTsServerPath(version!), isWindows ? 'tsserver.cmd' : 'tsserver');
    });

    it('getVersions', async () => {
        const versions = await impl.getVersions({
            workspaceFolders: [projectUri.toString()]
        });
        assert.equal(
            versions.map(({ qualifier, uri }) => `${qualifier}: ${projectUri.relative(new URI(uri))}`).join(os.EOL),
            [
                'Bundled: node_modules/typescript/lib',
                'Workspace: node_modules/typescript/lib'
            ].join(os.EOL)
        );
    });

});
