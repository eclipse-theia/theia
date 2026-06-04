// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** VS Code / Cursor Changes tab glyph (rounded square, + above −). */
export const QAAP_SCM_CHANGES_ICON_CLASS = 'qaap-icon-scm-changes';

/** Cursor/VS Code product icon (minus, plus, frame). */
export const QAAP_SCM_CHANGES_SVG_MARKUP = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" aria-hidden="true">'
    + '<path d="M9.86328 9.72363C10.2081 9.72406 10.4883 10.0037 10.4883 10.3486C10.4881 10.6934 10.208 10.9732 9.86328 10.9736H6.19629C5.85121 10.9736 5.57145 10.6937 5.57129 10.3486C5.57129 10.0035 5.85111 9.72363 6.19629 9.72363H9.86328Z" fill="currentColor"></path>'
    + '<path d="M8.0293 4.22363C8.37426 4.22388 8.6543 4.50361 8.6543 4.84863V6.05664H9.86328C10.208 6.05706 10.4881 6.33687 10.4883 6.68164C10.4881 7.02642 10.208 7.30622 9.86328 7.30664H8.6543V8.51562C8.65396 8.86036 8.37405 9.14038 8.0293 9.14062C7.68448 9.14045 7.40464 8.8604 7.4043 8.51562V7.30664H6.19629C5.85121 7.30664 5.57145 7.02668 5.57129 6.68164C5.57147 6.33661 5.85122 6.05664 6.19629 6.05664H7.4043V4.84863C7.4043 4.50356 7.68427 4.22381 8.0293 4.22363Z" fill="currentColor"></path>'
    + '<path d="M12.1963 1.55664C13.2776 1.55688 14.1541 2.4334 14.1543 3.51465V11.8486C14.1541 12.9299 13.2776 13.8064 12.1963 13.8066H3.8623C2.78101 13.8065 1.90447 12.93 1.9043 11.8486V3.51465C1.90447 2.43335 2.781 1.55682 3.8623 1.55664H12.1963ZM3.8623 2.80664C3.47136 2.80682 3.15447 3.1237 3.1543 3.51465V11.8486C3.15447 12.2396 3.47135 12.5565 3.8623 12.5566H12.1963C12.5872 12.5564 12.9041 12.2396 12.9043 11.8486V3.51465C12.9041 3.12374 12.5872 2.80688 12.1963 2.80664H3.8623Z" fill="currentColor"></path>'
    + '</svg>';

export function isQaapScmChangesIcon(icon: string): boolean {
    return icon === QAAP_SCM_CHANGES_ICON_CLASS;
}

export function createExecutionSurfaceIconElement(icon: string, baseClassName: string): HTMLSpanElement {
    if (isQaapScmChangesIcon(icon)) {
        return createQaapScmChangesIconElement(baseClassName);
    }
    const glyph = document.createElement('span');
    glyph.className = baseClassName ? `${baseClassName} codicon ${icon}` : `codicon ${icon}`;
    glyph.setAttribute('aria-hidden', 'true');
    return glyph;
}

function createQaapScmChangesIconElement(baseClassName: string): HTMLSpanElement {
    const icon = document.createElement('span');
    icon.className = baseClassName ? `${baseClassName} ${QAAP_SCM_CHANGES_ICON_CLASS}` : QAAP_SCM_CHANGES_ICON_CLASS;
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = QAAP_SCM_CHANGES_SVG_MARKUP;
    return icon;
}

export function appendExecutionSurfaceTabIcon(parent: HTMLElement, icon: string, baseClassName: string): void {
    parent.append(createExecutionSurfaceIconElement(icon, baseClassName));
}
