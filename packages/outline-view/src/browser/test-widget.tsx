/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import * as React from 'react';
import { MessageService } from '@theia/core';
import { FrontendApplication, ShellLayoutRestorer } from '@theia/core/lib/browser';

export class TestWidget extends ReactWidget {

    constructor(private messageService: MessageService,
                private frontendApplication: FrontendApplication,
                private shellLayoutRestorer: ShellLayoutRestorer) {
        super();

        this.id = 'test-widget';
        this.title.closable = true;
        this.title.caption = this.title.label = 'Test Widget';
        this.update();
    }

    public handleOnClick() {
        this.messageService.info('Storing the layout!!!');
        setTimeout(() => {
            this.shellLayoutRestorer.storeLayout(this.frontendApplication);
        }, 1);
    }

    protected render(): React.ReactNode {
        return <React.Fragment>
                <br/>
                <button onClick = {e => this.handleOnClick()}>Store Layout</button>
            </React.Fragment>;
    }

}
