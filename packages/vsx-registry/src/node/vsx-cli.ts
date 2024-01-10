// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { CliContribution } from '@theia/core/lib/node';
import { injectable } from '@theia/core/shared/inversify';
import { Argv } from '@theia/core/shared/yargs';
import { OVSXRouterConfig } from '@theia/ovsx-client';
import * as fs from 'fs';

@injectable()
export class VsxCli implements CliContribution {

    ovsxRouterConfig: OVSXRouterConfig | undefined;

    configure(conf: Argv<{}>): void {
        conf.option('ovsx-router-config', { description: 'JSON configuration file for the OVSX router client', type: 'string' });
    }

    async setArguments(args: Record<string, unknown>): Promise<void> {
        const { 'ovsx-router-config': ovsxRouterConfig } = args;
        if (typeof ovsxRouterConfig === 'string') {
            this.ovsxRouterConfig = JSON.parse(await fs.promises.readFile(ovsxRouterConfig, 'utf8'));
        }
    }
}
