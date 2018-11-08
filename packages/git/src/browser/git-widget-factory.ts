/********************************************************************************
 * Copyright (C) 2018 Arm and others.
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

import { injectable, inject } from 'inversify';
import { Git, Repository } from '../common';
import { ScmWidgetFactory } from '.';
import { FileStat } from '@theia/filesystem/lib/common';
import { GIT_WIDGET_FACTORY_ID } from '.';

@injectable()
export class GitWidgetFactory implements ScmWidgetFactory {

    public label = 'Git';
    public widgetId = GIT_WIDGET_FACTORY_ID;

    constructor(
        @inject(Git) protected readonly git: Git,
        ) {
    }

    isUnderSourceControl(directoryFileStat: FileStat): boolean {
        if (directoryFileStat.children === undefined) {
            return false;
        }
        return directoryFileStat.children
            .filter(f => f.isDirectory)
            .map(f => f.uri.split('/').pop())
            .some(f => f === '.git');
    }

    repositories(workspaceRootUri: string, options: Git.Options.Repositories): Promise<Repository[]> {
        return this.git.repositories(workspaceRootUri, options);
    }
}
