"use strict";

/*
    GITHUB SETTINGS
    Replace the placeholder below with your fine-grained GitHub token.
    Do not add quotation marks inside the token itself.
*/

// Netlify Function endpoint. Replace with your deployed Netlify site URL.
const NETLIFY_API =
    "https://busandtruckimporters.netlify.app/.netlify/functions/github";

// The password is requested at runtime and kept only for this browser tab.
function getAdminPassword() {
    let password = sessionStorage.getItem("mft_admin_password");

    if (!password) {
        password = window.prompt("Enter the admin password:");
        if (!password) {
            throw new Error("Admin authentication is required.");
        }
        sessionStorage.setItem("mft_admin_password", password);
    }

    return password;
}

const REPO_OWNER = "marlinfintech";
const REPO_NAME = "sample-bus-and-truck-importers";
const BRANCH = "main";

const API_BASE =
    "https://api.github.com/repos/" +
    REPO_OWNER + "/" + REPO_NAME + "/contents/";

const INDEX_FILE = "index.json";

let buses = [];
let editingId = null;

const form = document.getElementById("busForm");
const existingBus = document.getElementById("existingBus");
const statusBox = document.getElementById("status");

const imageFields = [
    "largeImage",
    "smallImage1",
    "smallImage2",
    "smallImage3",
    "smallImage4"
];

const jsonImageFields = {
    largeImage: "e-buses-list-item-large-image",
    smallImage1: "e-buses-list-item-small-image1",
    smallImage2: "e-buses-list-item-small-image2",
    smallImage3: "e-buses-list-item-small-image3",
    smallImage4: "e-buses-list-item-small-image4"
};

function showStatus(message) {
    statusBox.textContent = message;
}

async function githubRequest(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const actionByMethod = {
        GET: "read",
        PUT: "upload",
        DELETE: "delete"
    };

    const action = actionByMethod[method];

    if (!action) {
        throw new Error("Unsupported GitHub operation: " + method);
    }

    // Existing dashboard code includes ?ref=main on GET requests.
    const cleanPath = path.split("?")[0];

    let originalBody = {};
    if (options.body) {
        try {
            originalBody = JSON.parse(options.body);
        } catch {
            throw new Error("Invalid request data.");
        }
    }

    const requestBody = {
        action: action,
        path: cleanPath,
        message: originalBody.message,
        content: originalBody.content,
        sha: originalBody.sha,
        branch: originalBody.branch || BRANCH
    };

    const response = await fetch(NETLIFY_API, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Admin-Password": getAdminPassword()
        },
        body: JSON.stringify(requestBody),
        cache: "no-store"
    });

    const responseText = await response.text();
    let result = {};

    if (responseText) {
        try {
            result = JSON.parse(responseText);
        } catch {
            result = { message: responseText };
        }
    }

    if (response.status === 401) {
        sessionStorage.removeItem("mft_admin_password");
        throw new Error("Admin password was rejected. Reload and try again.");
    }

    if (!response.ok) {
        throw new Error(
            result.message ||
            result.error ||
            "Backend returned HTTP " + response.status + "."
        );
    }

    return result;
}

function decodeBase64Utf8(base64) {
    const binary = atob(base64.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }

    return new TextDecoder("utf-8").decode(bytes);
}

function encodeBase64Utf8(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(
            ...bytes.subarray(i, i + chunkSize)
        );
    }

    return btoa(binary);
}

async function fileToBase64(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;

    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(
            ...bytes.subarray(i, i + chunkSize)
        );
    }

    return btoa(binary);
}

async function readIndexFile() {
    const result = await githubRequest(
        INDEX_FILE + "?ref=" + encodeURIComponent(BRANCH),
        { method: "GET", cache: "no-store" }
    );

    if (!result.content || !result.sha) {
        throw new Error("GitHub returned an incomplete index.json file.");
    }

    const data = JSON.parse(decodeBase64Utf8(result.content));

    if (!data || !Array.isArray(data["e-buses-list"])) {
        throw new Error(
            'index.json must contain an array named "e-buses-list".'
        );
    }

    return {
        data: data,
        sha: result.sha
    };
}

