/********************************************************************************
 * Copyright (C) 2019 Ericsson and others.
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

import { injectable } from 'inversify';
import { FolderPreferenceProvider } from '@theia/preferences/lib/browser/folder-preference-provider';

@injectable()
export class TaskFolderPreferenceProvider extends FolderPreferenceProvider {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected parse(content: string): any {
        const tasks = super.parse(content);
        if (tasks === undefined) {
            return undefined;
        }
        return { tasks: { ...tasks } };
    }

    protected getPath(preferenceName: string): string[] | undefined {
        if (preferenceName === 'tasks') {
            return [];
        }
        if (preferenceName.startsWith('tasks.')) {
            return [preferenceName.substr('tasks.'.length)];
        }
        return undefined;
    }

}
