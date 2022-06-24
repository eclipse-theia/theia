// *****************************************************************************
// Copyright (C) 2022 TypeFox and others.
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

import * as express from 'express';
import { injectable } from 'inversify';
import { BackendApplicationContribution } from './backend-application';
import { OS } from '../common/os';

@injectable()
export class OSBackendApplicationContribution implements BackendApplicationContribution {

    configure(app: express.Application): void {
        app.get('/os', (_, res) => {
            res.send(OS.type());
        });
    }
}
