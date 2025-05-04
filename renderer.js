// renderer.js

// --- Get references to UI elements ---
const inputPathEl = document.getElementById('input-path');
const outputPathEl = document.getElementById('output-path');
const passwordEl = document.getElementById('password');
// Payload type
const payloadTypeTextRadio = document.getElementById('payload-type-text');
const payloadTypeFileRadio = document.getElementById('payload-type-file');
// Payload sections
const textPayloadSection = document.getElementById('text-payload-section');
const filePayloadSection = document.getElementById('file-payload-section');
// Payload inputs
const messageEl = document.getElementById('secret-message'); // Textarea
const payloadFilePathEl = document.getElementById('payload-file-path'); // File path input
// Buttons
const browseInputBtn = document.getElementById('browse-input-btn');
const browseOutputBtn = document.getElementById('browse-output-btn');
const browsePayloadBtn = document.getElementById('browse-payload-btn');
const encodeBtn = document.getElementById('encode-btn');
const decodeBtn = document.getElementById('decode-btn');
const clearBtn = document.getElementById('clear-btn');
// Status & Progress
const statusBar = document.getElementById('status-bar');
const progressSection = document.getElementById('progress-section');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');

// Store selected payload file path
let selectedPayloadFilePath = null;

// --- Helper Functions ---

function updateStatus(message, statusType = 'ready') {
    if (!statusBar) return; // Safety check if element doesn't exist
    statusBar.textContent = message;
    // Base classes for structure
    const baseClasses = ['mt-4', 'p-3', 'rounded-md', 'text-center', 'text-sm', 'font-medium', 'transition-colors', 'duration-300', 'border'];
    // State-specific classes for the zinc/sky dark theme
    let stateClasses = [];
    switch (statusType) {
        case 'error':
            // Dark red bg, lighter red text, subtle red border
            stateClasses = ['bg-red-900/60', 'text-red-300', 'border-red-700/60'];
            console.error(`Error: ${message}`);
            break;
        case 'success':
             // Dark green bg, lighter green text, subtle green border
            stateClasses = ['bg-emerald-900/60', 'text-emerald-300', 'border-emerald-700/60'];
            console.log(`Success: ${message}`);
            break;
        case 'progress':
             // Dark blue bg, lighter blue text, subtle blue border
            stateClasses = ['bg-sky-900/60', 'text-sky-300', 'border-sky-700/60'];
            console.log(`Progress: ${message}`);
            break;
        case 'ready':
        default:
            // Neutral dark bg, subtle border, lighter gray text
            stateClasses = ['bg-gray-700/40', 'text-gray-400', 'border-gray-600/50'];
            console.log(`Status: ${message}`);
            break;
    }
    // Apply classes
    statusBar.className = ''; // Clear existing classes first
    statusBar.classList.add(...baseClasses, ...stateClasses);
}


function updateProgress(percent) {
    if (!progressSection || !progressBar || !progressText) return; // Safety check

    if (percent >= 0 && percent <= 100) {
        progressSection.classList.remove('hidden');
        progressBar.style.width = `${percent}%`;
        progressText.textContent = `Processing... ${percent}%`;
    } else {
        // Hide progress bar if percent is invalid or process finished/failed
        progressSection.classList.add('hidden');
        progressBar.style.width = '0%';
        progressText.textContent = ''; // Clear text
    }
}

function disableControls(disabled) {
    // Disable all interactive elements during processing
    [ browseInputBtn, browseOutputBtn, browsePayloadBtn, encodeBtn, decodeBtn, clearBtn,
      payloadTypeTextRadio, payloadTypeFileRadio, messageEl, passwordEl
    ].forEach(el => { if (el) el.disabled = disabled; }); // Check if element exists before disabling

    // Also visually indicate disabled state for readonly inputs
    [inputPathEl, outputPathEl, payloadFilePathEl].forEach(el => {
        if (el) el.classList.toggle('opacity-60', disabled); // Use opacity for readonly inputs
    });
}

function clearAll() {
    // Clear input values
    if(inputPathEl) inputPathEl.value = '';
    if(outputPathEl) outputPathEl.value = '';
    if(messageEl) messageEl.value = '';
    if(passwordEl) passwordEl.value = '';
    if(payloadFilePathEl) payloadFilePathEl.value = '';

    // Clear stored state
    selectedPayloadFilePath = null;

    // Reset UI elements
    if(payloadTypeTextRadio) payloadTypeTextRadio.checked = true; // Default to text
    handlePayloadTypeChange(); // Update UI visibility based on reset radio button
    updateStatus('Ready.', 'ready');
    updateProgress(-1); // Hide progress bar
}