async function updateIndexFile(data, sha, message) {
    const content = JSON.stringify(data, null, 2);

    return githubRequest(INDEX_FILE, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message: message,
            content: encodeBase64Utf8(content),
            sha: sha,
            branch: BRANCH
        })
    });
}

function imageUrl(imagePath) {
    if (!imagePath) return "";
    return new URL(imagePath, document.baseURI).href;
}

function getNextId(list) {
    let highestNumber = 0;

    list.forEach(function (bus) {
        const match = /^e-bus(\d+)$/i.exec(bus.id || "");

        if (match) {
            highestNumber = Math.max(
                highestNumber,
                Number(match[1])
            );
        }
    });

    return "e-bus" + String(highestNumber + 1).padStart(3, "0");
}

function getImagePaths(bus) {
    return Object.values(jsonImageFields)
        .map(function (key) {
            return bus[key];
        })
        .filter(function (path) {
            return typeof path === "string" && path.startsWith("assets/");
        });
}

function showImagePreviews(bus) {
    imageFields.forEach(function (field) {
        const preview = document.getElementById("preview-" + field);
        const input = document.getElementById(field);

        preview.replaceChildren();

        if (input.files && input.files[0]) {
            const img = document.createElement("img");
            img.alt = "Selected image preview";
            img.src = URL.createObjectURL(input.files[0]);
            preview.appendChild(img);
            return;
        }

        const savedPath = bus ? bus[jsonImageFields[field]] : "";

        if (savedPath) {
            const img = document.createElement("img");
            img.alt = "Current saved image";
            img.src = imageUrl(savedPath);
            preview.appendChild(img);
        }
    });
}

function clearForm() {
    form.reset();
    editingId = null;

    document.getElementById("formHeading").textContent =
        "Add a Bus Listing";

    document.getElementById("currentId").textContent =
        "New listing — ID will be generated when saved";

    document.getElementById("saveButton").textContent =
        "Save New Listing";

    existingBus.value = "";

    showImagePreviews(null);
    showStatus("");
}

function startEditing(bus) {
    editingId = bus.id;

    document.getElementById("title").value =
        bus["e-buses-list-item-title"] || "";

    document.getElementById("price").value =
        bus["e-buses-list-item-price"] || "";

    document.getElementById("description").value =
        bus["e-buses-list-item-description"] || "";

    imageFields.forEach(function (field) {
        document.getElementById(field).value = "";
    });

    document.getElementById("formHeading").textContent =
        "Edit Bus Listing";

    document.getElementById("currentId").textContent =
        "ID: " + bus.id + " (will be preserved)";

    document.getElementById("saveButton").textContent =
        "Save Changes";

    existingBus.value = bus.id;

    showImagePreviews(bus);
    showStatus("");
}

