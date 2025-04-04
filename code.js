// --- Constants ---
const SVG_NS = "http://www.w3.org/2000/svg";
const BAR_HEIGHT = 30; // Height of each timeline bar
const CYCLE_PADDING = 5; // Vertical space between cycle bars within a conference
const CONFERENCE_PADDING = 10; // Vertical space below each conference row
// const LABEL_WIDTH = 120; // No longer needed, width is auto
const MONTH_LABEL_HEIGHT = 20; // Space for month labels at the top of the SVG
const COLORS = ["#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd", "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf"];
const SMALL_BREAKPOINT = 768; // Bootstrap's 'md' breakpoint (approx)
const TODAY_MARKER_COLOR = "#333333"; // Darker color for today marker
const TODAY_MARKER_WIDTH = 2; // Thicker line for today marker

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
const getTodaysDate = getTodaysDateReal;

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
        // Optionally display a loading message in the scroll container
        const scrollContainer = document.getElementById('timeline-scroll-container');
        if (scrollContainer) scrollContainer.innerHTML = '<p>Loading timeline data...</p>';
        return;
    }

    const labelContainer = document.getElementById('timeline-labels');
    const scrollContainer = document.getElementById('timeline-scroll-container');
    const wrapper = document.getElementById('timeline-wrapper'); // Get the main wrapper

    if (!labelContainer || !scrollContainer || !wrapper) {
        console.error("Timeline layout containers not found!");
        return;
    }
    labelContainer.innerHTML = ''; // Clear previous labels
    scrollContainer.innerHTML = ''; // Clear previous SVG

    const today = getTodaysDate();
    const isSmallScreen = window.innerWidth < SMALL_BREAKPOINT; // Check screen size based on window, not container
    const timelineDurationMonths = isSmallScreen ? 3 : 12;

    // --- Determine overall date range from data ---
    let minDate = new Date(8640000000000000); // Max possible date
    let maxDate = new Date(-8640000000000000); // Min possible date

    conferenceData.forEach(conf => {
        conf.installments?.forEach(inst => {
            inst.cycles?.forEach(cycle => {
                cycle.dates?.forEach(event => {
                    const d = parseDate(event.date);
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

    // Use the globally fetched data
    const conferences = conferenceData;

    // --- Pre-calculate heights and cycle counts ---
    let totalRequiredHeight = MONTH_LABEL_HEIGHT; // Start with space for month labels
    const conferenceLayouts = conferences.map(conf => {
        let totalCycles = 0;
        // Ensure installments and cycles exist before trying to access length
        if (conf.installments) {
            conf.installments.forEach(inst => {
                if (inst.cycles) {
                    totalCycles += inst.cycles.length;
                }
            }); // End forEach inst
        } // End if (conf.installments)
        // Calculate height based on the total cycles found for this conference
        const confHeight = totalCycles === 0 ? 0 : (totalCycles * BAR_HEIGHT) + (Math.max(0, totalCycles - 1) * CYCLE_PADDING);
        const layout = { conf, totalCycles, confHeight };
        totalRequiredHeight += confHeight + (confHeight > 0 ? CONFERENCE_PADDING : 0); // Add padding only if height > 0
        return layout;
        totalRequiredHeight += confHeight + (confHeight > 0 ? CONFERENCE_PADDING : 0); // Add padding only if height > 0
        return layout;
    });
    // Remove padding added after the last conference
    if (conferenceLayouts.length > 0 && conferenceLayouts[conferenceLayouts.length - 1].confHeight > 0) {
        // Ensure last conf doesn't add extra padding if its height is 0
        if (conferenceLayouts.length > 0 && conferenceLayouts[conferenceLayouts.length - 1].confHeight === 0) {
             // Find the last one with height > 0 to remove padding after it
             let lastVisibleIndex = conferenceLayouts.length - 1;
             while(lastVisibleIndex >= 0 && conferenceLayouts[lastVisibleIndex].confHeight === 0) {
                 lastVisibleIndex--;
             }
             if (lastVisibleIndex < conferenceLayouts.length - 1) {
                 // We removed padding from a zero-height one, potentially incorrectly.
                 // Let's just ensure total height doesn't include padding if the very last item has no height.
                 if (conferenceLayouts[conferenceLayouts.length - 1].confHeight === 0 && totalRequiredHeight > MONTH_LABEL_HEIGHT) {
                    // This logic might be complex, let's simplify: only subtract if the last *rendered* one added padding.
                 }
                 // Simpler: just remove padding if the last one added it.
                 if (conferenceLayouts.length > 0 && conferenceLayouts[conferenceLayouts.length - 1].confHeight > 0) {
                     totalRequiredHeight -= CONFERENCE_PADDING;
                 }
             } else if (lastVisibleIndex === conferenceLayouts.length - 1 && conferenceLayouts[lastVisibleIndex].confHeight > 0) {
                 // Last one has height, remove its bottom padding
                 totalRequiredHeight -= CONFERENCE_PADDING;
             }
        } else if (conferenceLayouts.length > 0 && conferenceLayouts[conferenceLayouts.length - 1].confHeight > 0) {
             totalRequiredHeight -= CONFERENCE_PADDING; // Remove padding added after the last visible conference
        }
    }
    const totalSvgHeight = Math.max(MONTH_LABEL_HEIGHT, totalRequiredHeight); // Ensure minimum height for labels


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
        const { conf, totalCycles, confHeight } = layout;

        if (confHeight === 0) return; // Skip conferences with no cycles/height

        const conferenceStartY = currentY; // Y position where this conference row starts in the SVG
        let cycleOffsetY = 0; // Vertical offset within the current conference row in the SVG

        conf.installments.forEach(inst => {
            inst.cycles.forEach(cycle => {
                const cycleY = conferenceStartY + cycleOffsetY; // Calculate Y for this specific cycle's bars
                let colorIndex = 0; // Reset color index for each cycle

                for (let i = 0; i < cycle.dates.length - 1; i++) {
                    const startEvent = cycle.dates[i];
                    const endEvent = cycle.dates[i + 1];

                    const segmentStartDate = parseDate(startEvent.date);
                    const segmentEndDate = parseDate(endEvent.date);

                    // No clamping needed, render everything relative to the absolute minDate
                    // Only render if the segment has a positive duration and is within the overall timeline
                    if (segmentStartDate < segmentEndDate && segmentEndDate > minDate && segmentStartDate < maxDate) {
                        // Calculate x position and width based on the *total SVG timeline width* and *total timeline days*
                        // Use the actual segment dates relative to the overall timeline start (minDate)
                        const startDaysOffset = diffDays(minDate, segmentStartDate);
                        const endDaysOffset = diffDays(minDate, segmentEndDate);

                        // Ensure days offsets are within the calculated range to avoid issues
                        const clampedStartDays = Math.max(0, startDaysOffset);
                        const clampedEndDays = Math.min(totalTimelineDays, endDaysOffset);

                        if (clampedStartDays < clampedEndDays) {
                            const x = (clampedStartDays / totalTimelineDays) * totalSvgTimelineWidth;
                            const width = ((clampedEndDays - clampedStartDays) / totalTimelineDays) * totalSvgTimelineWidth;

                            // Ensure width is at least 1 pixel if it's supposed to be visible
                            if (width >= 1) {
                                const rect = document.createElementNS(SVG_NS, "rect");
                                rect.setAttribute("x", x);
                                rect.setAttribute("y", cycleY); // Use the calculated Y for the current cycle
                                rect.setAttribute("width", width); // Use calculated width
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
                            } // End if (width >= 1)
                        } // End if (clampedStartDays < clampedEndDays)
                    } // End if (segmentStartDate < segmentEndDate ...)

                    colorIndex++; // Increment color index for the *next* segment in this cycle
                } // End for loop (cycle.dates)
                cycleOffsetY += BAR_HEIGHT + CYCLE_PADDING; // Increment offset for the next cycle
                // Color index is now handled per-segment inside the loop above
            }); // End forEach cycle
        }); // End forEach installment

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
            const separatorY = currentY + confHeight + (CONFERENCE_PADDING / 2);
            const separatorLine = document.createElementNS(SVG_NS, "line");
            separatorLine.setAttribute("x1", 0); // Start from the very left of the SVG
            separatorLine.setAttribute("y1", separatorY);
            separatorLine.setAttribute("x2", totalSvgTimelineWidth); // Extend to the full SVG width
            separatorLine.setAttribute("y2", separatorY);
            separatorLine.setAttribute("stroke", "#cccccc"); // Light gray color
            separatorLine.setAttribute("stroke-width", "1");
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
        todayLine.setAttribute("stroke", TODAY_MARKER_COLOR);
        todayLine.setAttribute("stroke-width", TODAY_MARKER_WIDTH);
        todayLine.setAttribute("shape-rendering", "crispEdges");
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
                                    cycle.dates.sort((a, b) => parseDate(a.date) - parseDate(b.date));
                                }
                            });
                        }
                    });
                }
            });
        }
        // --- End sorting ---

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