function handlePayloadTypeChange() {
    if (!payloadTypeTextRadio || !textPayloadSection || !filePayloadSection) return; // Safety check

    if (payloadTypeTextRadio.checked) {
        textPayloadSection.classList.remove('hidden');
        filePayloadSection.classList.add('hidden');
        // Clear the file input when switching to text
        if(payloadFilePathEl) payloadFilePathEl.value = '';
        selectedPayloadFilePath = null;
    } else {
        textPayloadSection.classList.add('hidden');
        filePayloadSection.classList.remove('hidden');
        // Clear the text area when switching to file
        if(messageEl) messageEl.value = '';
    }
}

// --- Event Listeners ---

// Payload Type Selection
if(payloadTypeTextRadio) payloadTypeTextRadio.addEventListener('change', handlePayloadTypeChange);
if(payloadTypeFileRadio) payloadTypeFileRadio.addEventListener('change', handlePayloadTypeChange);

// Browse Buttons
if(browseInputBtn) browseInputBtn.addEventListener('click', async () => {
    if (browseInputBtn.disabled) return;
    try {
        const filePath = await window.electronAPI.openFileDialog();
        if (filePath) {
            inputPathEl.value = filePath;
             // Extract filename for display
             const filename = filePath.split(/[\\/]/).pop();
            updateStatus(`Cover image selected: ${filename}`, 'ready');
        }
    } catch (error) { updateStatus(`Error selecting cover image: ${error.message || 'Unknown error'}`, 'error'); }
});

if(browseOutputBtn) browseOutputBtn.addEventListener('click', async () => {
    if (browseOutputBtn.disabled) return;
     try {
        const filePath = await window.electronAPI.saveFileDialog();
        if (filePath) {
            outputPathEl.value = filePath;
             const filename = filePath.split(/[\\/]/).pop();
            updateStatus(`Output location set: ${filename}`, 'ready');
        }
    } catch (error) { updateStatus(`Error selecting output location: ${error.message || 'Unknown error'}`, 'error'); }
});

if(browsePayloadBtn) browsePayloadBtn.addEventListener('click', async () => {
    if (browsePayloadBtn.disabled) return;
    try {
        const filePath = await window.electronAPI.openPayloadFileDialog();
        if (filePath) {
            selectedPayloadFilePath = filePath; // Store the full path
            payloadFilePathEl.value = filePath; // Display it
             const filename = filePath.split(/[\\/]/).pop();
            updateStatus(`Payload file selected: ${filename}`, 'ready');
        }
    } catch (error) { updateStatus(`Error selecting payload file: ${error.message || 'Unknown error'}`, 'error'); }
});


// Encode Action
if(encodeBtn) encodeBtn.addEventListener('click', async () => {
    if (encodeBtn.disabled) return;
    const inputPath = inputPathEl.value;
    const outputPath = outputPathEl.value;
    const password = passwordEl.value;
    const payloadType = payloadTypeTextRadio.checked ? 'text' : 'file';
    const payloadText = messageEl.value;
    const payloadFilePath = selectedPayloadFilePath; // Use stored path

    // Validation
    if (!inputPath) { updateStatus('Please select a cover image.', 'error'); return; }
    if (!outputPath) { updateStatus('Please select an output file location.', 'error'); return; }
    if (!password) { updateStatus('Password is required for encoding.', 'error'); return; }
    if (payloadType === 'text' && !payloadText) { updateStatus('Please enter text to hide.', 'error'); return; }
    if (payloadType === 'file' && !payloadFilePath) { updateStatus('Please select a file to hide.', 'error'); return; }

    updateStatus('Encoding in progress...', 'progress');
    updateProgress(0); // Show progress bar at 0%
    disableControls(true);

    try {
        const args = {
            inputPath,
            payloadType,
            payloadText: payloadType === 'text' ? payloadText : null,
            payloadFilePath: payloadType === 'file' ? payloadFilePath : null,
            outputPath,
            password // Password passed directly
        };
        const result = await window.electronAPI.encode(args);

        if (result.success) {
            updateStatus(result.message, 'success');
        } else {
            updateStatus(result.message || 'Unknown encoding error occurred.', 'error');
        }
    } catch (error) {
        updateStatus(`Encoding IPC error: ${error.message || 'Unknown error'}`, 'error');
        console.error("IPC Error during encode:", error);
    } finally {
        updateProgress(-1); // Hide progress bar on completion/error
        disableControls(false);
    }
});

