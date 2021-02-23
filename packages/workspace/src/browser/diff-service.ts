/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { open, OpenerService, OpenerOptions } from '@theia/core/lib/browser';
import { MessageService } from '@theia/core/lib/common/message-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';

@injectable()
export class DiffService {

    @inject(FileService) protected readonly fileService: FileService;
    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(MessageService) protected readonly messageService: MessageService;

    public async openDiffEditor(left: URI, right: URI, label?: string, options?: OpenerOptions): Promise<void> {
        if (left.scheme === 'file' && right.scheme === 'file') {
            const [resolvedLeft, resolvedRight] = await this.fileService.resolveAll([{ resource: left }, { resource: right }]);
            if (resolvedLeft.success && resolvedRight.success) {
                const leftStat = resolvedLeft.stat;
                const rightStat = resolvedRight.stat;
                if (leftStat && rightStat) {
                    if (!leftStat.isDirectory && !rightStat.isDirectory) {
                        const uri = DiffUris.encode(left, right, label);
                        await open(this.openerService, uri, options);
                    } else {
                        const details = (() => {
                            if (leftStat.isDirectory && rightStat.isDirectory) {
                                return 'Both resource were a directory.';
                            } else {
                                if (leftStat.isDirectory) {
                                    return `'${left.path.base}' was a directory.`;
                                } else {
                                    return `'${right.path.base}' was a directory.`;
                                }
                            }
                        });
                        this.messageService.warn(`Directories cannot be compared. ${details()}`);
                    }
                }
            }
        } else {
            const uri = DiffUris.encode(left, right, label);
            await open(this.openerService, uri, options);
        }
    }
}
