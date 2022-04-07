// *****************************************************************************
// Copyright (C) 2022 TypeFox and others.
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

import { Widget } from '../widgets';
import { FrontendApplication, FrontendApplicationContribution } from '../frontend-application';
import { NavigatableWidget } from '../navigatable-types';
import { inject, injectable } from 'inversify';
import { WindowTitleService } from './window-title-service';
import { LabelProvider } from '../label-provider';

@injectable()
export class WindowTitleUpdater implements FrontendApplicationContribution {

    @inject(WindowTitleService)
    protected readonly windowTitleService: WindowTitleService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    onStart(app: FrontendApplication): void {
        // Update the current title every 33 ms (30 times per second)
        // This update is relatively cheap and work arounds a few issues in the application shell:
        // 1. We can't easily identify when an editor becomes dirty/non-dirty, as there's no event for it
        // 2. Adding a new widget might take a few frames for it to actually becomes the main widget, leaving the old widget in the title
        // 3. Removing focus from the app messes with the active widget, leading to unexpected behavior
        setInterval(() => {
            this.updateTitleWidget(app.shell.getCurrentWidget('main'));
        }, 33);
    }

    protected updateTitleWidget(widget?: Widget): void {
        let activeEditorLong: string | undefined;
        let activeEditorMedium: string | undefined;
        let activeEditorShort: string | undefined;
        let activeFolderLong: string | undefined;
        let activeFolderMedium: string | undefined;
        let activeFolderShort: string | undefined;
        const uri = NavigatableWidget.getUri(widget);
        if (uri) {
            activeEditorLong = uri.path.toString();
            activeEditorMedium = this.labelProvider.getLongName(uri);
            activeEditorShort = this.labelProvider.getName(uri);
            const parent = uri.parent;
            activeFolderLong = parent.path.toString();
            activeFolderMedium = this.labelProvider.getLongName(parent);
            activeFolderShort = this.labelProvider.getName(parent);
        } else if (widget) {
            const widgetTitle = widget.title.label;
            activeEditorLong = widgetTitle;
            activeEditorMedium = widgetTitle;
            activeEditorShort = widgetTitle;
        }
        this.windowTitleService.update({
            activeEditorLong,
            activeEditorMedium,
            activeEditorShort,
            activeFolderLong,
            activeFolderMedium,
            activeFolderShort
        });
    }

}
