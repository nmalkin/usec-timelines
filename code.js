// --- Constants ---
const SVG_NS = "http://www.w3.org/2000/svg";
const BAR_HEIGHT = 30; // Height of each timeline bar
const CYCLE_PADDING = 5; // Vertical space between cycle bars within a conference
const CONFERENCE_PADDING = 10; // Vertical space below each conference row
const MONTH_LABEL_HEIGHT = 20; // Space for month labels at the top of the SVG
const SMALL_BREAKPOINT = 768; // Bootstrap's 'md' breakpoint (approx)
const TODAY_MARKER_WIDTH = 2; // Thicker line for today marker

// Color Palettes (Consider moving to CSS variables if more complex theming is needed)
const LIGHT_COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"];
const DARK_COLORS = ["#6baed6", "#fd8d3c", "#74c476", "#ef6548", "#ad49f3", "#d59f84", "#f7b6d2", "#bdbdbd", "#dadaeb", "#63d0d0"]; // Brighter/Pastel versions for dark bg

// --- Date Helpers ---

/**
 * Parses a YYYY-MM-DD string into a Date object (UTC to avoid timezone issues).
 * @param {string} dateString - The date string in YYYY-MM-DD format.
 * @returns {object} An object containing the `date` (Date object) and `isUncertain` (boolean).
 */
function parseDate(dateString) {
    const isUncertain = dateString.endsWith('?');
    const cleanDateString = isUncertain ? dateString.slice(0, -1) : dateString;
    const parts = cleanDateString.split('-');
    // Month is 0-indexed in JavaScript Date constructor
    const date = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
    return { date, isUncertain };
}

/**
 * Calculates the difference between two dates in days.
 * @param {Date} date1 - The first date.
 * @param {Date} date2 - The second date.
 * @returns {number} The difference in days (date2 - date1).
 */
function diffDays(date1, date2) {
    const oneDay = 24 * 60 * 60 * 1000; // hours*minutes*seconds*milliseconds
    return Math.round((date2 - date1) / oneDay);
}

/**
 * Gets the real current date.
 * @returns {Date} Today's date.
 */
function getTodaysDateReal() {
    const today = new Date();
    // Set hours to 0 to compare dates consistently
    today.setUTCHours(0, 0, 0, 0);
    return today;
}

/**
 * Gets a fixed date for testing purposes.
 * @returns {Date} A fixed date (2024-09-01).
 */
function getTodaysDateTest() {
    // Note: Using parseDate ensures it's treated as UTC
    return parseDate("2024-09-01").date;
}

/**
 * Formats a Date object into a verbose string (e.g., "Thursday, April 3, 2025").
 * Uses UTC to ensure consistency. If the date is uncertain, formats as "Month (?) Year".
 * @param {Date} date - The Date object to format.
 * @param {boolean} isUncertain - Flag indicating if the date is uncertain.
 * @returns {string} The formatted date string.
 */
function formatDateVerbose(date, isUncertain) {
    if (isUncertain) {
        const options = { year: 'numeric', month: 'long', timeZone: 'UTC' };
        const formatted = date.toLocaleDateString('en-US', options);
        // Inject the (?) after the month
        const parts = formatted.split(' ');
        if (parts.length === 2) { // Expecting "Month Year"
            return `${parts[0]} (?) ${parts[1]}`;
        }
        return formatted; // Fallback if format is unexpected
    } else {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' };
        // Use en-US locale for consistent formatting, adjust if needed for other locales
        return date.toLocaleDateString('en-US', options);
    }
}


// --- Global State ---
// Choose which date function to use (real or test)
const getTodaysDate = getTodaysDateReal; // Or use getTodaysDateTest for debugging

let conferenceData = null; // Stores the fetched conference data
// Global variable to store filter controls container
let filterContainer = null;
// localStorage key for filter state
const FILTER_STORAGE_KEY = 'conferenceFilterState';


// --- LocalStorage Helpers ---

/**
 * Saves the current state of conference filter checkboxes to localStorage.
 */
function saveFilterState() {
    if (!filterContainer) return;
    const state = {};
    const conferenceCheckboxes = filterContainer.querySelectorAll('.conference-filter-checkbox');
    conferenceCheckboxes.forEach(checkbox => {
        state[checkbox.value] = checkbox.checked;
    });
    try {
        localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.error("Failed to save filter state to localStorage:", e);
    }
}

/**
 * Loads the filter state from localStorage.
 * @returns {object | null} The saved state object or null if none exists/error.
 */
