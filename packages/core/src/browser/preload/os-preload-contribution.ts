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

import { injectable } from 'inversify';
import { OS } from '../../common';
import { AbstractPreloadContribution } from './preloader';

@injectable()
export class OSPreloadContribution extends AbstractPreloadContribution {

    async initialize(): Promise<void> {
        const response = await this.fetch('/os');
        const osType = await response.text() as OS.Type;
        const isWindows = osType === 'Windows';
        const isOSX = osType === 'OSX';
        OS.backend.isOSX = isOSX;
        OS.backend.isWindows = isWindows;
        OS.backend.type = () => osType;
    }

}
