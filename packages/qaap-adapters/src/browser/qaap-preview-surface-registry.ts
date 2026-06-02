// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { PanelLayout } from '@theia/core/lib/browser/widgets/widget';
import { MiniBrowser } from '@theia/mini-browser/lib/browser/mini-browser';
import { QaapMiniBrowserContent } from './qaap-mini-browser-content';
import { QaapPreviewFramePicker, QaapPreviewFramePickerFactory } from './qaap-preview-frame-picker';

export interface QaapPreviewSurfaceHandle {
    readonly frame: HTMLIFrameElement;
    readonly picker: QaapPreviewFramePicker;
    isConnected(): boolean;
}

@injectable()
export class QaapPreviewSurfaceRegistry {

    @inject(QaapPreviewFramePickerFactory)
    protected readonly pickerFactory: QaapPreviewFramePickerFactory;

    protected readonly surfaces: QaapPreviewSurfaceHandle[] = [];

    registerEmbedded(frame: HTMLIFrameElement, toDispose: DisposableCollection): QaapPreviewSurfaceHandle {
        const picker = this.pickerFactory.create(frame, toDispose);
        return this.registerSurface(frame, picker, toDispose);
    }

    registerMiniBrowserContent(content: QaapMiniBrowserContent, toDispose: DisposableCollection): QaapPreviewSurfaceHandle {
        const frame = content.previewFrame;
        const picker = content.getPreviewFramePicker();
        const handle = this.registerSurface(frame, picker, toDispose);
        return {
            frame: handle.frame,
            picker: handle.picker,
            isConnected: () => content.node.isConnected,
        };
    }

    protected registerSurface(
        frame: HTMLIFrameElement,
        picker: QaapPreviewFramePicker,
        toDispose: DisposableCollection,
    ): QaapPreviewSurfaceHandle {
        const handle: QaapPreviewSurfaceHandle = {
            frame,
            picker,
            isConnected: () => frame.isConnected,
        };
        this.surfaces.push(handle);
        toDispose.push(Disposable.create(() => this.removeSurface(handle)));
        return handle;
    }

    hasActiveSurface(): boolean {
        return this.getActiveSurface() !== undefined;
    }

    getActiveSurface(): QaapPreviewSurfaceHandle | undefined {
        const connected = this.surfaces.filter(surface => surface.isConnected());
        if (connected.length) {
            return connected[connected.length - 1];
        }
        return undefined;
    }

    activateElementPicker(): { started: boolean; message: string } {
        const surface = this.getActiveSurface();
        if (!surface) {
            return {
                started: false,
                message: 'No preview open. Open a dev preview first, then pick an element.',
            };
        }
        surface.picker.startElementPicker();
        return {
            started: true,
            message: 'Element picker active — click an element in the preview.',
        };
    }

    async toggleElementInspector(): Promise<void> {
        const surface = this.getActiveSurface();
        if (surface) {
            await surface.picker.openElementInspector();
        }
    }

    protected removeSurface(handle: QaapPreviewSurfaceHandle): void {
        const index = this.surfaces.indexOf(handle);
        if (index >= 0) {
            this.surfaces.splice(index, 1);
        }
    }
}

export function findQaapMiniBrowserContentFromWidgets(widgets: Iterable<unknown>): QaapMiniBrowserContent | undefined {
    for (const widget of widgets) {
        if (!(widget instanceof MiniBrowser)) {
            continue;
        }
        const child = (widget.layout as PanelLayout).widgets[0];
        if (child instanceof QaapMiniBrowserContent) {
            return child;
        }
    }
    return undefined;
}
