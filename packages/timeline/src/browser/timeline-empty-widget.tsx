/********************************************************************************
 * Copyright (C) 2020 RedHat and others.
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

import { injectable } from '@theia/core/shared/inversify';
import { ReactWidget } from '@theia/core/lib/browser';
import { AlertMessage } from '@theia/core/lib/browser/widgets/alert-message';
import * as React from '@theia/core/shared/react';

@injectable()
export class TimelineEmptyWidget extends ReactWidget {

    static ID = 'timeline-empty-widget';

    constructor() {
        super();
        this.addClass('theia-timeline-empty');
        this.id = TimelineEmptyWidget.ID;
    }

    protected render(): React.ReactNode {
        return <AlertMessage
            type='WARNING'
            header='The active editor cannot provide timeline information.'
        />;
    }

}