function renderListings() {
    existingBus.replaceChildren();

    const addOption = document.createElement("option");
    addOption.value = "";
    addOption.textContent = "Add a new listing";
    existingBus.appendChild(addOption);

    buses.forEach(function (bus) {
        const option = document.createElement("option");
        option.value = bus.id;
        option.textContent =
            bus.id + " — " +
            (bus["e-buses-list-item-title"] || "Untitled bus");

        existingBus.appendChild(option);
    });

    document.getElementById("nextId").textContent = getNextId(buses);

    const listingList = document.getElementById("listingList");
    listingList.replaceChildren();

    if (buses.length === 0) {
        listingList.textContent = "No bus listings have been added yet.";
        return;
    }

    buses.forEach(function (bus) {
        const item = document.createElement("div");
        item.className = "listing";

        const heading = document.createElement("strong");
        heading.textContent =
            bus.id + " — " +
            (bus["e-buses-list-item-title"] || "Untitled bus");

        const price = document.createElement("p");
        price.textContent =
            bus["e-buses-list-item-price"] || "No price entered";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.textContent = "Edit This Listing";

        editButton.addEventListener("click", function () {
            startEditing(bus);
            window.scrollTo({ top: 0, behavior: "smooth" });
        });

        item.appendChild(heading);
        item.appendChild(price);

        const imageContainer = document.createElement("div");

        Object.values(jsonImageFields).forEach(function (key) {
            if (!bus[key]) return;

            const img = document.createElement("img");
            img.src = imageUrl(bus[key]);
            img.alt = "Image for " + bus.id;
            imageContainer.appendChild(img);
        });

        item.appendChild(imageContainer);
        item.appendChild(editButton);

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.textContent = "Delete Listing";
        deleteButton.style.background = "#c62828";

        deleteButton.addEventListener("click", async function () {
            const confirmed = window.confirm(
                "Are you sure you want to delete " +
                bus.id + " — " +
                (bus["e-buses-list-item-title"] || "Untitled bus") +
                "?\n\nThis will remove the listing from index.json. Images no longer used by another listing will also be deleted."
            );

            if (!confirmed) return;

            deleteButton.disabled = true;
            showStatus("Deleting " + bus.id + "...");

            try {
                const latest = await readIndexFile();
                const latestBuses = latest.data["e-buses-list"];

                const busToDelete = latestBuses.find(function (entry) {
                    return entry.id === bus.id;
                });

                if (!busToDelete) {
                    throw new Error(
                        "This listing is no longer in index.json. Reload the dashboard."
                    );
                }

                const oldImagePaths = getImagePaths(busToDelete);

                latest.data["e-buses-list"] = latestBuses.filter(
                    function (entry) {
                        return entry.id !== bus.id;
                    }
                );

                await updateIndexFile(
                    latest.data,
                    latest.sha,
                    "Delete bus listing " + bus.id
                );

                if (editingId === bus.id) {
                    clearForm();
                }

                await loadListings();

                const cleanupMessage = await deleteUnusedImages(
                    oldImagePaths,
                    buses
                );

                showStatus(
                    "Listing " + bus.id + " deleted." + cleanupMessage
                );

            } catch (error) {
                showStatus("Error: " + error.message);
                deleteButton.disabled = false;
            }
        });

        item.appendChild(deleteButton);
        listingList.appendChild(item);
    });
}

async function loadListings() {
    try {
        showStatus("Loading listings from GitHub...");

        const result = await readIndexFile();
        buses = result.data["e-buses-list"];

        renderListings();
        showStatus("Listings loaded from GitHub.");

    } catch (error) {
        showStatus("Error loading listings: " + error.message);
        document.getElementById("listingList").textContent =
            "Could not load listings from GitHub.";
    }
}

function getSafeExtension(file) {
    const nameParts = file.name.split(".");
    let extension = nameParts.length > 1
        ? nameParts.pop().toLowerCase()
        : "";

    const allowed = ["jpg", "jpeg", "png", "webp", "gif", "avif"];

    if (!allowed.includes(extension)) {
        const mimeExtensions = {
            "image/jpeg": "jpg",
            "image/png": "png",
            "image/webp": "webp",
            "image/gif": "gif",
            "image/avif": "avif"
        };

        extension = mimeExtensions[file.type] || "";
    }

    if (!extension || !file.type.startsWith("image/")) {
        throw new Error(
            "One of the selected files is not a supported image."
        );
    }

    return extension;
}

async function uploadImage(file, busId, fieldName) {
    const extension = getSafeExtension(file);
    const timestamp = Date.now();

    const filename =
        busId + "_" + fieldName + "_" + timestamp + "." + extension;

    const path = "assets/" + filename;
    const content = await fileToBase64(file);

    await githubRequest(path, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            message: "Upload image for " + busId,
            content: content,
            branch: BRANCH
        })
    });

    return path;
}

async function deleteRepoImage(path) {
    if (
        typeof path !== "string" ||
        !path.startsWith("assets/") ||
        path.includes("..")
    ) {
        return;
    }

    try {
        const file = await githubRequest(
            path + "?ref=" + encodeURIComponent(BRANCH),
            { method: "GET", cache: "no-store" }
        );

        await githubRequest(path, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                message: "Remove unused bus image",
                sha: file.sha,
                branch: BRANCH
            })
        });

    } catch (error) {
        // A missing file is already effectively deleted.
        if (!error.message.includes("could not find")) {
            throw error;
        }
    }
}

