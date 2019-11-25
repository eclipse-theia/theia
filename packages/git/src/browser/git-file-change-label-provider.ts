/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { LabelProviderContribution, DidChangeLabelEvent, LabelProvider } from '@theia/core/lib/browser/label-provider';
import { GitFileChangeNode } from './git-file-change-node';
import URI from '@theia/core/lib/common/uri';
import { GitRepositoryProvider } from './git-repository-provider';
import { Repository, GitFileStatus } from '../common';

@injectable()
export class GitFileChangeLabelProvider implements LabelProviderContribution {

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(GitRepositoryProvider)
    protected readonly repositoryProvider: GitRepositoryProvider;

    canHandle(element: object): number {
        return GitFileChangeNode.is(element) ? 100 : 0;
    }

    getIcon(node: GitFileChangeNode): string {
        return this.labelProvider.getIcon(new URI(node.uri));
    }

    getName(node: GitFileChangeNode): string {
        return this.labelProvider.getName(new URI(node.uri));
    }

    getDescription(node: GitFileChangeNode): string {
        return this.relativePath(new URI(node.uri).parent);
    }

    affects(node: GitFileChangeNode, event: DidChangeLabelEvent): boolean {
        return event.affects(new URI(node.uri));
    }

    getCaption(fileChange: GitFileChangeNode): string {
        let result = `${this.relativePath(fileChange.uri)} - ${this.getStatusCaption(fileChange.status, true)}`;
        if (fileChange.oldUri) {
            result = `${this.relativePath(fileChange.oldUri)} -> ${result}`;
        }
        return result;
    }

    relativePath(uri: URI | string): string {
        const parsedUri = typeof uri === 'string' ? new URI(uri) : uri;
        const repo = this.repositoryProvider.findRepository(parsedUri);
        const relativePath = repo && Repository.relativePath(repo, parsedUri);
        if (relativePath) {
            return relativePath.toString();
        }
        return this.labelProvider.getLongName(parsedUri);
    }

    getStatusCaption(status: GitFileStatus, staged?: boolean): string {
        return GitFileStatus.toString(status, staged);
    }

}
