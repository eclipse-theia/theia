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

import { FileStat } from '@theia/filesystem/lib/common';
import { Git, Repository } from '../common';

export const ScmWidgetFactory = Symbol('ScmWidgetFactory');

export const GIT_WIDGET_FACTORY_ID = 'git';

export interface ScmWidgetFactory {
    readonly label: string;
    readonly widgetId: string;

    /**
     * Given a directory FileStat populated with its children, determine if this is a repository
     * of appropriate type.
     *
     * @param fileStat
     */
    isUnderSourceControl(fileStat: FileStat): boolean;

    /**
     * Resolves to an array of repositories discovered in the workspace given with the workspace root URI.
     */
    repositories(workspaceRootUri: string, options: Git.Options.Repositories): Promise<Repository[]>;
}
