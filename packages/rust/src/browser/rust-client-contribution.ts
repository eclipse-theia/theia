/*
 * Copyright (C) 2018 David Craven and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { BaseLanguageClientContribution, Workspace, Languages,
         LanguageClientFactory } from '@theia/languages/lib/browser';
import { RUST_LANGUAGE_ID, RUST_LANGUAGE_NAME } from '../common';

@injectable()
export class RustClientContribution extends BaseLanguageClientContribution {

    readonly id = RUST_LANGUAGE_ID;
    readonly name = RUST_LANGUAGE_NAME;

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages,
        @inject(LanguageClientFactory)
        protected readonly languageClientFactory: LanguageClientFactory
    ) {
        super(workspace, languages, languageClientFactory);
    }

    protected get globPatterns() {
        return [
            '**/*.rs', '**/Cargo.toml'
        ];
    }
}
