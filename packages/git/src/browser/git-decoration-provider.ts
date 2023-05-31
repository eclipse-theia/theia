// *****************************************************************************
// Copyright (C) 2020 Red Hat, Inc. and others.
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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { GitFileChange, GitFileStatus, GitStatusChangeEvent } from '../common';
import { CancellationToken, Emitter, Event } from '@theia/core/lib/common';
import { Decoration, DecorationsProvider } from '@theia/core/lib/browser/decorations-service';
import { GitRepositoryTracker } from './git-repository-tracker';
import URI from '@theia/core/lib/common/uri';
import { GitConfiguration, GitPreferences } from './git-preferences';
import { PreferenceChangeEvent } from '@theia/core/lib/browser';

@injectable()
export class GitDecorationProvider implements DecorationsProvider {

    @inject(GitPreferences) protected readonly preferences: GitPreferences;
    @inject(GitRepositoryTracker) protected readonly gitRepositoryTracker: GitRepositoryTracker;

    protected decorationsEnabled: boolean;
    protected colorsEnabled: boolean;

    protected decorations = new Map<string, Decoration>();
    protected uris = new Set<string>();

    private readonly onDidChangeDecorationsEmitter = new Emitter<URI[]>();
    readonly onDidChange: Event<URI[]> = this.onDidChangeDecorationsEmitter.event;

    @postConstruct()
    protected init(): void {
        this.decorationsEnabled = this.preferences['git.decorations.enabled'];
        this.colorsEnabled = this.preferences['git.decorations.colors'];
        this.gitRepositoryTracker.onGitEvent((event: GitStatusChangeEvent | undefined) => this.handleGitEvent(event));
        this.preferences.onPreferenceChanged((event: PreferenceChangeEvent<GitConfiguration>) => this.handlePreferenceChange(event));
    }

    protected async handleGitEvent(event: GitStatusChangeEvent | undefined): Promise<void> {
        this.updateDecorations(event);
        this.triggerDecorationChange();
    }

    protected updateDecorations(event?: GitStatusChangeEvent): void {
        if (!event) {
            return;
        }
        const newDecorations = new Map<string, Decoration>();
        this.collectDecorationData(event.status.changes, newDecorations);

        this.uris = new Set([...this.decorations.keys()].concat([...newDecorations.keys()]));
        this.decorations = newDecorations;
    }

    protected collectDecorationData(changes: GitFileChange[], bucket: Map<string, Decoration>): void {
        changes.forEach(change => {
            const color = GitFileStatus.getColor(change.status, change.staged);
            bucket.set(change.uri, {
                bubble: true,
                colorId: color.substring(12, color.length - 1).replace(/-/g, '.'),
                tooltip: GitFileStatus.toString(change.status),
                letter: GitFileStatus.toAbbreviation(change.status, change.staged)
            });
        });
    }

    provideDecorations(uri: URI, token: CancellationToken): Decoration | Promise<Decoration | undefined> | undefined {
        if (this.decorationsEnabled) {
            const decoration = this.decorations.get(uri.toString());
            if (decoration && !this.colorsEnabled) {
                // Remove decoration color if disabled.
                return {
                    ...decoration,
                    colorId: undefined
                };
            }
            return decoration;
        }
        return undefined;
    }

    protected handlePreferenceChange(event: PreferenceChangeEvent<GitConfiguration>): void {
        const { preferenceName, newValue } = event;
        let updateDecorations = false;
        if (preferenceName === 'git.decorations.enabled') {
            updateDecorations = true;
            const decorationsEnabled = !!newValue;
            if (this.decorationsEnabled !== decorationsEnabled) {
                this.decorationsEnabled = decorationsEnabled;
            }
        }
        if (preferenceName === 'git.decorations.colors') {
            updateDecorations = true;
            const colorsEnabled = !!newValue;
            if (this.colorsEnabled !== colorsEnabled) {
                this.colorsEnabled = colorsEnabled;
            }
        }
        if (updateDecorations) {
            this.triggerDecorationChange();
        }
    }

    /**
     * Notify that the provider has been updated to trigger a re-render of decorations.
     */
    protected triggerDecorationChange(): void {
        this.onDidChangeDecorationsEmitter.fire(Array.from(this.uris, value => new URI(value)));
    }

}

