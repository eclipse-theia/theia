/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { ResourceResolver } from "../../application/common";
import URI from "../../application/common/uri";
import { ILanguageClient, LanguageIdentifier, LanguageClientContribution } from '../../languages/browser';
import { JAVA_LANGUAGE_ID, JAVA_SCHEME } from '../common';
import { JavaResource } from "./java-resource";

@injectable()
export class JavaClientContribution implements ResourceResolver, LanguageClientContribution {

    protected languageClient: ILanguageClient | undefined;

    protected resolveDidStart: (languageClient: ILanguageClient) => void;
    protected didStart: Promise<ILanguageClient>;

    constructor() {
        this.waitForDidStart();
    }

    resolve(uri: URI): Promise<JavaResource> {
        if (uri.scheme !== JAVA_SCHEME) {
            return Promise.reject(undefined);
        }
        const resolveLanguageClient = this.resolveLanguageClient.bind(this);
        const javaResource = new JavaResource(uri, resolveLanguageClient);
        return Promise.resolve(javaResource);
    }

    protected resolveLanguageClient(): Promise<ILanguageClient> {
        return this.languageClient ? Promise.resolve(this.languageClient) : this.didStart;
    }

    onWillStart(language: LanguageIdentifier, languageClient: ILanguageClient): void {
        if (language.description.id === JAVA_LANGUAGE_ID) {
            languageClient.onReady().then(() =>
                this.onDidStart(language, languageClient)
            );
        }
    }

    protected onDidStart(language: LanguageIdentifier, languageClient: ILanguageClient): void {
        this.languageClient = languageClient
        this.resolveDidStart(this.languageClient);
        this.waitForDidStart();
    }

    protected waitForDidStart(): void {
        this.didStart = new Promise<ILanguageClient>(resolve =>
            this.resolveDidStart = resolve
        );
    }

}