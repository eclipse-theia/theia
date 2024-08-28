// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { injectable } from 'inversify';
import { OpenHandler } from '../../browser/opener-service';
import URI from '../../common/uri';
import { HttpOpenHandler } from '../../browser/http-open-handler';

export interface ExternalAppOpenHandlerOptions {
    openExternalApp?: boolean
}

@injectable()
export class ExternalAppOpenHandler implements OpenHandler {

    static readonly PRIORITY: number = HttpOpenHandler.PRIORITY + 100;
    readonly id = 'external-app';

    canHandle(uri: URI, options?: ExternalAppOpenHandlerOptions): number {
        return (options && options.openExternalApp) ? ExternalAppOpenHandler.PRIORITY : -1;
    }

    async open(uri: URI): Promise<undefined> {
        // For files 'file:' scheme, system accepts only the path.
        // For other protocols e.g. 'vscode:' we use the full URI to propagate target app information.
        window.electronTheiaCore.openWithSystemApp(uri.toString(true));
        return undefined;
    }
}
