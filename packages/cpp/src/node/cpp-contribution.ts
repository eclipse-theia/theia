/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { BaseLanguageServerContribution, IConnection } from "@theia/languages/lib/node";
import { parseArgs } from '@theia/process/lib/node/utils';
import { CPP_LANGUAGE_ID, CPP_LANGUAGE_NAME } from '../common';
import { Message, isRequestMessage } from 'vscode-ws-jsonrpc';
import { InitializeParams, InitializeRequest } from 'vscode-languageserver-protocol';

export const CLANGD_COMMAND_DEFAULT = 'clangd';

@injectable()
export class CppContribution extends BaseLanguageServerContribution {

    readonly id = CPP_LANGUAGE_ID;
    readonly name = CPP_LANGUAGE_NAME;

    constructor() {
        super();
    }

    protected map(message: Message): Message {
        if (isRequestMessage(message)) {
            if (message.method === InitializeRequest.type.method) {
                const initializeParams = message.params as InitializeParams;
                initializeParams.processId = process.pid;
            }
        }
        return message;
    }

    protected forward(clientConnection: IConnection, serverConnection: IConnection): void {
        super.forward(clientConnection, serverConnection);
    }

    public start(clientConnection: IConnection): void {
        const envCommand = process.env.CPP_CLANGD_COMMAND;
        const command = envCommand ? envCommand : CLANGD_COMMAND_DEFAULT;

        const envArgs = process.env.CPP_CLANGD_ARGS;
        let args: string[] = [];
        if (envArgs) {
            args = parseArgs(envArgs);
        }

        const envCompilationDatabase = process.env.CPP_CLANGD_COMPILATION_DB_DIRECTORY;
        if (envCompilationDatabase) {
            args.push("-compile-commands-dir=" + envCompilationDatabase);
        }
        const serverConnection = this.createProcessStreamConnection(command, args);
        this.forward(clientConnection, serverConnection);
    }
}
