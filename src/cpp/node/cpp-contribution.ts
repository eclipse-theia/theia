/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { BaseLanguageServerContribution, IConnection } from "../../languages/node";

@injectable()
export class CppContribution extends BaseLanguageServerContribution {

    readonly description = {
        id: 'cpp',
        name: 'C/C++',
        documentSelector: ['h', 'hxx', 'hh', 'hpp', 'inc', 'c', 'cxx', 'C', 'c++', 'cc', 'cc', 'cpp'],
        fileEvents: [
            '**/*.h', '**/*.hxx', '**/*.hh', '**/*.hpp', '**/*.inc', '**/*.c', '**/*.cxx', '**/*.C', '**/*.c++', '**/*.cc', '**/*.cc', '**/*.cpp',
        ]
    }

    readonly id = 'cpp';

    start(clientConnection: IConnection): void {
        // TODO: clangd has to be on PATH, this should be a preference.
        const command = 'clangd';
        const args: string[] = [];
        const serverConnection = this.createProcessStreamConnection(command, args);
        this.forward(clientConnection, serverConnection);
    }

}
