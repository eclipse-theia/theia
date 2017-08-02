/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */


import { FrontendApplication, FrontendApplicationContribution } from "@theia/core/lib/browser"
import { injectable, inject } from "inversify"
import { ExtensionWidget } from "./extension-widget"

@injectable()
export class ExtensionContribution implements FrontendApplicationContribution {

    constructor(@inject(ExtensionWidget) protected readonly extensionWidget: ExtensionWidget) {

    }

    onStart(app: FrontendApplication): void {
        app.shell.addToLeftArea(this.extensionWidget, {
            rank: 2
        })
    }

}

