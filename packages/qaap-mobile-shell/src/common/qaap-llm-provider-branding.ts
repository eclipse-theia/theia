// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentBrandTone } from './qaap-agent-branding';
import { LLM_PROVIDER_ICON_DATA_URLS } from './qaap-llm-provider-icon-assets';

export interface QaapLlmProviderBrand {
    readonly id: string;
    readonly label: string;
    readonly tone: QaapAgentBrandTone;
    readonly svg?: string;
    readonly imageUrl?: string;
    /** When set, the picker swaps light/dark PNGs with the active UI theme. */
    readonly imageUrlLight?: string;
    readonly imageUrlDark?: string;
}

let svgInstanceCounter = 0;

function uniquifySvgIds(svg: string): string {
    const suffix = String(++svgInstanceCounter);
    return svg
        .replace(/\bid="([^"]+)"/g, `id="$1-${suffix}"`)
        .replace(/url\(#([^)]+)\)/g, `url(#$1-${suffix})`)
        .replace(/xlink:href="#([^"]+)"/g, `xlink:href="#$1-${suffix}"`);
}

function monogramBrand(id: string, label: string, letter: string, bg: string, fg = '#fff'): QaapLlmProviderBrand {
    return {
        id,
        label,
        tone: 'brand',
        svg: `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true"><rect width="24" height="24" rx="6" fill="${bg}"/><text x="12" y="16.5" text-anchor="middle" fill="${fg}" font-size="11" font-weight="700" font-family="system-ui,-apple-system,sans-serif">${letter}</text></svg>`,
    };
}

function pngBrand(
    id: string,
    label: string,
    tone: QaapAgentBrandTone,
    assetKey: string = id,
): QaapLlmProviderBrand {
    const imageUrl = LLM_PROVIDER_ICON_DATA_URLS[assetKey];
    if (imageUrl) {
        return { id, label, tone, imageUrl };
    }
    return monogramBrand(id, label, label.slice(0, 2).toUpperCase(), '#374151');
}

function themeAdaptivePngBrand(
    id: string,
    label: string,
    lightAssetKey: string,
    darkAssetKey: string,
): QaapLlmProviderBrand {
    const imageUrlLight = LLM_PROVIDER_ICON_DATA_URLS[lightAssetKey];
    const imageUrlDark = LLM_PROVIDER_ICON_DATA_URLS[darkAssetKey];
    if (imageUrlLight && imageUrlDark) {
        return { id, label, tone: 'brand', imageUrlLight, imageUrlDark };
    }
    return pngBrand(id, label, 'brand', lightAssetKey);
}

const SVG_QWEN = `<svg fill="currentColor" fill-rule="evenodd" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true"><path d="M12.604 1.34c.393.69.784 1.382 1.174 2.075a.18.18 0 00.157.091h5.552c.174 0 .322.11.446.327l1.454 2.57c.19.337.24.478.024.837-.26.43-.513.864-.76 1.3l-.367.658c-.106.196-.223.28-.04.512l2.652 4.637c.172.301.111.494-.043.77-.437.785-.882 1.564-1.335 2.34-.159.272-.352.375-.68.37-.777-.016-1.552-.01-2.327.016a.099.099 0 00-.081.05 575.097 575.097 0 01-2.705 4.74c-.169.293-.38.363-.725.364-.997.003-2.002.004-3.017.002a.537.537 0 01-.465-.271l-1.335-2.323a.09.09 0 00-.083-.049H4.982c-.285.03-.553-.001-.805-.092l-1.603-2.77a.543.543 0 01-.002-.54l1.207-2.12a.198.198 0 000-.197 550.951 550.951 0 01-1.875-3.272l-.79-1.395c-.16-.31-.173-.496.095-.965.465-.813.927-1.625 1.387-2.436.132-.234.304-.334.584-.335a338.3 338.3 0 012.589-.001.124.124 0 00.107-.063l2.806-4.895a.488.488 0 01.422-.246c.524-.001 1.053 0 1.583-.006L11.704 1c.341-.003.724.032.9.34zm-3.432.403a.06.06 0 00-.052.03L6.254 6.788a.157.157 0 01-.135.078H3.253c-.056 0-.07.025-.041.074l5.81 10.156c.025.042.013.062-.034.063l-2.795.015a.218.218 0 00-.2.116l-1.32 2.31c-.044.078-.021.118.068.118l5.716.008c.046 0 .08.02.104.061l1.403 2.454c.046.081.092.082.139 0l5.006-8.76.783-1.382a.055.055 0 01.096 0l1.424 2.53a.122.122 0 00.107.062l2.763-.02a.04.04 0 00.035-.02.041.041 0 000-.04l-2.9-5.086a.108.108 0 010-.113l.293-.507 1.12-1.977c.024-.041.012-.062-.035-.062H9.2c-.059 0-.073-.026-.043-.077l1.434-2.505a.107.107 0 000-.114L9.225 1.774a.06.06 0 00-.053-.031zm6.29 8.02c.046 0 .058.02.034.06l-.832 1.465-2.613 4.585a.056.056 0 01-.05.029.058.058 0 01-.05-.029L8.498 9.841c-.02-.034-.01-.052.028-.054l.216-.012 6.722-.012z"/></svg>`;

