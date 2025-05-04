// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises; // Use fs promises
const { encodeMessage, decodeMessage } = require('./steg-logic');

let mainWindow; // Make mainWindow accessible for progress updates

function createWindow() {
    mainWindow = new BrowserWindow({ // Assign to global variable
        width: 850,
        height: 750, // Increased height slightly for progress bar
        backgroundColor: '#1e293b', // Dark background
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        }
    });
    mainWindow.loadFile('index.html');
    // mainWindow.webContents.openDevTools(); // Uncomment for debugging
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// --- Helper: Send Progress Updates ---
// Debounce/throttle progress updates to avoid flooding IPC
let lastProgressUpdate = 0;
const progressUpdateThrottle = 150; // ms

function sendProgress(percent) {
    const now = Date.now();
    if (mainWindow && (percent === 0 || percent === 100 || now - lastProgressUpdate > progressUpdateThrottle)) {
         mainWindow.webContents.send('steg:progress', percent);
         lastProgressUpdate = now;
    }
}


// --- IPC Handlers ---

// Open dialog for COVER image
ipcMain.handle('dialog:openFile', async () => { /* ... (same as before) ... */
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Select Cover Image',
        filters: [{ name: 'PNG Images', extensions: ['png'] }],
        properties: ['openFile']
    });
    if (canceled || filePaths.length === 0) return null;
    else return filePaths[0];
});

// Open dialog for PAYLOAD file (new)
ipcMain.handle('dialog:openPayloadFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Select File to Hide',
        properties: ['openFile'] // Allow any file type
    });
    if (canceled || filePaths.length === 0) return null;
    else return filePaths[0];
});


// Save dialog for OUTPUT stego image
ipcMain.handle('dialog:saveFile', async () => { /* ... (same as before) ... */
    const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save Encoded Image As...',
        defaultPath: 'stego_image.png',
        filters: [{ name: 'PNG Images', extensions: ['png'] }]
    });
    if (canceled || !filePath) return null;
    else return filePath.endsWith('.png') ? filePath : filePath + '.png';
});

// Save dialog for DECODED file output (new)
ipcMain.handle('dialog:saveDecodedFile', async (event, { defaultFilename, dataBuffer }) => {
     if (!dataBuffer || !(dataBuffer instanceof Buffer)) {
         console.error("Invalid dataBuffer received for saving.");
         return { success: false, message: "Internal error: Invalid data to save." };
     }
     const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save Decoded File As...',
        defaultPath: defaultFilename || 'decoded_file'
    });
    if (canceled || !filePath) {
        return { success: false, canceled: true, message:"Save canceled." };
    } else {
        try {
            await fs.writeFile(filePath, dataBuffer);
            console.log(`Decoded file saved to: ${filePath}`);
            return { success: true, message: `File saved successfully to ${path.basename(filePath)}` };
        } catch (error) {
            console.error(`Error saving decoded file: ${error}`);
            return { success: false, message: `Error saving file: ${error.message}` };
        }
    }
});


// ENCODE Request Handler (Updated)
ipcMain.handle('steg:encode', async (event, args) => {
    const { inputPath, payloadType, payloadText, payloadFilePath, outputPath, password } = args;
    console.log('Main received encode request:', { payloadType, inputPath, outputPath });
    sendProgress(0); // Reset progress

    let payloadData;
    let payloadFilename;

    try {
        // Prepare payload based on type
        if (payloadType === 'file') {
            if (!payloadFilePath) return { success: false, message: "Error: Payload file path is missing." };
            payloadData = await fs.readFile(payloadFilePath); // Read file as buffer
            payloadFilename = path.basename(payloadFilePath);
            if (payloadData.length === 0) return { success: false, message: "Error: Selected payload file is empty." };
            console.log(`Read payload file: ${payloadFilename}, Size: ${payloadData.length}`);
        } else if (payloadType === 'text') {
            if (!payloadText) return { success: false, message: "Error: Payload text is missing." };
            payloadData = payloadText; // Use the text directly
            payloadFilename = null; // No filename for text
        } else {
            return { success: false, message: "Error: Invalid payload type specified." };
        }

        // Perform encoding using the imported function, passing the progress callback
        const result = await encodeMessage(
            inputPath,
            payloadData,
            payloadType,
            payloadFilename,
            outputPath,
            password,
            sendProgress // Pass the progress reporting function
         );
         if (!result.success) sendProgress(0); // Reset progress on error
         return result;

    } catch (error) {
        console.error("Error during encode handling in main:", error);
        sendProgress(0);
        return { success: false, message: `Error preparing encoding: ${error.message}` };
    }
});

// DECODE Request Handler (Updated)
ipcMain.handle('steg:decode', async (event, args) => {
    const { inputPath, password } = args;
    console.log('Main received decode request');
    sendProgress(0); // Reset progress

    // Perform decoding, passing the progress callback
    const result = await decodeMessage(
        inputPath,
        password,
        sendProgress // Pass the progress reporting function
     );
     if (!result.success) sendProgress(0); // Reset progress on error
     return result;
});