// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    AIContextVariable,
    AIVariableResolutionRequest,
    AIVariableService,
    PromptText,
} from '@theia/ai-core';
import { FILE_VARIABLE } from '@theia/ai-core/lib/browser/file-variable-contribution';
import { IMAGE_CONTEXT_VARIABLE } from '@theia/ai-chat/lib/common/image-context-variable';
import { QuickInputService, nls } from '@theia/core';
import { FileUploadService } from '@theia/filesystem/lib/common/upload/file-upload';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import {
    attachDeviceFilesOptimistic,
    attachDeviceImagesOptimistic,
    attachDeviceImagesFromPicker,
    attachDeviceFilesFromPicker,
    pickFilesFromDevice,
    type MobileComposerAttachHandlers,
} from './qaap-mobile-composer-device-attach';
import { MobileSnackbar } from './mobile-snackbar';

const QUERY_CONTEXT = { type: 'context-variable-picker' };

const WORKSPACE_CONTEXT_VARIABLE_NAMES = new Set([
    FILE_VARIABLE.name,
    IMAGE_CONTEXT_VARIABLE.name,
]);

export interface MobileContextAttachServices {
    readonly fileUploadService: FileUploadService;
    readonly fileService: FileService;
    readonly workspaceService: WorkspaceService;
}

type MobileContextAttachMenuSelection =
    | { kind: 'device-files' }
    | { kind: 'device-images' }
    | { kind: 'variable'; variable: AIContextVariable };

let activeMenu: HTMLElement | undefined;
let activeAnchor: HTMLElement | undefined;
let activeDismiss: (() => void) | undefined;

export function dismissMobileContextAttachMenu(): void {
    activeDismiss?.();
}

function positionAttachMenu(menu: HTMLElement, anchor: HTMLElement): void {
    const margin = 8;
    const gap = 6;
    const anchorRect = anchor.getBoundingClientRect();
    const menuWidth = Math.max(menu.offsetWidth, 200);
    const menuHeight = menu.offsetHeight;
    let top = anchorRect.bottom + gap;
    const maxBottom = window.innerHeight - margin;
    if (top + menuHeight > maxBottom) {
        const aboveTop = anchorRect.top - gap - menuHeight;
        top = aboveTop >= margin ? aboveTop : Math.max(margin, maxBottom - menuHeight);
    }
    let left = anchorRect.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - menuWidth - margin));
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
}

function createAttachMenuItem(options: {
    iconClasses: string;
    label: string;
    hint?: string;
    onSelect: () => void;
}): HTMLButtonElement {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'theia-mobile-projects-sticky-composer-attach-menu-item';
    item.setAttribute('role', 'menuitem');

    const icon = document.createElement('span');
    icon.className = options.iconClasses;
    icon.setAttribute('aria-hidden', 'true');

    const body = document.createElement('span');
    body.className = 'theia-mobile-projects-sticky-composer-attach-menu-item-body';

    const label = document.createElement('span');
    label.className = 'theia-mobile-projects-sticky-composer-attach-menu-item-label';
    label.textContent = options.label;
    body.append(label);

    if (options.hint?.trim()) {
        const hint = document.createElement('span');
        hint.className = 'theia-mobile-projects-sticky-composer-attach-menu-item-hint';
        hint.textContent = options.hint.trim();
        body.append(hint);
    }

    item.append(icon, body);
    item.addEventListener('click', ev => {
        ev.stopPropagation();
        options.onSelect();
    });
    return item;
}

function createAttachMenuSeparator(): HTMLElement {
    const separator = document.createElement('div');
    separator.className = 'theia-mobile-projects-sticky-composer-attach-menu-separator';
    separator.setAttribute('role', 'separator');
    return separator;
}

