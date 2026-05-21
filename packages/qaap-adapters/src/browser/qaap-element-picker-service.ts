// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { ApplicationShell, WidgetManager } from '@theia/core/lib/browser';
import { PanelLayout } from '@theia/core/lib/browser/widgets/widget';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import { MiniBrowser } from '@theia/mini-browser/lib/browser/mini-browser';
import { ElementInspectorService } from '@theia/qaap-element-inspector/lib/browser/element-inspector-service';
import {
    ELEMENT_PICKER_CANCEL_TYPE,
    PickedElement,
} from '@theia/qaap-element-inspector/lib/browser/element-inspector-types';
import { QaapMiniBrowserContent } from './qaap-mini-browser-content';

export interface QaapElementPickResult {
    readonly picked?: QaapElementPickSummary;
    readonly cancelled?: boolean;
    readonly error?: string;
    readonly message?: string;
}

/** JSON-safe element snapshot for AI tools (omits heavy computedStyles). */
export interface QaapElementPickSummary {
    readonly pickedId: string;
    readonly tagName: string;
    readonly id?: string;
    readonly classes: ReadonlyArray<string>;
    readonly domPath: string;
    readonly outerHTML: string;
    readonly textPreview: string;
    readonly pageUrl: string;
    readonly position: { top: number; left: number; width: number; height: number };
}

const DEFAULT_PICK_TIMEOUT_MS = 120_000;

@injectable()
export class QaapElementPickerService {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ElementInspectorService)
    protected readonly inspector: ElementInspectorService;

    /** True when a preview mini-browser tab exists (picker can run). */
    hasPreviewTab(): boolean {
        return this.findPreviewContent() !== undefined;
    }

    /** Activates the picker on the active or first open preview mini-browser. */
    activatePicker(): { started: boolean; message: string } {
        const content = this.findPreviewContent();
        if (!content) {
            return {
                started: false,
                message: 'No preview tab open. Run qaap_bootstrap_open_preview first, then pick an element.',
            };
        }
        content.startElementPicker();
        return { started: true, message: 'Element picker active — click an element in the preview.' };
    }

    /**
     * Starts the picker and resolves when the user picks an element, cancels, or the timeout elapses.
     */
    async pickElement(timeoutMs: number = DEFAULT_PICK_TIMEOUT_MS): Promise<QaapElementPickResult> {
        const activation = this.activatePicker();
        if (!activation.started) {
            return { error: activation.message };
        }
        return new Promise<QaapElementPickResult>(resolve => {
            const toDispose = new DisposableCollection();
            const finish = (result: QaapElementPickResult): void => {
                toDispose.dispose();
                resolve(result);
            };
            toDispose.push(this.inspector.onDidPick(element => {
                finish({ picked: this.summarize(element), message: activation.message });
            }));
            const onCancel = (event: MessageEvent): void => {
                if (!event.data || typeof event.data !== 'object') {
                    return;
                }
                const data = event.data as { type?: string };
                if (data.type === ELEMENT_PICKER_CANCEL_TYPE) {
                    finish({ cancelled: true, message: 'Element pick cancelled.' });
                }
            };
            window.addEventListener('message', onCancel);
            toDispose.push({ dispose: () => window.removeEventListener('message', onCancel) });
            const timer = window.setTimeout(() => {
                finish({ error: `Timed out after ${timeoutMs}ms waiting for an element pick.` });
            }, timeoutMs);
            toDispose.push({ dispose: () => window.clearTimeout(timer) });
        });
    }

    protected findPreviewContent(): QaapMiniBrowserContent | undefined {
        const fromActive = this.contentFromWidget(this.shell.activeWidget);
        if (fromActive) {
            return fromActive;
        }
        for (const widget of this.widgetManager.getWidgets(MiniBrowser.ID)) {
            const content = this.contentFromWidget(widget);
            if (content) {
                return content;
            }
        }
        return undefined;
    }

    protected contentFromWidget(widget: unknown): QaapMiniBrowserContent | undefined {
        if (!(widget instanceof MiniBrowser)) {
            return undefined;
        }
        const child = (widget.layout as PanelLayout).widgets[0];
        return child instanceof QaapMiniBrowserContent ? child : undefined;
    }

    protected summarize(element: PickedElement): QaapElementPickSummary {
        return {
            pickedId: element.pickedId,
            tagName: element.tagName,
            id: element.id,
            classes: element.classes,
            domPath: element.domPath,
            outerHTML: element.outerHTML,
            textPreview: element.textPreview,
            pageUrl: element.pageUrl,
            position: element.position,
        };
    }
}
