/********************************************************************************
 * Copyright (c) 2021 SAP SE or an SAP affiliate company and others.
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
import { Disposable } from '../../common';
import { QuickInputService } from './quick-input-service';

export interface QuickViewItem {
    readonly label: string;
    readonly when?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readonly open: () => any;
}

@injectable()
export class QuickViewService extends QuickInputService {
    readonly prefix = 'view ';

    registerItem(item: QuickViewItem): Disposable {
        return Disposable.create(() => { });
    }
    hideItem(label: string): void { }
    showItem(label: string): void { }
}
