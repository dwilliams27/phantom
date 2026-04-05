# Cathay Pacific Asia Miles - Onboarding Notes

Research conducted 2026-04-05 via Phantom.

## Award Search URL
Homepage: https://www.cathaypacific.com/cx/en_US.html (search form with "Book with miles" toggle)
Results: book.cathaypacific.com/CathayPacificAwardV3/dyn/air/booking/availability (session-based POST, cannot construct directly)

## Login Required
Yes. Asia Miles / Cathay membership account. Shows "Welcome, Mr/Ms [Name]" in header when logged in.

## Known Issues
- Results page (book.cathaypacific.com) occasionally returns 404s on JS bundles. Possibly CDN issues or transient rate limiting. Retrying usually works. If persistent, may indicate bot detection on the booking subdomain.
- Timezone off-by-one: form showed July 5 but results selected July 4. May be UTC vs local timezone issue in date handling.
- Results URL is session-based POST -- reloading shows "system not available" error. Must navigate from homepage form.

## Form Field Details

### Book with Miles Toggle
- Switch element with "checked" attribute when active
- MUST be enabled before filling other fields
- Changes submit button from "Search flights" to "Redeem flights"
- Shows dynamic "Miles per passenger from [N]" preview

### Origin/Destination
- Comboboxes with typeahead autocomplete
- Format: "City, Airport Name (CODE) Country"
- 1304+ airports in database
- Pre-fills origin from geolocation -- must clear before typing
- First filtered result auto-selects (marked as selected)

### Trip Type
- Combobox: "Return" (default), "One way"
- One way disables return date field

### Cabin Class + Passengers
- Combined combobox opening a sub-panel
- Class dropdown: First, Business, Premium Economy, Economy
- Passenger +/- buttons (max 6 online, infants require calling customer care)
- "Done" button to close panel

### Date Picker
- Dialog overlay, 2 months side by side
- gridcell > button per day with full ARIA labels ("Sunday, July 5, 2026")
- Past dates disabled, today marked "First available date"
- Navigation buttons between month headers
- "Done" button at bottom with miles preview
- Availability legend (Low/High) but no per-date indicators in calendar
- "Seat availability reflects Cathay Pacific flights for the next 360 days"

## Results Page

### Date Carousel
- 7-day strip, clickable dates
- Month label above

### Cabin Class Cards
- Summary cards per class showing lowest miles
- "View full details" expandable with cancellation/change fees

### Flight Cards
- Each flight is a button (disabled = unavailable, enabled = available)
- Shows: airline logos, flight numbers, departure/arrival times, duration, stops, miles price
- Partner airlines: Qatar Airways (QR), British Airways (BA), Cathay Pacific (CX)
- Multi-segment shown as "QR710 > QR816"
- Availability text: "There are no redemption seats available for this flight."

### Pricing Model
- FLAT miles per cabin class per route (not variable by flight)
- IAD→HKG: Economy 38K, Business 115K, First 160K (one-way)
- All flights same miles cost -- availability is the differentiator

### Sort/Filter
- Sort: Departure time (default), Arrival time, Duration
- Filter button available

## Session Mechanics
- Homepage on cathaypacific.com, results on book.cathaypacific.com
- Session-based POST for results -- no direct URL construction
- Auth cookie behavior: needs monitoring for expiry