function loadFilterState() {
    try {
        const savedState = localStorage.getItem(FILTER_STORAGE_KEY);
        if (savedState) {
            return JSON.parse(savedState);
        }
    } catch (e) {
        console.error("Failed to load or parse filter state from localStorage:", e);
    }
    return null; // Return null if no state saved or if there was an error
}

/**
 * Removes the filter state from localStorage.
 */
function removeFilterState() {
    try {
        localStorage.removeItem(FILTER_STORAGE_KEY);
    } catch (e) {
        console.error("Failed to remove filter state from localStorage:", e);
    }
}


// --- Filter Controls Rendering ---

/**
 * Creates the "Select All / None" checkbox and adds its event listener.
 * @returns {HTMLElement} The div element containing the checkbox.
 */
function createSelectAllCheckbox() {
    const selectAllDiv = document.createElement('div');
    selectAllDiv.className = 'col-12 mb-2'; // Span full width, add margin below

    const selectAllFormCheck = document.createElement('div');
    selectAllFormCheck.className = 'form-check';

    const selectAllInput = document.createElement('input');
    selectAllInput.className = 'form-check-input';
    selectAllInput.type = 'checkbox';
    selectAllInput.id = 'filter-all';

    const selectAllLabel = document.createElement('label');
    selectAllLabel.className = 'form-check-label select-all-label';
    selectAllLabel.htmlFor = 'filter-all';
    selectAllLabel.textContent = 'Select All / None';

    selectAllFormCheck.appendChild(selectAllInput);
    selectAllFormCheck.appendChild(selectAllLabel);
    selectAllDiv.appendChild(selectAllFormCheck);

    // Add event listener for "Select All"
    selectAllInput.addEventListener('change', () => {
        const isChecked = selectAllInput.checked;
        const conferenceCheckboxes = filterContainer.querySelectorAll('.conference-filter-checkbox');
        conferenceCheckboxes.forEach(checkbox => {
            checkbox.checked = isChecked;
        });
        renderTimeline(); // Re-render after changing all checkboxes

        // Remove state if "Select All" is checked (meaning all are selected), save otherwise
        if (isChecked) {
            removeFilterState();
        } else {
            saveFilterState();
        }
    });

    return selectAllDiv;
}

/**
 * Creates a single conference filter checkbox element within a grid column.
 * @param {object} conf - The conference object.
 * @param {object | null} savedFilterState - The loaded filter state from localStorage.
 * @returns {HTMLElement} The column div element containing the checkbox.
 */
function createConferenceFilterCheckbox(conf, savedFilterState) {
    const colDiv = document.createElement('div');
    // Define responsive columns: 3 on xs, 2 on sm+
    colDiv.className = 'col-3 col-sm-2 col-md-2';

    const formCheck = document.createElement('div');
    formCheck.className = 'form-check';

    const input = document.createElement('input');
    input.className = 'form-check-input conference-filter-checkbox';
    input.type = 'checkbox';
    input.value = conf.conference; // Use conference name as value
    input.id = `filter-${conf.conference.replace(/\s+/g, '-')}`; // Create a unique ID
    // Set checked state based on loaded state, default to true if no state exists
    input.checked = savedFilterState ? (savedFilterState[conf.conference] ?? true) : true;

    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.htmlFor = input.id;
    label.textContent = conf.conference;

    formCheck.appendChild(input);
    formCheck.appendChild(label);
    colDiv.appendChild(formCheck);

    // Add event listener to re-render timeline, update "Select All", and save state
    input.addEventListener('change', () => {
        updateSelectAllCheckboxState();
        renderTimeline();

        // Check "Select All" state AFTER update, then save or remove state
        const selectAllInput = document.getElementById('filter-all');
        if (selectAllInput && selectAllInput.checked) {
            removeFilterState(); // If all are checked now, remove specific state
        } else {
            saveFilterState(); // Otherwise, save the current (partial) state
        }
    });

    return colDiv;
}

/**
 * Renders the filter checkboxes for conferences into the filter container.
 * @param {Array} conferences - The conference data array.
 */
function renderFilterControls(conferences) {
    if (!filterContainer) {
        console.error("Filter container not found!");
        return;
    }
    filterContainer.innerHTML = '<h5>Filter Conferences:</h5>'; // Clear previous controls but keep title

    const savedFilterState = loadFilterState();

    // Add "Select All" checkbox
    const selectAllCheckbox = createSelectAllCheckbox();
    filterContainer.appendChild(selectAllCheckbox);

    // Add row for conference checkboxes
    const conferenceRow = document.createElement('div');
    conferenceRow.className = 'row g-1'; // Add row class and reduced gutter spacing
    filterContainer.appendChild(conferenceRow);

    // Add individual conference checkboxes
    conferences.forEach(conf => {
        const checkboxElement = createConferenceFilterCheckbox(conf, savedFilterState);
        conferenceRow.appendChild(checkboxElement);
    });

    // Set the initial state of the "Select All" checkbox after rendering individuals
    updateSelectAllCheckboxState();
}

