// steg-logic.js
const Jimp = require('jimp');
const crypto = require('crypto');
const path = require('path'); // To get filename
const fs = require('fs').promises; // Use promises for async file reading
const { TextEncoder, TextDecoder } = require('util');

// --- Constants ---
const SALT_LEN = 16; // bytes
const IV_LEN = 12; // bytes for AES-GCM
const KEY_LEN = 32; // bytes (256 bits)
const AUTH_TAG_LEN = 16; // bytes for AES-GCM
const PBKDF2_ITERATIONS = 100000; // Number of iterations for key derivation
const HEADER_FIXED_LEN = SALT_LEN + IV_LEN + AUTH_TAG_LEN; // Total fixed header size

// Payload Type Indicators (single byte)
const TYPE_TEXT = 0x54; // 'T'
const TYPE_FILE = 0x46; // 'F'

// --- Crypto Helpers ---

async function deriveKey(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, KEY_LEN, 'sha512', (err, derivedKey) => {
            if (err) reject(err);
            else resolve(derivedKey);
        });
    });
}

// --- LSB Conversion (Unchanged) ---

function bytesToBits(bytes) { /* ... (same as before) ... */
    let bits = '';
    for (let i = 0; i < bytes.length; i++) {
        bits += bytes[i].toString(2).padStart(8, '0');
    }
    return bits;
}

function bitsToBytes(bits) { /* ... (same as before, including remainder check) ... */
    const remainder = bits.length % 8;
    if (remainder !== 0) {
        console.warn(`Bit string length (${bits.length}) is not a multiple of 8. Truncating.`);
        bits = bits.slice(0, bits.length - remainder);
        if (bits.length === 0) return new Uint8Array(0);
    }
    const bytes = new Uint8Array(bits.length / 8);
    for (let i = 0; i < bytes.length; i++) {
        const byteBits = bits.slice(i * 8, (i + 1) * 8);
        bytes[i] = parseInt(byteBits, 2);
    }
    return bytes;
}


// --- Core Steganography Functions ---

