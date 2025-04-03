// --- Constants ---
const SVG_NS = "http://www.w3.org/2000/svg";
const BAR_HEIGHT = 30; // Height of each timeline bar
const CYCLE_PADDING = 5; // Vertical space between cycle bars within a conference
const CONFERENCE_PADDING = 10; // Vertical space below each conference row
const LABEL_WIDTH = 120; // Increased width for labels
const MONTH_LABEL_HEIGHT = 20; // Space for month labels
const COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"];
const SMALL_BREAKPOINT = 576; // Bootstrap's 'sm' breakpoint

// --- Date Helpers ---

/**
 * Parses a YYYY-MM-DD string into a Date object (UTC to avoid timezone issues).
 * @param {string} dateString - The date string in YYYY-MM-DD format.
 * @returns {Date} The corresponding Date object.
 */
function parseDate(dateString) {
    const parts = dateString.split('-');
    // Month is 0-indexed in JavaScript Date constructor
    return new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
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

// Use the test date for now
const getTodaysDate = getTodaysDateTest;

// Global variable to store fetched conference data
let conferenceData = null;

// --- Timeline Rendering ---

/**
 * Renders the entire conference timeline using the globally stored data.
 */
function renderTimeline() {
    if (!conferenceData) {
        console.log("Timeline data not loaded yet.");
        // Optionally display a loading message
        const container = document.getElementById('timeline-container');
        if (container) container.innerHTML = '<p>Loading timeline data...</p>';
        return;
    }

    const container = document.getElementById('timeline-container');
    if (!container) {
        console.error("Timeline container not found!");
        return;
    }
    container.innerHTML = ''; // Clear previous content

    const today = getTodaysDate();
    const isSmallScreen = window.innerWidth < SMALL_BREAKPOINT;
    const timelineDurationMonths = isSmallScreen ? 3 : 12;

    const startDate = new Date(today);
    const endDate = new Date(today); // End of the initially visible area
    endDate.setUTCMonth(endDate.getUTCMonth() + timelineDurationMonths);

    const totalDaysInView = diffDays(startDate, endDate); // Days in the 3 or 12 month view
    // For small screens, calculate width based on a full year for consistent scrolling
    const daysForWidthCalculation = isSmallScreen ? diffDays(startDate, new Date(Date.UTC(startDate.getUTCFullYear() + 1, startDate.getUTCMonth(), startDate.getUTCDate()))) : totalDaysInView;
    // Calculate the actual end date for the full scrollable range
    const scrollableEndDate = new Date(startDate);
    scrollableEndDate.setUTCDate(scrollableEndDate.getUTCDate() + daysForWidthCalculation);


    const containerWidth = container.clientWidth;
    // Width available for the actual timeline bars/markers (excluding labels)
    const timelineAreaWidth = Math.max(0, containerWidth - LABEL_WIDTH);

    // Calculate the total width the SVG needs. For small screens, this allows scrolling.
    // Scale the timelineAreaWidth based on the ratio of total days (1yr) to viewable days (3mo)
    const totalSvgTimelineWidth = isSmallScreen ? (timelineAreaWidth / totalDaysInView) * daysForWidthCalculation : timelineAreaWidth;
    const totalSvgWidth = LABEL_WIDTH + totalSvgTimelineWidth;

    // Use the globally fetched data
    const conferences = conferenceData;

    // --- Pre-calculate heights and cycle counts ---
    let totalRequiredHeight = MONTH_LABEL_HEIGHT;
    const conferenceLayouts = conferences.map(conf => {
        let totalCycles = 0;
        // Ensure installments and cycles exist before trying to access length
        if (conf.installments) {
            conf.installments.forEach(inst => {
                if (inst.cycles) {
                    totalCycles += inst.cycles.length;
                }
            });
        }
            totalCycles += inst.cycles.length;
        });
        const confHeight = totalCycles === 0 ? 0 : (totalCycles * BAR_HEIGHT) + (Math.max(0, totalCycles - 1) * CYCLE_PADDING);
        const layout = { conf, totalCycles, confHeight };
        totalRequiredHeight += confHeight + (confHeight > 0 ? CONFERENCE_PADDING : 0); // Add padding only if height > 0
        return layout;
    });
    // Remove padding added after the last conference
    if (conferenceLayouts.length > 0 && conferenceLayouts[conferenceLayouts.length - 1].confHeight > 0) {
        totalRequiredHeight -= CONFERENCE_PADDING;
    }
    const totalSvgHeight = totalRequiredHeight;


    // --- Create Single SVG ---
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "timeline-svg");
    svg.setAttribute("width", totalSvgWidth); // Full width including labels and scrollable area
    svg.setAttribute("height", totalSvgHeight);
    // No viewBox needed if width/height are set correctly relative to content
    container.appendChild(svg); // Append the single SVG directly to the main container

    // --- Render Conference Rows (Labels and Bars) ---
    let currentY = MONTH_LABEL_HEIGHT; // Start below month labels
    conferenceLayouts.forEach((layout, confIndex) => {
        const { conf, totalCycles, confHeight } = layout;

        if (confHeight === 0) return; // Skip conferences with no cycles/height

        const conferenceStartY = currentY; // Y position where this conference row starts

        // Render Label (as SVG text) - Vertically centered in the conference's total height
        const labelText = document.createElementNS(SVG_NS, "text");
        labelText.setAttribute("x", 10); // Padding from left edge
        labelText.setAttribute("y", conferenceStartY + confHeight / 2); // Center in the allocated block
        labelText.setAttribute("font-weight", "bold");
        labelText.setAttribute("dominant-baseline", "middle"); // Better vertical alignment
        labelText.textContent = conf.conference;
        svg.appendChild(labelText);

        // Render Timeline Bars for this Conference (directly into the main SVG)
        let cycleOffsetY = 0; // Vertical offset within the current conference row

        conf.installments.forEach(inst => {
            inst.cycles.forEach(cycle => {
                const cycleY = conferenceStartY + cycleOffsetY; // Calculate Y for this specific cycle's bars
                let colorIndex = 0; // Reset color index for each cycle

                for (let i = 0; i < cycle.dates.length - 1; i++) {
                    const startEvent = cycle.dates[i];
                    const endEvent = cycle.dates[i + 1];

                    const segmentStartDate = parseDate(startEvent.date);
                    const segmentEndDate = parseDate(endEvent.date);

                    // Clamp the segment dates to the *full scrollable range* (startDate to scrollableEndDate)
                    const renderStartDate = segmentStartDate < startDate ? startDate : segmentStartDate;
                    const renderEndDate = segmentEndDate > scrollableEndDate ? scrollableEndDate : segmentEndDate;

                    // Only render if the clamped segment has a positive duration and starts before the scrollable end date
                    if (renderStartDate < renderEndDate && renderStartDate < scrollableEndDate) {
                        // Calculate x position and width based on the *total timeline width* and *total days for width calc*
                        // Use the clamped dates relative to the overall timeline start (startDate)
                        const x = LABEL_WIDTH + (diffDays(startDate, renderStartDate) / daysForWidthCalculation) * totalSvgTimelineWidth;
                        const width = (diffDays(renderStartDate, renderEndDate) / daysForWidthCalculation) * totalSvgTimelineWidth;

                        // Ensure width is at least 1 pixel if it's supposed to be visible
                        if (width >= 0) { // Avoid drawing if calculation is somehow negative
                            const rect = document.createElementNS(SVG_NS, "rect");
                            rect.setAttribute("x", x);
                            rect.setAttribute("y", cycleY); // Use the calculated Y for the current cycle
                            rect.setAttribute("width", Math.max(1, width)); // Ensure minimum width of 1px for visibility
                            rect.setAttribute("height", BAR_HEIGHT);
                            rect.setAttribute("fill", COLORS[colorIndex % COLORS.length]);

                            // Add Bootstrap Popover attributes
                            rect.setAttribute("data-bs-toggle", "popover");
                            rect.setAttribute("data-bs-placement", "top");
                            rect.setAttribute("data-bs-trigger", "hover focus"); // Show on hover or focus
                            const title = `${conf.conference} ${inst.year}`;
                            const content = `
                                <strong>Start:</strong> ${startEvent.description} (${startEvent.date})<br>
                                <strong>End:</strong> ${endEvent.description} (${endEvent.date})
                            `;
                            rect.setAttribute("data-bs-title", title);
                            rect.setAttribute("data-bs-content", content);
                            rect.setAttribute("data-bs-html", "true"); // Allow HTML in content

                            svg.appendChild(rect); // Add rect directly to the main SVG
                        } // End if (width >= 0)
                    } // End if (renderStartDate < renderEndDate && renderStartDate < scrollableEndDate)

                    colorIndex++; // Increment color index for the *next* segment in this cycle
                } // End for loop (cycle.dates)
                cycleOffsetY += BAR_HEIGHT + CYCLE_PADDING; // Increment offset for the next cycle
                // Color index is now handled per-segment inside the loop above
            }); // End forEach cycle
        }); // End forEach installment
        currentY += confHeight + CONFERENCE_PADDING; // Update Y for the next conference row
    }); // End forEach conferenceLayout

    // --- Render Month Markers (Last, so they are on top) ---
    const monthGroup = document.createElementNS(SVG_NS, "g");
    svg.appendChild(monthGroup); // Add the group to the main SVG
    let currentMonth = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1)); // Start from the first day of the starting month

    // Iterate potentially beyond the end date to draw markers for the full scrollable width if needed
    const markerEndDate = new Date(startDate);
    markerEndDate.setUTCDate(markerEndDate.getUTCDate() + daysForWidthCalculation);

    while (currentMonth <= markerEndDate) {
        const daysFromStart = diffDays(startDate, currentMonth);

        // Only draw markers if they fall within the calculated total timeline duration
        if (daysFromStart >= 0 && daysFromStart <= daysForWidthCalculation) {
            // Calculate x position based on the total timeline width
            const xPos = LABEL_WIDTH + (daysFromStart / daysForWidthCalculation) * totalSvgTimelineWidth;

            // Vertical line
            const line = document.createElementNS(SVG_NS, "line");
            line.setAttribute("x1", xPos);
            line.setAttribute("y1", 0); // Start from the very top
            line.setAttribute("x2", xPos);
            line.setAttribute("y2", totalSvgHeight); // Extend to the bottom
            line.setAttribute("stroke", "#e0e0e0"); // Light gray
            line.setAttribute("stroke-width", "1");
            line.setAttribute("shape-rendering", "crispEdges"); // Make thin lines sharp
            monthGroup.appendChild(line);

            // Month label - Position within the top margin
            // Only draw label if it's within the initial visible range for clarity? Or allow scrolling? Let's allow scrolling.
            const label = document.createElementNS(SVG_NS, "text");
            label.setAttribute("x", xPos + 3); // Slight offset from the line
            label.setAttribute("y", MONTH_LABEL_HEIGHT - 7); // Position towards the bottom of the label area
            label.setAttribute("font-size", "10px");
            label.setAttribute("fill", "#555"); // Slightly darker text
            label.setAttribute("dominant-baseline", "middle"); // Align text vertically
            label.textContent = `${currentMonth.toLocaleString('default', { month: 'short', timeZone: 'UTC' })} ${currentMonth.getUTCFullYear()}`;
            monthGroup.appendChild(label);
        }

        // Move to the next month
        currentMonth.setUTCMonth(currentMonth.getUTCMonth() + 1);
        currentMonth.setUTCDate(1); // Ensure we are on the 1st for the next iteration
    }


    // --- Initialize Popovers ---
    const popoverTriggerList = [].slice.call(svg.querySelectorAll('[data-bs-toggle="popover"]')); // Query within the SVG
    popoverTriggerList.map(function (popoverTriggerEl) {
        return new bootstrap.Popover(popoverTriggerEl);
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
        console.log("Timeline data loaded successfully.");
        renderTimeline(); // Initial render after data is loaded
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