/**
 * Updates the checked state of the "Select All" checkbox based on individual checkbox states.
 */
function updateSelectAllCheckboxState() {
    const selectAllInput = document.getElementById('filter-all');
    if (!selectAllInput || !filterContainer) return; // Exit if elements aren't ready

    const conferenceCheckboxes = filterContainer.querySelectorAll('.conference-filter-checkbox');
    if (conferenceCheckboxes.length === 0) {
        selectAllInput.checked = false; // No checkboxes, so not "all" are checked
        return;
    }
    const allChecked = Array.from(conferenceCheckboxes).every(checkbox => checkbox.checked);
    selectAllInput.checked = allChecked;
    // Optional: Handle indeterminate state visually if desired
    // const noneChecked = Array.from(conferenceCheckboxes).every(checkbox => !checkbox.checked);
    // selectAllInput.indeterminate = !allChecked && !noneChecked;
}


// --- SVG Element Creation Helper ---

/**
 * Creates an SVG element with specified attributes.
 * @param {string} tagName - The type of SVG element (e.g., 'rect', 'line', 'text').
 * @param {object} attributes - An object mapping attribute names to values.
 * @returns {SVGElement} The created SVG element.
 */
function createSvgElement(tagName, attributes) {
    const element = document.createElementNS(SVG_NS, tagName);
    for (const key in attributes) {
        element.setAttribute(key, attributes[key]);
    }
    return element;
}


// --- Timeline Rendering Logic ---

/**
 * Calculates the overall date range for the timeline based on filtered data.
 * @param {Array} conferencesToRender - The filtered list of conferences.
 * @returns {{minDate: Date, maxDate: Date, totalTimelineDays: number}}
 */
function calculateTimelineDateRange(conferencesToRender) {
    let minDate = new Date(8640000000000000); // Max possible date
    let maxDate = new Date(-8640000000000000); // Min possible date

    conferencesToRender.forEach(conf => {
        conf.installments?.forEach(inst => {
            inst.cycles?.forEach(cycle => {
                cycle.dates?.forEach(event => {
                    const { date: d } = parseDate(event.date);
                    if (d < minDate) minDate = d;
                    if (d > maxDate) maxDate = d;
                });
            });
        });
    });

    // Add padding (1 month before/after) and align to month start
    minDate.setUTCMonth(minDate.getUTCMonth() - 1);
    minDate.setUTCDate(1);
    maxDate.setUTCMonth(maxDate.getUTCMonth() + 1);
    maxDate.setUTCDate(1);

    const totalTimelineDays = diffDays(minDate, maxDate);
    return { minDate, maxDate, totalTimelineDays };
}

/**
 * Calculates the required dimensions for the SVG timeline.
 * @param {number} totalTimelineDays - The total duration of the timeline in days.
 * @param {Date} today - The current date.
 * @param {number} scrollContainerWidth - The width of the scrollable container.
 * @returns {{totalSvgTimelineWidth: number, pixelsPerDay: number}}
 */
function calculateSvgDimensions(totalTimelineDays, today, scrollContainerWidth) {
    const isSmallScreen = window.innerWidth < SMALL_BREAKPOINT;
    const timelineDurationMonths = isSmallScreen ? 3 : 12; // Initial visible duration

    // Calculate pixels-per-day based on the desired initial view
    const initialViewEndDate = new Date(today);
    initialViewEndDate.setUTCMonth(initialViewEndDate.getUTCMonth() + timelineDurationMonths);
    const initialViewDays = diffDays(today, initialViewEndDate);

    // Avoid division by zero if initial view is 0 days (shouldn't happen with month padding)
    const pixelsPerDay = initialViewDays > 0 ? scrollContainerWidth / initialViewDays : 1;
    const totalSvgTimelineWidth = totalTimelineDays * pixelsPerDay;

    return { totalSvgTimelineWidth, pixelsPerDay };
}

