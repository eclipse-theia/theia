// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
import { RemoteCopyOptions, RemoteCopyRegistry, RemoteFile } from '@theia/core/lib/node/remote/remote-copy-contribution';
import { MainCopyContribution } from './main-copy-contribution.js';

class RecordingRemoteCopyRegistry implements RemoteCopyRegistry {
    readonly files: RemoteFile[] = [];
    readonly globs: string[] = [];
    readonly directories: string[] = [];

    getFiles(): RemoteFile[] {
        return this.files;
    }

    async glob(pattern: string): Promise<void> {
        this.globs.push(pattern);
    }

    file(file: string, target?: string, options?: RemoteCopyOptions): void {
        this.files.push({ path: file, target: target ?? file, options });
    }

    async directory(dir: string): Promise<void> {
        this.directories.push(dir);
    }
}

describe('MainCopyContribution', () => {
    let registry: RecordingRemoteCopyRegistry;

    beforeEach(async () => {
        registry = new RecordingRemoteCopyRegistry();
        await new MainCopyContribution().copy(registry);
    });

    it('should copy the backend module type marker lib/backend/package.json', () => {
        const marker = registry.getFiles().find(file => file.path === 'lib/backend/package.json');
        expect(marker).to.not.be.undefined;
        expect(marker?.target).to.equal('lib/backend/package.json');
    });

    it('should still copy the root package.json and the backend bundle', () => {
        expect(registry.getFiles().map(file => file.path)).to.include('package.json');
        expect(registry.globs).to.include('lib/backend/**/*.js');
        expect(registry.directories).to.include.members(['lib/frontend', 'lib/webview']);
    });
});