const SVG_NVIDIA = `<svg xml:space="preserve" viewBox="35.188 31.512 351.46 258.785" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true"><path d="M384.195 282.109c0 3.771-2.769 6.302-6.047 6.302v-.023c-3.371.023-6.089-2.508-6.089-6.278 0-3.769 2.718-6.293 6.089-6.293 3.279-.001 6.047 2.523 6.047 6.292zm2.453 0c0-5.175-4.02-8.179-8.5-8.179-4.511 0-8.531 3.004-8.531 8.179 0 5.172 4.021 8.188 8.531 8.188 4.481 0 8.5-3.016 8.5-8.188m-9.91.692h.91l2.109 3.703h2.316l-2.336-3.859c1.207-.086 2.2-.661 2.2-2.286 0-2.019-1.392-2.668-3.75-2.668h-3.411v8.813h1.961v-3.703m.001-1.492v-2.122h1.364c.742 0 1.753.06 1.753.965 0 .985-.523 1.157-1.398 1.157h-1.719M329.406 237.027l10.598 28.993H318.48l10.926-28.993zm-11.35-11.289-24.423 61.88h17.246l3.863-10.934h28.903l3.656 10.934h18.722l-24.605-61.888-23.362.008zm-49.033 61.903h17.497v-61.922l-17.5-.004.003 61.926zm-121.467-61.926-14.598 49.078-13.984-49.074-18.879-.004 19.972 61.926h25.207l20.133-61.926h-17.851zm70.725 13.484h7.52c10.91 0 17.966 4.898 17.966 17.609 0 12.714-7.056 17.613-17.966 17.613h-7.52v-35.222zm-17.35-13.484v61.926h28.366c15.113 0 20.048-2.512 25.384-8.148 3.769-3.957 6.207-12.641 6.207-22.134 0-8.707-2.063-16.468-5.66-21.304-6.481-8.649-15.817-10.34-29.75-10.34h-24.547zm-165.743-.086v62.012h17.645v-47.086l13.672.004c4.527 0 7.754 1.128 9.934 3.457 2.765 2.945 3.894 7.699 3.894 16.395v27.23h17.098v-34.262c0-24.453-15.586-27.75-30.836-27.75H35.188zm137.583.086.007 61.926h17.489v-61.926h-17.496z"/><path fill="#77B900" d="M82.211 102.414s22.504-33.203 67.437-36.638V53.73c-49.769 3.997-92.867 46.149-92.867 46.149s24.41 70.565 92.867 77.026v-12.804c-50.237-6.32-67.437-61.687-67.437-61.687zm67.437 36.223v11.726c-37.968-6.769-48.507-46.237-48.507-46.237s18.23-20.195 48.507-23.47v12.867c-.023 0-.039-.007-.058-.007-15.891-1.907-28.305 12.938-28.305 12.938s6.958 24.991 28.363 32.183m0-107.125V53.73c1.461-.112 2.922-.207 4.391-.257 56.582-1.907 93.449 46.406 93.449 46.406s-42.343 51.488-86.457 51.488c-4.043 0-7.828-.375-11.383-1.005v13.739c3.04.386 6.192.613 9.481.613 41.051 0 70.738-20.965 99.484-45.778 4.766 3.817 24.278 13.103 28.289 17.168-27.332 22.883-91.031 41.329-127.144 41.329-3.481 0-6.824-.211-10.11-.528v19.306H305.68V31.512H149.648zm0 49.144V65.777c1.446-.101 2.903-.179 4.391-.226 40.688-1.278 67.382 34.965 67.382 34.965s-28.832 40.043-59.746 40.043c-4.449 0-8.438-.715-12.028-1.922V93.523c15.84 1.914 19.028 8.911 28.551 24.786l21.18-17.859s-15.461-20.277-41.524-20.277c-2.833-.001-5.544.198-8.206.483"/></svg>`;

