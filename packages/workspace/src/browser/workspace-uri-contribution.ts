// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { DefaultUriLabelProviderContribution, URIIconReference } from '@theia/core/lib/browser/label-provider';
import URI from '@theia/core/lib/common/uri';
import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { WorkspaceService } from './workspace-service';
import { WorkspaceVariableContribution } from './workspace-variable-contribution';

@injectable()
export class WorkspaceUriLabelProviderContribution extends DefaultUriLabelProviderContribution {

    @inject(WorkspaceVariableContribution) protected readonly workspaceVariable: WorkspaceVariableContribution;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;

    @postConstruct()
    override init(): void {
        // no-op, backward compatibility
    }

    override canHandle(element: object): number {
        if ((element instanceof URI && element.scheme === 'file' || URIIconReference.is(element) || FileStat.is(element))) {
            return 10;
        }
        return 0;
    }

    override getIcon(element: URI | URIIconReference | FileStat): string {
        return super.getIcon(this.asURIIconReference(element));
    }

    override getName(element: URI | URIIconReference | FileStat): string | undefined {
        return super.getName(this.asURIIconReference(element));
    }

    /**
     * trims the workspace root from a file uri, if it is a child.
     */
    override getLongName(element: URI | URIIconReference | FileStat): string | undefined {
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

    override getDetails(element: URI | URIIconReference | FileStat): string | undefined {
        const uri = this.getUri(element);
        if (!uri) {
            return this.getLongName(element);
        }
        // Parent in order to omit the name - that's what comes out of `getName`, and `getDetails` should supplement, not duplicate.
        const relativePath = uri && this.workspaceVariable.getWorkspaceRelativePath(uri.parent);
        if (relativePath !== undefined) {
            const prefix = this.workspaceService.tryGetRoots().length > 1 ? this.getName(this.workspaceVariable.getWorkspaceRootUri(uri)!) : '';
            const separator = prefix && relativePath ? ' • ' : '';
            return prefix + separator + relativePath;
        }
        return this.getLongName(uri.parent);
    }

    protected asURIIconReference(element: URI | URIIconReference | FileStat): URI | URIIconReference {
        if (FileStat.is(element)) {
            return URIIconReference.create(element.isDirectory ? 'folder' : 'file', element.resource);
        }
        const uri = this.getUri(element);
        if (uri && this.workspaceVariable.getWorkspaceRootUri(uri)?.isEqual(uri)) {
            return URIIconReference.create('folder', uri);
        }
        return element;
    }

    protected override getUri(element: URI | URIIconReference | FileStat): URI | undefined {
        if (FileStat.is(element)) {
            return element.resource;
        }
        return super.getUri(element);
    }
}
