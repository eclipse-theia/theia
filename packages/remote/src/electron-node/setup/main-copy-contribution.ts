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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { RemoteCopyContribution, RemoteCopyRegistry } from '@theia/core/lib/node/remote/remote-copy-contribution';

@injectable()
export class MainCopyContribution implements RemoteCopyContribution {
    async copy(registry: RemoteCopyRegistry): Promise<void> {
        registry.file('package.json');
        await registry.glob('lib/backend/**/*.js');
        await registry.directory('lib/frontend');
        await registry.directory('lib/webview');
    }
}