const SVG_MISTRAL = `<svg viewBox="0 0 256 233" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true"><path d="M186.18182 0h46.54545v46.54545h-46.54545z"/><path fill="#F7D046" d="M209.45454 0h46.54545v46.54545h-46.54545z"/><path d="M0 0h46.54545v46.54545H0zM0 46.54545h46.54545V93.0909H0zM0 93.09091h46.54545v46.54545H0zM0 139.63636h46.54545v46.54545H0zM0 186.18182h46.54545v46.54545H0z"/><path fill="#F7D046" d="M23.27273 0h46.54545v46.54545H23.27273z"/><path fill="#F2A73B" d="M209.45454 46.54545h46.54545V93.0909h-46.54545zM23.27273 46.54545h46.54545V93.0909H23.27273z"/><path d="M139.63636 46.54545h46.54545V93.0909h-46.54545z"/><path fill="#F2A73B" d="M162.90909 46.54545h46.54545V93.0909h-46.54545zM69.81818 46.54545h46.54545V93.0909H69.81818z"/><path fill="#EE792F" d="M116.36364 93.09091h46.54545v46.54545h-46.54545zM162.90909 93.09091h46.54545v46.54545h-46.54545zM69.81818 93.09091h46.54545v46.54545H69.81818z"/><path d="M93.09091 139.63636h46.54545v46.54545H93.09091z"/><path fill="#EB5829" d="M116.36364 139.63636h46.54545v46.54545h-46.54545z"/><path fill="#EE792F" d="M209.45454 93.09091h46.54545v46.54545h-46.54545zM23.27273 93.09091h46.54545v46.54545H23.27273z"/><path d="M186.18182 139.63636h46.54545v46.54545h-46.54545z"/><path fill="#EB5829" d="M209.45454 139.63636h46.54545v46.54545h-46.54545z"/><path d="M186.18182 186.18182h46.54545v46.54545h-46.54545z"/><path fill="#EB5829" d="M23.27273 139.63636h46.54545v46.54545H23.27273z"/><path fill="#EA3326" d="M209.45454 186.18182h46.54545v46.54545h-46.54545zM23.27273 186.18182h46.54545v46.54545H23.27273z"/></svg>`;

const SVG_DEEPSEEK = `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true"><path fill="#4D6BFE" d="M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 0 1-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 0 0-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 0 1-.465.137 9.597 9.597 0 0 0-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 0 0 1.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 0 1 1.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 0 1 .415-.287.302.302 0 0 1 .2.288.306.306 0 0 1-.31.307.303.303 0 0 1-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 0 1-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 0 1 .016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 0 1-.254-.078.253.253 0 0 1-.114-.358c.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z"/></svg>`;

const SVG_GEMINI = `<svg viewBox="0 0 296 298" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true"><mask id="gemini__a" width="296" height="298" x="0" y="0" maskUnits="userSpaceOnUse" style="mask-type:alpha"><path fill="#3186FF" d="M141.201 4.886c2.282-6.17 11.042-6.071 13.184.148l5.985 17.37a184.004 184.004 0 0 0 111.257 113.049l19.304 6.997c6.143 2.227 6.156 10.91.02 13.155l-19.35 7.082a184.001 184.001 0 0 0-109.495 109.385l-7.573 20.629c-2.241 6.105-10.869 6.121-13.133.025l-7.908-21.296a184 184 0 0 0-109.02-108.658l-19.698-7.239c-6.102-2.243-6.118-10.867-.025-13.132l20.083-7.467A183.998 183.998 0 0 0 133.291 26.28l7.91-21.394Z"/></mask><g mask="url(#gemini__a)"><g filter="url(#gemini__b)"><ellipse cx="163" cy="149" fill="#3689FF" rx="196" ry="159"/></g><g filter="url(#gemini__c)"><ellipse cx="33.5" cy="142.5" fill="#F6C013" rx="68.5" ry="72.5"/></g><g filter="url(#gemini__d)"><ellipse cx="19.5" cy="148.5" fill="#F6C013" rx="68.5" ry="72.5"/></g><g filter="url(#gemini__e)"><path fill="#FA4340" d="M194 10.5C172 82.5 65.5 134.333 22.5 135L144-66l50 76.5Z"/></g><g filter="url(#gemini__f)"><path fill="#FA4340" d="M190.5-12.5C168.5 59.5 62 111.333 19 112L140.5-89l50 76.5Z"/></g><g filter="url(#gemini__g)"><path fill="#14BB69" d="M194.5 279.5C172.5 207.5 66 155.667 23 155l121.5 201 50-76.5Z"/></g><g filter="url(#gemini__h)"><path fill="#14BB69" d="M196.5 320.5C174.5 248.5 68 196.667 25 196l121.5 201 50-76.5Z"/></g></g><defs><filter id="gemini__b" width="464" height="390" x="-69" y="-46" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="18"/></filter><filter id="gemini__c" width="265" height="273" x="-99" y="6" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/></filter><filter id="gemini__d" width="265" height="273" x="-113" y="12" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/></filter><filter id="gemini__e" width="299.5" height="329" x="-41.5" y="-130" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/></filter><filter id="gemini__f" width="299.5" height="329" x="-45" y="-153" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/></filter><filter id="gemini__g" width="299.5" height="329" x="-41" y="91" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/></filter><filter id="gemini__h" width="299.5" height="329" x="-39" y="132" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse"><feFlood flood-opacity="0" result="BackgroundImageFix"/><feBlend in="SourceGraphic" in2="BackgroundImageFix" result="shape"/><feGaussianBlur result="effect1_foregroundBlur_69_17998" stdDeviation="32"/></filter></defs></svg>`;

