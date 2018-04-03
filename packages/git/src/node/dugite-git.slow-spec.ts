/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as tmp from 'tmp';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { GitFileStatus } from '../common';
import { createGit } from './test/binding-helper';

// tslint:disable:no-unused-expression

describe('git-slow', async function () {

    describe('diff-slow', async () => {

        it('diff with rename/move', async function () {
            this.timeout(50000);

            const root = tmp.dirSync({ prefix: 'diff-slow-rename', unsafeCleanup: true });
            const localUri = FileUri.create(root.name).toString();
            const repository = { localUri };

            const git = await createGit();
            await git.clone('https://github.com/eclipse/eclipse.jdt.ls.git', { localUri });
            await git.checkout(repository, { branch: 'Java9' });
            await git.checkout(repository, { branch: 'docker' });

            const result = await git.diff(repository, { range: { fromRevision: 'docker', toRevision: 'Java9' } });
            const renamedItem = result.find(change => change.uri.toString().endsWith('org.eclipse.jdt.ls.core/.classpath'));

            expect(renamedItem).toBeDefined();
            expect(renamedItem!.oldUri).toBeDefined();
            expect(renamedItem!.oldUri!.toString().endsWith('org.jboss.tools.vscode.java/.classpath')).toEqual(true);
            expect(renamedItem!.status).toEqual(GitFileStatus.Renamed);
        });

    });

});
