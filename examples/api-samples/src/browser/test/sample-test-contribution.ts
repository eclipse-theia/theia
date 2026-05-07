/* eslint-disable @typescript-eslint/no-explicit-any */
// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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

import { TestContribution, TestItem, TestRunProfileKind, TestService } from '@theia/test/lib/browser/test-service';
import { CommandContribution, CommandRegistry, Path, URI } from '@theia/core';
import { ILogger } from '@theia/core/lib/common/logger';
import { inject, injectable, interfaces, named, postConstruct } from '@theia/core/shared/inversify';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import { FileStatWithMetadata } from '@theia/filesystem/lib/common/files';
import { TestControllerImpl, TestItemImpl, TestRunImpl } from './test-controller';

function stringifyTransformer(key: string, value: any): any {
    if (value instanceof URI) {
        return value.toString();
    }
    if (value instanceof TestItemImpl) {
        return {
            id: value.id,
            label: value.label,
            range: value.range,
            sortKey: value.sortKey,
            tags: value.tags,
            uri: value.uri,
            busy: value.busy,
            canResolveChildren: value.canResolveChildren,
            children: value.tests,
            description: value.description,
            error: value.error
        };
    }
    return value;
}

@injectable()
export class SampleTestContribution implements TestContribution, CommandContribution {
    @inject(WorkspaceService)
    private workspaceService: WorkspaceService;

    @inject(FileSearchService)
    private searchService: FileSearchService;

    @inject(FileService)
    private fileService: FileService;

    @inject(ILogger) @named('api-samples')
    private logger: ILogger;

    private testController = new TestControllerImpl('SampleTestController', 'Sample Test Controller');
    private usedUris = new Set<string>();
    private nextTestId = 0;
    private nextRunId = 0;

    @postConstruct()
    protected init(): void {
        this.testController.onItemsChanged(e => {
            this.logger.debug(JSON.stringify(e, stringifyTransformer, 4));
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand({ id: 'testController.addSomeTests', label: 'Add Some Tests', category: 'API Samples' }, {
            execute: async (...args: any): Promise<any> => {

                const root = (await this.workspaceService.roots)[0];
                const files = (await this.searchService.find('.json', {
                    rootUris: [root.resource.toString()],
                    limit: 1000
                })).filter(uri => !this.usedUris.has(uri));
                for (let i = 0; i < Math.min(10, files.length); i++) {
                    const fileUri = new URI(files[i]);
                    const relativePath = root.resource.path.relative(fileUri.path);
                    let collection = this.testController.items;

                    let dirUri = root.resource;

                    relativePath?.toString().split(Path.separator).forEach(name => {
                        dirUri = dirUri.withPath(dirUri.path.join(name));
                        let item = collection.get(name);
                        if (!item) {
                            item = new TestItemImpl(dirUri, name);
                            item.label = name;
                            collection.add(item);
                        }
                        collection = item._children;
                    });
                    const meta: FileStatWithMetadata = await this.fileService.resolve(fileUri, { resolveMetadata: true });
                    const testItem = new TestItemImpl(fileUri, `test-id-${this.nextTestId}`);
                    testItem.label = `Test number ${this.nextTestId++}`;
                    testItem.range = {
                        start: { line: 0, character: 0 },
                        end: { line: 0, character: Math.min(10, meta.size) }
                    };
                    collection.add(testItem);
                }
            }
        });

        commands.registerCommand({ id: 'testController.dumpController', label: 'Dump Controller Contents', category: 'API Samples' }, {
            execute: (...args: any): any => {
                this.logger.debug(JSON.stringify(this.testController, stringifyTransformer, 4));
            }
        });
    }

    registerTestControllers(service: TestService): void {
        this.testController.addProfile({
            kind: TestRunProfileKind.Run,
            label: 'Sample run profile #1',
            isDefault: false,
            canConfigure: true,
            tag: '',
            run: (name: string, included: readonly TestItem[], excluded: readonly TestItem[]) => {
                this.testController.addRun(new TestRunImpl(this.testController, `sample-run-id-${this.nextRunId}`, `sample-profile-1-${this.nextRunId++}`));
            },
            configure: (): void => {
                this.logger.debug('configuring the sample profile 1');
            }
        });

        this.testController.addProfile({
            kind: TestRunProfileKind.Run,
            label: 'Sample run profile #2',
            isDefault: false,
            canConfigure: true,
            tag: '',
            run: (name: string, included: readonly TestItem[], excluded: readonly TestItem[]) => {
                this.testController.addRun(new TestRunImpl(this.testController, `sample-run-id-${this.nextRunId}`, `sample-profile-2-${this.nextRunId++}`));
            },
            configure: (): void => {
                this.logger.debug('configuring the sample profile 2');
            }
        });

        service.registerTestController(this.testController);
    }
}

export function bindTestSample(bind: interfaces.Bind): void {
    bind(SampleTestContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(SampleTestContribution);
    bind(TestContribution).toService(SampleTestContribution);
};
