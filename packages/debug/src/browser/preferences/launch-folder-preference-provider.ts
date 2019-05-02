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

import { injectable } from 'inversify';
import { FolderPreferenceProvider } from '@theia/preferences/lib/browser/folder-preference-provider';

@injectable()
export class LaunchFolderPreferenceProvider extends FolderPreferenceProvider {

    // tslint:disable-next-line:no-any
    protected parse(content: string): any {
        const launch = super.parse(content);
        if (launch === undefined) {
            return undefined;
        }
        return { launch: { ...launch } };
    }

    protected getPath(preferenceName: string): string[] | undefined {
        if (preferenceName === 'launch') {
            return [];
        }
        if (preferenceName.startsWith('launch.')) {
            return [preferenceName.substr('launch.'.length)];
        }
        return undefined;
    }

}