const MODEL_PREFIX_BRAND_KEYS: Readonly<Record<string, string>> = {
    anthropic: 'anthropic',
    claude: 'anthropic',
    openai: 'openai',
    google: 'google',
    gemini: 'gemini',
    qwen: 'qwen',
    deepseek: 'deepseek',
    nvidia: 'nvidia',
    meta: 'meta',
    'meta-llama': 'meta',
    mistralai: 'mistral',
    mistral: 'mistral',
    minimax: 'minimax',
    moonshotai: 'kimi',
    moonshot: 'kimi',
    cohere: 'cohere',
    huggingface: 'huggingface',
    ollama: 'ollama',
};

const VENDOR_BRAND_KEYS: Readonly<Record<string, string>> = {
    openai: 'openai',
    anthropic: 'anthropic',
    google: 'google',
    gemini: 'gemini',
    nvidia: 'nvidia',
    openrouter: 'openrouter',
    huggingface: 'huggingface',
    ollama: 'ollama',
    mistral: 'mistral',
    qwen: 'qwen',
    deepseek: 'deepseek',
    minimax: 'minimax',
    meta: 'meta',
    kimi: 'kimi',
};

const LLM_PROVIDER_BRAND_FACTORIES: Record<string, () => QaapLlmProviderBrand> = {
    openai: () => themeAdaptivePngBrand('openai', 'OpenAI', 'openai-light', 'openai-dark'),
    anthropic: () => pngBrand('anthropic', 'Anthropic', 'light'),
    google: () => ({ id: 'google', label: 'Google', tone: 'light', svg: uniquifySvgIds(SVG_GEMINI) }),
    gemini: () => ({ id: 'gemini', label: 'Gemini', tone: 'light', svg: uniquifySvgIds(SVG_GEMINI) }),
    nvidia: () => ({ id: 'nvidia', label: 'NVIDIA', tone: 'light', svg: SVG_NVIDIA }),
    qwen: () => ({ id: 'qwen', label: 'Qwen', tone: 'dark', svg: SVG_QWEN }),
    deepseek: () => ({ id: 'deepseek', label: 'DeepSeek', tone: 'light', svg: SVG_DEEPSEEK }),
    mistral: () => ({ id: 'mistral', label: 'Mistral', tone: 'light', svg: SVG_MISTRAL }),
    minimax: () => monogramBrand('minimax', 'MiniMax', 'M', '#111827'),
    openrouter: () => themeAdaptivePngBrand('openrouter', 'OpenRouter', 'openrouter-light', 'openrouter-dark'),
    huggingface: () => pngBrand('huggingface', 'Hugging Face', 'brand'),
    ollama: () => pngBrand('ollama', 'Ollama', 'light'),
    meta: () => monogramBrand('meta', 'Meta', 'M', '#0668E1'),
    kimi: () => pngBrand('kimi', 'Kimi', 'light', 'moonshot'),
    cohere: () => monogramBrand('cohere', 'Cohere', 'C', '#39594D'),
};

function normalizeToken(value: string | undefined): string {
    return value?.trim().toLowerCase() ?? '';
}

