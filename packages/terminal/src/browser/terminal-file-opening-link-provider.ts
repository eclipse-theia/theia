// *****************************************************************************
// Copyright (C) 2026 JuliaHub, Inc. and others.
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

import { ILogger } from '@theia/core';
import { OpenerService } from '@theia/core/lib/browser';
import URI from '@theia/core/lib/common/uri';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Position } from '@theia/editor/lib/browser';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { TerminalWidget } from './base/terminal-widget';
import { TerminalLink, TerminalLinkProvider } from './terminal-link-provider';

/**
 * Base for terminal link providers that resolve a matched string to a local file URI and open it in
 * the editor. Subclasses contribute their own matching in {@link provideLinks} and a named logger.
 */
@injectable()
export abstract class AbstractFileOpeningLinkProvider implements TerminalLinkProvider {

    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(FileService) protected readonly fileService: FileService;

    protected abstract readonly logger: ILogger;

    abstract provideLinks(line: string, terminal: TerminalWidget): Promise<TerminalLink[]>;

    protected async isValidFileURI(uri: URI): Promise<boolean> {
        try {
            const stat = await this.fileService.resolve(uri);
            return !stat.isDirectory;
        } catch { }
        return false;
    }

    async openURI(uri: URI, position?: Position): Promise<void> {
        const options = position ? { selection: { start: position } } : {};
        try {
            const opener = await this.openerService.getOpener(uri, options);
            await opener.open(uri, options);
        } catch (err) {
            this.logger.error('Cannot open link ' + uri, err);
        }
    }
}