// Decode Action
if(decodeBtn) decodeBtn.addEventListener('click', async () => {
    if (decodeBtn.disabled) return;
    const inputPath = inputPathEl.value;
    const password = passwordEl.value;

    if (!inputPath) { updateStatus('Please select an image file to decode.', 'error'); return; }
    if (!password) { updateStatus('Password is required for decoding.', 'error'); return; }

    updateStatus('Decoding in progress...', 'progress');
    updateProgress(0);
    disableControls(true);
    if(messageEl) messageEl.value = ''; // Clear result area

    try {
        const result = await window.electronAPI.decode({
            inputPath,
            password // Password passed directly
        });

        if (result.success) {
            if (result.type === 'text') {
                if(messageEl) messageEl.value = result.message;
                // Ensure text mode is selected in UI to show textarea
                if(payloadTypeTextRadio) payloadTypeTextRadio.checked = true;
                handlePayloadTypeChange();
                updateStatus('Decoding successful (Text).', 'success');
            } else if (result.type === 'file') {
                updateStatus(`Decoding successful (File: ${result.filename}). Prompting to save...`, 'success');
                // Now prompt user to save the file
                const saveData = {
                     defaultFilename: result.filename,
                     // IMPORTANT: The file data buffer needs to be transferred correctly.
                     // Electron's IPC handles Buffer serialization automatically.
                     dataBuffer: result.data
                 };
                 // Ensure result.data is actually a buffer or suitable type
                 if (!saveData.dataBuffer || typeof saveData.dataBuffer !== 'object') {
                     // It might arrive as a plain object if serialization goes wrong, check ArrayBuffer/Uint8Array too if needed
                     console.error("Decoded file data received is not a valid Buffer:", typeof saveData.dataBuffer);
                     throw new Error("Internal error: Decoded file data is not valid.");
                 }

                 const saveResult = await window.electronAPI.saveDecodedFileDialog(saveData);
                 if (saveResult.success) {
                     updateStatus(saveResult.message, 'success');
                 } else if (!saveResult.canceled) {
                     // Don't show error if user just canceled the dialog
                     updateStatus(saveResult.message || 'Failed to save decoded file.', 'error');
                 } else {
                     updateStatus('Save decoded file canceled.', 'ready');
                 }
                 // Clear text area even if file was decoded
                 if (messageEl) messageEl.value = '';
                 // Set UI to file mode maybe? Optional.
                 // if(payloadTypeFileRadio) payloadTypeFileRadio.checked = true;
                 // handlePayloadTypeChange();
            } else {
                 // Should not happen if steg-logic is correct
                 updateStatus('Decoding completed but with unknown data type.', 'error');
            }
        } else {
            updateStatus(result.message || 'Unknown decoding error occurred.', 'error');
        }
    } catch (error) {
        updateStatus(`Decoding IPC/logic error: ${error.message || 'Unknown error'}`, 'error');
        console.error("Error during decode handling:", error);
    } finally {
        updateProgress(-1); // Hide progress bar
        disableControls(false);
    }
});

// Clear Action
if(clearBtn) clearBtn.addEventListener('click', () => {
     if (clearBtn.disabled) return;
     clearAll();
});

// --- Initial Setup ---
if (window.electronAPI && typeof window.electronAPI.onStegProgress === 'function') {
    // Setup progress listener
    window.electronAPI.onStegProgress((percent) => {
         // console.log(`Progress Update Received: ${percent}%`); // Debug log
         updateProgress(percent);
    });
} else {
    console.error("Error: electronAPI.onStegProgress is not available. Preload script issue?");
    // Display an error to the user via status bar?
    updateStatus("Initialization Error: Cannot receive progress updates.", "error");
}


// Set initial UI state
handlePayloadTypeChange(); // Ensure correct payload section is visible
updateStatus('Ready.', 'ready'); // Set initial status
updateProgress(-1); // Ensure progress bar is hidden initially

// Optional: Add cleanup for listener when window closes (might be overkill)
// window.addEventListener('beforeunload', () => {
//    if(window.electronAPI && window.electronAPI.removeStegProgressListener) {
//        window.electronAPI.removeStegProgressListener();
//    }
// });