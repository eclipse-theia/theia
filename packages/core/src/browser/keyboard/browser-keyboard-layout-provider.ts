// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import { injectable, postConstruct, inject, named } from 'inversify';
import { isOSX } from '../../common/os';
import { Emitter, Event } from '../../common/event';
import { ILogger } from '../../common/logger';
import { Deferred } from '../../common/promise-util';
import {
    NativeKeyboardLayout, KeyboardLayoutProvider, KeyboardLayoutChangeNotifier, KeyValidator, KeyValidationInput, KeyboardLayoutSource
} from '../../common/keyboard/keyboard-layout-provider';
import { LocalStorageService } from '../storage-service';
import enUSPc from '../../common/keyboard/layouts/en-US-pc.json' with { type: 'json' };
import enUSMac from '../../common/keyboard/layouts/en-US-mac.json' with { type: 'json' };
import enDvorakPc from '../../common/keyboard/layouts/en-Dvorak-pc.json' with { type: 'json' };
import enDvorakMac from '../../common/keyboard/layouts/en-Dvorak-mac.json' with { type: 'json' };
import enDvorakLefthandedPc from '../../common/keyboard/layouts/en-Dvorak_Lefthanded-pc.json' with { type: 'json' };
import enDvorakLefthandedMac from '../../common/keyboard/layouts/en-Dvorak_Lefthanded-mac.json' with { type: 'json' };
import enDvorakRighthandedPc from '../../common/keyboard/layouts/en-Dvorak_Righthanded-pc.json' with { type: 'json' };
import enDvorakRighthandedMac from '../../common/keyboard/layouts/en-Dvorak_Righthanded-mac.json' with { type: 'json' };
import enColemakMac from '../../common/keyboard/layouts/en-Colemak-mac.json' with { type: 'json' };
import enBritishPc from '../../common/keyboard/layouts/en-British-pc.json' with { type: 'json' };
import enBritishMac from '../../common/keyboard/layouts/en-British-mac.json' with { type: 'json' };
import deGermanPc from '../../common/keyboard/layouts/de-German-pc.json' with { type: 'json' };
import deGermanMac from '../../common/keyboard/layouts/de-German-mac.json' with { type: 'json' };
import deSwissGermanPc from '../../common/keyboard/layouts/de-Swiss_German-pc.json' with { type: 'json' };
import deSwissGermanMac from '../../common/keyboard/layouts/de-Swiss_German-mac.json' with { type: 'json' };
import frFrenchPc from '../../common/keyboard/layouts/fr-French-pc.json' with { type: 'json' };
import frFrenchMac from '../../common/keyboard/layouts/fr-French-mac.json' with { type: 'json' };
import frCanadianFrenchPc from '../../common/keyboard/layouts/fr-Canadian_French-pc.json' with { type: 'json' };
import frCanadianFrenchMac from '../../common/keyboard/layouts/fr-Canadian_French-mac.json' with { type: 'json' };
import frSwissFrenchPc from '../../common/keyboard/layouts/fr-Swiss_French-pc.json' with { type: 'json' };
import frSwissFrenchMac from '../../common/keyboard/layouts/fr-Swiss_French-mac.json' with { type: 'json' };
import frBepoPc from '../../common/keyboard/layouts/fr-Bepo-pc.json' with { type: 'json' };
import ptPortuguesePc from '../../common/keyboard/layouts/pt-Portuguese-pc.json' with { type: 'json' };
import ptPortugueseMac from '../../common/keyboard/layouts/pt-Portuguese-mac.json' with { type: 'json' };
import ptBrazilianMac from '../../common/keyboard/layouts/pt-Brazilian-mac.json' with { type: 'json' };
import plPolishPc from '../../common/keyboard/layouts/pl-Polish-pc.json' with { type: 'json' };
import plPolishMac from '../../common/keyboard/layouts/pl-Polish-mac.json' with { type: 'json' };
import nlDutchPc from '../../common/keyboard/layouts/nl-Dutch-pc.json' with { type: 'json' };
import nlDutchMac from '../../common/keyboard/layouts/nl-Dutch-mac.json' with { type: 'json' };
import esSpanishPc from '../../common/keyboard/layouts/es-Spanish-pc.json' with { type: 'json' };
import esSpanishMac from '../../common/keyboard/layouts/es-Spanish-mac.json' with { type: 'json' };
import itItalianPc from '../../common/keyboard/layouts/it-Italian-pc.json' with { type: 'json' };
import itItalianMac from '../../common/keyboard/layouts/it-Italian-mac.json' with { type: 'json' };
import svSwedishPc from '../../common/keyboard/layouts/sv-Swedish-pc.json' with { type: 'json' };
import svSwedishMac from '../../common/keyboard/layouts/sv-Swedish-mac.json' with { type: 'json' };
import trTurkishQPc from '../../common/keyboard/layouts/tr-Turkish_Q-pc.json' with { type: 'json' };
import trTurkishQMac from '../../common/keyboard/layouts/tr-Turkish_Q-mac.json' with { type: 'json' };
import csCzechPc from '../../common/keyboard/layouts/cs-Czech-pc.json' with { type: 'json' };
import csCzechMac from '../../common/keyboard/layouts/cs-Czech-mac.json' with { type: 'json' };
import roRomanianPc from '../../common/keyboard/layouts/ro-Romanian-pc.json' with { type: 'json' };
import roRomanianMac from '../../common/keyboard/layouts/ro-Romanian-mac.json' with { type: 'json' };
import daDanishPc from '../../common/keyboard/layouts/da-Danish-pc.json' with { type: 'json' };
import daDanishMac from '../../common/keyboard/layouts/da-Danish-mac.json' with { type: 'json' };
import nbNorwegianPc from '../../common/keyboard/layouts/nb-Norwegian-pc.json' with { type: 'json' };
import nbNorwegianMac from '../../common/keyboard/layouts/nb-Norwegian-mac.json' with { type: 'json' };
import huHungarianPc from '../../common/keyboard/layouts/hu-Hungarian-pc.json' with { type: 'json' };
import huHungarianMac from '../../common/keyboard/layouts/hu-Hungarian-mac.json' with { type: 'json' };

