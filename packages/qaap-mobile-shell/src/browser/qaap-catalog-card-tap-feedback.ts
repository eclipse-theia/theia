// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { MobileHaptics } from './mobile-haptics';

/** Applied on pointerdown; drives the radial light animation in CSS. */
export const QAAP_CATALOG_CARD_TAP_GLOW_CLASS = 'theia-mod-catalog-tap-glow';

const GLOW_ANIMATION_MS = 480;

/**
 * Short haptic pulse + accent glow on catalog cards (account menu, Work Hub workflows).
 * Call once when creating each card button.
 */
export function bindCatalogCardTapFeedback(card: HTMLElement): void {
    let glowTimer: number | undefined;

    const clearGlowTimer = (): void => {
        if (glowTimer !== undefined) {
            window.clearTimeout(glowTimer);
            glowTimer = undefined;
        }
    };

    const scheduleGlowRemoval = (): void => {
        clearGlowTimer();
        glowTimer = window.setTimeout(() => {
            card.classList.remove(QAAP_CATALOG_CARD_TAP_GLOW_CLASS);
            glowTimer = undefined;
        }, GLOW_ANIMATION_MS);
    };

    card.addEventListener('pointerdown', (event: PointerEvent) => {
        if (event.button !== 0) {
            return;
        }
        const rect = card.getBoundingClientRect();
        const x = rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * 100 : 50;
        const y = rect.height > 0 ? ((event.clientY - rect.top) / rect.height) * 100 : 50;
        card.style.setProperty('--qaap-catalog-tap-x', `${x}%`);
        card.style.setProperty('--qaap-catalog-tap-y', `${y}%`);
        card.classList.remove(QAAP_CATALOG_CARD_TAP_GLOW_CLASS);
        void card.offsetWidth;
        card.classList.add(QAAP_CATALOG_CARD_TAP_GLOW_CLASS);
        MobileHaptics.fire(MobileHaptics.LIGHT);
        scheduleGlowRemoval();
    }, { passive: true });

    card.addEventListener('pointerup', scheduleGlowRemoval, { passive: true });
    card.addEventListener('pointercancel', () => {
        clearGlowTimer();
        card.classList.remove(QAAP_CATALOG_CARD_TAP_GLOW_CLASS);
    }, { passive: true });
    card.addEventListener('pointerleave', (event: PointerEvent) => {
        if (event.buttons !== 0) {
            clearGlowTimer();
            card.classList.remove(QAAP_CATALOG_CARD_TAP_GLOW_CLASS);
        }
    }, { passive: true });
}