function showContextAttachMenu(
    anchor: HTMLElement,
    variables: readonly AIContextVariable[],
    includeDeviceAttach: boolean,
): Promise<MobileContextAttachMenuSelection | undefined> {
    if (!includeDeviceAttach && !variables.length) {
        return Promise.resolve(undefined);
    }
    if (activeAnchor === anchor && activeMenu) {
        dismissMobileContextAttachMenu();
        return Promise.resolve(undefined);
    }
    dismissMobileContextAttachMenu();

    return new Promise(resolve => {
        const menu = document.createElement('div');
        menu.className = 'theia-mobile-projects-sticky-composer-attach-menu theia-mod-open';
        menu.setAttribute('role', 'menu');
        menu.tabIndex = -1;

        const finish = (selection: MobileContextAttachMenuSelection | undefined): void => {
            dismissMobileContextAttachMenu();
            resolve(selection);
        };

        if (includeDeviceAttach) {
            menu.append(createAttachMenuItem({
                iconClasses: 'codicon codicon-file',
                label: nls.localize(
                    'qaap/mobileProjects/stickyComposerAttachDeviceFile',
                    'Add file from device',
                ),
                hint: nls.localize(
                    'qaap/mobileProjects/stickyComposerAttachDeviceFileHint',
                    'Upload a file from this phone or tablet',
                ),
                onSelect: () => finish({ kind: 'device-files' }),
            }));
            menu.append(createAttachMenuItem({
                iconClasses: 'codicon codicon-file-media',
                label: nls.localize(
                    'qaap/mobileProjects/stickyComposerAttachDeviceImage',
                    'Add image from device',
                ),
                hint: nls.localize(
                    'qaap/mobileProjects/stickyComposerAttachDeviceImageHint',
                    'Attach a photo or screenshot from this device',
                ),
                onSelect: () => finish({ kind: 'device-images' }),
            }));
            if (variables.length > 0) {
                menu.append(createAttachMenuSeparator());
            }
        }

        for (const variable of variables) {
            menu.append(createAttachMenuItem({
                iconClasses: variable.iconClasses?.join(' ') ?? 'codicon codicon-symbol-variable',
                label: variable.label ?? variable.name,
                hint: variable.description?.trim(),
                onSelect: () => finish({ kind: 'variable', variable }),
            }));
        }

        document.body.appendChild(menu);
        activeMenu = menu;
        activeAnchor = anchor;
        anchor.setAttribute('aria-expanded', 'true');
        anchor.classList.add('theia-mod-active');

        const onPointerDown = (event: PointerEvent): void => {
            const target = event.target as Node | null;
            if (target && (menu.contains(target) || anchor.contains(target))) {
                return;
            }
            finish(undefined);
        };
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                event.preventDefault();
                finish(undefined);
                anchor.focus();
            }
        };

        const dismiss = (): void => {
            document.removeEventListener('pointerdown', onPointerDown, true);
            document.removeEventListener('keydown', onKeyDown, true);
            menu.remove();
            if (activeMenu === menu) {
                activeMenu = undefined;
            }
            if (activeDismiss === dismiss) {
                activeDismiss = undefined;
            }
            if (activeAnchor === anchor) {
                anchor.setAttribute('aria-expanded', 'false');
                anchor.classList.remove('theia-mod-active');
                activeAnchor = undefined;
            }
        };

        activeDismiss = dismiss;

        requestAnimationFrame(() => {
            positionAttachMenu(menu, anchor);
            document.addEventListener('pointerdown', onPointerDown, true);
            document.addEventListener('keydown', onKeyDown, true);
            menu.focus();
        });
    });
}

async function resolveVariableArguments(
    variable: AIContextVariable,
    variableService: AIVariableService,
    quickInputService: QuickInputService,
): Promise<AIVariableResolutionRequest | undefined> {
    if (!variable.args || variable.args.length === 0) {
        return { variable };
    }

    const argumentPicker = await variableService.getArgumentPicker(variable.name, QUERY_CONTEXT);
    if (!argumentPicker) {
        return useGenericArgumentPicker(variable, quickInputService);
    }
    const arg = await argumentPicker(QUERY_CONTEXT);
    if (!arg) {
        return undefined;
    }
    return { variable, arg };
}

async function useGenericArgumentPicker(
    variable: AIContextVariable,
    quickInputService: QuickInputService,
): Promise<AIVariableResolutionRequest | undefined> {
    const args: string[] = [];
    for (const argument of variable.args ?? []) {
        const placeHolder = argument.description;
        let input: string | undefined;
        if (argument.enum) {
            const picked = await quickInputService.pick(
                argument.enum.map(enumItem => ({ label: enumItem })),
                { placeHolder, canPickMany: false },
            );
            input = picked?.label;
        } else {
            input = await quickInputService.input({ placeHolder });
        }
        if (!input && !argument.isOptional) {
            return undefined;
        }
        args.push(input ?? '');
    }
    return { variable, arg: args.join(PromptText.VARIABLE_SEPARATOR_CHAR) };
}

function filterMobileContextVariables(variables: readonly AIContextVariable[]): AIContextVariable[] {
    return variables.filter(variable => !WORKSPACE_CONTEXT_VARIABLE_NAMES.has(variable.name));
}

async function resolveDeviceAttachSelection(
    selection: MobileContextAttachMenuSelection,
    attachServices: MobileContextAttachServices,
    handlers?: MobileComposerAttachHandlers,
): Promise<AIVariableResolutionRequest[]> {
    try {
        if (selection.kind === 'device-images') {
            const files = await pickFilesFromDevice({ accept: 'image/*', multiple: true });
            if (files.length === 0) {
                return [];
            }
            if (handlers) {
                attachDeviceImagesOptimistic(files, handlers);
                return [];
            }
            return attachDeviceImagesFromPicker();
        }
        const files = await pickFilesFromDevice({ multiple: true });
        if (files.length === 0) {
            return [];
        }
        if (handlers) {
            attachDeviceFilesOptimistic(files, attachServices, handlers);
            return [];
        }
        return attachDeviceFilesFromPicker(attachServices);
    } catch (error) {
        const message = error instanceof Error && error.message
            ? error.message
            : nls.localize(
                'qaap/mobileProjects/stickyComposerAttachDeviceFailed',
                'Could not attach files from this device.',
            );
        MobileSnackbar.show(message, { kind: 'warning', duration: 3200 });
        return [];
    }
}

/** Mobile attach control: device files/images plus context variables in a menu anchored to the button. */
export async function pickMobileContextVariable(
    anchor: HTMLElement,
    variableService: AIVariableService,
    quickInputService: QuickInputService,
    attachServices?: MobileContextAttachServices,
    handlers?: MobileComposerAttachHandlers,
): Promise<AIVariableResolutionRequest[]> {
    const variables = filterMobileContextVariables(variableService.getContextVariables());
    const selected = await showContextAttachMenu(anchor, variables, !!attachServices);
    if (!selected) {
        return [];
    }
    if (selected.kind === 'device-files' || selected.kind === 'device-images') {
        return resolveDeviceAttachSelection(selected, attachServices!, handlers);
    }
    const resolved = await resolveVariableArguments(selected.variable, variableService, quickInputService);
    return resolved ? [resolved] : [];
}
