/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import * as express from 'express';
import { injectable, inject } from 'inversify';
import { BackendApplicationContribution } from '../../node';
import { ElectronRemoteQuestionPath, ElectronRemoteAnswer } from '../../common/remote/electron-remote-protocol';

@injectable()
export class ElectronRemoteBackendContribution implements BackendApplicationContribution {

    @inject(ElectronRemoteQuestionPath) protected readonly path: string;
    @inject(ElectronRemoteAnswer) protected readonly answer: object;

    configure(app: express.Application): void {
        app.get(this.path, (request, response) => {
            response.send(this.answer);
        });
    }
}
