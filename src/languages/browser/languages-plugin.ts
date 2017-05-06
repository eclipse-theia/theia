/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { TheiaApplication, TheiaPlugin } from "../../application/browser";
import { LanguagesService } from '../common';
import { LanguageClientLauncher } from "./language-client-launcher";

@injectable()
export class LanguagesPlugin implements TheiaPlugin {

    constructor(
        @inject(LanguagesService) protected readonly service: LanguagesService,
        @inject(LanguageClientLauncher) protected readonly launcher: LanguageClientLauncher
    ) { }

    onStart(app: TheiaApplication): void {
        this.service.getLanguages().then(languages =>
            this.launcher.launch(languages)
        );
    }

}
