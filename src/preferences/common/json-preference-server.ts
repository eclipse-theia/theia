/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import URI from '../../application/common/uri';
import { FileSystem, FileChangesEvent } from '../../filesystem/common/filesystem';
import { FileSystemWatcher } from '../../filesystem/common/filesystem-watcher'
import { IPreferenceClient } from './preference-service'
import { PreferenceChangedEvent } from './preference-event'
import { IPreferenceServer } from './preference-server'
import * as coreutils from "@phosphor/coreutils";

export const PreferencePath = Symbol("PreferencePath")

@injectable()
export class JsonPreferenceServer implements IPreferenceServer {

    protected prefs: { [key: string]: any } | undefined; // Preferences cache
    protected client: IPreferenceClient | undefined;
    protected readonly resolveUri: Promise<URI>;

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(FileSystemWatcher) protected readonly watcher: FileSystemWatcher,
        @inject(PreferencePath) protected readonly preferencePath: string) {
        this.resolveUri = fileSystem.getWorkspaceRoot().
            then(root =>
                new URI(root.uri).appendPath(preferencePath)
            );

        watcher.onFileChanges(event => {
            this.arePreferencesAffected(event).then((arePrefsAffected) => {
                if (arePrefsAffected) {
                    this.reconcilePreferences();
                }
            })
        });

        this.reconcilePreferences();
    }

    /**
     * Checks to see if the preference file was modified
     */
    protected arePreferencesAffected(event: FileChangesEvent): Promise<boolean> {
        return this.resolveUri.then(uri =>
            event.changes.some(c =>
                c.uri === uri.toString()
            )
        );
    }

    /**
     * Read preferences
     */
    protected reconcilePreferences(): void {

        this.resolveUri.then((uri) => {
            this.fileSystem.resolveContent(uri.toString()).then(({ stat, content }) => {
                const newPrefs = JSON.parse(content) // Might need a custom parser because comments and whatnot?
                this.notifyPreferences(newPrefs);
            })
        })
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