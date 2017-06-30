/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as coreutils from '@phosphor/coreutils';
import { inject, injectable } from 'inversify';
import { ILogger, MaybePromise, DisposableCollection } from '../../application/common';
import URI from '../../application/common/uri';
import { FileChange, FileSystem, FileSystemWatcher } from '../../filesystem/common';
import { PreferenceChangedEvent, PreferenceClient, PreferenceServer } from '../common';

export const PreferencePath = Symbol("PreferencePath");
export type PreferencePath = MaybePromise<URI>;

@injectable()
export class JsonPreferenceServer implements PreferenceServer {

    protected preferences: { [key: string]: any } | undefined;
    protected client: PreferenceClient | undefined;
    protected readonly preferencePath: Promise<URI>;

    protected readonly toDispose = new DisposableCollection();

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcher) protected readonly watcher: FileSystemWatcher,
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(PreferencePath) preferencePath: PreferencePath
    ) {
        this.preferencePath = Promise.resolve(preferencePath);
        this.preferencePath.then(uri =>
            watcher.watchFileChanges(uri).then(disposable =>
                this.toDispose.push(disposable)
            )
        );

        this.toDispose.push(watcher.onFilesChanged(changes =>
            this.arePreferencesAffected(changes).then(() =>
                this.reconcilePreferences()
            )
        ));

        this.reconcilePreferences();
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    /**
     * Checks to see if the preference file was modified
     */
    protected arePreferencesAffected(changes: FileChange[]): Promise<void> {
        return new Promise(resolve => {
            this.preferencePath.then(preferenceUri => {
                if (changes.some(c => c.uri.toString() === preferenceUri.toString())) {
                    resolve();
                }
            })
        });
    }

    /**
     * Read preferences
     */
    protected reconcilePreferences(): void {
        this.preferencePath.then(path => {
            this.fileSystem.resolveContent(path.toString()).then(({ stat, content }) =>
                JSON.parse(content)
            ).then(newPreferences =>
                this.notifyPreferences(newPreferences),
                reason => {
                    if (reason) {
                        this.logger.error('Failed to reconcile preferences: ', reason);
                    }
                    this.notifyPreferences(undefined);
                })
        })
    }

    protected notifyPreferences(newPrefs: any) {
        if (this.preferences !== undefined && this.preferences !== newPrefs) {
            // Different prefs detected
            this.notifyDifferentPrefs(newPrefs);

        } else if (this.preferences === undefined && newPrefs !== undefined) {
            const newKeys: string[] = Object.keys(newPrefs);
            // All prefs are new, send events for all of them
            newKeys.forEach((newKey: string) => {
                const event: PreferenceChangedEvent = { preferenceName: newKey };
                this.fireEvent(event);
            })
        }
        this.preferences = newPrefs;
    }

    protected notifyDifferentPrefs(newPrefs: any) {
        const newKeys: string[] = Object.keys(newPrefs);
        const oldKeys = Object.keys(this.preferences);
        for (const newKey of newKeys) {
            const index = oldKeys.indexOf(newKey)
            if (index !== -1) {
                oldKeys.splice(index);
                // Existing pref

                if (this.preferences !== undefined && !coreutils.JSONExt.deepEqual(newPrefs[newKey], this.preferences[newKey])) {
                    // New value
                    const event: PreferenceChangedEvent = { preferenceName: newKey, newValue: newPrefs[newKey], oldValue: this.preferences[newKey] };
                    this.fireEvent(event);
                }

            } else {
                // New pref
                const event: PreferenceChangedEvent = { preferenceName: newKey, newValue: newPrefs[newKey] };
                this.fireEvent(event);
            }
        };

        // oldKeys now contain the deleted prefs that should have an event fired for
        for (const deletedKey of oldKeys) {
            const event: PreferenceChangedEvent = { preferenceName: deletedKey };
            this.fireEvent(event);
        }
    }

    protected fireEvent(event: PreferenceChangedEvent) {
        if (this.client) {
            this.client.onDidChangePreference(event);
        }
    }

    has(preferenceName: string): Promise<boolean> {
        return Promise.resolve(!!this.preferences && (preferenceName in this.preferences));
    }

    get<T>(preferenceName: string): Promise<T | undefined> {
        return Promise.resolve(!!this.preferences ? this.preferences[preferenceName] : undefined);
    }

    setClient(client: PreferenceClient | undefined) {
        this.client = client;
    }
}