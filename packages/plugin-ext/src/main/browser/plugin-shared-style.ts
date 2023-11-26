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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { ThemeService } from '@theia/core/lib/browser/theming';
import { Theme } from '@theia/core/lib/common/theme';
import { IconUrl } from '../../common/plugin-protocol';
import { Reference, SyncReferenceCollection } from '@theia/core/lib/common/reference';
import { Endpoint } from '@theia/core/lib/browser/endpoint';

export interface PluginIconKey {
    url: IconUrl;
    size?: number;
    type?: 'icon' | 'file';
}

export interface PluginIcon extends Disposable {
    readonly iconClass: string
}

export const PLUGIN_FILE_ICON_CLASS = 'theia-plugin-file-icon';

export const DEFAULT_ICON_SIZE = 16;

@injectable()
export class PluginSharedStyle {

    @inject(ThemeService) protected readonly themeService: ThemeService;

    protected style: HTMLStyleElement;
    protected readonly rules: {
        selector: string;
        body: (theme: Theme) => string
    }[] = [];

    @postConstruct()
    protected init(): void {
        this.update();
        this.themeService.onDidColorThemeChange(() => this.update());
    }

    protected readonly toUpdate = new DisposableCollection();
    protected update(): void {
        this.toUpdate.dispose();

        const style = this.style = document.createElement('style');
        style.type = 'text/css';
        style.media = 'screen';
        document.getElementsByTagName('head')[0].appendChild(style);
        this.toUpdate.push(Disposable.create(() =>
            document.getElementsByTagName('head')[0].removeChild(style)
        ));

        for (const rule of this.rules) {
            this.doInsertRule(rule);
        }
    }

    insertRule(selector: string, body: (theme: Theme) => string): Disposable {
        const rule = { selector, body };
        this.rules.push(rule);
        this.doInsertRule(rule);
        return Disposable.create(() => {
            const index = this.rules.indexOf(rule);
            if (index !== -1) {
                this.rules.splice(index, 1);
                this.deleteRule(selector);
            }
        });
    }
    protected doInsertRule({ selector, body }: {
        selector: string;
        body: (theme: Theme) => string
    }): void {
        const sheet = (<CSSStyleSheet>this.style.sheet);
        const cssBody = body(this.themeService.getCurrentTheme());
        sheet.insertRule(selector + ' {\n' + cssBody + '\n}', 0);
    }
    deleteRule(selector: string): void {
        const sheet = (<CSSStyleSheet>this.style.sheet);
        const rules = sheet.rules || sheet.cssRules || [];
        for (let i = rules.length - 1; i >= 0; i--) {
            const rule = rules[i];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((<any>rule).selectorText.indexOf(selector) !== -1) {
                sheet.deleteRule(i);
            }
        }
    }

    private readonly icons = new SyncReferenceCollection<PluginIconKey, PluginIcon>(key => this.createPluginIcon(key));
    toIconClass(url: IconUrl, { size }: { size: number } = { size: DEFAULT_ICON_SIZE }): Reference<PluginIcon> {
        return this.icons.acquire({ url, size });
    }

    toFileIconClass(url: IconUrl): Reference<PluginIcon> {
        return this.icons.acquire({ url, type: 'file' });
    }

    private iconSequence = 0;
    protected createPluginIcon(key: PluginIconKey): PluginIcon {
        const iconUrl = key.url;
        const size = key.size ?? DEFAULT_ICON_SIZE;
        const type = key.type ?? 'icon';
        const darkIconUrl = PluginSharedStyle.toExternalIconUrl(`${typeof iconUrl === 'object' ? iconUrl.dark : iconUrl}`);
        const lightIconUrl = PluginSharedStyle.toExternalIconUrl(`${typeof iconUrl === 'object' ? iconUrl.light : iconUrl}`);

        const toDispose = new DisposableCollection();
        let iconClass = 'plugin-icon-' + this.iconSequence++;
        if (type === 'icon') {
            toDispose.push(this.insertRule('.' + iconClass + '::before', theme => `
                    content: "";
                    background-position: 2px;
                    display: block;
                    width: ${size}px;
                    height: ${size}px;
                    background: center no-repeat url("${theme.type === 'light' ? lightIconUrl : darkIconUrl}");
                    background-size: ${size}px;
                `));
        } else {
            toDispose.push(this.insertRule('.' + iconClass + '::before', theme => `
                    content: "";
                    background-image: url("${theme.type === 'light' ? lightIconUrl : darkIconUrl}");
                    background-size: ${DEFAULT_ICON_SIZE}px;
                    background-position: left center;
                    background-repeat: no-repeat;
                `));
            iconClass += ' ' + PLUGIN_FILE_ICON_CLASS;
        }
        return { iconClass, dispose: () => toDispose.dispose() };
    }

    static toExternalIconUrl(iconUrl: string): string {
        if (iconUrl.startsWith('hostedPlugin/')) {
            return new Endpoint({ path: iconUrl }).getRestUrl().toString();
        }
        return iconUrl;
    }

}
