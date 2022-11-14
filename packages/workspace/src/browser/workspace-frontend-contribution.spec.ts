// *****************************************************************************
// Copyright (C) 2018 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { OS } from '@theia/core/lib/common/os';
import { OpenFileDialogProps } from '@theia/filesystem/lib/browser/file-dialog';
import { WorkspaceFrontendContribution } from './workspace-frontend-contribution';
import { WorkspaceCommands } from './workspace-commands';

disableJSDOM();

describe('workspace-frontend-contribution', () => {

    describe('WorkspaceFrontendContribution', () => {

        const title = WorkspaceCommands.OPEN_WORKSPACE.dialogLabel;
        const filters = WorkspaceFrontendContribution.DEFAULT_FILE_FILTER;

        before(() => disableJSDOM = enableJSDOM());
        after(() => disableJSDOM());

        ([
            [OS.Type.Linux, 'browser', true, { title, canSelectFiles: true, canSelectFolders: true, filters }],
            [OS.Type.Linux, 'electron', true, { title, canSelectFiles: true, canSelectFolders: false, filters }],
            [OS.Type.Windows, 'browser', true, { title, canSelectFiles: true, canSelectFolders: true, filters }],
            [OS.Type.Windows, 'electron', true, { title, canSelectFiles: true, canSelectFolders: false, filters }],
            [OS.Type.OSX, 'browser', true, { title, canSelectFiles: true, canSelectFolders: true, filters }],
            [OS.Type.OSX, 'electron', true, { title, canSelectFiles: true, canSelectFolders: true, filters }],
        ] as [OS.Type, 'browser' | 'electron', boolean, OpenFileDialogProps][]).forEach(test => {
            const [type, environment, _, expected] = test;
            const electron = environment === 'electron' ? true : false;
            const os = (OS.Type as any)[type]; // eslint-disable-line @typescript-eslint/no-explicit-any
            const actual = WorkspaceFrontendContribution.createOpenWorkspaceOpenFileDialogProps({
                type,
                electron,
            });
            it(`createOpenWorkspaceOpenFileDialogProps - OS: ${os}, Environment: ${environment}`, () => {
                expect(actual).to.be.deep.equal(expected);
            });
        });

    });

});
