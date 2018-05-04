/*
 * Copyright (C) 2018 David Craven and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from 'inversify';
import { BaseLanguageServerContribution,
         IConnection } from '@theia/languages/lib/node';
import { RUST_LANGUAGE_ID, RUST_LANGUAGE_NAME } from '../common';

@injectable()
export class RustContribution extends BaseLanguageServerContribution {

    readonly id = RUST_LANGUAGE_ID;
    readonly name = RUST_LANGUAGE_NAME;

    start(clientConnection: IConnection): void {
        const command = 'rls';
        const args: string[] = [];
        const serverConnection =
            this.createProcessStreamConnection(command, args);
        this.forward(clientConnection, serverConnection);
    }

    protected onDidFailSpawnProcess(error: Error): void {
        super.onDidFailSpawnProcess(error);
        const message =
            'Error starting rust language server.\n' +
            'Please make sure it is installed on your system.\n' +
            "Use the following command: 'rustup component add rls-preview'";
        console.error(message);
    }
}
