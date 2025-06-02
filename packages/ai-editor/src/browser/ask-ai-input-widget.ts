// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { Coordinate } from '@theia/core/lib/browser/context-menu-renderer';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { Emitter, Event } from '@theia/core/lib/common/event';

export interface InputSubmitEvent {
    userInput: string;
}

export class AskAIInputWidget implements Disposable {
    private readonly element: HTMLDivElement;
    private readonly inputElement: HTMLInputElement;
    private readonly disposables = new DisposableCollection();

    private readonly onSubmitEmitter = new Emitter<InputSubmitEvent>();
    private readonly onCancelEmitter = new Emitter<void>();

    readonly onSubmit: Event<InputSubmitEvent> = this.onSubmitEmitter.event;
    readonly onCancel: Event<void> = this.onCancelEmitter.event;

    constructor() {
        // Create container element
        this.element = document.createElement('div');
        this.element.className = 'ask-ai-input-widget';

        // Create input element
        this.inputElement = document.createElement('input');
        this.inputElement.type = 'text';
        this.inputElement.className = 'ask-ai-input-widget-input-field';
        this.inputElement.placeholder = 'Type your prompt...';
        this.element.appendChild(this.inputElement);

        // Add input event listeners
        this.addInputEventListeners();

        // Add document event listeners to handle clicks outside
        this.addDocumentEventListeners();
    }

    private addInputEventListeners(): void {
        // Handle key events on the input field
        const keydownListener = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleSubmit();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.handleCancel();
            }
        };

        this.inputElement.addEventListener('keydown', keydownListener);
        this.disposables.push(Disposable.create(() =>
            this.inputElement.removeEventListener('keydown', keydownListener)
        ));
    }

    private addDocumentEventListeners(): void {
        // Handle clicks outside the input field
        const mousedownListener = (e: MouseEvent) => {
            if (this.element.parentElement && !this.element.contains(e.target as Node)) {
                this.handleCancel();
            }
        };

        document.addEventListener('mousedown', mousedownListener);
        this.disposables.push(Disposable.create(() =>
            document.removeEventListener('mousedown', mousedownListener)
        ));
    }

    show(coordinates: Coordinate): void {
        // If the element is not already in the DOM, append it
        if (!this.element.parentElement) {
            document.body.appendChild(this.element);
        }

        // Position the element
        this.element.style.left = `${coordinates.x}px`;
        this.element.style.top = `${coordinates.y}px`;

        // Focus the input
        setTimeout(() => this.inputElement.focus(), 50);
    }

    hide(): void {
        if (this.element.parentElement) {
            this.element.parentElement.removeChild(this.element);
        }
    }

    setValue(value: string): void {
        this.inputElement.value = value;
    }

    getValue(): string {
        return this.inputElement.value;
    }

    private handleSubmit(): void {
        const userInput = this.inputElement.value.trim();
        if (userInput) {
            this.onSubmitEmitter.fire({ userInput });
        }
        this.hide();
    }

    private handleCancel(): void {
        this.onCancelEmitter.fire();
        this.hide();
    }

    dispose(): void {
        this.hide();
        this.disposables.dispose();
        this.onSubmitEmitter.dispose();
        this.onCancelEmitter.dispose();
    }
}
