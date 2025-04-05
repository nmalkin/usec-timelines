// --- Constants ---
const SVG_NS = "http://www.w3.org/2000/svg";
const BAR_HEIGHT = 30; // Height of each timeline bar
const CYCLE_PADDING = 5; // Vertical space between cycle bars within a conference
const CONFERENCE_PADDING = 10; // Vertical space below each conference row
const MONTH_LABEL_HEIGHT = 20; // Space for month labels at the top of the SVG
const SMALL_BREAKPOINT = 768; // Bootstrap's 'md' breakpoint (approx)
// const TODAY_MARKER_COLOR = "#333333"; // Now handled by CSS variable
const TODAY_MARKER_WIDTH = 2; // Thicker line for today marker

// Color Palettes
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
    return parseDate("2024-09-01");
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


// Use the test date for now
const getTodaysDate = getTodaysDateReal;

// Global variable to store fetched conference data
let conferenceData = null;
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
        // console.log("Filter state saved:", state); // For debugging
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
            // console.log("Filter state loaded:", JSON.parse(savedState)); // For debugging
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
        // console.log("Filter state removed."); // For debugging
    } catch (e) {
        console.error("Failed to remove filter state from localStorage:", e);
    }
}


// --- Filter Controls Rendering ---

/**
 * Renders the filter checkboxes for conferences.
 * @param {Array} conferences - The conference data array.
 */
function renderFilterControls(conferences) {
    if (!filterContainer) {
        console.error("Filter container not found!");
        return;
    }
    filterContainer.innerHTML = '<h5>Filter Conferences:</h5>'; // Clear previous controls but keep title

    // Load saved filter state
    const savedFilterState = loadFilterState();

    // --- Add "Select All" Checkbox ---
    const selectAllDiv = document.createElement('div');
    selectAllDiv.className = 'col-12 mb-2'; // Span full width, add margin below

    const selectAllFormCheck = document.createElement('div');
    selectAllFormCheck.className = 'form-check';

    const selectAllInput = document.createElement('input');
    selectAllInput.className = 'form-check-input';
    selectAllInput.type = 'checkbox';
    selectAllInput.id = 'filter-all';
    // selectAllInput.checked = true; // DO NOT default to checked; state determined by individual boxes after load

    const selectAllLabel = document.createElement('label');
    selectAllLabel.className = 'form-check-label select-all-label'; // Add specific class for styling
    selectAllLabel.htmlFor = 'filter-all';
    selectAllLabel.textContent = 'Select All / None';

    selectAllFormCheck.appendChild(selectAllInput);
    selectAllFormCheck.appendChild(selectAllLabel);
    selectAllDiv.appendChild(selectAllFormCheck);
    filterContainer.appendChild(selectAllDiv); // Add it before the row of conference checkboxes

    // Add event listener for "Select All"
    selectAllInput.addEventListener('change', () => {
        const isChecked = selectAllInput.checked;
        const conferenceCheckboxes = filterContainer.querySelectorAll('.conference-filter-checkbox');
        conferenceCheckboxes.forEach(checkbox => {
            checkbox.checked = isChecked;
        });
        renderTimeline(); // Re-render after changing all checkboxes
        // saveFilterState(); // Save state after "Select All" change // <-- REMOVED, logic moved below

        // NEW logic: Remove state if "Select All" is checked, save otherwise
        if (isChecked) {
            removeFilterState();
        } else {
            saveFilterState();
        }
    });
    // --- End "Select All" Checkbox ---


    // const row = document.createElement('div'); // Removed the explicit row container
    // row.className = 'row';
    // filterContainer.appendChild(row); // Removed

    // Removed column creation logic (let items flow)
    // let currentColumn = null;
    // const conferencesPerColumn = 4;

    conferences.forEach((conf, index) => {
        // Removed column creation logic
        // if (index % conferencesPerColumn === 0) { ... }

        const formCheck = document.createElement('div');
        // Use inline-block and margins for layout instead of col-auto in a row
        formCheck.className = 'form-check d-inline-block me-3 mb-1'; // Adjust margins as needed

        const input = document.createElement('input');
        input.className = 'form-check-input conference-filter-checkbox';
        input.type = 'checkbox';
        input.value = conf.conference; // Use conference name as value
        input.id = `filter-${conf.conference.replace(/\s+/g, '-')}`; // Create a unique ID
        // Set checked state based on loaded state, default to true if not found
        input.checked = savedFilterState ? (savedFilterState[conf.conference] ?? true) : true;


        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.htmlFor = input.id;
        label.textContent = conf.conference;

        formCheck.appendChild(input);
        formCheck.appendChild(label);
        // Append directly to the filter container
        filterContainer.appendChild(formCheck);
        // row.appendChild(formCheck); // Removed
        // currentColumn.appendChild(formCheck); // Removed

        // Add event listener to re-render timeline on change AND update "Select All" state AND save state
        input.addEventListener('change', () => {
            updateSelectAllCheckboxState();
            renderTimeline();
            // saveFilterState(); // Save state after individual checkbox change // <-- REMOVED, logic moved below

            // NEW logic: Check "Select All" state AFTER update, then save or remove
            const selectAllInput = document.getElementById('filter-all');
            if (selectAllInput && selectAllInput.checked) {
                removeFilterState();
            } else {
                saveFilterState();
            }
        });
    });

    // Initial check in case not all are checked by default in the future
    updateSelectAllCheckboxState();
}

