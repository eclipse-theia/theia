/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { ILanguageClient } from '@theia/languages/lib/browser';
import { CallsParams, CallsResult, CallsRequest } from '@theia/languages/lib/browser/calls/calls-protocol.proposed';
import { CallHierarchyService } from './callhierarchy-service';

export class LspCallHierarchyService implements CallHierarchyService {

    constructor(public readonly languageId: string, protected readonly client: ILanguageClient) {}

    async getCalls(params: CallsParams): Promise<CallsResult> {
        const result = await this.client.sendRequest(CallsRequest.type, params);
        return result;
    }

}
