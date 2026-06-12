// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as fs from 'fs';
import * as path from 'path';
import { expect } from 'chai';
import { LLM_PROVIDER_ICON_DATA_URLS } from './qaap-llm-provider-icon-assets';

describe('qaap-llm-provider-icon-assets', () => {

    it('matches resources/llm-providers/*.png (run sync:llm-provider-icons after adding icons)', () => {
        const resourcesDir = path.join(__dirname, '..', '..', 'resources', 'llm-providers');
        const pngKeys = fs.readdirSync(resourcesDir)
            .filter(name => name.endsWith('.png'))
            .map(name => name.slice(0, -4))
            .sort();

        const assetKeys = Object.keys(LLM_PROVIDER_ICON_DATA_URLS).sort();
        expect(assetKeys).to.deep.equal(pngKeys);

        for (const key of pngKeys) {
            const png = fs.readFileSync(path.join(resourcesDir, `${key}.png`));
            const expected = `data:image/png;base64,${png.toString('base64')}`;
            expect(LLM_PROVIDER_ICON_DATA_URLS[key], key).to.equal(expected);
        }
    });

});
