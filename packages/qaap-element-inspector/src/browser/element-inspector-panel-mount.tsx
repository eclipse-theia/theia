// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { CommandRegistry } from '@theia/core/lib/common/command';
import { ElementInspectorService } from './element-inspector-service';
import { ElementInspectorPanel } from './element-inspector-panel';
import {
    ELEMENT_INSPECTOR_ASK_AGENT_COMMAND_ID,
    ELEMENT_INSPECTOR_COPY_SELECTOR_COMMAND_ID,
    ELEMENT_INSPECTOR_GENERATE_VARIANT_COMMAND_ID,
} from './element-inspector-contribution';
import { ensurePreviewInspectorPanelRoot } from './preview-inspector-panel-root';

export { QAAP_PREVIEW_INSPECTOR_PANEL_ROOT_CLASS, ensurePreviewInspectorPanelRoot } from './preview-inspector-panel-root';

export interface EmbeddedElementInspectorHost extends Disposable {
    show(): void;
    hide(): void;
    toggle(): boolean;
    isOpen(): boolean;
    syncButtonState(button?: HTMLButtonElement): void;
}

export function mountEmbeddedElementInspector(
    container: HTMLElement,
    service: ElementInspectorService,
    commands: CommandRegistry,
    toDispose: DisposableCollection = new DisposableCollection(),
): EmbeddedElementInspectorHost {
    container.classList.add('theia-mini-browser-inspector', 'qaap-preview-inline-inspector');
    container.hidden = true;
    container.setAttribute('role', 'complementary');
    container.setAttribute('aria-label', 'Element Inspector');

    const panelRoot = ensurePreviewInspectorPanelRoot(container);

    let root: Root | undefined;
    const render = (): void => {
        if (!root) {
            return;
        }
        root.render(
            <ElementInspectorPanel
                service={service}
                onCopySelector={() => runCommand(commands, ELEMENT_INSPECTOR_COPY_SELECTOR_COMMAND_ID)}
                onAskAgent={() => runCommand(commands, ELEMENT_INSPECTOR_ASK_AGENT_COMMAND_ID)}
                onGenerateVariant={() => runCommand(commands, ELEMENT_INSPECTOR_GENERATE_VARIANT_COMMAND_ID)}
            />,
        );
    };

    root = createRoot(panelRoot);
    toDispose.push(Disposable.create(() => {
        root?.unmount();
        root = undefined;
    }));

    let open = false;
    let boundButton: HTMLButtonElement | undefined;

    const syncButtonState = (button?: HTMLButtonElement): void => {
        if (button) {
            boundButton = button;
        }
        boundButton?.classList.toggle('theia-mini-browser-workbench-button--active', open);
        boundButton?.setAttribute('aria-pressed', open ? 'true' : 'false');
    };

    const host: EmbeddedElementInspectorHost = {
        show: () => {
            open = true;
            container.hidden = false;
            container.classList.add('qaap-preview-inline-inspector--open');
            container.closest('.qaap-preview-split')?.classList.add('qaap-preview-split--inspector-open');
            render();
            syncButtonState();
        },
        hide: () => {
            open = false;
            container.hidden = true;
            container.classList.remove('qaap-preview-inline-inspector--open');
            container.closest('.qaap-preview-split')?.classList.remove('qaap-preview-split--inspector-open');
            syncButtonState();
        },
        toggle: () => {
            if (open) {
                host.hide();
            } else {
                host.show();
            }
            return open;
        },
        isOpen: () => open,
        syncButtonState,
        dispose: () => {
            root?.unmount();
            root = undefined;
        },
    };

    toDispose.push(service.onDidChangeState(() => render()));
    toDispose.push(host);
    render();
    return host;
}

function runCommand(commands: CommandRegistry, commandId: string): void {
    if (commands.isEnabled(commandId)) {
        void commands.executeCommand(commandId).catch(() => undefined);
    }
}
