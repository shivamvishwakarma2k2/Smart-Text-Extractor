// Initialize PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// Wait for DOM to be fully loaded
document.addEventListener("DOMContentLoaded", function () {
    // Get DOM elements
    const uploadForm = document.getElementById("uploadForm");
    const resultContainer = document.getElementById("resultContainer");
    const result = document.getElementById("result");
    const resultStats = document.getElementById("resultStats");
    const progress = document.getElementById("progress");
    const extractButton = document.getElementById("extractButton");

    // Form submission handler
    uploadForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const fileInput = document.getElementById("file");

        if (!fileInput.files || !fileInput.files[0]) {
            showToast("Please select a file", "error");
            return;
        }

        const file = fileInput.files[0];
        const validTypes = [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/gif",
            "image/tiff",
            "application/pdf",
        ];

        if (!validTypes.includes(file.type)) {
            showToast("Please upload a valid image or PDF file", "error");
            return;
        }

        if (file.size > 20 * 1024 * 1024) {
            showToast("File size should be less than 20MB", "error");
            return;
        }

        // Disable extract button and show loading state
        extractButton.disabled = true;
        extractButton.innerHTML = `
                        <i class="fas fa-circle-notch fa-spin"></i>
                        Processing...
                    `;

        progress.classList.remove("hidden");
        resultContainer.classList.add("hidden");

        try {
            let data;
            if (file.type === "application/pdf") {
                data = await processPDF(file);
            } else {
                data = await processImage(file);
            }

            // Update stats
            resultStats.innerHTML = `
                            <div class="flex flex-wrap gap-3">
                                <div class="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg flex items-center gap-2">
                                    <i class="fas fa-percentage"></i>
                                    <span>Confidence: <span class="font-semibold">${data.confidence.toFixed(2)}%</span></span>
                                </div>
                                <div class="bg-purple-50 text-purple-700 px-4 py-2 rounded-lg flex items-center gap-2">
                                    <i class="fas fa-file"></i>
                                    <span>Type: <span class="font-semibold">${data.fileType}</span></span>
                                </div>
                                <div class="bg-blue-50 text-blue-700 px-4 py-2 rounded-lg flex items-center gap-2">
                                    <i class="fas fa-align-left"></i>
                                    <span>Characters: <span class="font-semibold">${data.text.length}</span></span>
                                </div>
                            </div>
                        `;

            // Display the text
            result.textContent = data.text;
            resultContainer.classList.remove("hidden");

            // Show success message
            showToast("Text extracted successfully!", "success");
        } catch (error) {
            console.error("Error:", error);
            showToast(error.message, "error");
        } finally {
            // Reset button state
            extractButton.disabled = false;
            extractButton.innerHTML = `
                            <i class="fas fa-magic"></i>
                            Extract Text
                        `;
            progress.classList.add("hidden");
        }
    });
});

// File name update handler
function updateFileName() {
    const fileInput = document.getElementById("file");
    const fileName = document.getElementById("fileName");
    const extractButton = document.getElementById("extractButton");

    if (fileInput.files.length > 0) {
        fileName.textContent = fileInput.files[0].name;
        extractButton.disabled = false;
    } else {
        fileName.textContent = "No file selected";
        extractButton.disabled = true;
    }
}

// Copy to clipboard function
function copyToClipboard() {
    const result = document.getElementById("result");
    navigator.clipboard.writeText(result.textContent)
        .then(() => {
            showToast("Text copied to clipboard!");
        })
        .catch((err) => {
            console.error("Failed to copy text: ", err);
            showToast("Failed to copy text!", "error");
        });
}

// Toast notification function
function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.className = `fixed top-4 right-4 ${type === "success" ? "bg-green-500" : "bg-red-500"
        } text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-2 transform transition-all duration-300 translate-x-full`;

    toast.innerHTML = `
                    <i class="fas ${type === "success" ? "fa-check-circle" : "fa-exclamation-circle"}"></i>
                    <span>${message}</span>
                `;

    container.appendChild(toast);

    // Trigger animation
    setTimeout(() => (toast.style.transform = "translateX(0)"), 10);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.transform = "translateX(full)";
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Update progress
function updateProgress(progress) {
    const progressBar = document.getElementById("progressBar");
    const progressText = document.getElementById("progressText");
    progressBar.style.width = `${progress * 100}%`;
    progressText.textContent = `Processing... ${Math.round(progress * 100)}%`;
}

