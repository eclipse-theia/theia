/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { DefaultUriLabelProviderContribution, URIIconReference } from '@theia/core/lib/browser/label-provider';
import URI from '@theia/core/lib/common/uri';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { WorkspaceVariableContribution } from './workspace-variable-contribution';

@injectable()
export class WorkspaceUriLabelProviderContribution extends DefaultUriLabelProviderContribution {

    @inject(WorkspaceVariableContribution)
    protected readonly workspaceVariable: WorkspaceVariableContribution;

    @postConstruct()
    async init(): Promise<void> {
        // no-op, backward compatibility
    }

    canHandle(element: object): number {
        if ((element instanceof URI && element.scheme === 'file' || URIIconReference.is(element) || FileStat.is(element))) {
            return 10;
        }
        return 0;
    }

    getIcon(element: URI | URIIconReference | FileStat): string {
        return super.getIcon(this.asURIIconReference(element));
    }

    getName(element: URI | URIIconReference | FileStat): string | undefined {
        return super.getName(this.asURIIconReference(element));
    }

    /**
     * trims the workspace root from a file uri, if it is a child.
     */
    getLongName(element: URI | URIIconReference | FileStat): string | undefined {
        const uri = this.getUri(element);
        if (uri) {
            const formatting = this.findFormatting(uri);
            if (formatting) {
                return this.formatUri(uri, formatting);
            }
        }
        const relativePath = uri && this.workspaceVariable.getWorkspaceRelativePath(uri);
        return relativePath || super.getLongName(this.asURIIconReference(element));
    }

    protected asURIIconReference(element: URI | URIIconReference | FileStat): URI | URIIconReference {
        if (FileStat.is(element)) {
            return URIIconReference.create(element.isDirectory ? 'folder' : 'file', element.resource);
        }
        return element;
    }

    protected getUri(element: URI | URIIconReference | FileStat): URI | undefined {
        if (FileStat.is(element)) {
            return element.resource;
        }
        return super.getUri(element);
    }
}
