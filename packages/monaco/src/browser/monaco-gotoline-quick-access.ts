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

import { QuickAccessContribution } from '@theia/core/lib/browser/quick-input';
import { injectable } from '@theia/core/shared/inversify';

export class GotoLineQuickAccess extends monaco.quickInput.StandaloneGotoLineQuickAccessProvider {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(...services: any[]);
    constructor(@monaco.services.ICodeEditorService private readonly service: monaco.editor.ICodeEditorService) {
        super(service);
    }

    get activeTextEditorControl(): monaco.editor.ICodeEditor | undefined {
        return this.service.getFocusedCodeEditor() || this.service.getActiveCodeEditor();
    }
}

@injectable()
export class GotoLineQuickAccessContribution implements QuickAccessContribution {
    registerQuickAccessProvider(): void {
        monaco.platform.Registry.as<monaco.quickInput.IQuickAccessRegistry>('workbench.contributions.quickaccess').registerQuickAccessProvider({
            ctor: GotoLineQuickAccess,
            prefix: ':',
            placeholder: '',
            helpEntries: [{ description: 'Go to line', needsEditor: true }]
        });
    }
}
