/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { Disposable, MaybeArray } from "../../application/common";
import { ILanguageClient, Workspace, LanguageIdentifier } from '../common';
import { LanguageClientProvider } from './language-client-provider';
import { CompositeLanguageClientContribution } from './language-client-contribution';

@injectable()
export class LanguageClientLauncher {

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(LanguageClientProvider) protected readonly languageClientProvider: LanguageClientProvider,
        @inject(CompositeLanguageClientContribution) protected readonly contribution: CompositeLanguageClientContribution
    ) { }

    /**
     * Create and start language clients for given languages.
     */
    launch(languages: LanguageIdentifier): Promise<Disposable>;
    launch(languages: LanguageIdentifier[]): Promise<Disposable>[];
    launch(arg: MaybeArray<LanguageIdentifier>): MaybeArray<Promise<Disposable>> {
        if (arg instanceof Array) {
            return arg.map(language => this.start(language));
        }
        return this.start(arg);
    }

    /**
     * Start the given language client if it is defined
     * or create and start a new one for the given language.
     */
    start(language: LanguageIdentifier, languageClient?: ILanguageClient): Promise<Disposable> {
        if (languageClient) {
            return this.doStart(language, languageClient);
        }
        return this.languageClientProvider(language).then(languageClient =>
            this.doStart(language, languageClient)
        );
    }

    protected doStart(language: LanguageIdentifier, languageClient: ILanguageClient): Promise<Disposable> {
        this.contribution.onWillStart(language, languageClient);
        return this.workspace.ready.then(() =>
            languageClient.start()
        );
    }

}
