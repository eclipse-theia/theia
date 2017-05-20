/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { FrontendApplication, FrontendApplicationContribution } from "../../application/browser";
import { DocumentSelector, Languages, LanguagesService, TextDocument, Workspace, LanguageIdentifier } from '../common';
import { LanguageClientLauncher } from "./language-client-launcher";

@injectable()
export class LanguagesPlugin implements FrontendApplicationContribution {

    constructor(
        @inject(LanguagesService) protected readonly service: LanguagesService,
        @inject(LanguageClientLauncher) protected readonly launcher: LanguageClientLauncher,
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(Languages) protected readonly languages: Languages
    ) { }

    onStart(app: FrontendApplication): void {
        this.service.getLanguages().then(languages => {
            for (const language of languages) {
                this.waitForActivation(language).then(() =>
                    this.launcher.launch(language)
                );
            }
        });
    }

    protected waitForActivation(language: LanguageIdentifier): Promise<any> {
        const selector = language.description.documentSelector;
        if (selector) {
            return this.waitForOpenTextDocument(selector);
        }
        return Promise.resolve();
    }

    protected waitForOpenTextDocument(selector: DocumentSelector): Promise<TextDocument> {
        return new Promise<TextDocument>(resolve => {
            if (selector) {
                const document = this.workspace.textDocuments.filter(document =>
                    this.languages.match(selector, document)
                )[0];
                if (document !== undefined) {
                    resolve(document);
                } else {
                    const disposable = this.workspace.onDidOpenTextDocument(document => {
                        if (this.languages.match(selector, document)) {
                            disposable.dispose();
                            resolve(document);
                        }
                    });
                }
            }
        });
    }

}