// Add this function for image preprocessing
async function preprocessImage(file) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const ctx = canvas.getContext("2d");

            // Set canvas size to match image
            canvas.width = img.width;
            canvas.height = img.height;

            // Draw original image
            ctx.drawImage(img, 0, 0);

            // Get image data
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // Convert to grayscale and increase contrast
            for (let i = 0; i < data.length; i += 4) {
                const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
                const adjusted = avg > 128 ? 255 : 0; // Thresholding
                data[i] = adjusted; // R
                data[i + 1] = adjusted; // G
                data[i + 2] = adjusted; // B
            }

            // Put processed image back
            ctx.putImageData(imageData, 0, 0);

            // Convert to blob
            canvas.toBlob((blob) => {
                resolve(blob);
            }, "image/png");
        };
        img.src = URL.createObjectURL(file);
    });
}

// Update the processImage function
async function processImage(file) {
    const progress = document.getElementById("progress");
    progress.classList.remove("hidden");

    try {
        // Preprocess the image
        const processedBlob = await preprocessImage(file);

        // Try processing both original and preprocessed images
        const [originalResult, processedResult] = await Promise.all([
            Tesseract.recognize(file, "eng", {
                logger: (m) => {
                    if (m.status === "recognizing text") {
                        updateProgress(m.progress * 0.5); // First half of progress
                    }
                },
            }),
            Tesseract.recognize(processedBlob, "eng", {
                logger: (m) => {
                    if (m.status === "recognizing text") {
                        updateProgress(0.5 + m.progress * 0.5); // Second half of progress
                    }
                },
                tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!@#$%^&*()_+-=[]{}|;:"<>?/\\\'" ',
            }),
        ]);

        // Choose the result with higher confidence
        const bestResult = originalResult.data.confidence > processedResult.data.confidence
            ? originalResult
            : processedResult;

        // Perform post-processing on the text
        const processedText = postProcessOCRText(bestResult.data.text);

        return {
            text: processedText,
            confidence: bestResult.data.confidence,
            fileType: file.type,
        };
    } catch (error) {
        throw new Error("Failed to process image: " + error.message);
    }
}

// Add this function for OCR text post-processing
function postProcessOCRText(text) {
    return text
        // Remove excessive whitespace
        .replace(/\s+/g, " ")
        // Remove empty lines
        .replace(/^\s*[\r\n]/gm, "")
        // Fix common OCR mistakes
        .replace(/[|]l/g, "1")
        .replace(/[O0]/g, (match) => /\d/.test(text[text.indexOf(match) - 1]) ? "0" : "O")
        // Fix broken words
        .replace(/(?<=\w)-\s+(?=\w)/g, "")
        // Fix common character confusions
        .replace(/rn/g, "m")
        .replace(/cl/g, "d")
        // Remove non-printable characters
        .replace(/[^\x20-\x7E\n]/g, "")
        // Trim the text
        .trim();
}

// Process PDF using PDF.js
async function processPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({
            data: arrayBuffer,
        }).promise;
        const numPages = pdf.numPages;
        let fullText = "";

        for (let i = 1; i <= numPages; i++) {
            updateProgress(i / numPages);
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items
                .map((item) => item.str)
                .join(" ");
            fullText += pageText + "\n\n";
        }

        return {
            text: fullText,
            confidence: 100, // PDF text extraction doesn't provide confidence
            fileType: file.type,
        };
    } catch (error) {
        throw new Error("Failed to process PDF: " + error.message);
    }
}

// Drag and drop functionality
const dropZone = document.getElementById("dropZone");

["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, highlight, false);
});

["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, unhighlight, false);
});

function highlight(e) {
    dropZone.classList.add("dragover");
}

function unhighlight(e) {
    dropZone.classList.remove("dragover");
}

dropZone.addEventListener("drop", handleDrop, false);

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    document.getElementById("file").files = files;
    updateFileName();
}
