/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from "inversify";
import { SelectionService } from "@theia/core/lib/common";
import { FrontendApplicationContribution, FrontendApplication } from "@theia/core/lib/browser";
import { DirNode } from "@theia/filesystem/lib/browser";
import { WorkspaceService } from "@theia/workspace/lib/browser";
import { FileNavigatorWidget, FILE_NAVIGATOR_ID } from './navigator-widget';
import { StorageService } from '@theia/core/lib/browser/storage-service';
import { WidgetFactory, WidgetManager } from '@theia/core/lib/browser/widget-manager';
import { Widget } from '@phosphor/widgets';

@injectable()
export class FileNavigatorContribution implements FrontendApplicationContribution, WidgetFactory {

    id = 'navigator';

    constructor(
        @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService,
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(FileNavigatorWidget) @named(FILE_NAVIGATOR_ID) protected readonly fileNavigator: FileNavigatorWidget,
        @inject(WidgetManager) protected readonly widgetManager: WidgetManager,
        @inject(StorageService) protected storageService: StorageService
    ) {
        this.fileNavigator.model.onSelectionChanged(selection =>
            this.selectionService.selection = selection
        );
        this.workspaceService.root.then(fileStat => {
            this.fileNavigator.model.root = DirNode.createRoot(fileStat);
        });
    }

    onStart(app: FrontendApplication): void {
        this.widgetManager.getOrCreateWidget('navigator').then(navigator => {
            app.shell.addToLeftArea(navigator, { rank: 1 });
        });
    }

    async createWidget(): Promise<Widget> {
        return this.fileNavigator;
    }
}
