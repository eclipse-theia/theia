import * as electron from 'electron';
import * as path from 'path';

let mainWindow: any = null;

electron.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron.app.quit();
    }
});

electron.app.on('ready', () => {
    require("../app");
    mainWindow = new electron.BrowserWindow({ width: 1024, height: 728 });
    mainWindow.loadURL(`file://${path.join(__dirname, 'index.html')}`);
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
});