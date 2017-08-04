/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { JSONExt } from '@phosphor/coreutils';
import { inject, injectable } from 'inversify';
import URI from "@theia/core/lib/common/uri";
import { Disposable, DisposableCollection, ILogger, MaybePromise } from '@theia/core/lib/common';
import { FileSystem } from '@theia/filesystem/lib/common';
import { FileSystemWatcherServer, DidFilesChangedParams, FileChange } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import { PreferenceChangedEvent, PreferenceClient, PreferenceServer, PreferenceChange } from '../common';
import * as jsoncparser from "jsonc-parser";
import { ParseError } from "jsonc-parser";


export const PreferenceUri = Symbol("PreferencePath");
export type PreferenceUri = MaybePromise<URI>;

@injectable()
export class JsonPreferenceServer implements PreferenceServer {

    protected preferences: { [key: string]: any } | undefined;
    protected client: PreferenceClient | undefined;
    protected readonly preferenceUri: Promise<string>;

    protected readonly toDispose = new DisposableCollection();
    protected ready: Promise<void>;

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcherServer) protected readonly watcherServer: FileSystemWatcherServer,
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(PreferenceUri) preferenceUri: PreferenceUri
    ) {
        this.preferenceUri = Promise.resolve(preferenceUri).then(uri => uri.toString());

        this.toDispose.push(watcherServer);
        watcherServer.setClient({
            onDidFilesChanged: p => this.onDidFilesChanged(p)
        });
        this.preferenceUri.then(uri =>
            watcherServer.watchFileChanges(uri).then(id => {
                this.toDispose.push(Disposable.create(() =>
                    watcherServer.unwatchFileChanges(id))
                );
            })
        );
        this.ready = this.reconcilePreferences();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected onDidFilesChanged(params: DidFilesChangedParams): void {
        this.arePreferencesAffected(params.changes).then(() =>
            this.reconcilePreferences()
        );
    }

    /**
     * Checks to see if the preference file was modified
     */
    protected arePreferencesAffected(changes: FileChange[]): Promise<void> {
        return new Promise(resolve => {
            this.preferenceUri.then(uri => {
                if (changes.some(c => c.uri === uri)) {
                    resolve();
                }
            });
        });
    }

    protected reconcilePreferences(): Promise<void> {
        return this.readPreferences().then(preferences =>
            this.doReconcilePreferences(preferences)
        );
    }

    protected readPreferences(): Promise<any | undefined> {
        return this.preferenceUri.then(uri =>
            this.fileSystem.exists(uri).then(exists => {
                if (!exists) {
                    return undefined;
                }
                return this.fileSystem.resolveContent(uri).then(({ stat, content }) => {
                    const strippedContent = jsoncparser.stripComments(content);
                    const errors: ParseError[] = [];
                    const preferences = jsoncparser.parse(strippedContent, errors);
                    if (errors.length) {
                        for (const error in errors) {
                            this.logger.error("JSON parsing error", error);
                        }
                    }

                    return preferences;
                });
            }).catch(reason => {
                if (reason) {
                    this.logger.error(`Failed to read preferences ${uri}:`, reason);
                }
                return undefined;
            })
        );
    }

    protected doReconcilePreferences(preferences: any | undefined) {
        if (preferences) {
            if (this.preferences) {
                this.fireChanged(this.preferences, preferences);
            } else {
                this.fireNew(preferences);
            }
        } else if (this.preferences) {
            this.fireRemoved(this.preferences);
        }
        this.preferences = preferences;
    }

    protected fireNew(preferences: any): void {
        const changes: PreferenceChange[] = [];

        // tslint:disable-next-line:forin
        for (const preferenceName in preferences) {
            const newValue = preferences[preferenceName];
            changes.push({
                preferenceName, newValue
            });
        }
        this.fireEvent({ changes });
    }

    protected fireRemoved(preferences: any): void {

        const changes: PreferenceChange[] = [];
        // tslint:disable-next-line:forin
        for (const preferenceName in preferences) {
            const oldValue = preferences[preferenceName];
            changes.push({
                preferenceName, oldValue
            });
        }
        this.fireEvent({ changes });
    }

    protected fireChanged(target: any, source: any): void {
        const deleted = new Set(Object.keys(target));
        const changes: PreferenceChange[] = [];

        // tslint:disable-next-line:forin
        for (const preferenceName in source) {
            deleted.delete(preferenceName);
            const newValue = source[preferenceName];
            if (preferenceName in target) {
                const oldValue = target[preferenceName];
                if (!JSONExt.deepEqual(oldValue, newValue)) {
                    changes.push({ preferenceName, newValue, oldValue });
                }
            } else {
                changes.push({ preferenceName, newValue });
            }
        }
        for (const preferenceName of deleted) {
            const oldValue = target[preferenceName];
            changes.push({ preferenceName, oldValue });
        }

        this.fireEvent({ changes });
    }

    protected fireEvent(event: PreferenceChangedEvent) {
        this.logger.debug(log =>
            log('onDidChangePreference:', event)
        );
        if (this.client) {
            this.client.onDidChangePreference(event);
        }
    }

    has(preferenceName: string): Promise<boolean> {
        return this.ready.then(() => {
            return !!this.preferences && (preferenceName in this.preferences);
        });
    }

    get<T>(preferenceName: string): Promise<T | undefined> {
        return this.ready.then(() =>
            !!this.preferences ? this.preferences[preferenceName] : undefined
        );
    }

    setClient(client: PreferenceClient | undefined) {
        this.client = client;
    }
}