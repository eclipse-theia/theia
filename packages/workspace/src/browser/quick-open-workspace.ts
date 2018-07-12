/********************************************************************************
  * Copyright (C) 2018 Ericsson and others.
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

import { injectable, inject } from "inversify";
import { QuickOpenService, QuickOpenModel, QuickOpenItem, QuickOpenMode } from "@theia/core/lib/browser/quick-open/";
import { WorkspaceService } from "./workspace-service";
import URI from "@theia/core/lib/common/uri";
import { MessageService } from "@theia/core/lib/common";

@injectable()
export class QuickOpenWorkspace implements QuickOpenModel {

    protected items: QuickOpenItem[];

    @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(MessageService) protected readonly messageService: MessageService;
    protected readonly workspace: string | undefined;

    open(workspaces: string[]): void {
        this.items = [];
        for (const workspace of workspaces) {
            this.items.push(new WorkspaceQuickOpenItem(this.workspaceService, workspace, this.messageService));
        }

        this.quickOpenService.open(this, {
            placeholder: 'Type the name of the workspace you want to open',
            fuzzyMatchLabel: true,
            fuzzySort: false
        });
    }

    onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
        acceptor(this.items);
    }

    select() {
        this.items = [];
        this.workspaceService.recentWorkspaces().then(workspaceRoots => {
            if (workspaceRoots) {
                this.open(workspaceRoots);
            }
        });
    }
}

export class WorkspaceQuickOpenItem extends QuickOpenItem {

    constructor(
        private readonly workspaceService: WorkspaceService,
        private readonly workspace: string | undefined,
        private readonly messageService: MessageService
    ) {
        super();
    }

    getLabel(): string {
        if (this.workspace) {
            return new URI(this.workspace).path.name;
        }
        return "";
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }
        this.workspaceService.root.then(current => {
            if (current === undefined) {  // Available recent workspace(s) but closed
                if (this.workspace && this.workspace.length > 0) {
                    this.workspaceService.open(new URI(this.workspace));
                }
            } else {
                if (current.uri !== this.workspace) {
                    this.workspaceService.open(new URI(this.workspace));
                } else {
                    this.messageService.info(`Using the same workspace [ ${this.getLabel()} ]`);
                }

            }
        });
        return true;
    }
}