/**
 * Pre-calculates the layout (Y position, height, row assignments) for each conference and its cycles.
 * @param {Array} conferences - The list of conferences to lay out.
 * @param {Date} minDate - The start date of the timeline.
 * @param {number} totalTimelineDays - The total duration of the timeline in days.
 * @param {number} totalSvgTimelineWidth - The total width of the SVG.
 * @returns {{conferenceLayouts: Array, totalSvgHeight: number}}
 */
function calculateConferenceLayouts(conferences, minDate, totalTimelineDays, totalSvgTimelineWidth) {
    let totalRequiredHeight = MONTH_LABEL_HEIGHT;
    const conferenceLayouts = conferences.map(conf => {
        const conferenceRows = []; // Tracks end X coordinate for each row: [{ endX: number }]
        const cycleLayouts = []; // Stores layout info for each cycle
        let maxRows = 0;

        conf.installments?.forEach(inst => {
            inst.cycles?.forEach(cycle => {
                if (!cycle.dates || cycle.dates.length < 2) return;

                let cycleMinDate = parseDate(cycle.dates[0].date).date;
                let cycleMaxDate = parseDate(cycle.dates[cycle.dates.length - 1].date).date;
                // Ensure correct min/max if dates aren't pre-sorted (though they should be)
                for (let i = 1; i < cycle.dates.length; i++) {
                    const d = parseDate(cycle.dates[i].date).date;
                    if (d < cycleMinDate) cycleMinDate = d;
                    if (d > cycleMaxDate) cycleMaxDate = d;
                }

                const startDaysOffset = diffDays(minDate, cycleMinDate);
                const endDaysOffset = diffDays(minDate, cycleMaxDate);
                const startXPixel = (Math.max(0, startDaysOffset) / totalTimelineDays) * totalSvgTimelineWidth;
                const endXPixel = (Math.min(totalTimelineDays, endDaysOffset) / totalTimelineDays) * totalSvgTimelineWidth;

                // Estimate label width (simple estimation, could be improved)
                const labelText = cycle.name || "";
                const estimatedCharWidth = 8; // Rough estimate
                const labelPadding = 15; // Space left + right of label
                const labelWidth = labelText ? (labelText.length * estimatedCharWidth + labelPadding) : 0;
                const effectiveStartX = startXPixel - labelWidth; // Consider label space for overlap check

                // Find the first row where this cycle fits without overlapping horizontally
                let assignedRowIndex = -1;
                for (let i = 0; i < conferenceRows.length; i++) {
                    if (effectiveStartX >= conferenceRows[i].endX) {
                        assignedRowIndex = i;
                        conferenceRows[i].endX = endXPixel; // Update row's end
                        break;
                    }
                }

                // If no suitable row found, add a new one
                if (assignedRowIndex === -1) {
                    assignedRowIndex = conferenceRows.length;
                    conferenceRows.push({ endX: endXPixel });
                }

                cycleLayouts.push({ cycle, inst, rowIndex: assignedRowIndex, startXPixel, endXPixel, labelWidth });
                maxRows = Math.max(maxRows, assignedRowIndex + 1);
            });
        });

        // Calculate conference height based on the number of rows needed
        const confHeight = maxRows === 0 ? 0 : (maxRows * BAR_HEIGHT) + (Math.max(0, maxRows - 1) * CYCLE_PADDING);
        const layout = { conf, confHeight, cycleLayouts };
        totalRequiredHeight += confHeight + (confHeight > 0 ? CONFERENCE_PADDING : 0);
        return layout;
    });

    // Adjust total height: remove padding added after the *last visible* conference
    for (let i = conferenceLayouts.length - 1; i >= 0; i--) {
        if (conferenceLayouts[i].confHeight > 0) {
            totalRequiredHeight -= CONFERENCE_PADDING; // Remove the last padding
            break;
        }
    }

    const totalSvgHeight = Math.max(MONTH_LABEL_HEIGHT, totalRequiredHeight); // Ensure minimum height for month labels
    return { conferenceLayouts, totalSvgHeight };
}

/**
 * Renders the conference name labels in the left-hand pane.
 * @param {Array} conferenceLayouts - Pre-calculated layout information.
 * @param {HTMLElement} labelContainer - The container element for labels.
 */
function renderConferenceLabels(conferenceLayouts, labelContainer) {
    labelContainer.innerHTML = ''; // Clear previous labels
    conferenceLayouts.forEach((layout) => {
        const { conf, confHeight } = layout;
        if (confHeight === 0) return; // Skip conferences with no visible cycles

        const labelDiv = document.createElement("div");
        labelDiv.classList.add("conference-label-item");
        // Set the dynamic height CSS variable for this label
        labelDiv.style.setProperty('--dynamic-conf-height', `${confHeight + CONFERENCE_PADDING}px`);
        labelDiv.textContent = conf.conference;
        labelContainer.appendChild(labelDiv);
    });
}

