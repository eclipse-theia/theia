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

import * as React from 'react';
import { inject, injectable, postConstruct } from 'inversify';
import { DialogProps } from './dialogs';
import { ReactDialog } from './dialogs/react-dialog';
import { ApplicationServer, ApplicationInfo, ExtensionInfo } from '../common/application-protocol';
import { Message } from './widgets/widget';
import { FrontendApplicationConfigProvider } from './frontend-application-config-provider';

export const ABOUT_CONTENT_CLASS = 'theia-aboutDialog';
export const ABOUT_EXTENSIONS_CLASS = 'theia-aboutExtensions';

@injectable()
export class AboutDialogProps extends DialogProps {
}

@injectable()
export class AboutDialog extends ReactDialog<void> {
    protected applicationInfo: ApplicationInfo | undefined;
    protected extensionsInfos: ExtensionInfo[] = [];
    protected readonly okButton: HTMLButtonElement;

    @inject(ApplicationServer)
    protected readonly appServer: ApplicationServer;

    constructor(
        @inject(AboutDialogProps) protected readonly props: AboutDialogProps
    ) {
        super({
            title: FrontendApplicationConfigProvider.get().applicationName,
        });
        this.appendAcceptButton('Ok');
    }

    @postConstruct()
    protected async init(): Promise<void> {
        this.applicationInfo = await this.appServer.getApplicationInfo();
        this.extensionsInfos = await this.appServer.getExtensionsInfos();
        this.update();
    }

    protected renderHeader(): React.ReactNode {
        const applicationInfo = this.applicationInfo;
        return applicationInfo && <h3>{applicationInfo.name} {applicationInfo.version}</h3>;
    }

    protected renderExtensions(): React.ReactNode {
        const extensionsInfos = this.extensionsInfos;
        return <>
            <h3>List of extensions</h3>

            <ul className={ABOUT_EXTENSIONS_CLASS}>
                {
                    extensionsInfos
                        .sort((a: ExtensionInfo, b: ExtensionInfo) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
                        .map((extension: ExtensionInfo) => <li key={extension.name}>{extension.name} {extension.version}</li>)
                }
            </ul>
        </>;
    }

    protected render(): React.ReactNode {
        return <div className={ABOUT_CONTENT_CLASS}>
            {this.renderHeader()}
            {this.renderExtensions()}
        </div>;
    }

    protected onAfterAttach(msg: Message): void {
        super.onAfterAttach(msg);
        this.update();
    }

    get value(): undefined { return undefined; }
}
