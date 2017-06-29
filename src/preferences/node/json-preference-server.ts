/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import URI from '../../application/common/uri';
import { FileSystem } from '../../filesystem/common/filesystem';
import { FileSystemWatcher, FileChange, FileChangeType } from '../../filesystem/common/filesystem-watcher'
import { IPreferenceClient } from '../common/preference-protocol'
import { PreferenceChangedEvent } from '../common/preference-event'
import { IPreferenceServer } from '../common/preference-protocol'
import * as coreutils from "@phosphor/coreutils";

export const WorkspacePreferenceServer = Symbol('WorkspacePreferenceServer');
export const UserPreferenceServer = Symbol('UserPreferenceServer');
export const PreferencePath = Symbol("PreferencePath")

@injectable()
export class JsonPreferenceServer implements IPreferenceServer {

    protected prefs: { [key: string]: any } | undefined; // Preferences cache
    protected client: IPreferenceClient | undefined;

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcher) protected readonly watcher: FileSystemWatcher,
        @inject(PreferencePath) protected readonly preferencePath: Promise<URI>) {

        preferencePath.then(uri => {
            watcher.watchFileChanges(uri)
        })

        watcher.onFilesChanged(changes => {
            this.arePreferencesAffected(changes).then(areAffected => {
                if (areAffected)
                    this.reconcilePreferences();
            })
        });

        this.reconcilePreferences();
    }

    /**
     * Checks to see if the preference file was modified
     */
    protected arePreferencesAffected(changes: FileChange[]): Promise<boolean> {
        return this.preferencePath.then((path) => {
            return changes.some(c => {
                return (c.uri.toString() === path.toString() && c.type === FileChangeType.UPDATED);
            })
        })
    }
    /**
     * Read preferences
     */
    protected reconcilePreferences(): void {
        this.preferencePath.then(path => {
            this.fileSystem.resolveContent(path.toString()).then(({ stat, content }) => {
                try {
                    const newPrefs = JSON.parse(content) // Might need a custom parser because comments and whatnot?
                    this.notifyPreferences(newPrefs);
                } catch (e) { // JSON could be invalid
                    console.log(e);
                    this.prefs = undefined;
                    // TODO user the logger and notify the user that the prefs.json is not valid
                }
            })
        })
    }

    protected notifyPreferences(newPrefs: any) {
        if (this.prefs !== undefined && this.prefs !== newPrefs) {
            // Different prefs detected
            this.notifyDifferentPrefs(newPrefs);

        } else if (this.prefs === undefined && newPrefs !== undefined) {
            const newKeys: string[] = Object.keys(newPrefs);
            // All prefs are new, send events for all of them
            newKeys.forEach((newKey: string) => {
                const event: PreferenceChangedEvent = { preferenceName: newKey };
                this.fireEvent(event);
            })
        }
        this.prefs = newPrefs;
    }

    protected notifyDifferentPrefs(newPrefs: any) {
        const newKeys: string[] = Object.keys(newPrefs);
        const oldKeys = Object.keys(this.prefs);
        for (const newKey of newKeys) {
            const index = oldKeys.indexOf(newKey)
            if (index !== -1) {
                oldKeys.splice(index);
                // Existing pref

                if (this.prefs !== undefined && !coreutils.JSONExt.deepEqual(newPrefs[newKey], this.prefs[newKey])) {
                    // New value
                    const event: PreferenceChangedEvent = { preferenceName: newKey, newValue: newPrefs[newKey], oldValue: this.prefs[newKey] };
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
        return Promise.resolve(!!this.prefs && (preferenceName in this.prefs));
    }

    get<T>(preferenceName: string): Promise<T | undefined> {
        return Promise.resolve(!!this.prefs ? this.prefs[preferenceName] : undefined);

    }

    setClient(client: IPreferenceClient | undefined) {
        this.client = client;
    }
}