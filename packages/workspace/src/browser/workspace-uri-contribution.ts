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

import { DefaultUriLabelProviderContribution } from "@theia/core/lib/browser/label-provider";
import URI from "@theia/core/lib/common/uri";
import { injectable, inject } from "inversify";
import { WorkspaceService } from "./workspace-service";
import { FileSystem, FileStat } from "@theia/filesystem/lib/common";
import { MaybePromise } from "@theia/core";

@injectable()
export class WorkspaceUriLabelProviderContribution extends DefaultUriLabelProviderContribution {

    wsRoot: string;
    constructor(@inject(WorkspaceService) wsService: WorkspaceService,
        @inject(FileSystem) protected fileSystem: FileSystem) {
        super();
        wsService.root.then(root => {
            if (root) {
                this.wsRoot = new URI(root.uri).toString(true);
            }
        });
    }

    canHandle(element: object): number {
        if ((element instanceof URI && element.scheme === 'file' || FileStat.is(element))) {
            return 10;
        }
        return 0;
    }

    private getUri(element: URI | FileStat) {
        if (FileStat.is(element)) {
            return new URI(element.uri);
        }
        return new URI(element.toString());
    }

    private getStat(element: URI | FileStat): MaybePromise<FileStat | undefined> {
        if (FileStat.is(element)) {
            return element;
        }
        return this.fileSystem.getFileStat(element.toString());
    }

    async getIcon(element: URI | FileStat): Promise<string> {
        if (FileStat.is(element) && element.isDirectory) {
            return 'fa fa-folder';
        }
        const uri = this.getUri(element);
        const icon = super.getFileIcon(uri);
        if (!icon) {
            try {
                const stat = await this.getStat(element);
                if (stat) {
                    if (stat.isDirectory) {
                        return 'fa fa-folder';
                    } else {
                        return 'fa fa-file';
                    }
                } else {
                    return 'fa fa-file';
                }
            } catch (err) {
                return 'fa fa-file';
            }
        }
        return icon;
    }

    getName(element: URI | FileStat): string {
        return super.getName(this.getUri(element));
    }

    /**
     * trims the workspace root from a file uri, if it is a child.
     */
    getLongName(element: URI | FileStat): string {
        const uri = this.getUri(element);
        const uriStr = uri.toString(true);
        if (!this.wsRoot || !uriStr.startsWith(this.wsRoot)) {
            return super.getLongName(uri);
        }

        const short = uriStr.substr(this.wsRoot.length);
        if (short[0] === '/') {
            return short.substr(1);
        }
        return short;
    }
}
