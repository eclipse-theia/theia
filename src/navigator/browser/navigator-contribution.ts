/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";

import { SelectionService } from "../../application/common";
import { FrontendApplicationContribution, FrontendApplication } from "../../application/browser";
import { FileNavigatorWidget } from "./navigator-widget";

@injectable()
export class FileNavigatorContribution implements FrontendApplicationContribution {

    constructor(
        @inject(SelectionService) protected readonly selectionService: SelectionService,
        @inject(FileNavigatorWidget) protected readonly fileNavigator: FileNavigatorWidget
    ) { }

    onStart(app: FrontendApplication): void {
        this.fileNavigator.getModel().refresh();
        app.shell.addToLeftArea(this.fileNavigator);
        this.fileNavigator.getModel().onSelectionChanged(selection =>
            this.selectionService.selection = selection
        );
    }

}
