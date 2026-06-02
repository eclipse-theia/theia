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
import { QuickInputService } from '@theia/core';

const QUERY_CONTEXT = { type: 'context-variable-picker' };

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

function showContextVariableMenu(
    anchor: HTMLElement,
    variables: readonly AIContextVariable[],
): Promise<AIContextVariable | undefined> {
    if (!variables.length) {
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

        for (const variable of variables) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'theia-mobile-projects-sticky-composer-attach-menu-item';
            item.setAttribute('role', 'menuitem');
            if (variable.iconClasses?.length) {
                const icon = document.createElement('span');
                icon.className = variable.iconClasses.join(' ');
                icon.setAttribute('aria-hidden', 'true');
                const body = document.createElement('span');
                body.className = 'theia-mobile-projects-sticky-composer-attach-menu-item-body';
                const label = document.createElement('span');
                label.className = 'theia-mobile-projects-sticky-composer-attach-menu-item-label';
                label.textContent = variable.label ?? variable.name;
                body.append(label);
                if (variable.description?.trim()) {
                    const hint = document.createElement('span');
                    hint.className = 'theia-mobile-projects-sticky-composer-attach-menu-item-hint';
                    hint.textContent = variable.description.trim();
                    body.append(hint);
                }
                item.append(icon, body);
            } else {
                item.textContent = variable.label ?? variable.name;
            }
            item.addEventListener('click', ev => {
                ev.stopPropagation();
                dismissMobileContextAttachMenu();
                resolve(variable);
            });
            menu.append(item);
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
            dismissMobileContextAttachMenu();
            resolve(undefined);
        };
        const onKeyDown = (event: KeyboardEvent): void => {
            if (event.key === 'Escape') {
                event.preventDefault();
                dismissMobileContextAttachMenu();
                anchor.focus();
                resolve(undefined);
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

/** Mobile attach control: context variables in a menu anchored to the button (not top quick pick). */
export async function pickMobileContextVariable(
    anchor: HTMLElement,
    variableService: AIVariableService,
    quickInputService: QuickInputService,
): Promise<AIVariableResolutionRequest | undefined> {
    const variables = variableService.getContextVariables();
    const selected = await showContextVariableMenu(anchor, variables);
    if (!selected) {
        return undefined;
    }
    return resolveVariableArguments(selected, variableService, quickInputService);
}
