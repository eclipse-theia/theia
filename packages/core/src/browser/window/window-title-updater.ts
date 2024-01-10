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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Widget } from '../widgets';
import { FrontendApplication } from '../frontend-application';
import { FrontendApplicationContribution } from '../frontend-application-contribution';
import { NavigatableWidget } from '../navigatable-types';
import { inject, injectable } from 'inversify';
import { WindowTitleService } from './window-title-service';
import { LabelProvider } from '../label-provider';
import { Saveable } from '../saveable';
import { Disposable } from '../../common';

@injectable()
export class WindowTitleUpdater implements FrontendApplicationContribution {

    @inject(WindowTitleService)
    protected readonly windowTitleService: WindowTitleService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    onStart(app: FrontendApplication): void {
        app.shell.mainPanel.onDidChangeCurrent(title => this.handleWidgetChange(title?.owner));
        this.handleWidgetChange(app.shell.getCurrentWidget('main'));
    }

    protected toDisposeOnWidgetChanged: Disposable = Disposable.NULL;
    protected handleWidgetChange(widget?: Widget): void {
        this.toDisposeOnWidgetChanged.dispose();
        const saveable = Saveable.get(widget);
        if (saveable) {
            this.toDisposeOnWidgetChanged = saveable.onDirtyChanged(() => this.windowTitleService.update({ dirty: saveable.dirty ? '●' : '' }));
        } else {
            this.toDisposeOnWidgetChanged = Disposable.NULL;
        }
        this.updateTitleWidget(widget);
    }

    /**
     * Updates the title of the application based on the currently opened widget.
     *
     * @param widget The current widget in the `main` application area. `undefined` if no widget is currently open in that area.
     */
    protected updateTitleWidget(widget?: Widget): void {
        let activeEditorLong: string | undefined;
        let activeEditorMedium: string | undefined;
        let activeEditorShort: string | undefined;
        let activeFolderLong: string | undefined;
        let activeFolderMedium: string | undefined;
        let activeFolderShort: string | undefined;
        let dirty: string | undefined;
        const uri = NavigatableWidget.getUri(widget);
        if (uri) {
            activeEditorLong = uri.path.fsPath();
            activeEditorMedium = this.labelProvider.getLongName(uri);
            activeEditorShort = this.labelProvider.getName(uri);
            const parent = uri.parent;
            activeFolderLong = parent.path.fsPath();
            activeFolderMedium = this.labelProvider.getLongName(parent);
            activeFolderShort = this.labelProvider.getName(parent);
        } else if (widget) {
            const widgetTitle = widget.title.label;
            activeEditorLong = widgetTitle;
            activeEditorMedium = widgetTitle;
            activeEditorShort = widgetTitle;
        }
        if (Saveable.isDirty(widget)) {
            dirty = '●';
        }
        this.windowTitleService.update({
            activeEditorLong,
            activeEditorMedium,
            activeEditorShort,
            activeFolderLong,
            activeFolderMedium,
            activeFolderShort,
            dirty
        });
    }

}
