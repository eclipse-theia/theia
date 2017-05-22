/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { LanguageContribution, IConnection, createServerProcess, forward } from "../../node";

export type ConfigurationType = 'config_win' | 'config_mac' | 'config_linux';
export const configurations = new Map<typeof process.platform, ConfigurationType>();


/**
 * IF you have go on your machine, `go-langserver` can be installed with the following command:
 * `go get github.com/sourcegraph/go-langserver`
 */
@injectable()
export class GoContribution implements LanguageContribution {

    readonly description = {
        id: 'go',
        name: 'Go',
        documentSelector: ['go'],
        fileEvents: [
            '**/*.go'
        ]
    }

    listen(clientConnection: IConnection): void {
        const command = 'go-langserver';
        const args: string[] = [
        ];
        try {
            const serverConnection = createServerProcess(this.description.name, command, args);
            forward(clientConnection, serverConnection);
        } catch (err) {
            console.error(err)
            console.error("Error starting go language server.")
            console.error("Please make sure it is installed on your system.")
            console.error("Use the following command: 'go get github.com/sourcegraph/go-langserver'")
        }
    }

}
