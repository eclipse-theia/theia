// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
import { Container } from '@theia/core/shared/inversify';
import { URI } from '@theia/core/lib/common/uri';
import { bindPreferenceConfigurations } from '@theia/core/lib/common/preferences/preference-configurations';
import { WorkspaceFileService } from '@theia/workspace/lib/common/workspace-file-service';
import { ExecutableWorkspaceConfiguration } from './executable-workspace-configuration.js';

describe('ExecutableWorkspaceConfiguration', () => {
    let executableConfiguration: ExecutableWorkspaceConfiguration;

    beforeEach(() => {
        const container = new Container();
        bindPreferenceConfigurations(container.bind.bind(container));
        container.bind(WorkspaceFileService).toSelf().inSingletonScope();
        container.bind(ExecutableWorkspaceConfiguration).toSelf().inSingletonScope();
        executableConfiguration = container.get(ExecutableWorkspaceConfiguration);
    });

    const executable = [
        'file:///workspace/.vscode/tasks.json',
        'file:///workspace/.vscode/launch.json',
        'file:///workspace/.vscode/settings.json',
        'file:///workspace/.theia/tasks.json',
        'file:///workspace/.theia/launch.json',
        'file:///workspace/.theia/settings.json',
        'file:///workspace/nested-root/.vscode/tasks.json',
        'file:///workspace/.VSCode/Tasks.JSON',
        'file:///workspace/.vscode/./tasks.json',
        'file:///workspace/.vscode//launch.json',
        'file:///workspace/.vscode/%2e/settings.json',
        'file:///workspace/project.code-workspace',
        'file:///workspace/project.theia-workspace',
        'file:///workspace/project.Code-Workspace'
    ];
    for (const uri of executable) {
        it(`recognizes ${uri} as executable workspace configuration`, () => {
            expect(executableConfiguration.is(new URI(uri))).to.be.true;
        });
    }

    const notExecutable = [
        'file:///workspace/tasks.json',
        'file:///workspace/src/tasks.json',
        'file:///workspace/vscode/tasks.json',
        'file:///workspace/.vscode/extensions.json',
        'file:///workspace/.vscode/tasks.json.bak',
        'file:///workspace/.vscode/tasks.txt',
        'file:///workspace/code-workspace.md'
    ];
    for (const uri of notExecutable) {
        it(`does not treat ${uri} as executable workspace configuration`, () => {
            expect(executableConfiguration.is(new URI(uri))).to.be.false;
        });
    }
});
