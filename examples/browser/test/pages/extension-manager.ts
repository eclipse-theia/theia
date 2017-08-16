import { Client } from 'webdriverio';

export class ExtensionManager {

    private driver: Client<any>;

    constructor(driver: Client<any>) {
        this.driver = driver;
    }

    isExtensionsTabAvailable(): boolean {
        return this.driver.element(`ul.p-TabBar-content > .p-TabBar-tab:nth-child(2)`).value !== null;
    }

    clickExtensionsTab(): void {
        this.driver.click(`ul.p-TabBar-content > .p-TabBar-tab:nth-child(2)`);
    }

    isExtensionManagerOpen(): boolean {
        return this.driver.element('#extensions').getAttribute('class').split(' ').indexOf('p-mod-hidden') === -1;
    }

    clickExtensionItem(itemName: string): void {
        this.driver.element('.extensionName=' + itemName).element('../../..').click();
    }

    waitForLoadingDetailWidget(): void {
        this.driver.waitForExist('.theia-extension-detail');
    }

    isExtensionItemVisible(containerSelector: string, name: string): boolean {
        return this.driver.elements(containerSelector).element('.extensionName=' + name).value !== null;
    }

    countExtensionListElements(): number {
        const elements = this.driver.element('#extensionListContainer').elements('.extensionHeaderContainer');
        return elements.value.length;
    }

    searchFor(query: string) {
        const elementNumber = this.countExtensionListElements();
        this.driver.setValue('input#extensionSearchField', query);
        this.driver.waitUntil(() => {
            return this.countExtensionListElements() !== elementNumber;
        }, 5000, 'after setting a value in search field the number of elements should be not the same as before');
    }

    findExtensionButtonByState(extensionName: string, containerSelector: string, state: string) {
        state = state ? '.' + state : '';
        return this.driver
            .element(containerSelector)
            .element('.extensionName=' + extensionName)
            .element('../..')
            .element('.extensionButtonContainer .extensionButton' + state);
    }

    clickUninstall(extensionName: string) {
        this.findExtensionButtonByState(extensionName, '#extensionListContainer', 'installed').click();
    }

    clickInstallInDetailView(extensionName: string) {
        this.findExtensionButtonByState(extensionName, '#theia-main-dock-panel', null).click();
    }

    resetSearchField() {
        const elementNumber = this.countExtensionListElements();
        this.driver.setValue('input#extensionSearchField', '\uE003');
        this.driver.waitUntil(() => {
            return this.countExtensionListElements() !== elementNumber;
        }, 5000, 'after setting a value in search field the number of elements should be not the same as before');
    }
}