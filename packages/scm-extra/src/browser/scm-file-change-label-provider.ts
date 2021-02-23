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

import { injectable, inject } from '@theia/core/shared/inversify';
import { LabelProviderContribution, DidChangeLabelEvent, LabelProvider } from '@theia/core/lib/browser/label-provider';
import { ScmFileChangeNode } from './scm-file-change-node';
import URI from '@theia/core/lib/common/uri';
import { ScmService } from '@theia/scm/lib/browser/scm-service';

@injectable()
export class ScmFileChangeLabelProvider implements LabelProviderContribution {

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(ScmService)
    protected readonly scmService: ScmService;

    canHandle(element: object): number {
        return ScmFileChangeNode.is(element) ? 100 : 0;
    }

    getIcon(node: ScmFileChangeNode): string {
        return this.labelProvider.getIcon(new URI(node.fileChange.uri));
    }

    getName(node: ScmFileChangeNode): string {
        return this.labelProvider.getName(new URI(node.fileChange.uri));
    }

    getDescription(node: ScmFileChangeNode): string {
        return this.relativePath(new URI(node.fileChange.uri).parent);
    }

    affects(node: ScmFileChangeNode, event: DidChangeLabelEvent): boolean {
        return event.affects(new URI(node.fileChange.uri));
    }

    getCaption(node: ScmFileChangeNode): string {
        return node.fileChange.getCaption();
    }

    relativePath(uri: URI | string): string {
        const parsedUri = typeof uri === 'string' ? new URI(uri) : uri;
        const repo = this.scmService.findRepository(parsedUri);
        if (repo) {
            const repositoryUri = new URI(repo.provider.rootUri);
            const relativePath = repositoryUri.relative(parsedUri);
            if (relativePath) {
                return relativePath.toString();
            }
        }
        return this.labelProvider.getLongName(parsedUri);
    }

    getStatusCaption(node: ScmFileChangeNode): string {
        return node.fileChange.getStatusCaption();
    }

}