export type { KeyboardLayoutSource } from '../../common/keyboard/keyboard-layout-provider';

@injectable()
export class BrowserKeyboardLayoutProvider implements KeyboardLayoutProvider, KeyboardLayoutChangeNotifier, KeyValidator {

    @inject(ILogger) @named('core:BrowserKeyboardLayoutProvider')
    protected readonly logger: ILogger;

    @inject(LocalStorageService)
    protected readonly storageService: LocalStorageService;

    protected readonly initialized = new Deferred();
    protected readonly nativeLayoutChanged = new Emitter<NativeKeyboardLayout>();

    get onDidChangeNativeLayout(): Event<NativeKeyboardLayout> {
        return this.nativeLayoutChanged.event;
    }

    protected readonly tester = new KeyboardTester(loadAllLayouts());
    protected source: KeyboardLayoutSource = 'pressed-keys';
    protected currentLayout: KeyboardLayoutData = DEFAULT_LAYOUT_DATA;

    get allLayoutData(): KeyboardLayoutData[] {
        return this.tester.candidates.slice();
    }

    get currentLayoutData(): KeyboardLayoutData {
        return this.currentLayout;
    }

    get layoutSource(): KeyboardLayoutSource {
        return this.source;
    }

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        await this.loadState();
        const keyboard = (navigator as NavigatorExtension).keyboard;
        if (keyboard && keyboard.addEventListener) {
            keyboard.addEventListener('layoutchange', async () => {
                const newLayout = await this.getNativeLayout();
                this.nativeLayoutChanged.fire(newLayout);
            });
        }
        this.initialized.resolve();
    }

    async getNativeLayout(): Promise<NativeKeyboardLayout> {
        await this.initialized.promise;
        if (this.source === 'user-choice') {
            return this.currentLayout.raw;
        }
        const [layout, source] = await this.autodetect();
        this.setCurrent(layout, source);
        return layout.raw;
    }

    /**
     * Set user-chosen keyboard layout data.
     */
    async setLayoutData(layout: KeyboardLayoutData | 'autodetect'): Promise<KeyboardLayoutData> {
        if (layout === 'autodetect') {
            if (this.source === 'user-choice') {
                const [newLayout, source] = await this.autodetect();
                this.setCurrent(newLayout, source);
                this.nativeLayoutChanged.fire(newLayout.raw);
                return newLayout;
            }
            return this.currentLayout;
        } else {
            if (this.source !== 'user-choice' || layout !== this.currentLayout) {
                this.setCurrent(layout, 'user-choice');
                this.nativeLayoutChanged.fire(layout.raw);
            }
            return layout;
        }
    }

    /**
     * Test all known keyboard layouts with the given combination of pressed key and
     * produced character. Matching layouts have their score increased (see class
     * KeyboardTester). If this leads to a change of the top-scoring layout, a layout
     * change event is fired.
     */
    validateKey(keyCode: KeyValidationInput): void {
        if (this.source !== 'pressed-keys') {
            return;
        }
        const accepted = this.tester.updateScores(keyCode);
        if (!accepted) {
            return;
        }
        const layout = this.selectLayout();
        if (layout !== this.currentLayout && layout !== DEFAULT_LAYOUT_DATA) {
            this.setCurrent(layout, 'pressed-keys');
            this.nativeLayoutChanged.fire(layout.raw);
        }
    }

    protected setCurrent(layout: KeyboardLayoutData, source: KeyboardLayoutSource): void {
        this.currentLayout = layout;
        this.source = source;
        this.saveState();
        if (this.tester.inputCount && (source === 'pressed-keys' || source === 'navigator.keyboard')) {
            const from = source === 'pressed-keys' ? 'pressed keys' : 'browser API';
            const hardware = layout.hardware === 'mac' ? 'Mac' : 'PC';
            this.logger.info(`Detected keyboard layout from ${from}: ${layout.name} (${hardware})`);
        }
    }

    protected async autodetect(): Promise<[KeyboardLayoutData, KeyboardLayoutSource]> {
        const keyboard = (navigator as NavigatorExtension).keyboard;
        if (keyboard && keyboard.getLayoutMap) {
            try {
                const layoutMap = await keyboard.getLayoutMap();
                this.testLayoutMap(layoutMap);
                return [this.selectLayout(), 'navigator.keyboard'];
            } catch (error) {
                this.logger.warn('Failed to obtain keyboard layout map.', error);
            }
        }
        return [this.selectLayout(), 'pressed-keys'];
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
        if (matchingOScount >= 1) {
            return candidates.find((c, i) => scores[i] === topScore && osMatches(c.hardware))!;
        }
        if (topScoringCount >= 1) {
            return candidates.find((_, i) => scores[i] === topScore)!;
        }
        return DEFAULT_LAYOUT_DATA;
    }

    protected saveState(): Promise<void> {
        const data: LayoutProviderState = {
            tester: this.tester.getState(),
            source: this.source,
            currentLayout: this.currentLayout !== DEFAULT_LAYOUT_DATA ? getLayoutId(this.currentLayout) : undefined
        };
        return this.storageService.setData('keyboard', data);
    }

    protected async loadState(): Promise<void> {
        const data = await this.storageService.getData<LayoutProviderState>('keyboard');
        if (data) {
            this.tester.setState(data.tester || {});
            this.source = data.source || 'pressed-keys';
            if (data.currentLayout) {
                const layout = this.tester.candidates.find(c => getLayoutId(c) === data.currentLayout);
                if (layout) {
                    this.currentLayout = layout;
                }
            } else {
                this.currentLayout = DEFAULT_LAYOUT_DATA;
            }
        }
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        info: {} as any,
        mapping: {}
    }
};

