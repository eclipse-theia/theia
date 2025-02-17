// *****************************************************************************
// Copyright (C) 2025 and others.
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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();
FrontendApplicationConfigProvider.set({});

import { Container } from '@theia/core/shared/inversify';
import { type FileStat } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { expect } from 'chai';
import { DebugSessionConfigurationLabelProvider } from './debug-session-configuration-label-provider';

disableJSDOM();

describe('DebugSessionConfigurationLabelProvider', () => {

    let roots: FileStat[] = [];
    const tryGetRoots = () => roots;
    let labelProvider: DebugSessionConfigurationLabelProvider;

    before(() => {
        const container = new Container();
        container.bind(WorkspaceService).toConstantValue(<WorkspaceService>{
            tryGetRoots
        });
        container.bind(DebugSessionConfigurationLabelProvider).toSelf();
        labelProvider = container.get(DebugSessionConfigurationLabelProvider);
    });

    beforeEach(() => {
        roots = [];
    });

    it('should return the name', () => {
        const name = 'name';
        const label = labelProvider.getLabel({ name });
        expect(label).to.be.equal(name);
    });

    it('should return the name with default params', () => {
        const name = 'name';
        const label = labelProvider.getLabel({ name, workspaceFolderUri: 'file:///workspace/folder/basename' });
        expect(label).to.be.equal(name);
    });

    it('should return the multi-root name ignoring the workspace', () => {
        const name = 'name';
        const label = labelProvider.getLabel({ name, workspaceFolderUri: 'file:///workspace/folder/basename' }, true);
        expect(label).to.be.equal('name (basename)');
    });

    it('should ignore the workspace and return the name without default params', () => {
        roots = [
            {/* irrelevant */ } as FileStat,
            {/* irrelevant */ } as FileStat,
        ];

        const name = 'name';
        const label = labelProvider.getLabel({ name }, false);
        expect(label).to.be.equal(name);
    });

    it('should handle multi-workspace roots', () => {
        roots = [
            {/* irrelevant */ } as FileStat,
            {/* irrelevant */ } as FileStat,
        ];

        const name = 'name';
        const label = labelProvider.getLabel({ name, workspaceFolderUri: 'file:///workspace/root1/folder/basename' });
        expect(label).to.be.equal('name (basename)');
    });

    it('should handle falsy basename and URI authority wins with multi-workspace roots', () => {
        roots = [
            {/* irrelevant */ } as FileStat,
            {/* irrelevant */ } as FileStat,
        ];

        const label = labelProvider.getLabel({ name: '', workspaceFolderUri: 'http://example.com' });
        expect(label).to.be.equal(' (example.com)');
    });
});