/**
 * Updates the state of the "Select All" checkbox based on individual checkbox states.
 */
function updateSelectAllCheckboxState() {
    const selectAllInput = document.getElementById('filter-all');
    if (!selectAllInput || !filterContainer) return; // Exit if elements aren't ready

    const conferenceCheckboxes = filterContainer.querySelectorAll('.conference-filter-checkbox');
    const allChecked = Array.from(conferenceCheckboxes).every(checkbox => checkbox.checked);
    // const noneChecked = Array.from(conferenceCheckboxes).every(checkbox => !checkbox.checked); // Optional: for indeterminate state
    // const someChecked = !allChecked && !noneChecked; // Optional: for indeterminate state

    selectAllInput.checked = allChecked;
    // Optional: Handle indeterminate state visually if desired
    // selectAllInput.indeterminate = someChecked;
}

// --- Timeline Rendering ---

/**
 * Renders the entire conference timeline based on the current filter selection.
 */
function renderTimeline() {
    if (!conferenceData) {
        console.log("Timeline data not loaded yet.");
        // Optionally display a loading message
        const container = document.getElementById('timeline-container');
        if (container) container.innerHTML = '<p>Loading timeline data...</p>';
        // Optionally display a loading message in the scroll container
        const scrollContainer = document.getElementById('timeline-scroll-container');
        if (scrollContainer) scrollContainer.innerHTML = '<p>Loading timeline data...</p>';
        return;
    }

    // --- Get Filtered Data ---
    const checkedFilters = filterContainer ? Array.from(filterContainer.querySelectorAll('.conference-filter-checkbox:checked')) : [];
    const visibleConferenceNames = new Set(checkedFilters.map(input => input.value));
    const conferencesToRender = conferenceData.filter(conf => visibleConferenceNames.has(conf.conference));
    // console.log("Rendering conferences:", Array.from(visibleConferenceNames)); // For debugging

    if (conferencesToRender.length === 0) {
        // Handle case where no conferences are selected
        const labelContainer = document.getElementById('timeline-labels');
        const scrollContainer = document.getElementById('timeline-scroll-container');
        if (labelContainer) labelContainer.innerHTML = '';
        if (scrollContainer) scrollContainer.innerHTML = '<p class="p-3">No conferences selected. Check some boxes above to see the timeline.</p>';
        // Ensure wrapper height doesn't collapse completely
        const wrapper = document.getElementById('timeline-wrapper');
        if (wrapper) wrapper.style.minHeight = '50px'; // Adjust as needed
        return;
    } else {
         // Reset minHeight if conferences are visible
        const wrapper = document.getElementById('timeline-wrapper');
        if (wrapper) wrapper.style.minHeight = '';
    }


    const labelContainer = document.getElementById('timeline-labels');
    const scrollContainer = document.getElementById('timeline-scroll-container');
    const wrapper = document.getElementById('timeline-wrapper'); // Get the main wrapper

    if (!labelContainer || !scrollContainer || !wrapper) {
        console.error("Timeline layout containers not found!");
        return;
    }

    // --- Determine Color Scheme ---
    const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const ACTIVE_COLORS = isDarkMode ? DARK_COLORS : LIGHT_COLORS;
    labelContainer.innerHTML = ''; // Clear previous labels
    scrollContainer.innerHTML = ''; // Clear previous SVG

    const today = getTodaysDate();
    const isSmallScreen = window.innerWidth < SMALL_BREAKPOINT; // Check screen size based on window, not container
    const timelineDurationMonths = isSmallScreen ? 3 : 12;

    // --- Determine overall date range from data ---
    let minDate = new Date(8640000000000000); // Max possible date
    let maxDate = new Date(-8640000000000000); // Min possible date

    // Use filtered data to determine date range
    conferencesToRender.forEach(conf => {
        conf.installments?.forEach(inst => {
            inst.cycles?.forEach(cycle => {
                cycle.dates?.forEach(event => {
                    const { date: d } = parseDate(event.date); // Extract only the date object
                    if (d < minDate) minDate = d;
                    if (d > maxDate) maxDate = d;
                });
            });
        });
    });

    // Add some padding to the date range (e.g., 1 month before/after)
    minDate.setUTCMonth(minDate.getUTCMonth() - 1);
    minDate.setUTCDate(1); // Start from beginning of the month
    maxDate.setUTCMonth(maxDate.getUTCMonth() + 1);
    maxDate.setUTCDate(1); // Extend into the next month for buffer

    const totalTimelineDays = diffDays(minDate, maxDate);

    // --- Calculate SVG dimensions ---
    // Width available for the scrollable timeline area
    const scrollContainerWidth = scrollContainer.clientWidth;

    // Total width needed for the SVG to represent the entire date range
    // We base the pixels-per-day on the desired *initial* view (1yr or 3mo)
    const initialViewEndDate = new Date(today);
    initialViewEndDate.setUTCMonth(initialViewEndDate.getUTCMonth() + timelineDurationMonths);
    const initialViewDays = diffDays(today, initialViewEndDate);
    const pixelsPerDay = scrollContainerWidth / initialViewDays;
    const totalSvgTimelineWidth = totalTimelineDays * pixelsPerDay;

    // Use filtered data for layout calculation
    // const conferences = conferenceData; // Use the globally fetched data
    const conferences = conferencesToRender; // Use the filtered data

    // --- Pre-calculate Layout and Heights ---
    let totalRequiredHeight = MONTH_LABEL_HEIGHT;
    const conferenceLayouts = conferences.map(conf => {
        const conferenceRows = []; // Tracks end X coordinate for each row: [{ endX: number }]
        const cycleLayouts = []; // Stores layout info for each cycle: [{ cycle, inst, rowIndex, startXPixel, endXPixel, labelWidth }]
        let maxRows = 0;

        if (conf.installments) {
            conf.installments.forEach(inst => {
                if (inst.cycles) {
                    inst.cycles.forEach(cycle => {
                        if (!cycle.dates || cycle.dates.length < 2) return; // Need at least two dates for a segment

                        // Find cycle's date range
                        let cycleMinDate = parseDate(cycle.dates[0].date).date;
                        let cycleMaxDate = parseDate(cycle.dates[cycle.dates.length - 1].date).date;
                        for (let i = 1; i < cycle.dates.length; i++) {
                            const d = parseDate(cycle.dates[i].date).date;
                            if (d < cycleMinDate) cycleMinDate = d;
                            if (d > cycleMaxDate) cycleMaxDate = d;
                        }

                        // Calculate pixel range
                        const startDaysOffset = diffDays(minDate, cycleMinDate);
                        const endDaysOffset = diffDays(minDate, cycleMaxDate);
                        const startXPixel = (Math.max(0, startDaysOffset) / totalTimelineDays) * totalSvgTimelineWidth;
                        const endXPixel = (Math.min(totalTimelineDays, endDaysOffset) / totalTimelineDays) * totalSvgTimelineWidth;

                        // Estimate label width (simple estimation)
                        const labelText = cycle.name || "";
                        const estimatedCharWidth = 8; // Rough estimate
                        const labelPadding = 15; // Space left of label + space right of label
                        const labelWidth = labelText ? (labelText.length * estimatedCharWidth + labelPadding) : 0;

                        const effectiveStartX = startXPixel - labelWidth; // Where the cycle effectively starts horizontally

                        // Find the first row where this cycle fits
                        let assignedRowIndex = -1;
                        for (let i = 0; i < conferenceRows.length; i++) {
                            if (effectiveStartX >= conferenceRows[i].endX) {
                                assignedRowIndex = i;
                                conferenceRows[i].endX = endXPixel; // Update row's end
                                break;
                            }
                        }

                        // If no row found, add a new one
                        if (assignedRowIndex === -1) {
                            assignedRowIndex = conferenceRows.length;
                            conferenceRows.push({ endX: endXPixel });
                        }

                        cycleLayouts.push({ cycle, inst, rowIndex: assignedRowIndex, startXPixel, endXPixel, labelWidth });
                        maxRows = Math.max(maxRows, assignedRowIndex + 1);
                    }); // End forEach cycle
                }
            }); // End forEach inst
        } // End if (conf.installments)

        // Calculate height based on the number of rows needed
        const confHeight = maxRows === 0 ? 0 : (maxRows * BAR_HEIGHT) + (Math.max(0, maxRows - 1) * CYCLE_PADDING);
        const layout = { conf, confHeight, cycleLayouts }; // Store cycleLayouts here
        totalRequiredHeight += confHeight + (confHeight > 0 ? CONFERENCE_PADDING : 0);
        return layout;
    });

    // Adjust total height calculation (remove padding after the last *visible* conference)
    let lastVisibleConfHeight = 0;
    for (let i = conferenceLayouts.length - 1; i >= 0; i--) {
        if (conferenceLayouts[i].confHeight > 0) {
            lastVisibleConfHeight = conferenceLayouts[i].confHeight;
            break;
        }
    }
    if (lastVisibleConfHeight > 0) {
         totalRequiredHeight -= CONFERENCE_PADDING; // Remove padding added after the last visible one
    }

    const totalSvgHeight = Math.max(MONTH_LABEL_HEIGHT, totalRequiredHeight);


    // --- Create SVG Element ---
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "timeline-svg");
    svg.setAttribute("width", totalSvgTimelineWidth); // SVG width is the total scrollable timeline width
    svg.setAttribute("height", totalSvgHeight);
    scrollContainer.appendChild(svg); // Append SVG to the scrollable container

    // --- Set container heights explicitly ---
    // Let the container height be determined by the content (labels / SVG)
    // const containerHeight = `${totalSvgHeight}px`;
    // labelContainer.style.height = containerHeight; // Removed
    // scrollContainer.style.height = containerHeight; // Removed


    // --- Render Labels (in the dedicated label container) ---
    let currentLabelY = 0; // Y position within the label container
    conferenceLayouts.forEach((layout) => {
        const { conf, confHeight } = layout;

        if (confHeight === 0) return; // Skip conferences with no cycles/height

        const labelDiv = document.createElement("div");
        labelDiv.classList.add("conference-label-item");
        // Set the dynamic height for this label based on its content rows in the SVG
        labelDiv.style.setProperty('--dynamic-conf-height', `${confHeight + CONFERENCE_PADDING}px`);
        // Adjust vertical alignment if needed, align-items: center should work
        labelDiv.textContent = conf.conference;

        // Add separator padding logic here if needed, or rely on CSS border
        labelContainer.appendChild(labelDiv);

        // Add padding below this label to push the next one down
        // The height style now includes the padding space
        // currentLabelY += confHeight + CONFERENCE_PADDING; // Track Y if needed for absolute positioning (not used here)
    });
     // Adjust padding for the last label item if necessary via CSS or JS


    // --- Render Timeline Bars (in the SVG) ---
    let currentY = MONTH_LABEL_HEIGHT; // Start below month labels in the SVG
    conferenceLayouts.forEach((layout, confIndex) => {
        const { conf, confHeight, cycleLayouts } = layout; // Get pre-calculated layouts

        if (confHeight === 0) return; // Skip conferences with no cycles/height

        const conferenceStartY = currentY + (CONFERENCE_PADDING / 2); // Y position where this conference row starts in the SVG

        // Iterate through the pre-calculated cycle layouts
        cycleLayouts.forEach(({ cycle, inst, rowIndex }) => {
            // Calculate Y position based on the assigned row index
            const cycleY = conferenceStartY + rowIndex * (BAR_HEIGHT + CYCLE_PADDING);
            let colorIndex = 0; // Reset color index for each cycle
            let firstSegmentX = -1; // Track the starting X of the first segment for label placement

            // Render segments for this cycle
            for (let i = 0; i < cycle.dates.length - 1; i++) {
                const startEvent = cycle.dates[i];
                const endEvent = cycle.dates[i + 1];

                const { date: segmentStartDate, isUncertain: startIsUncertain } = parseDate(startEvent.date);
                const { date: segmentEndDate, isUncertain: endIsUncertain } = parseDate(endEvent.date);

                if (segmentStartDate < segmentEndDate && segmentEndDate > minDate && segmentStartDate < maxDate) {
                    const startDaysOffset = diffDays(minDate, segmentStartDate);
                    const endDaysOffset = diffDays(minDate, segmentEndDate);
                    const clampedStartDays = Math.max(0, startDaysOffset);
                    const clampedEndDays = Math.min(totalTimelineDays, endDaysOffset);

                    if (clampedStartDays < clampedEndDays) {
                        const x = (clampedStartDays / totalTimelineDays) * totalSvgTimelineWidth;
                        const width = ((clampedEndDays - clampedStartDays) / totalTimelineDays) * totalSvgTimelineWidth;

                        if (width >= 1) {
                            // --- Track first segment's X for label placement ---
                            if (firstSegmentX === -1) {
                                firstSegmentX = x;

                                // --- Create and add the cycle name label (potentially as a link) ---
                                if (cycle.name) {
                                    const labelText = document.createElementNS(SVG_NS, "text");
                                    labelText.setAttribute("x", firstSegmentX - 5); // Position left of the first bar segment
                                    labelText.setAttribute("y", cycleY + BAR_HEIGHT / 2); // Vertically center on the cycle's row
                                    labelText.setAttribute("font-size", "14px");
                                    labelText.setAttribute("text-anchor", "end");
                                    labelText.setAttribute("dominant-baseline", "middle");
                                    labelText.textContent = cycle.name;

                                    if (inst.website) {
                                        const link = document.createElementNS(SVG_NS, "a");
                                        link.setAttribute("class", "cycle-label-link");
                                        link.setAttribute("href", inst.website);
                                        link.setAttribute("target", "_blank");

                                        const linkTitle = document.createElementNS(SVG_NS, "title");
                                        linkTitle.textContent = `Visit ${conf.conference} ${inst.year} website`;
                                        link.appendChild(linkTitle);

                                        link.appendChild(labelText);
                                        svg.appendChild(link);
                                    } else {
                                        labelText.setAttribute("class", "cycle-label-text");
                                        svg.appendChild(labelText);
                                    }
                                }
                            }
                            // --- End Cycle Name Label ---

                            const rect = document.createElementNS(SVG_NS, "rect");
                            rect.setAttribute("x", x);
                            rect.setAttribute("y", cycleY); // Use the calculated Y for the current cycle's row
                            rect.setAttribute("width", width);
                            rect.setAttribute("height", BAR_HEIGHT);
                            rect.setAttribute("fill", ACTIVE_COLORS[colorIndex % ACTIVE_COLORS.length]);

                            // Add Bootstrap Popover attributes
                            rect.setAttribute("data-bs-toggle", "popover");
                            rect.setAttribute("data-bs-placement", "top");
                            rect.setAttribute("data-bs-trigger", "hover click focus");
                            const title = `${conf.conference} ${inst.year}`;
                            const formattedStartDate = formatDateVerbose(segmentStartDate, startIsUncertain);
                            const formattedEndDate = formatDateVerbose(segmentEndDate, endIsUncertain);
                            const durationDays = diffDays(segmentStartDate, segmentEndDate);
                            const content = `<strong>${startEvent.description}</strong><br>${formattedStartDate}<br><br><span class="popover-duration">(${durationDays} days)</span><br><br><strong>${endEvent.description}</strong><br>${formattedEndDate}`;
                            rect.setAttribute("data-bs-title", title);
                            rect.setAttribute("data-bs-content", content);
                            rect.setAttribute("data-bs-html", "true");

                            svg.appendChild(rect);
                        } // End if (width >= 1)
                    } // End if (clampedStartDays < clampedEndDays)
                } // End if (segmentStartDate < segmentEndDate ...)

                colorIndex++; // Increment color index for the *next* segment in this cycle
            } // End for loop (cycle.dates segments)
        }); // End forEach cycleLayout

        // --- Draw Horizontal Separator Line in SVG (if not the last *visible* conference) ---
        // Find if this is the last conference with actual height
        let isLastVisible = true;
        for (let k = confIndex + 1; k < conferenceLayouts.length; k++) {
            if (conferenceLayouts[k].confHeight > 0) {
                isLastVisible = false;
                break;
            }
        }

        if (!isLastVisible) {
            // Adjust Y position to align with the bottom border of the label div
            const separatorY = currentY + confHeight + CONFERENCE_PADDING - 0.5;
            const separatorLine = document.createElementNS(SVG_NS, "line");
            separatorLine.setAttribute("x1", 0); // Start from the very left of the SVG
            separatorLine.setAttribute("y1", separatorY);
            separatorLine.setAttribute("x2", totalSvgTimelineWidth); // Extend to the full SVG width
            separatorLine.setAttribute("y2", separatorY);
            // separatorLine.setAttribute("stroke", "var(--border-color-medium)"); // Use CSS variable via class
            separatorLine.setAttribute("stroke-width", "1");
            separatorLine.setAttribute("class", "separator-line"); // Use CSS class
            svg.appendChild(separatorLine);
        }


        currentY += confHeight + CONFERENCE_PADDING; // Update Y for the next conference row
    }); // End forEach conferenceLayout


    // --- Render Month Markers (across the entire SVG width) ---
    const monthGroup = document.createElementNS(SVG_NS, "g");
    svg.appendChild(monthGroup);
    let currentMonth = new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), 1)); // Start from the first day of the overall start month

    while (currentMonth <= maxDate) {
        const daysFromStart = diffDays(minDate, currentMonth);

        // Only draw markers if they fall within the calculated total timeline duration
        if (daysFromStart >= 0 && daysFromStart <= totalTimelineDays) {
            // Calculate x position based on the total SVG timeline width
            const xPos = (daysFromStart / totalTimelineDays) * totalSvgTimelineWidth;

            // Vertical line
            const line = document.createElementNS(SVG_NS, "line");
            line.setAttribute("x1", xPos);
            line.setAttribute("y1", 0); // Start from the very top
            line.setAttribute("x2", xPos);
            line.setAttribute("y2", totalSvgHeight); // Extend to the bottom
            // line.setAttribute("stroke", "var(--border-color-light)"); // Use CSS variable via class
            line.setAttribute("stroke-width", "1");
            line.setAttribute("shape-rendering", "crispEdges"); // Make thin lines sharp
            line.setAttribute("class", "month-marker-line"); // Use CSS class
            monthGroup.appendChild(line);

            // Month label - Position within the top margin
            const label = document.createElementNS(SVG_NS, "text");
            label.setAttribute("x", xPos + 3); // Slight offset from the line
            label.setAttribute("y", MONTH_LABEL_HEIGHT - 7); // Position towards the bottom of the label area
            label.setAttribute("font-size", "10px");
            // label.setAttribute("fill", "var(--muted-text-color)"); // Use CSS variable via class
            label.setAttribute("dominant-baseline", "middle"); // Align text vertically
            label.setAttribute("class", "month-label"); // Use CSS class
            label.textContent = `${currentMonth.toLocaleString('default', { month: 'short', timeZone: 'UTC' })} ${currentMonth.getUTCFullYear()}`;
            monthGroup.appendChild(label);
        }

        // Move to the next month
        currentMonth.setUTCMonth(currentMonth.getUTCMonth() + 1);
        currentMonth.setUTCDate(1); // Ensure we are on the 1st for the next iteration
    }

    // --- Render "Today" Marker ---
    const daysFromStartToToday = diffDays(minDate, today);
    if (daysFromStartToToday >= 0 && daysFromStartToToday <= totalTimelineDays) {
        const todayXPos = (daysFromStartToToday / totalTimelineDays) * totalSvgTimelineWidth;
        const todayLine = document.createElementNS(SVG_NS, "line");
        todayLine.setAttribute("x1", todayXPos);
        todayLine.setAttribute("y1", 0); // Start from the very top
        todayLine.setAttribute("x2", todayXPos);
        todayLine.setAttribute("y2", totalSvgHeight); // Extend to the bottom
        // todayLine.setAttribute("stroke", "var(--today-marker-color)"); // Use CSS variable via class
        todayLine.setAttribute("stroke-width", TODAY_MARKER_WIDTH);
        todayLine.setAttribute("shape-rendering", "crispEdges");
        todayLine.setAttribute("class", "today-marker-line"); // Use CSS class
        // Add a simple title for accessibility/hover info
        const titleElem = document.createElementNS(SVG_NS, "title");
        titleElem.textContent = `Today (${today.toISOString().split('T')[0]})`;
        todayLine.appendChild(titleElem);

        svg.appendChild(todayLine); // Add after month markers, but before popover elements potentially
    }


    // --- Set Initial Scroll Position ---
    // Calculate the scroll offset needed to place 'today' at the beginning of the scroll container
    const scrollOffset = (daysFromStartToToday / totalTimelineDays) * totalSvgTimelineWidth;
    // Ensure scroll offset is not negative and not beyond the max scroll width
    const maxScrollLeft = scrollContainer.scrollWidth - scrollContainer.clientWidth;
    scrollContainer.scrollLeft = Math.max(0, Math.min(scrollOffset, maxScrollLeft));


    // --- Initialize Popovers ---
    const popoverTriggerList = [].slice.call(svg.querySelectorAll('[data-bs-toggle="popover"]')); // Query within the SVG
    popoverTriggerList.map(function (popoverTriggerEl) {
        // Ensure popovers are created relative to the body or a fixed container
        // to avoid issues with SVG transforms or clipping if the SVG moves.
        // Default Bootstrap behavior might be sufficient, but keep an eye on placement.
        return new bootstrap.Popover(popoverTriggerEl, {
            container: 'body' // Render popover in body to avoid SVG clipping issues
        });
    });
}