/**
 * Renders the cycle name label (potentially as a link) in the SVG.
 * @param {SVGElement} svg - The main SVG element.
 * @param {object} cycleData - Data for the cycle ({ cycle, inst }).
 * @param {number} x - The calculated X position for the label anchor.
 * @param {number} y - The calculated Y position for the label.
 */
function renderCycleLabel(svg, cycleData, x, y) {
    const { cycle, inst } = cycleData;
    if (!cycle.name) return; // No label to render

    const labelText = createSvgElement("text", {
        x: x - 5, // Position left of the first bar segment
        y: y + BAR_HEIGHT / 2, // Vertically center on the cycle's row
        "font-size": "14px",
        "text-anchor": "end",
        "dominant-baseline": "middle"
    });
    labelText.textContent = cycle.name;

    if (inst.website) {
        const link = createSvgElement("a", {
            class: "cycle-label-link",
            href: inst.website,
            target: "_blank"
        });
        const linkTitle = createSvgElement("title", {});
        linkTitle.textContent = `Visit ${inst.conference} ${inst.year} website`; // Assuming inst has conference/year
        link.appendChild(linkTitle);
        link.appendChild(labelText);
        svg.appendChild(link);
    } else {
        labelText.setAttribute("class", "cycle-label-text");
        svg.appendChild(labelText);
    }
}

/**
 * Renders a single timeline bar (rect) for a cycle segment in the SVG.
 * @param {SVGElement} svg - The main SVG element.
 * @param {object} segmentData - Data for the segment ({ x, y, width, color, popoverContent }).
 */
function renderTimelineBar(svg, segmentData) {
    const { x, y, width, color, popoverTitle, popoverContent } = segmentData;

    const rect = createSvgElement("rect", {
        x: x,
        y: y,
        width: width,
        height: BAR_HEIGHT,
        fill: color,
        "data-bs-toggle": "popover",
        "data-bs-placement": "top",
        "data-bs-trigger": "hover click focus",
        "data-bs-title": popoverTitle,
        "data-bs-content": popoverContent,
        "data-bs-html": "true"
    });
    svg.appendChild(rect);
}

/**
 * Renders all cycle bars and their labels for a given conference.
 * @param {SVGElement} svg - The main SVG element.
 * @param {Array} cycleLayouts - Pre-calculated layouts for the cycles of one conference.
 * @param {number} conferenceStartY - The Y position where this conference starts in the SVG.
 * @param {Date} minDate - The start date of the timeline.
 * @param {number} totalTimelineDays - The total duration of the timeline in days.
 * @param {number} totalSvgTimelineWidth - The total width of the SVG.
 * @param {Array} ACTIVE_COLORS - The color palette to use.
 * @param {Date} maxDate - The end date of the timeline.
 * @param {string} conferenceName - The name of the conference.
 */
function renderConferenceCycles(svg, cycleLayouts, conferenceStartY, minDate, totalTimelineDays, totalSvgTimelineWidth, ACTIVE_COLORS, maxDate, conferenceName) {
    cycleLayouts.forEach(({ cycle, inst, rowIndex }) => {
        const cycleY = conferenceStartY + rowIndex * (BAR_HEIGHT + CYCLE_PADDING);
        let colorIndex = 0;
        let firstSegmentX = -1; // Track start X for label placement

        for (let i = 0; i < cycle.dates.length - 1; i++) {
            const startEvent = cycle.dates[i];
            const endEvent = cycle.dates[i + 1];
            const { date: segmentStartDate, isUncertain: startIsUncertain } = parseDate(startEvent.date);
            const { date: segmentEndDate, isUncertain: endIsUncertain } = parseDate(endEvent.date);

            // Check if segment is valid and within the overall timeline bounds
            if (segmentStartDate < segmentEndDate && segmentEndDate > minDate && segmentStartDate < maxDate) {
                const startDaysOffset = diffDays(minDate, segmentStartDate);
                const endDaysOffset = diffDays(minDate, segmentEndDate);
                const clampedStartDays = Math.max(0, startDaysOffset);
                const clampedEndDays = Math.min(totalTimelineDays, endDaysOffset);

                if (clampedStartDays < clampedEndDays) {
                    const x = (clampedStartDays / totalTimelineDays) * totalSvgTimelineWidth;
                    const width = ((clampedEndDays - clampedStartDays) / totalTimelineDays) * totalSvgTimelineWidth;

                    if (width >= 1) { // Only render if width is at least 1 pixel
                        // Render label before the first segment
                        if (firstSegmentX === -1) {
                            firstSegmentX = x;
                            // Pass necessary data for label creation
                            renderCycleLabel(svg, { cycle, inst, conference: inst.conference, year: inst.year }, firstSegmentX, cycleY);
                        }

                        // Prepare popover content
                        const popoverTitle = `${conferenceName} ${inst.year}`; // Use passed conference name
                        const formattedStartDate = formatDateVerbose(segmentStartDate, startIsUncertain);
                        const formattedEndDate = formatDateVerbose(segmentEndDate, endIsUncertain);
                        const durationDays = diffDays(segmentStartDate, segmentEndDate);
                        const popoverContent = `<strong>${startEvent.description}</strong><br>${formattedStartDate}<br><br><span class="popover-duration">(${durationDays} days)</span><br><br><strong>${endEvent.description}</strong><br>${formattedEndDate}`;

                        // Render the bar
                        renderTimelineBar(svg, {
                            x: x,
                            y: cycleY,
                            width: width,
                            color: ACTIVE_COLORS[colorIndex % ACTIVE_COLORS.length],
                            popoverTitle: popoverTitle,
                            popoverContent: popoverContent
                        });
                    }
                }
            }
            colorIndex++; // Use next color for the next segment
        }
    });
}

