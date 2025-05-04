// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Dialogs
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: () => ipcRenderer.invoke('dialog:saveFile'),
  openPayloadFileDialog: () => ipcRenderer.invoke('dialog:openPayloadFile'), // New
  saveDecodedFileDialog: (args) => ipcRenderer.invoke('dialog:saveDecodedFile', args), // New

  // Steg Actions
  encode: (args) => ipcRenderer.invoke('steg:encode', args),
  decode: (args) => ipcRenderer.invoke('steg:decode', args),

  // Progress Listener (New)
  onStegProgress: (callback) => {
     // Remove previous listener if exists to avoid duplicates
     ipcRenderer.removeAllListeners('steg:progress');
     // Add the new listener
     ipcRenderer.on('steg:progress', (_event, value) => callback(value));
   },
   removeStegProgressListener: () => ipcRenderer.removeAllListeners('steg:progress'), // Optional cleanup
});

console.log("Preload script loaded and electronAPI exposed.");