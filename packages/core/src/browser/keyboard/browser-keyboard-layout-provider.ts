/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, postConstruct, inject } from 'inversify';
import { IKeyboardLayoutInfo } from 'native-keymap';
import { isOSX } from '../../common/os';
import { Emitter } from '../../common/event';
import { ILogger } from '../../common/logger';
import { NativeKeyboardLayout, KeyboardLayoutProvider, KeyboardLayoutChangeNotifier } from '../../common/keyboard/keyboard-layout-provider';
import { KeyCode } from './keys';

export type KeyboardLayoutSource = 'navigator.keyboard' | 'none';

@injectable()
export class BrowserKeyboardLayoutProvider implements KeyboardLayoutProvider, KeyboardLayoutChangeNotifier {

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected readonly nativeLayoutChanged = new Emitter<NativeKeyboardLayout>();

    get onDidChangeNativeLayout() {
        return this.nativeLayoutChanged.event;
    }

    protected readonly tester = new KeyboardTester(loadAllLayouts());
    protected source: KeyboardLayoutSource = 'none';
    protected lastSelected?: KeyboardLayoutData;

    @postConstruct()
    protected initialize(): void {
        const keyboard = (navigator as NavigatorExtension).keyboard;
        if (keyboard && keyboard.addEventListener) {
            keyboard.addEventListener('layoutchange', async () => {
                const newLayout = await this.getNativeLayout();
                this.nativeLayoutChanged.fire(newLayout);
            });
        }
    }

    async getNativeLayout(): Promise<NativeKeyboardLayout> {
        const keyboard = (navigator as NavigatorExtension).keyboard;
        if (keyboard && keyboard.getLayoutMap) {
            try {
                const layoutMap = await keyboard.getLayoutMap();
                this.source = 'navigator.keyboard';
                this.testLayoutMap(layoutMap);
            } catch (error) {
                this.logger.warn('Failed to obtain keyboard layout map.', error);
            }
        }
        const layout = this.selectLayout();
        this.setSelected(layout);
        return layout.raw;
    }

    /**
     * Test all known keyboard layouts with the given KeyCode. Layouts that match the
     * combination of key and produced character have their score increased (see class
     * KeyboardTester). If this leads to a change of the top-scoring layout, a layout
     * change event is fired.
     */
    validateKeyCode(keyCode: KeyCode): void {
        if (!keyCode.key || !keyCode.character || this.source !== 'none') {
            return;
        }
        const accepted = this.tester.updateScores({
            code: keyCode.key.code,
            character: keyCode.character,
            shiftKey: keyCode.shift,
            ctrlKey: keyCode.ctrl,
            altKey: keyCode.alt
        });
        if (!accepted) {
            return;
        }
        const layout = this.selectLayout();
        if (this.lastSelected === undefined || layout !== this.lastSelected && layout !== DEFAULT_LAYOUT_DATA) {
            this.setSelected(layout);
            this.nativeLayoutChanged.fire(layout.raw);
        }
    }

    protected setSelected(layout: KeyboardLayoutData): void {
        this.lastSelected = layout;
        this.logger.info(`Detected keyboard layout: ${layout.name}`);
    }

    /**
     * @param layoutMap a keyboard layout map according to https://wicg.github.io/keyboard-map/
     */
    protected testLayoutMap(layoutMap: KeyboardLayoutMap): void {
        this.tester.reset();
        for (const [code, key] of layoutMap.entries()) {
            this.tester.updateScores({ code, character: key });
        }
    }

    /**
     * Select a layout based on the current tester state and the operating system
     * and language detected from the browser.
     */
    protected selectLayout(): KeyboardLayoutData {
        const candidates = this.tester.candidates;
        const scores = this.tester.scores;
        const topScore = this.tester.topScore;
        const language = navigator.language;
        let matchingOScount = 0;
        let topScoringCount = 0;
        for (let i = 0; i < candidates.length; i++) {
            if (scores[i] === topScore) {
                const candidate = candidates[i];
                if (osMatches(candidate.hardware)) {
                    if (language && language.startsWith(candidate.language)) {
                        return candidate;
                    }
                    matchingOScount++;
                }
                topScoringCount++;
            }
        }
        if (topScoringCount === 1) {
            return candidates.find((_, i) => scores[i] === topScore)!;
        }
        if (matchingOScount === 1) {
            return candidates.find((c, i) => scores[i] === topScore && osMatches(c.hardware))!;
        }
        return DEFAULT_LAYOUT_DATA;
    }

}