/**
 * Renders the horizontal separator lines between conferences in the SVG.
 * @param {SVGElement} svg - The main SVG element.
 * @param {Array} conferenceLayouts - Pre-calculated layout information.
 * @param {number} totalSvgTimelineWidth - The total width of the SVG.
 * @param {number} initialYOffset - The starting Y offset (MONTH_LABEL_HEIGHT).
 */
function renderSeparatorLines(svg, conferenceLayouts, totalSvgTimelineWidth, initialYOffset) {
    let currentY = initialYOffset;
    conferenceLayouts.forEach((layout, confIndex) => {
        const { confHeight } = layout;
        if (confHeight === 0) return; // Skip if no height

        // Check if this is the last *visible* conference
        let isLastVisible = true;
        for (let k = confIndex + 1; k < conferenceLayouts.length; k++) {
            if (conferenceLayouts[k].confHeight > 0) {
                isLastVisible = false;
                break;
            }
        }

        if (!isLastVisible) {
            // Calculate Y position for the line (aligned with bottom border of label)
            const separatorY = currentY + confHeight + CONFERENCE_PADDING - 0.5; // -0.5 for crispness
            const separatorLine = createSvgElement("line", {
                x1: 0,
                y1: separatorY,
                x2: totalSvgTimelineWidth,
                y2: separatorY,
                "stroke-width": "1",
                class: "separator-line" // Style via CSS
            });
            svg.appendChild(separatorLine);
        }

        currentY += confHeight + CONFERENCE_PADDING; // Update Y for the next potential line
    });
}

/**
 * Renders the vertical month marker lines and labels in the SVG.
 * @param {SVGElement} svg - The main SVG element.
 * @param {Date} minDate - The start date of the timeline.
 * @param {Date} maxDate - The end date of the timeline.
 * @param {number} totalTimelineDays - The total duration of the timeline in days.
 * @param {number} totalSvgTimelineWidth - The total width of the SVG.
 * @param {number} totalSvgHeight - The total height of the SVG.
 */
function renderMonthMarkers(svg, minDate, maxDate, totalTimelineDays, totalSvgTimelineWidth, totalSvgHeight) {
    const monthGroup = createSvgElement("g", {}); // Group markers for clarity
    svg.appendChild(monthGroup);

    let currentMonth = new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), 1));

    while (currentMonth <= maxDate) {
        const daysFromStart = diffDays(minDate, currentMonth);

        if (daysFromStart >= 0 && daysFromStart <= totalTimelineDays) {
            const xPos = (daysFromStart / totalTimelineDays) * totalSvgTimelineWidth;

            // Vertical line
            const line = createSvgElement("line", {
                x1: xPos,
                y1: 0, // Start from top
                x2: xPos,
                y2: totalSvgHeight, // Extend to bottom
                "stroke-width": "1",
                "shape-rendering": "crispEdges",
                class: "month-marker-line" // Style via CSS
            });
            monthGroup.appendChild(line);

            // Month label
            const label = createSvgElement("text", {
                x: xPos + 3, // Slight offset
                y: MONTH_LABEL_HEIGHT - 7, // Position in label area
                "font-size": "10px",
                "dominant-baseline": "middle",
                class: "month-label" // Style via CSS
            });
            label.textContent = `${currentMonth.toLocaleString('default', { month: 'short', timeZone: 'UTC' })} ${currentMonth.getUTCFullYear()}`;
            monthGroup.appendChild(label);
        }

        // Move to the next month
        currentMonth.setUTCMonth(currentMonth.getUTCMonth() + 1);
        currentMonth.setUTCDate(1); // Ensure start of month
    }
}

