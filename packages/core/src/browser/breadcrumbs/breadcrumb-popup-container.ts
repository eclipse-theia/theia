// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import { inject, injectable, postConstruct } from '../../../shared/inversify';
import { Emitter, Event } from '../../common';
import { Disposable, DisposableCollection } from '../../common/disposable';
import { Coordinate } from '../context-menu-renderer';
import { RendererHost } from '../widgets/react-renderer';
import { Styles } from './breadcrumbs-constants';

export interface BreadcrumbPopupContainerFactory {
    (parent: HTMLElement, breadcrumbId: string, position: Coordinate): BreadcrumbPopupContainer;
}
export const BreadcrumbPopupContainerFactory = Symbol('BreadcrumbPopupContainerFactory');

export type BreadcrumbID = string;
export const BreadcrumbID = Symbol('BreadcrumbID');

/**
 * This class creates a popup container at the given position
 * so that contributions can attach their HTML elements
 * as children of `BreadcrumbPopupContainer#container`.
 *
 * - `dispose()` is called on blur or on hit on escape
 */
@injectable()
export class BreadcrumbPopupContainer implements Disposable {
    @inject(RendererHost) protected readonly parent: RendererHost;
    @inject(BreadcrumbID) public readonly breadcrumbId: BreadcrumbID;
    @inject(Coordinate) protected readonly position: Coordinate;

    protected onDidDisposeEmitter = new Emitter<void>();
    protected toDispose: DisposableCollection = new DisposableCollection(this.onDidDisposeEmitter);
    get onDidDispose(): Event<void> {
        return this.onDidDisposeEmitter.event;
    }

    protected _container: HTMLElement;
    get container(): HTMLElement {
        return this._container;
    }

    protected _isOpen: boolean;
    get isOpen(): boolean {
        return this._isOpen;
    }

    @postConstruct()
    protected init(): void {
        this._container = this.createPopupDiv(this.position);
        document.addEventListener('keyup', this.escFunction);
        this._container.focus();
        this._isOpen = true;
    }

    protected createPopupDiv(position: Coordinate): HTMLDivElement {
        const result = window.document.createElement('div');
        result.className = Styles.BREADCRUMB_POPUP;
        result.style.left = `${position.x}px`;
        result.style.top = `${position.y}px`;
        result.tabIndex = 0;
        result.addEventListener('focusout', this.onFocusOut);
        this.parent.appendChild(result);
        return result;
    }

    protected onFocusOut = (event: FocusEvent) => {
        if (!(event.relatedTarget instanceof Element) || !this._container.contains(event.relatedTarget)) {
            this.dispose();
        }
    };

    protected escFunction = (event: KeyboardEvent) => {
        if (event.key === 'Escape' || event.key === 'Esc') {
            this.dispose();
        }
    };

    dispose(): void {
        if (!this.toDispose.disposed) {
            this.onDidDisposeEmitter.fire();
            this.toDispose.dispose();
            this._container.remove();
            this._isOpen = false;
            document.removeEventListener('keyup', this.escFunction);
        }
    }
}
