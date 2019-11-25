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

import { DefaultUriLabelProviderContribution } from '@theia/core/lib/browser/label-provider';
import URI from '@theia/core/lib/common/uri';
import { injectable, inject, postConstruct } from 'inversify';
import { FileStat } from '@theia/filesystem/lib/common';
import { WorkspaceVariableContribution } from './workspace-variable-contribution';

@injectable()
export class WorkspaceUriLabelProviderContribution extends DefaultUriLabelProviderContribution {

    @inject(WorkspaceVariableContribution)
    protected readonly workspaceVariable: WorkspaceVariableContribution;

    @postConstruct()
    protected async init(): Promise<void> {
        // no-op, backward compatibility
    }

    canHandle(element: object): number {
        if ((element instanceof URI && element.scheme === 'file' || FileStat.is(element))) {
            return 10;
        }
        return 0;
    }

    private getUri(element: URI | FileStat): URI {
        if (FileStat.is(element)) {
            return new URI(element.uri);
        }
        return new URI(element.toString());
    }

    getIcon(element: URI | FileStat): string {
        if (!FileStat.is(element)) {
            return super.getIcon(element);
        }
        if (element.isDirectory) {
            return this.defaultFolderIcon;
        }
        const icon = super.getFileIcon(new URI(element.uri));
        return icon || this.defaultFileIcon;
    }

    getName(element: URI | FileStat): string {
        return super.getName(this.getUri(element));
    }

    /**
     * trims the workspace root from a file uri, if it is a child.
     */
    getLongName(element: URI | FileStat): string {
        const uri = this.getUri(element);
        const relativePath = this.workspaceVariable.getWorkspaceRelativePath(uri);
        return relativePath || super.getLongName(uri);
    }
}
