// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { QAAP_APPLICATION_DISPLAY_NAME } from './qaap-application-name';

interface BrandingRule {
    pattern: RegExp;
    replacement: string;
}

const APP = QAAP_APPLICATION_DISPLAY_NAME;

/** Legacy product name → Qaap (e.g. prior `IDE_APPLICATION_NAME=Nova`). */
const LEGACY_NAME_RULES: BrandingRule[] = [
    { pattern: /\bNova\b/g, replacement: APP }
];

/** Per-locale regex replacements for translated / default UI strings. */
const LOCALE_RULES: Record<string, BrandingRule[]> = {
    en: [
        ...LEGACY_NAME_RULES,
        { pattern: /on the machine running Theia\.?/gi, replacement: `on the machine running ${APP}.` },
        { pattern: /running Theia application/gi, replacement: `running ${APP} application window` },
        { pattern: /AI Support in the Theia IDE is available!/g, replacement: `AI Support in ${APP} is available!` },
        { pattern: /in the code editor in the Theia IDE/gi, replacement: `in the code editor in ${APP}` },
        { pattern: /capabilities of Theia IDE/gi, replacement: `capabilities of ${APP}` },
        { pattern: /configure and manage LlamaFile models in Theia IDE/gi,
            replacement: `configure and manage LlamaFile models in ${APP}` },
        { pattern: /in the Theia IDE documentation/gi, replacement: `in the ${APP} documentation` },
        { pattern: /in the Theia IDE\b/g, replacement: `in ${APP}` },
        { pattern: /within the Theia IDE\b/g, replacement: `in ${APP}` },
        { pattern: /in Theia IDE\b/g, replacement: `in ${APP}` },
        { pattern: /Theia IDE/g, replacement: APP },
        { pattern: /\bthis application\b/gi, replacement: APP },
        { pattern: /\bEclipse Theia\b/g, replacement: APP }
    ],
    de: [
        ...LEGACY_NAME_RULES,
        { pattern: /auf dem Rechner gespeichert, auf dem Theia ausgeführt wird/gi,
            replacement: `auf dem Rechner gespeichert, auf dem ${APP} ausgeführt wird` },
        { pattern: /der laufenden Theia-Anwendung/gi, replacement: `des laufenden ${APP}-Fensters` },
        { pattern: /der halben Breite der laufenden Theia-Anwendung/gi,
            replacement: `der halben Breite des laufenden ${APP}-Fensters` },
        { pattern: /AI-Unterstützung in der Theia IDE ist verfügbar!/g, replacement: `KI-Unterstützung in ${APP} ist verfügbar!` },
        { pattern: /in der Theia IDE\b/gi, replacement: `in ${APP}` },
        { pattern: /im Theia IDE\b/gi, replacement: `in ${APP}` },
        { pattern: /Theia IDE/g, replacement: APP },
        { pattern: /\bdiese Anwendung\b/gi, replacement: APP },
        { pattern: /\bEclipse Theia\b/g, replacement: APP }
    ],
    es: [
        ...LEGACY_NAME_RULES,
        { pattern: /en la máquina que ejecuta Theia/gi, replacement: `en la máquina que ejecuta ${APP}` },
        { pattern: /aplicación Theia en ejecución/gi, replacement: `ventana de ${APP} en ejecución` },
        { pattern: /Theia IDE/g, replacement: APP },
        { pattern: /\besta aplicación\b/gi, replacement: APP },
        { pattern: /\bEclipse Theia\b/g, replacement: APP }
    ],
    fr: [
        ...LEGACY_NAME_RULES,
        { pattern: /sur la machine exécutant Theia/gi, replacement: `sur la machine exécutant ${APP}` },
        { pattern: /application Theia en cours/gi, replacement: `fenêtre ${APP} en cours` },
        { pattern: /Theia IDE/g, replacement: APP },
        { pattern: /\bcette application\b/gi, replacement: APP },
        { pattern: /\bEclipse Theia\b/g, replacement: APP }
    ],
    'pt-br': [
        ...LEGACY_NAME_RULES,
        { pattern: /na máquina em que o Theia está em execução/gi,
            replacement: `na máquina em que o ${APP} está em execução` },
        { pattern: /aplicação Theia em execução/gi, replacement: `janela do ${APP} em execução` },
        { pattern: /Theia IDE/g, replacement: APP },
        { pattern: /\besta aplicação\b/gi, replacement: APP },
        { pattern: /\bEclipse Theia\b/g, replacement: APP }
    ],
    it: [
        ...LEGACY_NAME_RULES,
        { pattern: /sulla macchina che esegue Theia/gi, replacement: `sulla macchina che esegue ${APP}` },
        { pattern: /Theia IDE/g, replacement: APP },
        { pattern: /\bquesta applicazione\b/gi, replacement: APP },
        { pattern: /\bEclipse Theia\b/g, replacement: APP }
    ],
    ja: [
        ...LEGACY_NAME_RULES,
        { pattern: /Theia IDE/g, replacement: APP },
        { pattern: /Theia を実行しているマシン/g, replacement: `${APP} を実行しているマシン` },
        { pattern: /\bEclipse Theia\b/g, replacement: APP }
    ],
    ko: [
        ...LEGACY_NAME_RULES,
        { pattern: /Theia IDE/g, replacement: APP },
        { pattern: /Theia를 실행하는 머신/g, replacement: `${APP}를 실행하는 머신` },
        { pattern: /\bEclipse Theia\b/g, replacement: APP }
    ],
    'zh-cn': [
        ...LEGACY_NAME_RULES,
        { pattern: /Theia IDE/g, replacement: APP },
        { pattern: /运行 Theia 的机器/g, replacement: `运行 ${APP} 的机器` },
        { pattern: /\bEclipse Theia\b/g, replacement: APP }
    ],
    'zh-tw': [
        ...LEGACY_NAME_RULES,
        { pattern: /Theia IDE/g, replacement: APP },
        { pattern: /執行 Theia 的機器/g, replacement: `執行 ${APP} 的機器` },
        { pattern: /\bEclipse Theia\b/g, replacement: APP }
    ],
    ru: [
        ...LEGACY_NAME_RULES,
        { pattern: /Theia IDE/g, replacement: APP },
        { pattern: /компьютере, на котором запущен Theia/gi, replacement: `компьютере, на котором запущен ${APP}` },
        { pattern: /\bEclipse Theia\b/g, replacement: APP }
    ],
    tr: [
        ...LEGACY_NAME_RULES,
        { pattern: /Theia IDE/g, replacement: APP },
        { pattern: /\bEclipse Theia\b/g, replacement: APP }
    ],
    pl: [
        ...LEGACY_NAME_RULES,
        { pattern: /Theia IDE/g, replacement: APP },
        { pattern: /maszynie uruchomionym Theia/gi, replacement: `maszynie uruchomionej ${APP}` },
        { pattern: /\bEclipse Theia\b/g, replacement: APP }
    ],
    cs: [
        ...LEGACY_NAME_RULES,
        { pattern: /Theia IDE/g, replacement: APP },
        { pattern: /\bEclipse Theia\b/g, replacement: APP }
    ],
    hu: [
        ...LEGACY_NAME_RULES,
        { pattern: /Theia IDE/g, replacement: APP },
        { pattern: /\bEclipse Theia\b/g, replacement: APP }
    ]
};

const DEFAULT_RULES: BrandingRule[] = [
    ...LEGACY_NAME_RULES,
    { pattern: /on the machine running Theia\.?/gi, replacement: `on the machine running ${APP}.` },
    { pattern: /Theia IDE/g, replacement: APP },
    { pattern: /\bthis application\b/gi, replacement: APP },
    { pattern: /\bEclipse Theia\b/g, replacement: APP }
];

export function applyQaapBrandingToText(text: string, languageId: string): string {
    const rules = LOCALE_RULES[languageId] ?? DEFAULT_RULES;
    let result = text;
    for (const { pattern, replacement } of rules) {
        result = result.replace(pattern, replacement);
    }
    return result;
}
