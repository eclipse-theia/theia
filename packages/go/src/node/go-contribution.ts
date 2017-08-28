/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { BaseLanguageServerContribution, IConnection } from "@theia/languages/lib/node";
import { GO_LANGUAGE_ID, GO_LANGUAGE_NAME } from '../common';

/**
 * IF you have go on your machine, `go-langserver` can be installed with the following command:
 * `go get github.com/sourcegraph/go-langserver`
 */
@injectable()
export class GoContribution extends BaseLanguageServerContribution {

    readonly id = GO_LANGUAGE_ID;
    readonly name = GO_LANGUAGE_NAME;

    start(clientConnection: IConnection): void {
        // TODO: go-langserver has to be on PATH, this should be a preference.
        const command = 'go-langserver';
        const args: string[] = [];
        const serverConnection = this.createProcessStreamConnection(command, args);
        this.forward(clientConnection, serverConnection);
    }

    protected onDidFailSpawnProcess(error: Error): void {
        super.onDidFailSpawnProcess(error);
        console.error("Error starting go language server.");
        console.error("Please make sure it is installed on your system.");
        console.error("Use the following command: 'go get github.com/sourcegraph/go-langserver'");
    }
}
