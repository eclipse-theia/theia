/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from "inversify";
import { CommandContribution, CommandRegistry, Command } from '@theia/core/lib/common';
import { SHOW_REFERENCES } from "@theia/editor/lib/browser";
import { Workspace } from "@theia/languages/lib/common";




// export const SWITCH_SOURCE_HEADER = 'switch_source_header'

/**
 * Switch between source/header file
 */
export const SWITCH_SOURCE_HEADER: Command = {
    id: 'switch_source_header',
    label: 'Switch between source/header file'
};


@injectable()
export class CppCommandContribution implements CommandContribution {

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace
    ) { }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SWITCH_SOURCE_HEADER, {
            execute: (uri: string, position: Position, locations: Location[]) =>
                commands.executeCommand(SHOW_REFERENCES.id, uri, position, locations)
        });

        // commands.registerCommand({
        //     id: CppCommands.SWITCH_SOURCE_HEADER,
        //     label: 'Switch between source/header file'
        // });
    }

}