// --- Data Fetching and Initialization ---
async function loadAndRenderTimeline() {
    try {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        conferenceData = await response.json();

        // --- Sort cycle dates chronologically ---
        if (conferenceData) {
            conferenceData.forEach(conf => {
                if (conf.installments) {
                    conf.installments.forEach(inst => {
                        if (inst.cycles) {
                            inst.cycles.forEach(cycle => {
                                if (cycle.dates && cycle.dates.length > 1) {
                                    // Sort based on the actual date object, ignoring uncertainty for sorting
                                    cycle.dates.sort((a, b) => parseDate(a.date).date - parseDate(b.date).date);
                                }
                            });
                        }
                    });
                }
            });
        }
        // --- End sorting ---

        console.log("Timeline data loaded successfully.");
        filterContainer = document.getElementById('filter-container'); // Store container reference
        renderFilterControls(conferenceData); // Render filters first
        renderTimeline(); // Initial render after data is loaded and filters are present
    } catch (error) {
        console.error("Failed to load timeline data:", error);
        // Display an error message to the user
        const container = document.getElementById('timeline-container');
        if (container) container.innerHTML = '<p>Error loading timeline data. Please try again later.</p>';
    }
}


// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', loadAndRenderTimeline);
// Re-render on resize using the already loaded data
window.addEventListener('resize', renderTimeline);

// Re-render if the color scheme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', renderTimeline);
