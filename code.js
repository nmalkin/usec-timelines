document.addEventListener('DOMContentLoaded', () => {
    const timelineContainer = document.getElementById('timeline-container');
    const conferenceData = window.data;
    // Define segment colors - add more if needed
    const segmentColors = ['#0d6efd', '#6f42c1', '#d63384', '#fd7e14', '#198754', '#dc3545', '#ffc107', '#20c997'];
    const barHeight = '30px'; // Approximate height for timeline bars

    // --- Helper Functions ---

    // Formats a date string (YYYY-MM-DD) to a more readable format (e.g., Mon DD, YYYY)
    function formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString + 'T00:00:00'); // Add T00:00:00 to avoid timezone issues
        return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
    }

    // Calculates the percentage position and width for a segment within the timeline
    function calculatePositionAndWidth(startDateStr, endDateStr, timelineStartMs, totalTimelineDurationMs) {
        if (!startDateStr || !endDateStr) return { left: 0, width: 0 };

        const startMs = new Date(startDateStr + 'T00:00:00').getTime();
        const endMs = new Date(endDateStr + 'T00:00:00').getTime();

        // Ensure dates are within the visible timeline range for calculation
        const effectiveStartMs = Math.max(startMs, timelineStartMs);
        const effectiveEndMs = Math.min(endMs, timelineStartMs + totalTimelineDurationMs);

        if (effectiveEndMs <= effectiveStartMs) return { left: 0, width: 0 }; // Segment is outside or zero duration

        const left = ((effectiveStartMs - timelineStartMs) / totalTimelineDurationMs) * 100;
        const width = ((effectiveEndMs - effectiveStartMs) / totalTimelineDurationMs) * 100;

        return { left: Math.max(0, left), width: Math.max(0, width) }; // Ensure non-negative values
    }

    // Finds a specific date object by its description within a cycle's dates array
    function findDateByDescription(dates, description) {
        return dates.find(d => d.description.toLowerCase().includes(description.toLowerCase()));
    }

    // --- Main Rendering Function ---
    function renderTimeline() {
        timelineContainer.innerHTML = ''; // Clear previous content

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day
        const todayMs = today.getTime();

        const isMobile = window.innerWidth < 576; // Bootstrap 'sm' breakpoint

        let timelineStartMs;
        let timelineEndMs;
        let totalTimelineDurationMs;
        let containerWidthStyle = '100%'; // Default for desktop
        let timelineWrapperClass = ''; // No wrapper needed by default

        if (isMobile) {
            // Mobile: Show 3 months, starting from today
            timelineStartMs = todayMs;
            const threeMonthsLater = new Date(today);
            threeMonthsLater.setMonth(today.getMonth() + 3);
            timelineEndMs = threeMonthsLater.getTime();
            totalTimelineDurationMs = timelineEndMs - timelineStartMs;
            // Since 3 months is 1/4 of a year, the full year content needs 400% width
            containerWidthStyle = '400%';
            timelineWrapperClass = 'overflow-auto'; // Enable horizontal scrolling
        } else {
            // Desktop: Show 1 year, starting from today
            timelineStartMs = todayMs;
            const oneYearLater = new Date(today);
            oneYearLater.setFullYear(today.getFullYear() + 1);
            timelineEndMs = oneYearLater.getTime();
            totalTimelineDurationMs = timelineEndMs - timelineStartMs;
        }

        // Create a wrapper for scrolling on mobile
        const scrollWrapper = document.createElement('div');
        if (isMobile) {
            scrollWrapper.className = timelineWrapperClass;
        }

        // Create the inner container that might be wider than the screen
        const innerTimeline = document.createElement('div');
        innerTimeline.style.width = containerWidthStyle;
        innerTimeline.style.position = 'relative'; // Needed for absolute positioning of markers/segments

        // --- Add Month Markers ---
        const startMonth = new Date(timelineStartMs);
        startMonth.setDate(1); // Start from the first day of the starting month

        let numMonthsToShow = isMobile ? 12 : 12; // Show markers for the full year even if only 3 months are visible initially on mobile

        for (let i = 0; i < numMonthsToShow; i++) {
            const monthDate = new Date(startMonth);
            monthDate.setMonth(startMonth.getMonth() + i);
            const monthStartMs = monthDate.getTime();

            if (monthStartMs < timelineStartMs + totalTimelineDurationMs * (isMobile ? 4 : 1) && monthStartMs >= timelineStartMs) { // Check if marker is within the *potential* full year range
                 // Calculate position relative to the *actual* visible timeline start
                const pos = calculatePositionAndWidth(monthDate.toISOString().split('T')[0], monthDate.toISOString().split('T')[0], timelineStartMs, totalTimelineDurationMs * (isMobile ? 4 : 1));

                const marker = document.createElement('div');
                marker.style.position = 'absolute';
                marker.style.left = `${pos.left}%`;
                marker.style.top = '0';
                marker.style.bottom = '0';
                marker.style.width = '1px';
                marker.style.backgroundColor = '#e0e0e0'; // Light gray
                marker.style.zIndex = '1'; // Behind segments

                const label = document.createElement('span');
                label.textContent = monthDate.toLocaleDateString('en-US', { month: 'short' });
                label.style.position = 'absolute';
                label.style.left = `${pos.left}%`;
                label.style.top = '-20px'; // Position above the timeline rows
                label.style.fontSize = '0.8em';
                label.style.color = '#6c757d'; // Bootstrap secondary color
                label.style.whiteSpace = 'nowrap';
                innerTimeline.appendChild(label);
                innerTimeline.appendChild(marker);
            }
        }


        // --- Render Conference Rows ---
        conferenceData.forEach(conf => {
            const confRow = document.createElement('div');
            confRow.className = 'mb-3'; // Margin bottom between rows

            const title = document.createElement('h5');
            title.textContent = `${conf.conference} (${conf.full_name})`;
            title.className = 'mb-1';
            confRow.appendChild(title);

            // Create SVG container for the timeline bar
            const svgNS = "http://www.w3.org/2000/svg";
            const barContainer = document.createElementNS(svgNS, 'svg');
            barContainer.setAttribute('width', '100%');
            barContainer.setAttribute('height', barHeight);
            // preserveAspectRatio="none" ensures rects stretch vertically if needed,
            // though with height="100%" on rects it might not be strictly necessary.
            barContainer.setAttribute('preserveAspectRatio', 'none');
            // Add class for potential styling, though Bootstrap width utility might not directly apply
            barContainer.setAttribute('class', 'w-100'); // Keep for layout consistency if parent uses flex/grid

            let segmentIndex = 0; // To cycle through colors

            conf.installments.forEach(inst => {
                inst.cycles.forEach(cycle => {
                    // Define the key dates for segments
                    const dates = cycle.dates.sort((a, b) => new Date(a.date) - new Date(b.date)); // Ensure dates are sorted

                    const submission = findDateByDescription(dates, 'Submission Deadline');
                    const earlyReject = findDateByDescription(dates, 'Early Reject') || findDateByDescription(dates, 'Early-reject');
                    const rebuttalStart = findDateByDescription(dates, 'Rebuttal Period - Start');
                    const rebuttalEnd = findDateByDescription(dates, 'Rebuttal Period - End');
                    const notification = findDateByDescription(dates, 'Notification') || findDateByDescription(dates, 'Acceptance Notification'); // Handle variations

                    // Define segments based on available dates
                    const segments = [];
                    if (submission && earlyReject) segments.push({ start: submission, end: earlyReject, label: 'Review 1' });
                    if (earlyReject && rebuttalStart) segments.push({ start: earlyReject, end: rebuttalStart, label: 'Review 2' });
                    else if (submission && rebuttalStart) segments.push({ start: submission, end: rebuttalStart, label: 'Review' }); // If no early reject

                    if (rebuttalStart && rebuttalEnd) segments.push({ start: rebuttalStart, end: rebuttalEnd, label: 'Rebuttal' });

                    if (rebuttalEnd && notification) segments.push({ start: rebuttalEnd, end: notification, label: 'Decision' });
                    else if (submission && notification && !rebuttalStart) segments.push({ start: submission, end: notification, label: 'Review & Decision' }); // If no rebuttal period


                    // Create and append segment divs
                    segments.forEach(segData => {
                        const { left, width } = calculatePositionAndWidth(segData.start.date, segData.end.date, timelineStartMs, totalTimelineDurationMs * (isMobile ? 4 : 1)); // Use full year duration for calculation base

                        if (width > 0) {
                            const segmentRect = document.createElementNS(svgNS, 'rect');
                            segmentRect.setAttribute('x', `${left}%`);
                            segmentRect.setAttribute('y', '0');
                            segmentRect.setAttribute('width', `${width}%`);
                            segmentRect.setAttribute('height', '100%'); // Use '100%' to fill the SVG height
                            segmentRect.setAttribute('fill', segmentColors[segmentIndex % segmentColors.length]);

                            // Add popover attributes directly to the rect
                            segmentRect.setAttribute('data-bs-toggle', 'popover');
                            segmentRect.setAttribute('data-bs-trigger', 'hover focus'); // Show on hover or focus
                            segmentRect.setAttribute('data-bs-placement', 'top');
                            const popoverTitle = `${segData.label} (${conf.conference} ${inst.year})`;
                            const popoverContent = `
                                Start: ${formatDate(segData.start.date)} (${segData.start.description})<br>
                                End: ${formatDate(segData.end.date)} (${segData.end.description})
                            `;
                            segmentRect.setAttribute('data-bs-title', popoverTitle);
                            segmentRect.setAttribute('data-bs-content', popoverContent);
                            segmentRect.setAttribute('data-bs-html', 'true'); // Allow HTML in content

                            barContainer.appendChild(segmentRect);
                            segmentIndex++;
                        }
                    });
                });
            });

            confRow.appendChild(barContainer);
            innerTimeline.appendChild(confRow);
        });

        // Append the inner timeline (potentially wide) to the scroll wrapper (if mobile) or directly to the main container
        if (isMobile) {
            scrollWrapper.appendChild(innerTimeline);
            timelineContainer.appendChild(scrollWrapper);
        } else {
            timelineContainer.appendChild(innerTimeline);
        }


        // --- Initialize Popovers ---
        const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
        popoverTriggerList.map(function (popoverTriggerEl) {
            return new bootstrap.Popover(popoverTriggerEl);
        });
    }

    // --- Event Listeners ---
    window.addEventListener('resize', renderTimeline);

    // --- Initial Render ---
    renderTimeline();
});
