// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import { Endpoint } from '@theia/core/lib/browser';
import { injectable, interfaces } from '@theia/core/shared/inversify';
import { SampleAppInfo } from '../../common/vsx/sample-app-info';

@injectable()
export class SampleFrontendAppInfo implements SampleAppInfo {

    async getSelfOrigin(): Promise<string> {
        return new Endpoint().origin;
    }
}

export function bindSampleAppInfo(bind: interfaces.Bind): void {
    bind(SampleAppInfo).to(SampleFrontendAppInfo).inSingletonScope();
}
