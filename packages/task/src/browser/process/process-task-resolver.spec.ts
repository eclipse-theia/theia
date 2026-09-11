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
// http://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { isCancelled } from '@theia/core/lib/common/cancellation';
import { TaskScope } from '../../common/task-protocol';
import { ProcessTaskConfiguration } from '../../common/process/task-protocol';
import { ProcessTaskResolver } from './process-task-resolver';

describe('ProcessTaskResolver', () => {
    after(() => {
        disableJSDOM();
    });

    it('cancels a task when resolving its arguments is cancelled', async () => {
        const resolver = new ProcessTaskResolver();
        (resolver as unknown as {
            variableResolverService: { resolve: (value: unknown) => Promise<unknown> };
            workspaceService: { getWorkspaceRootUri: () => undefined };
        }).variableResolverService = {
            resolve: async value => Array.isArray(value) ? undefined : value
        };
        (resolver as unknown as {
            workspaceService: { getWorkspaceRootUri: () => undefined };
        }).workspaceService = {
            getWorkspaceRootUri: () => undefined
        };

        const task: ProcessTaskConfiguration = {
            label: 'task with input variables',
            type: 'shell',
            command: 'node',
            args: ['${input:task-argument}'],
            _scope: TaskScope.Workspace
        };

        let error: Error | undefined;
        try {
            await resolver.resolveTask(task);
        } catch (e) {
            error = e as Error;
        }

        expect(isCancelled(error)).to.equal(true);
    });
});