async function encodeMessage(imagePath, payload, payloadType, payloadFilename, outputPath, password, progressCallback) {
    try {
        if (!password) {
            return { success: false, message: "Error: Password is required for encryption." };
        }
        console.log(`Encoding started. Input: ${imagePath}, Output: ${outputPath}, Type: ${payloadType}`);

        // 1. Prepare Payload with Metadata
        let dataToEncrypt;
        const textEncoder = new TextEncoder();
        if (payloadType === 'text') {
            const textBytes = textEncoder.encode(payload); // payload is the text string
            dataToEncrypt = new Uint8Array(1 + textBytes.length);
            dataToEncrypt[0] = TYPE_TEXT;
            dataToEncrypt.set(textBytes, 1);
        } else if (payloadType === 'file') {
            const filenameBytes = textEncoder.encode(payloadFilename || 'unknown_file'); // Use provided filename
            const fileBytes = payload; // payload is the file Buffer
            // Structure: TYPE_FILE | NUL | filenameBytes | fileBytes
            dataToEncrypt = new Uint8Array(1 + 1 + filenameBytes.length + fileBytes.length);
            let offset = 0;
            dataToEncrypt[offset] = TYPE_FILE; offset += 1;
            dataToEncrypt[offset] = 0x00; offset += 1; // Null separator after filename
            dataToEncrypt.set(filenameBytes, offset); offset += filenameBytes.length;
            dataToEncrypt.set(fileBytes, offset);
        } else {
            return { success: false, message: "Error: Invalid payload type." };
        }
        console.log(`Prepared payload size (before encryption): ${dataToEncrypt.length} bytes`);

        // 2. Encrypt Payload (AES-GCM)
        const salt = crypto.randomBytes(SALT_LEN);
        const iv = crypto.randomBytes(IV_LEN);
        const key = await deriveKey(password, salt);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

        const encryptedData = Buffer.concat([cipher.update(dataToEncrypt), cipher.final()]);
        const authTag = cipher.getAuthTag(); // Get the authentication tag

        if (authTag.length !== AUTH_TAG_LEN) {
             throw new Error(`Authentication tag length mismatch: Expected ${AUTH_TAG_LEN}, got ${authTag.length}`);
        }

        // 3. Combine Header + Encrypted Data
        const finalPayloadToEmbed = Buffer.concat([salt, iv, authTag, encryptedData]);
        console.log(`Final payload size (header + encrypted): ${finalPayloadToEmbed.length} bytes`);

        // 4. Prepare Image & Check Capacity
        const image = await Jimp.read(imagePath);
        if (image.hasAlpha()) {
            image.rgba(false).background(0xFFFFFFFF);
            console.log("Input image converted to RGB.");
        }
        image.quality(100);

        const width = image.bitmap.width;
        const height = image.bitmap.height;
        const maxBits = width * height * 3;
        const maxPayloadBytes = Math.floor(maxBits / 8);

        const messageBits = bytesToBits(finalPayloadToEmbed);
        const messageLenBits = messageBits.length;

        console.log(`Image dimensions: ${width}x${height}`);
        console.log(`Max embeddable capacity (approx bytes): ${maxPayloadBytes}`);
        console.log(`Required bits: ${messageLenBits}`);
        console.log(`Available bits in image: ${maxBits}`);

        if (messageLenBits > maxBits) {
            const requiredBytes = Math.ceil(messageLenBits / 8);
            return { success: false, message: `Error: Encrypted payload is too large (${requiredBytes} bytes). Max capacity: ${maxPayloadBytes} bytes.` };
        }

        // 5. Embed Data using LSB with Progress
        let dataIndex = 0;
        let stopScan = false;
        let lastReportedProgress = -1;
        const totalPixels = width * height;
        let pixelsProcessed = 0;

        image.scan(0, 0, width, height, function (x, y, idx) {
            if (stopScan) return;

            // Embed 3 bits per pixel
            for (let i = 0; i < 3; i++) { // R, G, B
                 if (dataIndex < messageLenBits) {
                    const bit = parseInt(messageBits[dataIndex++], 10);
                    this.bitmap.data[idx + i] = (this.bitmap.data[idx + i] & 0xFE) | bit;
                 } else {
                    stopScan = true;
                    break; // Stop embedding in this pixel
                 }
            }

            pixelsProcessed++;

            // Report Progress periodically
            if (!stopScan) { // Only report progress while actively embedding
                const currentProgress = Math.floor((pixelsProcessed / totalPixels) * 100);
                if (currentProgress > lastReportedProgress) {
                     if (typeof progressCallback === 'function') {
                         progressCallback(currentProgress); // Send progress update
                     }
                     lastReportedProgress = currentProgress;
                }
            }
             if (dataIndex >= messageLenBits) {
                 stopScan = true; // Ensure stopScan is set after last bit
             }
        });

        // Final check
        if (dataIndex < messageLenBits) {
             console.error("Error: Embedding loop finished unexpectedly. DataIndex:", dataIndex, "MessageLenBits:", messageLenBits);
             return { success: false, message: "Error: Failed to embed the entire message (internal error)." };
        }

        // 6. Save Output Image
        await image.writeAsync(outputPath);
        if (typeof progressCallback === 'function') progressCallback(100); // Final progress update
        console.log(`Encoding finished successfully. Output: ${outputPath}`);
        const outputFilename = path.basename(outputPath);
        return { success: true, message: `Encoded successfully to ${outputFilename}` };

    } catch (error) {
        console.error("Error during encoding process:", error);
        let userMessage = `Error during encoding: ${error.message || 'Unknown error'}`;
        if (error.code === 'ENOENT') userMessage = `Error: Input file not found at '${imagePath}'`;
        else if (error.message && error.message.includes('Unsupported')) userMessage = `Error: Unsupported image format. Use PNG.`;
        else if (error.message && error.message.includes('Input buffer contains unsupported image format')) userMessage = `Error: Invalid or corrupt image file.`;
        return { success: false, message: userMessage };
    }
}


