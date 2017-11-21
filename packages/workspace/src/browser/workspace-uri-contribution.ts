/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { LabelProviderContribution } from "@theia/core/lib/browser/label-provider";
import URI from "@theia/core/lib/common/uri";
import { injectable, inject } from "inversify";
import { WorkspaceService } from "./workspace-service";

@injectable()
export class WorkspaceUriLabelProviderContribution implements LabelProviderContribution {

    wsRoot: string;

    constructor( @inject(WorkspaceService) wsService: WorkspaceService) {
        wsService.root.then(root => {
            if (root) {
                this.wsRoot = root.uri;
            }
        });
    }

    canHandle(element: object): number {
        if (this.wsRoot && element instanceof URI) {
            if (element.toString().startsWith(this.wsRoot)) {
                return 10;
            }
        }
        return 0;
    }

    /**
     * trims the workspace root from a file uri, if it is a child.
     */
    getLongName(uri: URI): string {
        const short = uri.toString().substr(this.wsRoot.length);
        if (short[0] === '/') {
            return short.substr(1);
        }
        return short;
    }
}
