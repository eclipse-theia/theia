/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable, postConstruct, inject } from '@theia/core/shared/inversify';
import { ContextKey, ContextKeyService } from '@theia/core/lib/browser/context-key-service';

@injectable()
export class ViewContextKeyService {

    protected _view: ContextKey<string>;
    get view(): ContextKey<string> {
        return this._view;
    }

    protected _viewItem: ContextKey<string>;
    get viewItem(): ContextKey<string> {
        return this._viewItem;
    }

    protected _activeViewlet: ContextKey<string>;
    /**
     * Viewlet is a tab in the left area in VS Code. Active means visible in this context.
     *
     * In VS Code there can be only one visible viewlet at any time.
     * It is not true for Theia, since views can be layed-out again to different areas.
     * So only last visible view will be an active viewlet.
     */
    get activeViewlet(): ContextKey<string> {
        return this._activeViewlet;
    }

    protected _activePanel: ContextKey<string>;
    /**
     * Panel is a tab in the bottom area in VS Code. Active means visible in this context.
     *
     * In VS Code there can be only one visible panel at any time.
     * It is not true for Theia, since views can be layed-out again to different areas.
     * So only last visible view will be an active panel.
     */
    get activePanel(): ContextKey<string> {
        return this._activePanel;
    }

    protected _focusedView: ContextKey<string>;
    get focusedView(): ContextKey<string> {
        return this._focusedView;
    }

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @postConstruct()
    protected init(): void {
        this._view = this.contextKeyService.createKey('view', '');
        this._viewItem = this.contextKeyService.createKey('viewItem', '');
        this._activeViewlet = this.contextKeyService.createKey('activeViewlet', '');
        this._activePanel = this.contextKeyService.createKey('activePanel', '');
        this._focusedView = this.contextKeyService.createKey('focusedView', '');
    }

    match(expression: string | undefined): boolean {
        return !expression || this.contextKeyService.match(expression);
    }

    with<T>(input: { view?: string, viewItem?: string }, cb: () => T): T {
        const view = this.view.get();
        const viewItem = this.viewItem.get();
        this.view.set(input.view);
        this.viewItem.set(input.viewItem);
        try {
            return cb();
        } finally {
            this.view.set(view);
            this.viewItem.set(viewItem);
        }
    }

}
