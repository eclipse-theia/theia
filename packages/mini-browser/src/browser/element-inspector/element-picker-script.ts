// *****************************************************************************
// Copyright (C) 2026 Theia contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ELEMENT_PICKER_MESSAGE_TYPE, ELEMENT_PICKER_CANCEL_TYPE, TRACKED_COMPUTED_STYLES } from './element-inspector-types';

const PICKER_GLOBAL = '__theiaMiniBrowserElementPicker__';
const OVERLAY_ID = 'theia-mini-browser-picker-overlay';
const LABEL_ID = 'theia-mini-browser-picker-label';
const STYLE_ID = 'theia-mini-browser-picker-style';
const TOOLBAR_ID = 'theia-mini-browser-picker-toolbar';

/**
 * Renders the JS source that runs *inside* the iframe to highlight DOM nodes on hover
 * and reports the picked element back to the parent via `postMessage`.
 *
 * The script is self-contained: it can be injected multiple times safely (re-entry guarded
 * via {@link PICKER_GLOBAL}) and is only enabled while a session is active.
 */
export function buildElementPickerScript(): string {
    const trackedStyles = JSON.stringify(TRACKED_COMPUTED_STYLES);
    return `(() => {
    if (window.${PICKER_GLOBAL} && window.${PICKER_GLOBAL}.active) {
        window.${PICKER_GLOBAL}.deactivate();
        return;
    }
    const TRACKED = ${trackedStyles};
    const MESSAGE_TYPE = ${JSON.stringify(ELEMENT_PICKER_MESSAGE_TYPE)};
    const CANCEL_TYPE = ${JSON.stringify(ELEMENT_PICKER_CANCEL_TYPE)};

    const ensureStyle = () => {
        if (document.getElementById(${JSON.stringify(STYLE_ID)})) return;
        const style = document.createElement('style');
        style.id = ${JSON.stringify(STYLE_ID)};
        style.textContent = \`
            #${OVERLAY_ID} {
                position: fixed; pointer-events: none; z-index: 2147483646;
                box-sizing: border-box; transition: top .06s ease, left .06s ease, width .06s ease, height .06s ease;
                background: rgba(64, 160, 255, 0.18); outline: 2px solid #2f8fff; border-radius: 2px;
            }
            #${LABEL_ID} {
                position: fixed; z-index: 2147483646; pointer-events: none;
                font: 11px/1.3 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
                background: #2f8fff; color: #ffffff;
                padding: 2px 6px; border-radius: 3px;
                box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                max-width: 320px; transition: top .06s ease, left .06s ease;
            }
            #${LABEL_ID} .theia-picker-label-tag { font-weight: 600; }
            #${LABEL_ID} .theia-picker-label-id { color: #ffe28a; }
            #${LABEL_ID} .theia-picker-label-cls { color: #c9e4ff; }
            #${LABEL_ID} .theia-picker-label-dim { color: rgba(255, 255, 255, 0.75); margin-left: 8px; font-weight: 400; }
            #${TOOLBAR_ID} {
                position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
                display: flex; align-items: center; gap: 8px;
                padding: 6px 10px; font: 12px/1.4 system-ui, sans-serif;
                background: #1f2329; color: #e8eaed; box-shadow: 0 1px 3px rgba(0,0,0,.35);
                pointer-events: none;
            }
            #${TOOLBAR_ID} kbd { background: #3a3f47; padding: 1px 6px; border-radius: 3px; font-family: inherit; }
        \`;
        document.documentElement.appendChild(style);
    };

    const ensureOverlay = () => {
        let overlay = document.getElementById(${JSON.stringify(OVERLAY_ID)});
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = ${JSON.stringify(OVERLAY_ID)};
            document.documentElement.appendChild(overlay);
        }
        return overlay;
    };

    const ensureLabel = () => {
        let label = document.getElementById(${JSON.stringify(LABEL_ID)});
        if (!label) {
            label = document.createElement('div');
            label.id = ${JSON.stringify(LABEL_ID)};
            document.documentElement.appendChild(label);
        }
        return label;
    };

    const escapeHtml = (s) => String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    const buildLabelHtml = (el, rect) => {
        const tag = (el.tagName || '').toLowerCase();
        const idPart = el.id ? '<span class="theia-picker-label-id">#' + escapeHtml(el.id) + '</span>' : '';
        const classList = Array.from(el.classList || []).slice(0, 2);
        const clsPart = classList.length
            ? '<span class="theia-picker-label-cls">.' + classList.map(escapeHtml).join('.') + '</span>'
            : '';
        const dim = '<span class="theia-picker-label-dim">' + Math.round(rect.width) + ' × ' + Math.round(rect.height) + '</span>';
        return '<span class="theia-picker-label-tag">' + escapeHtml(tag) + '</span>' + idPart + clsPart + dim;
    };

    const positionLabel = (el, rect) => {
        const label = ensureLabel();
        label.innerHTML = buildLabelHtml(el, rect);
        const labelHeight = 20;
        let top = rect.top - labelHeight - 4;
        if (top < 4) {
            top = rect.top + rect.height + 4;
        }
        let left = rect.left;
        const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
        const labelWidth = Math.min(label.offsetWidth || 200, 320);
        if (left + labelWidth > viewportWidth - 4) {
            left = Math.max(4, viewportWidth - labelWidth - 4);
        }
        if (left < 4) left = 4;
        label.style.top = Math.round(top) + 'px';
        label.style.left = Math.round(left) + 'px';
        label.style.display = 'block';
    };

    const ensureToolbar = () => {
        let bar = document.getElementById(${JSON.stringify(TOOLBAR_ID)});
        if (!bar) {
            bar = document.createElement('div');
            bar.id = ${JSON.stringify(TOOLBAR_ID)};
            bar.innerHTML = '<span>Pick an element</span><span style="opacity:.65">— click to capture, <kbd>Esc</kbd> to cancel</span>';
            document.documentElement.appendChild(bar);
        }
        return bar;
    };

    const computeDomPath = (el) => {
        const parts = [];
        let node = el;
        while (node && node.nodeType === 1 && node !== document.documentElement) {
            let part = node.tagName.toLowerCase();
            if (node.id) {
                part += '#' + node.id;
                parts.unshift(part);
                break;
            }
            if (node.classList && node.classList.length) {
                part += '.' + Array.from(node.classList).slice(0, 3).join('.');
            }
            const parent = node.parentElement;
            if (parent) {
                const sameTagSiblings = Array.from(parent.children).filter(c => c.tagName === node.tagName);
                if (sameTagSiblings.length > 1) {
                    part += '[' + sameTagSiblings.indexOf(node) + ']';
                }
            }
            parts.unshift(part);
            node = node.parentElement;
        }
        return 'html > ' + parts.join(' > ');
    };

    const truncate = (s, max) => s.length > max ? s.slice(0, max - 1) + '…' : s;

    const serialize = (el) => {
        const rect = el.getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        const styles = {};
        for (const key of TRACKED) styles[key] = cs.getPropertyValue(key).trim();
        const ancestors = [];
        let a = el.parentElement;
        while (a && ancestors.length < 6) {
            ancestors.push({
                tagName: a.tagName.toLowerCase(),
                id: a.id || undefined,
                classes: Array.from(a.classList || [])
            });
            a = a.parentElement;
        }
        return {
            tagName: el.tagName.toLowerCase(),
            id: el.id || undefined,
            classes: Array.from(el.classList || []),
            attributes: Array.from(el.attributes || []).map(attr => ({ name: attr.name, value: attr.value })),
            textPreview: truncate((el.textContent || '').replace(/\\s+/g, ' ').trim(), 160),
            outerHTML: truncate(el.outerHTML || '', 2000),
            domPath: computeDomPath(el),
            position: { top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height) },
            computedStyles: styles,
            ancestors,
            pageUrl: location.href
        };
    };

    const positionOverlay = (el) => {
        const overlay = ensureOverlay();
        const rect = el.getBoundingClientRect();
        overlay.style.top = rect.top + 'px';
        overlay.style.left = rect.left + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.height = rect.height + 'px';
        overlay.style.display = 'block';
        positionLabel(el, rect);
    };

    const state = { active: false, current: null, deactivate: () => {} };

    const onMove = (e) => {
        const target = e.target;
        if (!target || target.nodeType !== 1) return;
        if (target.id === ${JSON.stringify(OVERLAY_ID)}
            || target.id === ${JSON.stringify(LABEL_ID)}
            || target.id === ${JSON.stringify(TOOLBAR_ID)}) return;
        state.current = target;
        positionOverlay(target);
    };

    const onClick = (e) => {
        if (!state.active) return;
        e.preventDefault();
        e.stopPropagation();
        const target = state.current || e.target;
        if (target && target.nodeType === 1) {
            try {
                const payload = serialize(target);
                window.parent.postMessage({ type: MESSAGE_TYPE, payload }, '*');
            } catch (err) {
                window.parent.postMessage({ type: MESSAGE_TYPE, error: String(err) }, '*');
            }
        }
        state.deactivate();
    };

    const onKey = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            window.parent.postMessage({ type: CANCEL_TYPE }, '*');
            state.deactivate();
        }
    };

    const deactivate = () => {
        if (!state.active) return;
        state.active = false;
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        const overlay = document.getElementById(${JSON.stringify(OVERLAY_ID)});
        if (overlay) overlay.remove();
        const label = document.getElementById(${JSON.stringify(LABEL_ID)});
        if (label) label.remove();
        const bar = document.getElementById(${JSON.stringify(TOOLBAR_ID)});
        if (bar) bar.remove();
        const style = document.getElementById(${JSON.stringify(STYLE_ID)});
        if (style) style.remove();
    };
    state.deactivate = deactivate;

    ensureStyle();
    ensureOverlay();
    ensureLabel();
    ensureToolbar();
    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    state.active = true;
    window.${PICKER_GLOBAL} = state;
})();`;
}
