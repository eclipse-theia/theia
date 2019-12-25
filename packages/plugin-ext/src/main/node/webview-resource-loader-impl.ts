/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import { injectable } from 'inversify';
import { WebviewResourceLoader, LoadWebviewResourceParams, LoadWebviewResourceResult } from '../common/webview-protocol';
import { FileUri } from '@theia/core/lib/node/file-uri';

@injectable()
export class WebviewResourceLoaderImpl implements WebviewResourceLoader {

    async load(params: LoadWebviewResourceParams): Promise<LoadWebviewResourceResult | undefined> {
        const fsPath = FileUri.fsPath(params.uri);
        const stat = await fs.stat(fsPath);
        const eTag = this.compileETag(fsPath, stat);
        if ('eTag' in params && params.eTag === eTag) {
            return undefined;
        }
        const buffer = await fs.readFile(FileUri.fsPath(params.uri));
        return { buffer: buffer.toJSON().data, eTag };
    }

    protected compileETag(fsPath: string, stat: fs.Stats): string {
        return crypto.createHash('md5')
            .update(fsPath + stat.mtime.getTime() + stat.size, 'utf8')
            .digest('base64');
    }

}
