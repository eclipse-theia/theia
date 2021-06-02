/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { inject, injectable } from '@theia/core/shared/inversify';
import { UriAwareCommandHandler, UriCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import URI from '@theia/core/lib/common/uri';
import { SelectionService } from '@theia/core';
import { theiaUritoUriComponents } from '../../common/uri-components';

export namespace SelectionProviderCommands {
    export const GET_SELECTED_CONTEXT: Command = {
        id: 'theia.plugin.workspace.selectedContext'
    };
}

@injectable()
export class SelectionProviderCommandContribution implements CommandContribution {

    @inject(SelectionService) protected readonly selectionService: SelectionService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(SelectionProviderCommands.GET_SELECTED_CONTEXT, this.newMultiUriAwareCommandHandler({
            isEnabled: () => true,
            isVisible: () => false,
            execute: (selectedUris: URI[]) => selectedUris.map(uri => theiaUritoUriComponents(uri))
        }));
    }

    protected newMultiUriAwareCommandHandler(handler: UriCommandHandler<URI[]>): UriAwareCommandHandler<URI[]> {
        return UriAwareCommandHandler.MultiSelect(this.selectionService, handler);
    }
}