/**
 * Renders the "Today" marker line in the SVG.
 * @param {SVGElement} svg - The main SVG element.
 * @param {Date} minDate - The start date of the timeline.
 * @param {Date} today - The current date.
 * @param {number} totalTimelineDays - The total duration of the timeline in days.
 * @param {number} totalSvgTimelineWidth - The total width of the SVG.
 * @param {number} totalSvgHeight - The total height of the SVG.
 */
function renderTodayMarker(svg, minDate, today, totalTimelineDays, totalSvgTimelineWidth, totalSvgHeight) {
    const daysFromStartToToday = diffDays(minDate, today);
    if (daysFromStartToToday >= 0 && daysFromStartToToday <= totalTimelineDays) {
        const todayXPos = (daysFromStartToToday / totalTimelineDays) * totalSvgTimelineWidth;
        const todayLine = createSvgElement("line", {
            x1: todayXPos,
            y1: 0,
            x2: todayXPos,
            y2: totalSvgHeight,
            "stroke-width": TODAY_MARKER_WIDTH,
            "shape-rendering": "crispEdges",
            class: "today-marker-line" // Style via CSS
        });

        // Add a title for hover info
        const titleElem = createSvgElement("title", {});
        titleElem.textContent = `Today (${today.toISOString().split('T')[0]})`;
        todayLine.appendChild(titleElem);

        svg.appendChild(todayLine);
    }
}

/**
 * Initializes Bootstrap popovers for elements within the SVG.
 * @param {SVGElement} svg - The main SVG element containing popover triggers.
 */
function initializePopovers(svg) {
    const popoverTriggerList = Array.from(svg.querySelectorAll('[data-bs-toggle="popover"]'));
    popoverTriggerList.forEach(popoverTriggerEl => {
        new bootstrap.Popover(popoverTriggerEl, {
            container: 'body' // Render popover in body to avoid SVG clipping issues
        });
    });
}

/**
 * Sets the initial horizontal scroll position of the timeline container.
 * @param {HTMLElement} scrollContainer - The scrollable container element.
 * @param {Date} minDate - The start date of the timeline.
 * @param {Date} today - The current date.
 * @param {number} totalTimelineDays - The total duration of the timeline in days.
 * @param {number} totalSvgTimelineWidth - The total width of the SVG.
 */
function setInitialScrollPosition(scrollContainer, minDate, today, totalTimelineDays, totalSvgTimelineWidth) {
    const daysFromStartToToday = diffDays(minDate, today);
    // Calculate the scroll offset to place 'today' near the left edge
    const scrollOffset = (daysFromStartToToday / totalTimelineDays) * totalSvgTimelineWidth;

    // Ensure scroll offset is within valid bounds
    const maxScrollLeft = scrollContainer.scrollWidth - scrollContainer.clientWidth;
    scrollContainer.scrollLeft = Math.max(0, Math.min(scrollOffset, maxScrollLeft));
}


/**
 * Main function to render the entire conference timeline.
 */
