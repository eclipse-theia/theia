/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

import { injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { WidgetOpenHandler } from '@theia/core/lib/browser';
import { VSXExtensionOptions } from './vsx-extension';
import { VSXExtensionUri } from '../common/vsx-extension-uri';
import { VSXExtensionEditor } from './vsx-extension-editor';

@injectable()
export class VSXExtensionEditorManager extends WidgetOpenHandler<VSXExtensionEditor> {

    readonly id = VSXExtensionEditor.ID;

    canHandle(uri: URI): number {
        const id = VSXExtensionUri.toId(uri);
        return !!id ? 500 : 0;
    }

    protected createWidgetOptions(uri: URI): VSXExtensionOptions {
        const id = VSXExtensionUri.toId(uri);
        if (!id) {
            throw new Error('Invalid URI: ' + uri.toString());
        }
        return { id };
    }

}
