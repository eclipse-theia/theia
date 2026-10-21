// *****************************************************************************
// Copyright (C) 2026 Vinay Kaushal and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { FileUri } from '@theia/core/lib/common/file-uri';
import URI from '@theia/core/lib/common/uri';
import { OpenFileDialogProps, SaveFileDialogProps } from '../../browser/file-dialog';
import { OpenDialogOptions, SaveDialogOptions } from '../../electron-common/electron-api';
import { ElectronFileDialogService } from './electron-file-dialog-service';

disableJSDOM();

class TestElectronFileDialogService extends ElectronFileDialogService {
    override toOpenDialogOptions(uri: URI, props: OpenFileDialogProps): OpenDialogOptions {
        return super.toOpenDialogOptions(uri, props);
    }
    override toSaveDialogOptions(uri: URI, props: SaveFileDialogProps): SaveDialogOptions {
        return super.toSaveDialogOptions(uri, props);
    }
}

describe('ElectronFileDialogService', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    const uri = FileUri.create('/home/user');
    const filters = { 'Theia Workspace': ['theia-workspace'] };

    it('adds an All Files filter to the given filters', () => {
        const options = new TestElectronFileDialogService().toOpenDialogOptions(uri, { title: 'Open', canSelectFiles: true, filters });
        expect(options.filters).to.deep.equal([
            { name: 'Theia Workspace', extensions: ['theia-workspace'] },
            { name: 'All Files', extensions: ['*'] }
        ]);
    });

    it('omits the All Files filter if it is disabled', () => {
        const options = new TestElectronFileDialogService().toOpenDialogOptions(uri, { title: 'Open', canSelectFiles: true, filters, disableAllFilesFilter: true });
        expect(options.filters).to.deep.equal([
            { name: 'Theia Workspace', extensions: ['theia-workspace'] }
        ]);
    });

    describe('windowName forwarding', () => {
        it('should pass windowName from targetWindow for open dialog', () => {
            const targetWindow = { name: '123-secondaryWindow-0' } as Window;
            const options = new TestElectronFileDialogService().toOpenDialogOptions(uri, { title: 'Open', canSelectFiles: true, targetWindow });
            expect(options.windowName).to.equal('123-secondaryWindow-0');
        });

        it('should leave windowName undefined when no targetWindow is set for open dialog', () => {
            const options = new TestElectronFileDialogService().toOpenDialogOptions(uri, { title: 'Open', canSelectFiles: true });
            expect(options.windowName).to.be.undefined;
        });

        it('should pass windowName from targetWindow for save dialog', () => {
            const targetWindow = { name: '123-secondaryWindow-0' } as Window;
            const options = new TestElectronFileDialogService().toSaveDialogOptions(uri, { title: 'Save', targetWindow });
            expect(options.windowName).to.equal('123-secondaryWindow-0');
        });

        it('should leave windowName undefined when no targetWindow is set for save dialog', () => {
            const options = new TestElectronFileDialogService().toSaveDialogOptions(uri, { title: 'Save' });
            expect(options.windowName).to.be.undefined;
        });
    });
});