function renderTimeline() {
    if (!conferenceData) {
        // Data not loaded yet, maybe show loading state (handled in loadAndRenderTimeline)
        return;
    }

    // --- Get DOM Elements ---
    const labelContainer = document.getElementById('timeline-labels');
    const scrollContainer = document.getElementById('timeline-scroll-container');
    const wrapper = document.getElementById('timeline-wrapper');

    if (!labelContainer || !scrollContainer || !wrapper || !filterContainer) {
        console.error("Timeline layout or filter containers not found!");
        return;
    }

    // --- Filter Data ---
    const checkedFilters = Array.from(filterContainer.querySelectorAll('.conference-filter-checkbox:checked'));
    const visibleConferenceNames = new Set(checkedFilters.map(input => input.value));
    const conferencesToRender = conferenceData.filter(conf => visibleConferenceNames.has(conf.conference));

    // --- Handle Empty State ---
    if (conferencesToRender.length === 0) {
        labelContainer.innerHTML = '';
        scrollContainer.innerHTML = '<p class="p-3">No conferences selected. Check some boxes above to see the timeline.</p>';
        wrapper.style.minHeight = '50px'; // Prevent collapse
        return;
    } else {
        wrapper.style.minHeight = ''; // Reset minHeight
    }

    // --- Clear Previous Render ---
    labelContainer.innerHTML = '';
    scrollContainer.innerHTML = '';

    // --- Prepare Rendering Context ---
    const today = getTodaysDate();
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const ACTIVE_COLORS = isDarkMode ? DARK_COLORS : LIGHT_COLORS;
    const scrollContainerWidth = scrollContainer.clientWidth;

    // --- Calculations ---
    const { minDate, maxDate, totalTimelineDays } = calculateTimelineDateRange(conferencesToRender);
    const { totalSvgTimelineWidth } = calculateSvgDimensions(totalTimelineDays, today, scrollContainerWidth);
    const { conferenceLayouts, totalSvgHeight } = calculateConferenceLayouts(conferencesToRender, minDate, totalTimelineDays, totalSvgTimelineWidth);

    // --- Create SVG Element ---
    const svg = createSvgElement("svg", {
        class: "timeline-svg",
        width: totalSvgTimelineWidth,
        height: totalSvgHeight
    });
    scrollContainer.appendChild(svg);

    // --- Render Components ---
    renderConferenceLabels(conferenceLayouts, labelContainer);

    // Render SVG content
    renderMonthMarkers(svg, minDate, maxDate, totalTimelineDays, totalSvgTimelineWidth, totalSvgHeight);
    renderSeparatorLines(svg, conferenceLayouts, totalSvgTimelineWidth, MONTH_LABEL_HEIGHT);

    let currentY = MONTH_LABEL_HEIGHT; // Start below month labels
    conferenceLayouts.forEach((layout) => {
        const { confHeight, cycleLayouts } = layout;
        if (confHeight > 0) {
            const conferenceStartY = currentY + (CONFERENCE_PADDING / 2);
            // Pass conference-specific data to the rendering function
            const conferenceInfo = { conference: layout.conf.conference, year: layout.conf.year }; // Adjust as needed based on data structure
            renderConferenceCycles(svg, cycleLayouts, conferenceStartY, minDate, totalTimelineDays, totalSvgTimelineWidth, ACTIVE_COLORS, maxDate, layout.conf.conference);
            currentY += confHeight + CONFERENCE_PADDING;
        }
    });

    renderTodayMarker(svg, minDate, today, totalTimelineDays, totalSvgTimelineWidth, totalSvgHeight);

    // --- Final Steps ---
    setInitialScrollPosition(scrollContainer, minDate, today, totalTimelineDays, totalSvgTimelineWidth);
    initializePopovers(svg);
}


// --- Data Fetching and Initialization ---

/**
 * Sorts cycle dates chronologically within the conference data.
 * Modifies the global `conferenceData` object in place.
 */
function sortConferenceDataDates() {
    if (!conferenceData) return;

    conferenceData.forEach(conf => {
        conf.installments?.forEach(inst => {
            inst.cycles?.forEach(cycle => {
                if (cycle.dates && cycle.dates.length > 1) {
                    // Sort based on the actual date object, ignoring uncertainty for sorting
                    cycle.dates.sort((a, b) => parseDate(a.date).date - parseDate(b.date).date);
                }
            });
        });
    });
}

/**
 * Fetches conference data, sorts it, renders filters, and performs the initial timeline render.
 */
async function loadAndRenderTimeline() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        conferenceData = await response.json();

        sortConferenceDataDates(); // Sort dates after fetching

        filterContainer = document.getElementById('filter-container'); // Store container reference globally
        if (!filterContainer) {
            throw new Error("Filter container element not found in the DOM.");
        }

        renderFilterControls(conferenceData); // Render filters first
        renderTimeline(); // Initial render after data is loaded and filters are present

    } catch (error) {
        console.error("Failed to load or initialize timeline:", error);
        // Display a user-friendly error message
        const scrollContainer = document.getElementById('timeline-scroll-container');
        if (scrollContainer) {
            scrollContainer.innerHTML = '<p class="p-3 text-danger">Error loading timeline data. Please try refreshing the page.</p>';
        } else {
            // Fallback if even the scroll container isn't found
            document.body.insertAdjacentHTML('beforeend', '<p class="p-3 text-danger">Error loading timeline data.</p>');
        }
    }
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', loadAndRenderTimeline);

// Re-render on resize (debouncing could be added for performance if needed)
window.addEventListener('resize', renderTimeline);

// Re-render if the system color scheme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderTimeline);
