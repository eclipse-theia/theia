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
import { URI } from '@theia/core';
import { Disposable } from '@theia/core/lib/common/disposable';
import { Event } from '@theia/core/lib/common/event';
import { FileChange } from '@theia/filesystem/lib/common/files';
import { DiskFileSystemProvider } from '@theia/filesystem/lib/node/disk-file-system-provider';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { JSONCEditor } from '../common/jsonc-editor';
import { BackendPreferenceStorage } from './backend-preference-storage';

class MockDiskFileSystemProvider {
    disposed = false;
    watch(): Disposable {
        return Disposable.NULL;
    }
    onDidChangeFile: Event<readonly FileChange[]> = Event.None;
    dispose(): void {
        this.disposed = true;
    }
}

describe('BackendPreferenceStorage', () => {
    it('disposes its file system provider when disposed', () => {
        const provider = new MockDiskFileSystemProvider();
        const storage = new BackendPreferenceStorage(
            provider as unknown as DiskFileSystemProvider,
            new URI('file:///settings.json'),
            undefined as unknown as EncodingService,
            undefined as unknown as JSONCEditor
        );
        expect(provider.disposed).to.be.false;
        storage.dispose();
        expect(provider.disposed).to.be.true;
    });
});