async function decodeMessage(imagePath, password, progressCallback) {
    try {
        if (!password) {
            return { success: false, message: "Error: Password is required for decryption." };
        }
        console.log(`Decoding started. Input: ${imagePath}`);

        // 1. Read Image and Extract LSBs
        const image = await Jimp.read(imagePath);
        if (image.hasAlpha()) {
            image.rgba(false).background(0xFFFFFFFF);
            console.log("Input image converted to RGB for decoding.");
        }

        const width = image.bitmap.width;
        const height = image.bitmap.height;
        let extractedBits = '';
        let lastReportedProgress = -1;
        const totalPixels = width * height;
        let pixelsProcessed = 0;

        image.scan(0, 0, width, height, function (x, y, idx) {
            // Extract LSB from R, G, B
            extractedBits += (this.bitmap.data[idx] & 1).toString();
            extractedBits += (this.bitmap.data[idx + 1] & 1).toString();
            extractedBits += (this.bitmap.data[idx + 2] & 1).toString();

            pixelsProcessed++;
            // Report Progress periodically
             const currentProgress = Math.floor((pixelsProcessed / totalPixels) * 100);
             if (currentProgress > lastReportedProgress) {
                  if (typeof progressCallback === 'function') {
                      progressCallback(currentProgress); // Send progress update
                  }
                  lastReportedProgress = currentProgress;
             }
        });
        if (typeof progressCallback === 'function') progressCallback(100); // Final progress update
        console.log(`Finished extracting LSBs. Total bits: ${extractedBits.length}`);

        // 2. Convert Bits to Bytes
        const embeddedPayloadBytes = bitsToBytes(extractedBits);
        if (!embeddedPayloadBytes || embeddedPayloadBytes.length < HEADER_FIXED_LEN + 1) { // Must have header + at least 1 byte data
             console.error(`Error: Extracted data too short (${embeddedPayloadBytes?.length} bytes) or invalid.`);
             return { success: false, message: "Error: Not enough data found in image, or data corrupted." };
        }

        // 3. Parse Header and Encrypted Data
        let offset = 0;
        const salt = embeddedPayloadBytes.slice(offset, offset + SALT_LEN); offset += SALT_LEN;
        const iv = embeddedPayloadBytes.slice(offset, offset + IV_LEN); offset += IV_LEN;
        const authTag = embeddedPayloadBytes.slice(offset, offset + AUTH_TAG_LEN); offset += AUTH_TAG_LEN;
        const encryptedData = embeddedPayloadBytes.slice(offset);

        console.log(`Parsed header: Salt(${salt.length}), IV(${iv.length}), AuthTag(${authTag.length})`);
        console.log(`Encrypted data size: ${encryptedData.length} bytes`);

        if (encryptedData.length === 0) {
             console.error("Error: No encrypted data found after header.");
             return { success: false, message: "Error: Image contains header but no encrypted data." };
        }

        // 4. Decrypt Data (AES-GCM)
        const key = await deriveKey(password, salt);
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag); // Set the expected authentication tag

        let decryptedData;
        try {
            decryptedData = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
            // If decipher.final() throws, auth tag is invalid (wrong password or tampering)
        } catch (decryptionError) {
            console.error("Decryption failed:", decryptionError);
             return { success: false, message: "Error: Decryption failed. Incorrect password or data corrupted." };
        }

        console.log(`Decrypted data size: ${decryptedData.length} bytes`);

        // 5. Interpret Decrypted Payload
        if (decryptedData.length < 1) {
            return { success: false, message: "Error: Decrypted data is empty." };
        }

        const payloadType = decryptedData[0];
        const textDecoder = new TextDecoder('utf-8', { fatal: true }); // Ensure valid UTF-8

        if (payloadType === TYPE_TEXT) {
            try {
                const messageText = textDecoder.decode(decryptedData.slice(1));
                console.log("Decoding successful (Text).");
                return { success: true, type: 'text', message: messageText };
            } catch (e) {
                 console.error("UTF-8 decoding error for text payload:", e);
                 return { success: false, message: "Error: Failed to decode text payload (corrupted?)." };
            }
        } else if (payloadType === TYPE_FILE) {
            // Find the null separator after TYPE_FILE byte
            const separatorIndex = decryptedData.indexOf(0x00, 1); // Start search after type byte
            if (separatorIndex === -1 || separatorIndex === 1) { // Separator not found or filename empty
                 console.error("Error: File payload missing filename separator or filename.");
                 return { success: false, message: "Error: Hidden file metadata is corrupted." };
            }
            try {
                const filename = textDecoder.decode(decryptedData.slice(1, separatorIndex));
                const fileBytes = decryptedData.slice(separatorIndex + 1);
                if (fileBytes.length === 0) {
                     console.error("Error: File payload contains filename but no file data.");
                     return { success: false, message: "Error: Hidden file data is missing or corrupted." };
                }
                console.log(`Decoding successful (File: ${filename}, Size: ${fileBytes.length} bytes).`);
                return { success: true, type: 'file', filename: filename, data: fileBytes };
            } catch (e) {
                 console.error("UTF-8 decoding error for filename:", e);
                 return { success: false, message: "Error: Failed to decode filename (corrupted?)." };
            }
        } else {
            console.error(`Error: Unknown payload type indicator: 0x${payloadType.toString(16)}`);
            return { success: false, message: "Error: Unknown or corrupted data type found in image." };
        }

    } catch (error) {
        console.error("Error during decoding process:", error);
        let userMessage = `Error during decoding: ${error.message || 'Unknown error'}`;
        if (error.code === 'ENOENT') userMessage = `Error: Stego image file not found at '${imagePath}'`;
        else if (error.message && error.message.includes('Unsupported')) userMessage = `Error: Cannot read image file. Is it a valid PNG?`;
        else if (error.message && error.message.includes('Input buffer contains unsupported image format')) userMessage = `Error: Invalid or corrupt image file.`;

        return { success: false, message: userMessage };
    }
}

module.exports = { encodeMessage, decodeMessage };