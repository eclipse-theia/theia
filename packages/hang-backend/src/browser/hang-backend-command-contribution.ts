/********************************************************************************
 * Copyright (C) 2023 Ericsson and others.
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

import { CommandContribution, CommandRegistry } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { HangBackendService } from '../common/types';

@injectable()
export class HangBackendCommandContribution implements CommandContribution {
    @inject(HangBackendService) protected readonly hangBackendService: HangBackendService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand({ id: 'hangBackend', label: 'Hang Backend' }, {
            execute: () => this.hangBackendService.hangBackend(180_000),
        });
    }
}
