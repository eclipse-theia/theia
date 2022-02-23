// *****************************************************************************
// Copyright (C) 2020 Arm and others.
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

import { injectable } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ReactWidget } from '@theia/core/lib/browser';
import { AlertMessage } from '@theia/core/lib/browser/widgets/alert-message';
import { nls } from '@theia/core/lib/common/nls';

@injectable()
export class ScmNoRepositoryWidget extends ReactWidget {

    static ID = 'scm-no-repository-widget';

    constructor() {
        super();
        this.addClass('theia-scm-no-repository');
        this.id = ScmNoRepositoryWidget.ID;
    }

    protected render(): React.ReactNode {
        return <AlertMessage
            type='WARNING'
            header={nls.localize('theia/scm/noRepositoryFound', 'No repository found')}
        />;
    }

}
