// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { DependencyDownloadContribution } from '@theia/core/lib/node/dependency-download';
import { injectable } from '@theia/core/shared/inversify';

@injectable()
export class FindGitRepositoriesDependebcyDownload implements DependencyDownloadContribution {
    getDownloadUrl(remoteOS: string): string {
        if (remoteOS.includes('mac')) {
            return 'https://github.com/jonah-iden/theia-native-dependencies/releases/download/1.38.0-macos-latest/find-git-repositories.zip';
        } else if (remoteOS.includes('win')) {
            return 'https://github.com/jonah-iden/theia-native-dependencies/releases/download/1.38.0-windows-latest/find-git-repositories.zip';
        } else {
            return 'https://github.com/jonah-iden/theia-native-dependencies/releases/download/1.38.0-ubuntu-latest/find-git-repositories.zip';
        }
    }

}
