// --- Constants ---
const SVG_NS = "http://www.w3.org/2000/svg";
const BAR_HEIGHT = 30; // Height of each timeline bar
const ROW_PADDING = 10; // Vertical space below each row
const LABEL_WIDTH = 100; // Estimated width for labels (adjust as needed)
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

// --- Timeline Rendering ---

/**
 * Renders the entire conference timeline.
 */
function renderTimeline() {
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
    const endDate = new Date(today);
    endDate.setUTCMonth(endDate.getUTCMonth() + timelineDurationMonths);

    const totalDays = diffDays(startDate, endDate);
    const totalTimelineDaysForWidthCalc = isSmallScreen ? diffDays(startDate, new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())) : totalDays; // Use 1 year for width calc on small screens

    // Calculate available width for the SVG timeline itself
    const containerWidth = container.clientWidth;
    const svgTimelineWidth = containerWidth - LABEL_WIDTH; // Subtract label width

    // Calculate the total width the SVG needs to represent 1 year (for scrolling on small screens)
    const totalSvgContentWidth = isSmallScreen ? (svgTimelineWidth / totalDays) * totalTimelineDaysForWidthCalc : svgTimelineWidth;

    const conferences = window.data || [];
    const totalSvgHeight = MONTH_LABEL_HEIGHT + conferences.length * (BAR_HEIGHT + ROW_PADDING);

    // Create main SVG container
    const svgContainerDiv = document.createElement('div');
    svgContainerDiv.className = 'timeline-svg-container';

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "timeline-svg");
    // Set viewable width/height
    svg.setAttribute("width", isSmallScreen ? totalSvgContentWidth : svgTimelineWidth); // Full content width for scrolling
    svg.setAttribute("height", totalSvgHeight);
    // svg.setAttribute("viewBox", `0 0 ${totalSvgContentWidth} ${totalSvgHeight}`); // Might not need viewBox if width is set correctly

    // Append the SVG container div (handling potential scrolling) to the main page container
    container.appendChild(svgContainerDiv);
    svgContainerDiv.appendChild(svg); // Append the SVG itself


    // --- Render Month Markers ---
    const monthGroup = document.createElementNS(SVG_NS, "g");
    svg.appendChild(monthGroup); // Add the group to the main SVG
    let currentMonth = new Date(startDate);
    currentMonth.setUTCDate(1); // Start from the first day of the starting month

    while (currentMonth <= endDate) {
        const daysFromStart = diffDays(startDate, currentMonth);
        if (daysFromStart >= 0) { // Only draw markers within the timeline range
            const xPos = (daysFromStart / totalDays) * (isSmallScreen ? totalSvgContentWidth : svgTimelineWidth);

            // Vertical line - Ensure it starts from the top of the label area and goes down
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
    }


    // --- Render Conference Rows ---
    let currentY = MONTH_LABEL_HEIGHT; // Start below month labels
    conferences.forEach((conf, confIndex) => {
        const rowDiv = document.createElement('div');
        // Use Bootstrap grid for label + SVG layout
        rowDiv.className = 'row timeline-row align-items-center'; // Align items vertically

        // Label Column
        const labelCol = document.createElement('div');
        labelCol.className = `col-auto conference-label`; // Auto width for label
        labelCol.style.width = `${LABEL_WIDTH}px`; // Fixed width
        labelCol.textContent = conf.conference;
        rowDiv.appendChild(labelCol);

        // SVG Column
        const svgCol = document.createElement('div');
        svgCol.className = 'col'; // Takes remaining space
        svgCol.style.paddingLeft = '0'; // Remove default col padding
        svgCol.style.paddingRight = '0';

        // Create SVG specifically for this row's bars
        const rowSvg = document.createElementNS(SVG_NS, "svg");
        rowSvg.setAttribute("width", isSmallScreen ? totalSvgContentWidth : svgTimelineWidth);
        rowSvg.setAttribute("height", BAR_HEIGHT);
        rowSvg.setAttribute("overflow", "visible"); // Allow bars to potentially overflow if needed (though width should handle it)
        rowSvg.style.display = 'block'; // Prevent extra space

        svgCol.appendChild(rowSvg); // Add the row's SVG to its column
        rowDiv.appendChild(svgCol); // Add the SVG column to the row div
        // IMPORTANT: We append the rowDiv (label + SVG col) to the main container,
        // NOT directly to the main SVG with the month markers.
        // This means the month markers are in a separate SVG layer above.
        // To have lines go *through* the bars, we'd need a single SVG approach.
        // Let's stick to the current structure for now, where markers are above.
        container.appendChild(rowDiv);


        // --- Render Timeline Bars for this Conference (within its own SVG) ---
        let colorIndex = 0;
        conf.installments.forEach(inst => {
            inst.cycles.forEach(cycle => {
                for (let i = 0; i < cycle.dates.length - 1; i++) {
                    const startEvent = cycle.dates[i];
                    const endEvent = cycle.dates[i + 1];

                    const segmentStartDate = parseDate(startEvent.date);
                    const segmentEndDate = parseDate(endEvent.date);

                    // Clamp dates to the visible timeline window
                    const clampedStartDate = segmentStartDate < startDate ? startDate : segmentStartDate;
                    const clampedEndDate = segmentEndDate > endDate ? endDate : segmentEndDate;

                    if (clampedStartDate < clampedEndDate) { // Only render if there's overlap
                        const startDay = diffDays(startDate, clampedStartDate);
                        const endDay = diffDays(startDate, clampedEndDate);
                        const durationDays = endDay - startDay;

                        if (startDay >= 0 && durationDays > 0) {
                            const x = (startDay / totalDays) * (isSmallScreen ? totalSvgContentWidth : svgTimelineWidth);
                            const width = (durationDays / totalDays) * (isSmallScreen ? totalSvgContentWidth : svgTimelineWidth);

                            const rect = document.createElementNS(SVG_NS, "rect");
                            rect.setAttribute("x", x);
                            rect.setAttribute("y", 0); // Y is relative to the row's SVG
                            rect.setAttribute("width", Math.max(1, width)); // Ensure minimum width of 1px
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

                            rowSvg.appendChild(rect); // Add rect to the row's SVG
                            colorIndex++;
                        }
                    }
                }
            });
        });
        // currentY += BAR_HEIGHT + ROW_PADDING; // Update Y for the next row (handled by separate divs now)
    });

    // --- Initialize Popovers ---
    const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
    popoverTriggerList.map(function (popoverTriggerEl) {
        return new bootstrap.Popover(popoverTriggerEl);
    });
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', renderTimeline);
window.addEventListener('resize', renderTimeline);
