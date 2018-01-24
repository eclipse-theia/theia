/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { DefaultUriLabelProviderContribution } from "@theia/core/lib/browser/label-provider";
import URI from "@theia/core/lib/common/uri";
import { injectable, inject } from "inversify";
import { WorkspaceService } from "./workspace-service";
import { FileSystem, FileStat } from "@theia/filesystem/lib/common";
import { MaybePromise } from "@theia/core";

@injectable()
export class WorkspaceUriLabelProviderContribution extends DefaultUriLabelProviderContribution {

    wsRoot: string;

    constructor( @inject(WorkspaceService) wsService: WorkspaceService,
        @inject(FileSystem) protected fileSystem: FileSystem) {
        super();
        wsService.root.then(root => {
            if (root) {
                this.wsRoot = root.uri;
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

    private getStat(element: URI | FileStat): MaybePromise<FileStat> {
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
                if (stat.isDirectory) {
                    return 'fa fa-folder';
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
        const uriStr = uri.toString();
        if (!this.wsRoot || !uriStr.startsWith(this.wsRoot)) {
            return super.getLongName(uri);
        }

        const short = uri.toString().substr(this.wsRoot.length);
        if (short[0] === '/') {
            return short.substr(1);
        }
        return short;
    }
}
