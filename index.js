
"use strict";

// Generate the next available electric bus ID.
function generateNextBusId(buses) {
    const prefix = "e-bus";
    let highestNumber = 0;

    buses.forEach(function (bus) {
        if (typeof bus.id !== "string") {
            return;
        }

        const match = bus.id.match(/^e-bus(\d+)$/);

        if (match) {
            const number = Number(match[1]);

            if (Number.isSafeInteger(number)) {
                highestNumber = Math.max(highestNumber, number);
            }
        }
    });

    return prefix + String(highestNumber + 1).padStart(3, "0");
}


// Create an HTML element with a CSS class.
function createElement(tagName, className) {
    const element = document.createElement(tagName);

    if (className) {
        element.className = className;
    }

    return element;
}


// Create a normal HTML image element.
function createImage(className, imagePath, altText) {
    const img = document.createElement("img");

    img.className = className;
    img.alt = altText;

    if (typeof imagePath === "string" && imagePath.trim() !== "") {
        img.src = imagePath;
    }

    return img;
}


// Create one electric bus listing from a JSON record.
function createBusListing(bus) {
    const itemCard = createElement("div", "e-buses-list-item");

    // Assign the bus ID to this listing.
    if (typeof bus.id === "string" && bus.id.trim() !== "") {
        itemCard.dataset.itemId = bus.id;
    }

    // LARGE IMAGE
    const largeImageContainer = createElement(
        "div",
        "large-image-container"
    );

    const largeImage = createImage(
        "e-buses-list-item-large-image",
        bus["e-buses-list-item-large-image"],
        bus["e-buses-list-item-title"] || "Electric bus"
    );

    largeImageContainer.appendChild(largeImage);


    // FOUR SMALL IMAGES
    const smallImagesContainer = createElement(
        "div",
        "small-images-container"
    );

    for (let i = 1; i <= 4; i++) {
        const imageKey = "e-buses-list-item-small-image" + i;

        const smallImage = createImage(
            "e-buses-list-item-small-image",
            bus[imageKey],
            "Bus image " + i
        );

        smallImagesContainer.appendChild(smallImage);
    }


    // TITLE, PRICE AND DESCRIPTION
    const listText = createElement("div", "list-text");

    const title = createElement(
        "div",
        "e-buses-list-item-title"
    );

    title.textContent =
        bus["e-buses-list-item-title"] || "";

    const price = createElement(
        "div",
        "e-buses-list-item-price"
    );

    price.textContent =
        bus["e-buses-list-item-price"] || "";

    const description = createElement(
        "div",
        "e-buses-list-item-description"
    );

    description.textContent =
        bus["e-buses-list-item-description"] || "";


    // Add the text elements to their container.
    listText.appendChild(title);
    listText.appendChild(price);
    listText.appendChild(description);


    // Assemble the complete bus listing.
    itemCard.appendChild(largeImageContainer);
    itemCard.appendChild(smallImagesContainer);
    itemCard.appendChild(listText);

    return itemCard;
}


// Load the electric bus listings from index.json.
async function loadElectricBuses() {
    const container = document.getElementById("e-buses-list");

    if (!container) {
        console.error(
            'The HTML container "#e-buses-list" was not found.'
        );
        return;
    }

    try {
        const response = await fetch("index.json");

        if (!response.ok) {
            throw new Error(
                "Could not load index.json. HTTP status: " +
                response.status
            );
        }

        const data = await response.json();
        const buses = data["e-buses-list"];

        if (!Array.isArray(buses)) {
            throw new Error(
                'The JSON must contain an "e-buses-list" array.'
            );
        }

        // Create all listings before adding them to the page.
        const fragment = document.createDocumentFragment();

        buses.forEach(function (bus) {
            fragment.appendChild(createBusListing(bus));
        });

        // Display all the listings.
        container.replaceChildren(fragment);

        // Make the ID generator available for later use.
        window.generateNextElectricBusId = function () {
            return generateNextBusId(buses);
        };

        console.log("Electric buses loaded:", buses.length);

        console.log(
            "Next available electric bus ID:",
            generateNextBusId(buses)
        );

    } catch (error) {
        console.error("Error loading electric buses:", error);

        container.textContent =
            "Unable to load the bus listings. Please check the JSON file.";
    }
}


// Run the loader after the HTML document has loaded.
document.addEventListener("DOMContentLoaded", function () {
    loadElectricBuses();
});
