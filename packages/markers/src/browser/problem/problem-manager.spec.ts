/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Container } from 'inversify';
import * as chai from 'chai';
import { ProblemManager } from './problem-manager';
import URI from "@theia/core/lib/common/uri";
import { LocalStorageService, StorageService } from '@theia/core/lib/browser/storage-service';
import { ILogger } from '@theia/core/lib/common/logger';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { FileSystemWatcher } from '@theia/filesystem/lib/browser/filesystem-watcher';

const expect = chai.expect;
let manager: ProblemManager;
let testContainer: Container;

before(async () => {
    testContainer = new Container();
    testContainer.bind(ILogger).to(MockLogger);
    testContainer.bind(StorageService).to(LocalStorageService).inSingletonScope();
    testContainer.bind(LocalStorageService).toSelf().inSingletonScope();
    // tslint:disable-next-line:no-any
    testContainer.bind(FileSystemWatcher).toConstantValue(<any>undefined);
    testContainer.bind(ProblemManager).toSelf();

    manager = testContainer.get(ProblemManager);
    await manager.initialized;
    manager.setMarkers(new URI('file:/foo/bar.txt'), 'me', [
        {
            range: {
                start: {
                    line: 1,
                    character: 1
                },
                end: {
                    line: 1,
                    character: 1
                }
            },
            message: "Foo"
        },
        {
            range: {
                start: {
                    line: 1,
                    character: 1
                },
                end: {
                    line: 1,
                    character: 1
                }
            },
            message: "Bar"
        }
    ]);

    manager.setMarkers(new URI('file:/foo/foo.txt'), 'me', [
        {
            range: {
                start: {
                    line: 1,
                    character: 1
                },
                end: {
                    line: 1,
                    character: 1
                }
            },
            message: "Foo"
        },
        {
            range: {
                start: {
                    line: 1,
                    character: 1
                },
                end: {
                    line: 1,
                    character: 2
                }
            },
            message: "Bar"
        }
    ]);
});

describe('problem-manager', () => {
    it('replaces markers', async () => {
        let events = 0;
        manager.onDidChangeMarkers(() => {
            events++;
        });
        expect(events).equal(0);
        const previous = await manager.setMarkers(new URI('file:/foo/bar.txt'), 'me', [
            {
                range: {
                    start: {
                        line: 2,
                        character: 3
                    },
                    end: {
                        line: 2,
                        character: 1
                    }
                },
                message: "Foo"
            },
            {
                range: {
                    start: {
                        line: 1,
                        character: 1
                    },
                    end: {
                        line: 1,
                        character: 1
                    }
                },
                message: "Bar"
            }
        ]);
        expect(previous.length).equal(2);
        expect(events).equal(1);
        expect(manager.findMarkers().length).equal(4);
    });

    it('should find markers with filter', () => {
        expect(manager.findMarkers({
            owner: 'me'
        }).length).equal(4);

        expect(manager.findMarkers({
            owner: 'you'
        }).length).equal(0);

        expect(manager.findMarkers({
            uri: new URI('file:/foo/foo.txt'),
            owner: 'me'
        }).length).equal(2);

        expect(manager.findMarkers({
            dataFilter: data => data.range.end.character > 1
        }).length).equal(1);
    });

    it('should persist markers', async () => {
        const newManager = testContainer.get(ProblemManager);
        await newManager.initialized;
        expect(newManager.findMarkers().length).eq(4);
    });
});
