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

const BASE_URL = 'https://github.com/microsoft/ripgrep-prebuilt/releases/download/v13.0.0-8/ripgrep-v13.0.0-8';

@injectable()
export class RigrepDependencyDownload implements DependencyDownloadContribution {
    getDownloadUrl(remoteOS: string): string {
        const [platform, architecure] = remoteOS.split('-');

        let transformedPlatform: string;
        if (remoteOS.includes('darwin')) {
            transformedPlatform = 'apple-darwin';
        } else if (remoteOS.includes('win')) {
            transformedPlatform = 'pc-windows-msvc';
        } else {
            transformedPlatform = 'unkown-linux-gnu';
        }

        return `${BASE_URL}-${architecure === 'x64' ? 'x86_64' : architecure}-${transformedPlatform}.${platform.includes('win') ? 'zip' : 'tar.gz'}`;
    }
}
