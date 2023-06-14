// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

// @ts-check

describe('The Task Configuration Manager', function () {
    this.timeout(5000);

    const { assert } = chai;

    const { WorkspaceService } = require('@theia/workspace/lib/browser/workspace-service');
    const { TaskScope, TaskConfigurationScope } = require('@theia/task/lib/common/task-protocol');
    const { TaskConfigurationManager } = require('@theia/task/lib/browser/task-configuration-manager');
    const container = window.theia.container;
    const workspaceService = container.get(WorkspaceService);
    const taskConfigurationManager = container.get(TaskConfigurationManager);

    const baseWorkspaceURI = workspaceService.tryGetRoots()[0].resource;
    const baseWorkspaceRoot = baseWorkspaceURI.toString();

    const basicTaskConfig = {
        label: 'task',
        type: 'shell',
        command: 'top',
    };

    /** @type {Set<TaskConfigurationScope>} */
    const scopesToClear = new Set();

    describe('in a single-root workspace', () => {
        beforeEach(() => clearTasks());
        after(() => clearTasks());

        setAndRetrieveTasks(() => TaskScope.Global, 'user');
        setAndRetrieveTasks(() => TaskScope.Workspace, 'workspace');
        setAndRetrieveTasks(() => baseWorkspaceRoot, 'folder');
    });

    async function clearTasks() {
        await Promise.all(Array.from(scopesToClear, async scope => {
            if (!!scope || scope === 0) {
                await taskConfigurationManager.setTaskConfigurations(scope, []);
            }
        }));
        scopesToClear.clear();
    }

    /**
     * @param {() => TaskConfigurationScope} scopeGenerator a function to allow lazy evaluation of the second workspace root.
     * @param {string} scopeLabel
     * @param {boolean} only
     */
    function setAndRetrieveTasks(scopeGenerator, scopeLabel, only = false) {
        const testFunction = only ? it.only : it;
        testFunction(`successfully handles ${scopeLabel} scope`, async () => {
            const scope = scopeGenerator();
            scopesToClear.add(scope);
            const initialTasks = taskConfigurationManager.getTasks(scope);
            assert.deepEqual(initialTasks, []);
            await taskConfigurationManager.setTaskConfigurations(scope, [basicTaskConfig]);
            const newTasks = taskConfigurationManager.getTasks(scope);
            assert.deepEqual(newTasks, [basicTaskConfig]);
        });
    }

    /* UNCOMMENT TO RUN MULTI-ROOT TESTS */
    // const { FileService } = require('@theia/filesystem/lib/browser/file-service');
    // const { EnvVariablesServer } = require('@theia/core/lib/common/env-variables');
    // const URI = require('@theia/core/lib/common/uri').default;

    // const fileService = container.get(FileService);
    // /** @type {EnvVariablesServer} */
    // const envVariables = container.get(EnvVariablesServer);

    // describe('in a multi-root workspace', () => {
    //     let secondWorkspaceRoot = '';
    //     before(async () => {
    //         const configLocation = await envVariables.getConfigDirUri();
    //         const secondWorkspaceRootURI = new URI(configLocation).parent.resolve(`test-root-${Date.now()}`);
    //         secondWorkspaceRoot = secondWorkspaceRootURI.toString();
    //         await fileService.createFolder(secondWorkspaceRootURI);
    //         /** @type {Promise<void>} */
    //         const waitForEvent = new Promise(resolve => {
    //             const listener = taskConfigurationManager.onDidChangeTaskConfig(() => {
    //                 listener.dispose();
    //                 resolve();
    //             });
    //         });
    //         workspaceService.addRoot(secondWorkspaceRootURI);
    //         return waitForEvent;
    //     });
    //     beforeEach(() => clearTasks());
    //     after(() => clearTasks());
    //     setAndRetrieveTasks(() => TaskScope.Global, 'user');
    //     setAndRetrieveTasks(() => TaskScope.Workspace, 'workspace');
    //     setAndRetrieveTasks(() => baseWorkspaceRoot, 'folder (1)');
    //     setAndRetrieveTasks(() => secondWorkspaceRoot, 'folder (2)');
    // });
});
