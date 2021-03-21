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

import { inject, injectable } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { UriCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import { DiffService } from './diff-service';

@injectable()
export class WorkspaceCompareHandler implements UriCommandHandler<URI[]> {

    @inject(DiffService) protected readonly diffService: DiffService;

    /**
     * Determine if the command is visible.
     *
     * @param uris URIs of selected resources.
     * @returns `true` if the command is visible.
     */
    isVisible(uris: URI[]): boolean {
        return uris.length === 2;
    }

    /**
     * Determine if the command is enabled.
     *
     * @param uris URIs of selected resources.
     * @returns `true` if the command is enabled.
     */
    isEnabled(uris: URI[]): boolean {
        return uris.length === 2;
    }

    /**
     * Execute the command.
     *
     * @param uris URIs of selected resources.
     */
    async execute(uris: URI[]): Promise<void> {
        const [left, right] = uris;
        await this.diffService.openDiffEditor(left, right);
    }
}
