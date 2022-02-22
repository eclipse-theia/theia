/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable } from '@theia/core/shared/inversify';
import { GitFileChange, GitFileStatus, GitStatusChangeEvent } from '../common';
import { CancellationToken, Emitter, Event } from '@theia/core/lib/common';
import { Decoration, DecorationsProvider } from '@theia/core/lib/browser/decorations-service';
import { GitRepositoryTracker } from './git-repository-tracker';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class GitDecorationProvider implements DecorationsProvider {

    private readonly onDidChangeDecorationsEmitter = new Emitter<URI[]>();
    readonly onDidChange: Event<URI[]> = this.onDidChangeDecorationsEmitter.event;

    private decorations = new Map<string, Decoration>();

    constructor(@inject(GitRepositoryTracker) protected readonly gitRepositoryTracker: GitRepositoryTracker) {
        this.gitRepositoryTracker.onGitEvent((event: GitStatusChangeEvent | undefined) => {
            this.onGitEvent(event);
        });
    }

    private async onGitEvent(event: GitStatusChangeEvent | undefined): Promise<void> {
        if (!event) {
            return;
        }

        const newDecorations = new Map<string, Decoration>();
        this.collectDecorationData(event.status.changes, newDecorations);

        const uris = new Set([...this.decorations.keys()].concat([...newDecorations.keys()]));
        this.decorations = newDecorations;
        this.onDidChangeDecorationsEmitter.fire([...uris.values()].map(value => new URI(value)));
    }

    private collectDecorationData(changes: GitFileChange[], bucket: Map<string, Decoration>): void {
        const unstagedChanges = changes.filter(change => !change.staged);

        changes.filter(change => change.staged).forEach(stagedChange => {
            const unstagedChangeIndex = unstagedChanges.findIndex(c => (c.status === GitFileStatus.Renamed ? c.oldUri : c.uri) === stagedChange.uri);
            if (unstagedChangeIndex !== -1) {
                // File has both a staged change and an unstaged change

                const removed = unstagedChanges.splice(unstagedChangeIndex, 1);
                const unstagedChange = removed[0];

                const combinedChange = {
                    ...stagedChange,
                    status: this.combineStatuses(stagedChange.status, unstagedChange.status)
                };
                const uri = new URI(stagedChange.uri);
                const stagedDecoration = this.buildDecoration(stagedChange);
                const unstagedDecoration = this.buildDecoration(unstagedChange);
                const combinedDecoration = this.buildDecoration(combinedChange);
                bucket.set(stagedChange.uri, combinedDecoration);
                bucket.set(uri.withFragment('index').toString(), stagedDecoration);
                bucket.set(uri.withFragment('workingTree').toString(), unstagedDecoration);
            } else {
                // File has only a staged change
                const decoration = this.buildDecoration(stagedChange);
                bucket.set(stagedChange.uri, decoration);
            }
        });

        unstagedChanges.forEach(change => {
            // File has only an unstanged change
            const decoration = this.buildDecoration(change);
            bucket.set(change.uri, decoration);
        });
    }

    private buildDecoration(change: GitFileChange): Decoration {
        const color = GitFileStatus.getColor(change.status, change.staged);
        return {
            colorId: color.substring(12, color.length - 1).replace(/-/g, '.'),
            tooltip: GitFileStatus.toString(change.status),
            letter: GitFileStatus.toAbbreviation(change.status, change.staged)
        };
    }

    private combineStatuses(stagedChange: GitFileStatus, unstagedChange: GitFileStatus): GitFileStatus {
        // TODO finish this...
        if (unstagedChange === GitFileStatus.Deleted) {
            return GitFileStatus.Deleted;
        } else {
            return stagedChange;
        }
    }

    provideDecorations(uri: URI, token: CancellationToken): Decoration | Promise<Decoration | undefined> | undefined {
        return this.decorations.get(uri.toString());
    }
}