function brandKeyFromModelSlug(modelId: string): string | undefined {
    const trimmed = modelId.trim();
    if (!trimmed) {
        return undefined;
    }
    const slash = trimmed.indexOf('/');
    const prefix = slash > 0 ? trimmed.slice(0, slash) : trimmed;
    const normalized = prefix.toLowerCase();
    if (MODEL_PREFIX_BRAND_KEYS[normalized]) {
        return MODEL_PREFIX_BRAND_KEYS[normalized];
    }
    if (normalized.includes('qwen')) {
        return 'qwen';
    }
    if (normalized.includes('deepseek')) {
        return 'deepseek';
    }
    if (normalized.includes('gemini') || normalized.includes('google')) {
        return 'gemini';
    }
    if (normalized.includes('claude') || normalized.includes('anthropic')) {
        return 'anthropic';
    }
    if (normalized.includes('llama') || normalized.includes('meta')) {
        return 'meta';
    }
    if (normalized.includes('mistral')) {
        return 'mistral';
    }
    if (normalized.includes('minimax')) {
        return 'minimax';
    }
    if (normalized.includes('kimi') || normalized.includes('moonshot')) {
        return 'kimi';
    }
    return undefined;
}

/** Resolve a stable brand id for LLM picker icons (vendor + optional OpenRouter-style slug). */
export function resolveLlmProviderBrandKey(vendor: string | undefined, modelId?: string): string | undefined {
    const normalizedVendor = normalizeToken(vendor);

    if (normalizedVendor === 'openrouter' || normalizedVendor === 'unknown' || !normalizedVendor) {
        const fromSlug = modelId ? brandKeyFromModelSlug(modelId) : undefined;
        if (fromSlug) {
            return fromSlug;
        }
        return normalizedVendor === 'openrouter' ? 'openrouter' : undefined;
    }

    if (VENDOR_BRAND_KEYS[normalizedVendor]) {
        return VENDOR_BRAND_KEYS[normalizedVendor];
    }

    const fromSlug = modelId ? brandKeyFromModelSlug(modelId) : undefined;
    if (fromSlug) {
        return fromSlug;
    }

    return normalizedVendor || undefined;
}

export function resolveLlmProviderBrand(vendor: string | undefined, modelId?: string): QaapLlmProviderBrand | undefined {
    const brandKey = resolveLlmProviderBrandKey(vendor, modelId);
    if (!brandKey) {
        return undefined;
    }
    const factory = LLM_PROVIDER_BRAND_FACTORIES[brandKey];
    if (!factory) {
        return monogramBrand(brandKey, brandKey, brandKey.slice(0, 2).toUpperCase(), '#374151');
    }
    return factory();
}

/** DOM icon for QAIQ model picker rows and provider section headers. */
export function createLlmProviderIcon(
    vendor: string | undefined,
    modelId: string | undefined,
    size: 'sm' | 'md' = 'sm',
): HTMLElement | undefined {
    const brand = resolveLlmProviderBrand(vendor, modelId);
    if (!brand) {
        return undefined;
    }
    const host = document.createElement('span');
    host.className = `theia-qaap-agent-brand-icon theia-qaap-llm-provider-icon theia-mod-${size} theia-mod-tone-${brand.tone}`;
    host.setAttribute('aria-hidden', 'true');
    if (brand.imageUrlLight && brand.imageUrlDark) {
        host.classList.add('theia-mod-theme-adaptive');
        const lightImg = document.createElement('img');
        lightImg.src = brand.imageUrlLight;
        lightImg.alt = '';
        lightImg.draggable = false;
        lightImg.className = 'theia-mod-llm-icon-for-light';
        const darkImg = document.createElement('img');
        darkImg.src = brand.imageUrlDark;
        darkImg.alt = '';
        darkImg.draggable = false;
        darkImg.className = 'theia-mod-llm-icon-for-dark';
        host.append(lightImg, darkImg);
    } else if (brand.imageUrl) {
        const img = document.createElement('img');
        img.src = brand.imageUrl;
        img.alt = '';
        img.draggable = false;
        host.append(img);
    } else if (brand.svg) {
        host.innerHTML = brand.svg;
    }
    return host;
}

export function appendLlmProviderIcon(
    parent: HTMLElement,
    vendor: string | undefined,
    modelId: string | undefined,
    size: 'sm' | 'md' = 'sm',
): HTMLElement | undefined {
    const icon = createLlmProviderIcon(vendor, modelId, size);
    if (icon) {
        parent.append(icon);
    }
    return icon;
}
