export const isWindows: boolean = (() => { return is('Windows', 'win32') })();
export const isOSX: boolean = (() => { return is('Mac', 'darwin') })();

function is(userAgent: string, platform: string): boolean {
    if (typeof navigator !== 'undefined') {
        if (navigator.userAgent && navigator.userAgent.indexOf(userAgent) >= 0) {
            return true;
        }
    }
    if (typeof process !== 'undefined') {
        return (process.platform === platform);
    }
    return false;
}