export interface LayoutProviderState {
    tester?: KeyboardTesterState;
    source?: KeyboardLayoutSource;
    currentLayout?: string;
}

export interface KeyboardTesterState {
    scores?: { [id: string]: number };
    topScore?: number;
    testedInputs?: { [key: string]: string }
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

    get inputCount(): number {
        return this.testedInputs.size;
    }

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

    updateScores(input: KeyValidationInput): boolean {
        let property: 'value' | 'withShift' | 'withAltGr' | 'withShiftAltGr';
        if (input.shiftKey && input.altGraph) {
            property = 'withShiftAltGr';
        } else if (input.shiftKey) {
            property = 'withShift';
        } else if (input.altGraph) {
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

    protected testCandidate(candidate: KeyboardLayoutData, input: KeyValidationInput,
        property: 'value' | 'withShift' | 'withAltGr' | 'withShiftAltGr'): number {
        const keyMapping = candidate.raw.mapping[input.code];
        if (keyMapping && keyMapping[property]) {
            return keyMapping[property] === input.character ? 1 : 0;
        } else {
            return 0;
        }
    }

    getState(): KeyboardTesterState {
        const scores: { [id: string]: number } = {};
        for (let i = 0; i < this.scores.length; i++) {
            scores[getLayoutId(this.candidates[i])] = this.scores[i];
        }
        const testedInputs: { [key: string]: string } = {};
        for (const [key, character] of this.testedInputs.entries()) {
            testedInputs[key] = character;
        }
        return {
            scores,
            topScore: this.topScore,
            testedInputs
        };
    }

    setState(state: KeyboardTesterState): void {
        this.reset();
        if (state.scores) {
            const layoutIds = this.candidates.map(getLayoutId);
            for (const id in state.scores) {
                if (state.scores.hasOwnProperty(id)) {
                    const index = layoutIds.indexOf(id);
                    if (index > 0) {
                        this.scores[index] = state.scores[id];
                    }
                }
            }
        }
        if (state.topScore) {
            this.topScore = state.topScore;
        }
        if (state.testedInputs) {
            for (const key in state.testedInputs) {
                if (state.testedInputs.hasOwnProperty(key)) {
                    this.testedInputs.set(key, state.testedInputs[key]);
                }
            }
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

function getLayoutId(layout: KeyboardLayoutData): string {
    return `${layout.language}-${layout.name.replace(' ', '_')}-${layout.hardware}`;
}

/**
 * Keyboard layout files are expected to have the following name scheme:
 *     `language-name-hardware.json`
 *
 * - `language`: A language subtag according to IETF BCP 47
 * - `name`:     Display name of the keyboard layout (without dashes)
 * - `hardware`: `pc` or `mac`
 */
function loadLayout(fileName: string, raw: object): KeyboardLayoutData {
    const [language, name, hardware] = fileName.split('-');
    return {
        name: name.replace('_', ' '),
        hardware: hardware as 'pc' | 'mac',
        language,
        raw: raw as KeyboardLayoutData['raw']
    };
}

function loadAllLayouts(): KeyboardLayoutData[] {
    // The order of keyboard layouts is relevant for autodetection. Layouts with
    // lower index have a higher chance of being selected.
    // The current ordering approach is to sort by estimated number of developers
    // in the respective country (taken from the Stack Overflow Developer Survey),
    // but keeping all layouts of the same language together.
    return [
        loadLayout('en-US-pc', enUSPc),
        loadLayout('en-US-mac', enUSMac),
        loadLayout('en-Dvorak-pc', enDvorakPc),
        loadLayout('en-Dvorak-mac', enDvorakMac),
        loadLayout('en-Dvorak_Lefthanded-pc', enDvorakLefthandedPc),
        loadLayout('en-Dvorak_Lefthanded-mac', enDvorakLefthandedMac),
        loadLayout('en-Dvorak_Righthanded-pc', enDvorakRighthandedPc),
        loadLayout('en-Dvorak_Righthanded-mac', enDvorakRighthandedMac),
        loadLayout('en-Colemak-mac', enColemakMac),
        loadLayout('en-British-pc', enBritishPc),
        loadLayout('en-British-mac', enBritishMac),
        loadLayout('de-German-pc', deGermanPc),
        loadLayout('de-German-mac', deGermanMac),
        loadLayout('de-Swiss_German-pc', deSwissGermanPc),
        loadLayout('de-Swiss_German-mac', deSwissGermanMac),
        loadLayout('fr-French-pc', frFrenchPc),
        loadLayout('fr-French-mac', frFrenchMac),
        loadLayout('fr-Canadian_French-pc', frCanadianFrenchPc),
        loadLayout('fr-Canadian_French-mac', frCanadianFrenchMac),
        loadLayout('fr-Swiss_French-pc', frSwissFrenchPc),
        loadLayout('fr-Swiss_French-mac', frSwissFrenchMac),
        loadLayout('fr-Bepo-pc', frBepoPc),
        loadLayout('pt-Portuguese-pc', ptPortuguesePc),
        loadLayout('pt-Portuguese-mac', ptPortugueseMac),
        loadLayout('pt-Brazilian-mac', ptBrazilianMac),
        loadLayout('pl-Polish-pc', plPolishPc),
        loadLayout('pl-Polish-mac', plPolishMac),
        loadLayout('nl-Dutch-pc', nlDutchPc),
        loadLayout('nl-Dutch-mac', nlDutchMac),
        loadLayout('es-Spanish-pc', esSpanishPc),
        loadLayout('es-Spanish-mac', esSpanishMac),
        loadLayout('it-Italian-pc', itItalianPc),
        loadLayout('it-Italian-mac', itItalianMac),
        loadLayout('sv-Swedish-pc', svSwedishPc),
        loadLayout('sv-Swedish-mac', svSwedishMac),
        loadLayout('tr-Turkish_Q-pc', trTurkishQPc),
        loadLayout('tr-Turkish_Q-mac', trTurkishQMac),
        loadLayout('cs-Czech-pc', csCzechPc),
        loadLayout('cs-Czech-mac', csCzechMac),
        loadLayout('ro-Romanian-pc', roRomanianPc),
        loadLayout('ro-Romanian-mac', roRomanianMac),
        loadLayout('da-Danish-pc', daDanishPc),
        loadLayout('da-Danish-mac', daDanishMac),
        loadLayout('nb-Norwegian-pc', nbNorwegianPc),
        loadLayout('nb-Norwegian-mac', nbNorwegianMac),
        loadLayout('hu-Hungarian-pc', huHungarianPc),
        loadLayout('hu-Hungarian-mac', huHungarianMac)
    ];
}
