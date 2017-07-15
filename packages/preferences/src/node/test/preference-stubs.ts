/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { JsonPreferenceServer } from '../json-preference-server'
import URI from '@theia/core/lib/common/uri';
import { FileSystemNode } from "@theia/filesystem/lib/node/node-filesystem"
import { ChokidarFileSystemWatcherServer } from '@theia/filesystem/lib/node/chokidar-filesystem-watcher'
import { Logger } from '@theia/core/lib/common/logger'
import { PreferenceContribution, Preference } from '../../common';
import { ContributionProvider } from '@theia/core/lib/common/contribution-provider'

export class JsonPrefHelper {
    readonly logger: Logger;
    readonly fileWatcher: ChokidarFileSystemWatcherServer;
    fileSystem: FileSystemNode;
    constructor() {
        this.logger = new Proxy<Logger>({} as any, {
            get: (target, name) => () => {
                if (name.toString().startsWith('is')) {
                    return Promise.resolve(false);
                }
                if (name.toString().startsWith('if')) {
                    return new Promise(resolve => { });
                }
            }
        });
        this.fileSystem = new FileSystemNode();
        this.fileWatcher = this.createFileSystemWatcher();
    }

    getFS(): FileSystemNode {
        return this.fileSystem;
    }

    createJsonPrefServer(preferenceFileUri: URI) {
        return new JsonPreferenceServer(this.fileSystem, this.fileWatcher, this.logger, Promise.resolve(preferenceFileUri));
    }

    private createFileSystemWatcher(): ChokidarFileSystemWatcherServer {
        return new ChokidarFileSystemWatcherServer(this.logger);
    }
}

export class PrefProviderStub implements ContributionProvider<PreferenceContribution> {
    getContributions(): PreferenceContribution[] {

        let prefs1: Preference[] = [
            {
                name: "testBooleanTrue",
                defaultValue: true,
                description: "testBooleanTrue description"
            },
            {
                name: "testBooleanFalse",
                defaultValue: false,
                description: "testBooleanFalse description"
            }
        ];

        let prefs2: Preference[] = [
            {
                name: "testStringSomething",
                defaultValue: "testStringSomethingValue",
                description: "testStringSomething description"
            },
            {
                name: "testStringSomething2",
                defaultValue: "testStringSomethingValue2"
            }
        ];

        let prefContrib: PreferenceContribution[] = [new PreferenceContributionStub(prefs1), new PreferenceContributionStub(prefs2)];

        return prefContrib;

    }
}

export class PreferenceContributionStub implements PreferenceContribution {
    constructor(readonly preferences: Preference[]
    ) { }
}