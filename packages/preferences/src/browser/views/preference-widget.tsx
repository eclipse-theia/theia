/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

import { postConstruct, injectable, inject } from 'inversify';
import { WidgetManager, Panel, Widget, Message, } from '@theia/core/lib/browser';
import { Preference } from '../util/preference-types';
import { PreferencesEditorWidget } from './preference-editor-widget';
import { PreferencesTreeWidget } from './preference-tree-widget';
import { PreferencesSearchbarWidget } from './preference-searchbar-widget';
import { PreferencesScopeTabBar } from './preference-scope-tabbar-widget';

@injectable()
export class PreferencesWidget extends Panel {
    /**
     * The widget `id`.
     */
    static readonly ID = 'settings_widget';
    /**
     * The widget `label` which is used for display purposes.
     */
    static readonly LABEL = 'Preferences';

    protected _preferenceScope: Preference.SelectedScopeDetails = Preference.DEFAULT_SCOPE;

    @inject(PreferencesEditorWidget) protected editorWidget: PreferencesEditorWidget;
    @inject(PreferencesTreeWidget) protected treeWidget: PreferencesTreeWidget;
    @inject(PreferencesSearchbarWidget) protected searchbarWidget: PreferencesSearchbarWidget;
    @inject(PreferencesScopeTabBar) protected tabBarWidget: PreferencesScopeTabBar;
    @inject(WidgetManager) protected readonly manager: WidgetManager;

    get preferenceScope(): Preference.SelectedScopeDetails {
        return this._preferenceScope;
    }

    set preferenceScope(preferenceScopeDetails: Preference.SelectedScopeDetails) {
        this._preferenceScope = preferenceScopeDetails;
        this.editorWidget.preferenceScope = this._preferenceScope;
    }

    protected onResize(msg: Widget.ResizeMessage): void {
        super.onResize(msg);
        if (msg.width < 600 && this.treeWidget && !this.treeWidget.isHidden) {
            this.treeWidget.hide();
            this.editorWidget.addClass('full-pane');
        } else if (msg.width >= 600 && this.treeWidget && this.treeWidget.isHidden) {
            this.treeWidget.show();
            this.editorWidget.removeClass('full-pane');
        }
    }

    protected onActivateRequest(msg: Message): void {
        super.onActivateRequest(msg);
        this.searchbarWidget.focus();
    }

    @postConstruct()
    protected async init(): Promise<void> {
        this.id = PreferencesWidget.ID;
        this.title.label = PreferencesWidget.LABEL;
        this.title.closable = true;
        this.addClass('theia-settings-container');
        this.title.iconClass = 'fa fa-sliders';

        this.searchbarWidget = await this.manager.getOrCreateWidget<PreferencesSearchbarWidget>(PreferencesSearchbarWidget.ID);
        this.searchbarWidget.addClass('preferences-searchbar-widget');
        this.addWidget(this.searchbarWidget);

        this.tabBarWidget = await this.manager.getOrCreateWidget<PreferencesScopeTabBar>(PreferencesScopeTabBar.ID);
        this.tabBarWidget.addClass('preferences-tabbar-widget');
        this.addWidget(this.tabBarWidget);

        this.treeWidget = await this.manager.getOrCreateWidget<PreferencesTreeWidget>(PreferencesTreeWidget.ID);
        this.treeWidget.addClass('preferences-tree-widget');
        this.addWidget(this.treeWidget);

        this.editorWidget = await this.manager.getOrCreateWidget<PreferencesEditorWidget>(PreferencesEditorWidget.ID);
        this.editorWidget.addClass('preferences-editor-widget');
        this.addWidget(this.editorWidget);

        this.update();
    }
}
