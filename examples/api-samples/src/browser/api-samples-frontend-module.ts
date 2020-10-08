/********************************************************************************
 * Copyright (C) 2019 Arm and others.
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

import { ContainerModule } from 'inversify';
import { bindDynamicLabelProvider } from './label/sample-dynamic-label-provider-command-contribution';
import { bindSampleUnclosableView } from './view/sample-unclosable-view-contribution';
import { bindSampleOutputChannelWithSeverity } from './output/sample-output-channel-with-severity';
import { bindSampleMenu } from './menu/sample-menu-contribution';
import { inject, injectable } from 'inversify';
import { EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { MiniBrowserOpenHandler } from '@theia/mini-browser/lib/browser/mini-browser-open-handler';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application';

import '../../src/browser/style/branding.css';

export default new ContainerModule(bind => {
    bindDynamicLabelProvider(bind);
    bindSampleUnclosableView(bind);
    bindSampleOutputChannelWithSeverity(bind);
    bindSampleMenu(bind);
    bind(FrontendApplicationContribution).to(MyCustomFrontendContribution).inSingletonScope();
});

@injectable()
class MyCustomFrontendContribution implements FrontendApplicationContribution {

    @inject(MiniBrowserOpenHandler)
    protected openHandler: MiniBrowserOpenHandler;

    onStart(app: FrontendApplication): void {
        app.shell.onDidAddWidget(widget => {
            if (widget instanceof EditorWidget) {
                const { editor } = widget;
                if (editor instanceof MonacoEditor) {
                    const uri = editor.getResourceUri();
                    if (uri && uri.scheme === 'file' && uri.path.ext === '.html') {
                        this.openHandler.open(uri, { widgetOptions: { ref: widget, mode: 'open-to-right' } });
                    }
                }
            }
        });
    }

}
