/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { BaseLanguageServerContribution, IConnection } from "@theia/languages/lib/node";
import { CPP_LANGUAGE_ID, CPP_LANGUAGE_NAME } from '../common';
import { CppPreferences, CLANGD_COMMAND_DEFAULT } from "../common";
import { Message, isRequestMessage } from 'vscode-ws-jsonrpc';
import { InitializeParams, InitializeRequest } from 'vscode-languageserver-protocol';

@injectable()
export class CppContribution extends BaseLanguageServerContribution {

    readonly id = CPP_LANGUAGE_ID;
    readonly name = CPP_LANGUAGE_NAME;

    constructor(
        @inject(CppPreferences) protected readonly cppPreferences: CppPreferences
    ) {
        super();
    }

    protected map(message: Message): Message {
        if (isRequestMessage(message)) {
            if (message.method === InitializeRequest.type.method) {
                const initializeParams = message.params as InitializeParams;
                initializeParams.processId = process.pid;
                initializeParams.initializationOptions = this.cppPreferences['cpp.indexingExclusions'];
            }
        }
        return message;
    }

    protected forward(clientConnection: IConnection, serverConnection: IConnection): void {
        super.forward(clientConnection, serverConnection);
    }

    public start(clientConnection: IConnection): void {
        const command = this.cppPreferences['cpp.clangdCommand'] === '' ? CLANGD_COMMAND_DEFAULT : this.cppPreferences['cpp.clangdCommand'];

        const args: string[] = this.cppPreferences['cpp.clangdCommandArgs'];
        if (this.cppPreferences['cpp.clangdCompilationDatabaseDirectory'] !== '') {
            args.push("-compile-commands-dir=" + this.cppPreferences['cpp.clangdCompilationDatabaseDirectory']);
        }
        const serverConnection = this.createProcessStreamConnection(command, args);
        this.forward(clientConnection, serverConnection);
    }

}
