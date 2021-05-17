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
        changes.forEach(change => {
            const color = GitFileStatus.getColor(change.status, change.staged);
            bucket.set(change.uri, {
                colorId: color.substring(12, color.length - 1).replace(/-/g, '.'),
                tooltip: GitFileStatus.toString(change.status),
                letter: GitFileStatus.toAbbreviation(change.status, change.staged)
            });
        });
    }

    provideDecorations(uri: URI, token: CancellationToken): Decoration | Promise<Decoration | undefined> | undefined {
        return this.decorations.get(uri.toString());
    }
}

