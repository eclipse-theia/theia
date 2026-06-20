// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
import { Arguments, Argv } from '@theia/core/shared/yargs';

/**
 * Handles the `--attach-container` CLI argument and stashes the value.
 */
@injectable()
export class DevContainerCliContribution implements CliContribution {

    protected attachContainerId: string | undefined;

    protected scanForDevJson: boolean = true;

    configure(conf: Argv): void {
        conf.option('attach-container', {
            description: 'Attach to a running Docker container by ID or name on startup',
            type: 'string'
        });
        conf.option('dev-json', {
            description: 'Scan for and apply devcontainer.json when attaching to a container (use --no-dev-json to skip)',
            type: 'boolean',
            default: true
        });
    }

    setArguments(args: Arguments): void {
        if (args['attach-container'] !== undefined) {
            const id = String(args['attach-container']).trim();
            this.attachContainerId = id.length > 0 ? id : undefined;
        }
        this.scanForDevJson = args['dev-json'] !== false;
    }

    getAttachContainerId(): string | undefined {
        return this.attachContainerId;
    }

    /**
     * Returns and clears the attach container ID so the startup attach flow
     * runs at most once (the window reloads after connecting to the remote).
     */
    consumeAttachContainerId(): string | undefined {
        const id = this.attachContainerId;
        this.attachContainerId = undefined;
        return id;
    }

    shouldScanForDevJson(): boolean {
        return this.scanForDevJson;
    }
}