export interface KeyboardLayoutData {
    name: string;
    hardware: 'pc' | 'mac';
    language: string;
    raw: NativeKeyboardLayout;
}

function osMatches(hardware: 'pc' | 'mac'): boolean {
    return isOSX ? hardware === 'mac' : hardware === 'pc';
}

/**
 * This is the fallback keyboard layout selected when nothing else matches.
 * It has an empty mapping, so user inputs are handled like with a standard US keyboard.
 */
export const DEFAULT_LAYOUT_DATA: KeyboardLayoutData = {
    name: 'US',
    hardware: isOSX ? 'mac' : 'pc',
    language: 'en',
    raw: {
        info: {} as IKeyboardLayoutInfo,
        mapping: {}
    }
};

export interface KeyboardTestInput {
    code: string;
    character: string;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    altKey?: boolean;
}

/**
 * Holds score values for all known keyboard layouts. Scores are updated
 * by comparing key codes with the corresponding character produced by
 * the user's keyboard.
 */
export class KeyboardTester {

    readonly scores: number[];
    topScore: number = 0;

    private readonly testedInputs = new Map<string, string>();

    constructor(readonly candidates: KeyboardLayoutData[]) {
        this.scores = this.candidates.map(() => 0);
    }

    reset(): void {
        for (let i = 0; i < this.scores.length; i++) {
            this.scores[i] = 0;
        }
        this.topScore = 0;
        this.testedInputs.clear();
    }

    updateScores(input: KeyboardTestInput): boolean {
        let property: 'value' | 'withShift' | 'withAltGr' | 'withShiftAltGr';
        if (input.shiftKey && input.altKey) {
            property = 'withShiftAltGr';
        } else if (input.shiftKey) {
            property = 'withShift';
        } else if (input.altKey) {
            property = 'withAltGr';
        } else {
            property = 'value';
        }
        const inputKey = `${input.code}.${property}`;
        if (this.testedInputs.has(inputKey)) {
            if (this.testedInputs.get(inputKey) === input.character) {
                return false;
            } else {
                // The same input keystroke leads to a different character:
                // probably a keyboard layout change, so forget all previous scores
                this.reset();
            }
        }

        const scores = this.scores;
        for (let i = 0; i < this.candidates.length; i++) {
            scores[i] += this.testCandidate(this.candidates[i], input, property);
            if (scores[i] > this.topScore) {
                this.topScore = scores[i];
            }
        }
        this.testedInputs.set(inputKey, input.character);
        return true;
    }

    protected testCandidate(candidate: KeyboardLayoutData, input: KeyboardTestInput,
        property: 'value' | 'withShift' | 'withAltGr' | 'withShiftAltGr'): number {
        const keyMapping = candidate.raw.mapping[input.code];
        if (keyMapping && keyMapping[property]) {
            return keyMapping[property] === input.character ? 1 : 0;
        } else {
            return 0;
        }
    }

}

/**
 * API specified by https://wicg.github.io/keyboard-map/
 */
interface NavigatorExtension extends Navigator {
    keyboard: Keyboard;
}

interface Keyboard {
    getLayoutMap(): Promise<KeyboardLayoutMap>;
    addEventListener(type: 'layoutchange', listener: EventListenerOrEventListenerObject): void;
}

type KeyboardLayoutMap = Map<string, string>;

function loadLayout(fileName: string): KeyboardLayoutData {
    const [language, name, hardware] = fileName.split('-');
    return {
        name: `${name} (${hardware === 'mac' ? 'Mac' : 'PC'})`,
        hardware: hardware as 'pc' | 'mac',
        language,
        raw: require('../../../src/common/keyboard/layouts/' + fileName + '.json')
    };
}

function loadAllLayouts(): KeyboardLayoutData[] {
    return [
        'de-German-pc',
        'de-German-mac',
        'en-US-pc',
        'en-US-mac',
        'fr-French-pc',
        'fr-French-mac'
    ].map(loadLayout);
}
