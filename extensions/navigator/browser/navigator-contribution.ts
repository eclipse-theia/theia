/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from "inversify";
import { SelectionService } from "../../application/common";
import { FrontendApplicationContribution, FrontendApplication } from "../../application/browser";
import { FileSystem } from "../../filesystem/common";
import { DirNode } from "../../filesystem/browser";
import { WorkspaceService } from "../../workspace/browser";
import { FileNavigatorWidget, ID } from "./navigator-widget";

@injectable()
export class FileNavigatorContribution implements FrontendApplicationContribution {

    protected readonly onReady: Promise<void>;

    constructor(
        @inject(FileSystem) protected readonly fileSystem: FileSystem,
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(FileNavigatorWidget) @named(ID) protected readonly fileNavigator: FileNavigatorWidget
    ) {
        this.fileNavigator.model.onSelectionChanged(selection =>
            this.selectionService.selection = selection
        );
        this.onReady = this.workspaceService.root.then(fileStat => {
            this.fileNavigator.model.root = DirNode.createRoot(fileStat);
        });
    }

    onStart(app: FrontendApplication): void {
        app.shell.addToLeftArea(this.fileNavigator);
    }

}