async function deleteUnusedImages(oldPaths, remainingBuses) {
    const stillUsed = new Set();

    remainingBuses.forEach(function (bus) {
        getImagePaths(bus).forEach(function (path) {
            stillUsed.add(path);
        });
    });

    const unused = [...new Set(oldPaths)].filter(function (path) {
        return !stillUsed.has(path);
    });

    let failed = 0;

    for (const path of unused) {
        try {
            await deleteRepoImage(path);
        } catch (error) {
            failed++;
        }
    }

    if (failed > 0) {
        return (
            " The listing was removed, but " + failed +
            " unused image file(s) could not be deleted from assets."
        );
    }

    return unused.length > 0
        ? " Unused images were also removed from assets."
        : "";
}

existingBus.addEventListener("change", function () {
    if (!existingBus.value) {
        clearForm();
        return;
    }

    const bus = buses.find(function (item) {
        return item.id === existingBus.value;
    });

    if (bus) startEditing(bus);
});

document.getElementById("newButton").addEventListener("click", clearForm);
document.getElementById("cancelButton").addEventListener("click", clearForm);

imageFields.forEach(function (field) {
    document.getElementById(field).addEventListener("change", function () {
        const bus = buses.find(function (item) {
            return item.id === editingId;
        });

        showImagePreviews(bus || null);
    });
});

form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const saveButton = document.getElementById("saveButton");
    saveButton.disabled = true;

    const uploadedPaths = [];
    const wasEditing = Boolean(editingId);

    try {
        showStatus("Preparing to save listing...");

        // Read the latest JSON from GitHub before making a change.
        const latest = await readIndexFile();
        const latestBuses = latest.data["e-buses-list"];

        let busId = editingId;

        if (editingId) {
            const exists = latestBuses.some(function (bus) {
                return bus.id === editingId;
            });

            if (!exists) {
                throw new Error(
                    "This listing no longer exists in index.json. Reload the dashboard."
                );
            }
        } else {
            busId = getNextId(latestBuses);
        }

        const existingRecord = editingId
            ? latestBuses.find(function (bus) {
                return bus.id === editingId;
            })
            : {};

        const busRecord = {
            ...existingRecord,
            id: busId,
            "e-buses-list-item-title":
                document.getElementById("title").value.trim(),
            "e-buses-list-item-price":
                document.getElementById("price").value.trim(),
            "e-buses-list-item-description":
                document.getElementById("description").value.trim()
        };

        const oldImagePaths = editingId
            ? getImagePaths(existingRecord)
            : [];

        // Upload any newly selected images first.
        for (const field of imageFields) {
            const input = document.getElementById(field);
            const file = input.files && input.files[0];

            if (file) {
                showStatus("Uploading " + field + "...");

                const newPath = await uploadImage(file, busId, field);

                uploadedPaths.push(newPath);
                busRecord[jsonImageFields[field]] = newPath;
            }
        }

        // Add or replace the record in the original e-buses-list array.
        if (editingId) {
            const recordIndex = latestBuses.findIndex(function (bus) {
                return bus.id === editingId;
            });

            latestBuses[recordIndex] = busRecord;
        } else {
            latestBuses.push(busRecord);
        }

        showStatus("Saving listing information to index.json...");

        await updateIndexFile(
            latest.data,
            latest.sha,
            wasEditing
                ? "Update bus listing " + busId
                : "Add bus listing " + busId
        );

        // Reload from GitHub so the dashboard reflects the committed data.
        await loadListings();
        clearForm();

        let message = wasEditing
            ? "Listing " + busId + " updated successfully."
            : "Listing " + busId + " added successfully.";

        // Remove replaced images only when no listing still uses them.
        if (oldImagePaths.length > 0) {
            const cleanupMessage = await deleteUnusedImages(
                oldImagePaths,
                buses
            );

            message += cleanupMessage;
        }

        showStatus(message);

    } catch (error) {
        showStatus(
            "Error: " + error.message +
            (uploadedPaths.length > 0
                ? "\nSome images may already have been uploaded to assets/. Check the repository before retrying."
                : "")
        );
    } finally {
        saveButton.disabled = false;
    }
});

loadListings();