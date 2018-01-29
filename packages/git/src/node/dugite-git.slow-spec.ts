/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as temp from 'temp';
import { expect } from 'chai';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { GitFileStatus } from '../common';
import { createGit } from './test/binding-helper';

// tslint:disable:no-unused-expression

const track = temp.track();

describe('git-slow', async function () {

    after(async () => {
        track.cleanupSync();
    });

    describe('diff-slow', async () => {

        it('diff with rename/move', async function () {
            this.timeout(50000);

            const root = track.mkdirSync('diff-slow-rename');
            const localUri = FileUri.create(root).toString();
            const repository = { localUri };

            const git = await createGit();
            await git.clone('https://github.com/eclipse/eclipse.jdt.ls.git', { localUri });
            await git.checkout(repository, { branch: 'Java9' });
            await git.checkout(repository, { branch: 'docker' });

            const result = await git.diff(repository, { range: { fromRevision: 'docker', toRevision: 'Java9' } });
            const renamedItem = result.find(change => change.uri.toString().endsWith('org.eclipse.jdt.ls.core/.classpath'));

            expect(renamedItem).to.be.not.undefined;
            expect(renamedItem!.oldUri).to.be.not.undefined;
            expect(renamedItem!.oldUri!.toString().endsWith('org.jboss.tools.vscode.java/.classpath')).to.be.true;
            expect(renamedItem!.status).to.be.equal(GitFileStatus.Renamed);
        });

    });

});
