/********************************************************************************
 * Copyright (C) 2020 Arm and others.
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
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { GitResourceOpener } from './git-resource-opener';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class GitOpenerInPrimaryArea implements GitResourceOpener {
    @inject(EditorManager) protected readonly editorManager: EditorManager;

    async open(changeUri: URI): Promise<void> {
        await this.editorManager.open(changeUri, { mode: 'reveal' });

    }
}
