# Cathay Pacific Asia Miles Award Search

Search for award ticket availability on cathaypacific.com using Asia Miles. Login is required -- the user will be pre-authenticated via saved cookies.

## Parameters

You will receive these search parameters:
- `origin`: IATA airport code (e.g., IAD)
- `destination`: IATA airport code (e.g., HKG)
- `departureDate`: Target date (YYYY-MM-DD)
- `tripType`: "oneway" or "roundtrip"
- `passengers`: Number of passengers (default 1)
- `class`: "economy", "business", or "first"
- `returnDate`: If roundtrip, the return date (YYYY-MM-DD)

## Search Flow

### 1. Navigate to the Homepage

Navigate to: https://www.cathaypacific.com/cx/en_US.html

Wait for the page to load fully. Dismiss any cookie consent or popup overlays.

### 2. Check Login Status and Auto-Login

Cathay Pacific shows "Sign in / up" in the header even when logged in. The user may or may not have an active session.

Steps:
1. Wait 5 seconds for the page to fully load
2. Try proceeding directly to step 3 (enable "Book with miles" and fill the form)
3. If at any point you are redirected to a login page or the search fails due to authentication:
   a. Click the "Sign in / up" button in the header
   b. You will land on a login page that defaults to PHONE NUMBER sign-in. Do NOT click "Sign in with email" -- use the phone number form.
   c. Click the phone number input field -- Chrome's autofill will pre-fill the phone number
   d. Press ArrowDown then Enter to accept the autofill suggestion if needed
   e. Chrome will auto-fill the phone number. Click "Continue" or the next step button.
   f. The password field should appear with Chrome's autofill pre-filling it. If not, click the password field and press ArrowDown then Enter to trigger autofill.
   g. Click the "Sign in" button
   h. Wait 8 seconds for login to complete, then navigate back to the homepage and continue with the search
4. Only return `{"status": "LOGIN_REQUIRED"}` if autofill does not appear (no saved credentials) or if an OTP/verification code is required.

### 3. Enable "Book with Miles" Toggle

The search form has a toggle switch labeled "Book with miles". This MUST be enabled BEFORE filling in other fields. Click the switch to turn it on. The switch element has a `checked` attribute when active. Verify by taking a snapshot -- you should see "Redeem flights" as the submit button text (not "Search flights").

### 4. Set Trip Type

The Trip type combobox defaults to "Return". If one-way, click it and select "One way". This will disable the return date field.

### 5. Enter Origin Airport

The "Leaving from" combobox is a typeahead autocomplete. It may pre-fill from geolocation.

Steps:
1. Click the origin combobox
2. Clear any pre-filled text and type the origin city name or IATA code
3. A filtered listbox appears showing matching airports in format: "City, Airport Name (CODE) Country"
4. Take a snapshot to find the correct option
5. Click the matching option

### 6. Enter Destination Airport

The "Going to" combobox works identically. Type destination city/code, select from dropdown.

### 7. Select Departure Date

Steps:
1. Click the departure date button (shows "Start Date" or current date)
2. A calendar dialog opens showing 2 months side by side
3. Navigate to the correct month using the navigation buttons between the month headers. Take a snapshot after each click to confirm which months are showing.
4. Each day is a gridcell with a button labeled like "Sunday, July 5, 2026"
5. Click the target departure date
6. If roundtrip, click the return date after selecting departure
7. Click "Done" at the bottom of the calendar. IMPORTANT: The Done button may be below the visible viewport inside the calendar dialog. If clicking it fails or is clamped, use evaluate_script to click it:
   ```
   evaluate_script: document.querySelectorAll('button').forEach(b => { if (b.textContent.trim() === 'Done') b.click() }); return 'clicked Done'
   ```
8. Wait 2 seconds for the calendar to close, then take a snapshot to verify dates are set

Important: Past dates are disabled. "First available date" marks today. Navigate months one at a time. There may be a timezone off-by-one quirk -- verify the selected date matches what you intended.

### 8. Set Cabin Class and Passengers

Click the "Cabin class and passengers" combobox. A sub-panel opens:

1. Click the Class dropdown and select the appropriate class: First, Business, Premium Economy, or Economy
2. Adjust passenger count using +/- buttons if needed (default is 1 adult)
3. Click "Done" to close the panel

### 9. Search

Click the "Redeem flights" button. This is the SEARCH button -- it does NOT actually redeem or purchase anything. It just searches for available award flights. This is safe to click. The page navigates to `book.cathaypacific.com` with results. Wait for the results page to load (5-15 seconds). The URL is session-based -- cannot be constructed directly.

### 10. Extract Results

The results page shows:
- A date carousel with 7 days, each clickable to load that day's flights
- Cabin class summary cards showing the lowest miles price per class (e.g., "FROM 115,000" Asia Miles)
- Flight result cards, each containing:
  - Airline logos and flight numbers (e.g., "QR710 > QR816" for multi-segment)
  - Departure time + origin airport
  - Duration (e.g., "22 hour(s) 50 minutes")
  - Arrival time with +N day indicator
  - Destination airport
  - Stopover city and number of stops
  - Availability status: enabled button = available, disabled button = no seats
  - Miles price (e.g., "115,000")

IMPORTANT: Most flights may show "There are no redemption seats available for this flight." (disabled buttons). Extract ALL flights but clearly mark each as available or unavailable. The `flights` array in the output should ONLY contain available/bookable flights. Unavailable flights go in a separate `unavailableFlights` array.

Use evaluate_script or take_snapshot to extract ALL flights. For each flight, extract:
- departureTime
- arrivalTime
- duration
- stops (list of stopover cities)
- airlines (operating carriers, e.g., "Qatar Airways, Cathay Pacific")
- flightNumbers (e.g., "QR710 > QR816")
- milesPrice (number only)
- available (boolean -- is the button enabled/clickable, NOT disabled?)

Also extract the date carousel: for each visible day, the date.
Also extract the cabin class summary: miles price per class shown.

### 11. Output Format

Return a JSON object:
```json
{
  "airline": "cathay_pacific",
  "searchMode": "points",
  "origin": "IAD",
  "destination": "HKG",
  "departureDate": "2026-10-13",
  "tripType": "roundtrip",
  "class": "economy",
  "passengers": 1,
  "searchedAt": "2026-04-05T00:00:00Z",
  "summary": {
    "totalFlights": 15,
    "availableFlights": 1,
    "unavailableFlights": 14
  },
  "classSummary": {
    "economy": 47000,
    "business": 115000,
    "first": 160000
  },
  "flights": [
    {
      "departureTime": "22:25",
      "arrivalTime": "07:50+2",
      "duration": "21h 25m",
      "stops": ["LHR"],
      "airlines": ["British Airways", "Cathay Pacific"],
      "flightNumbers": "BA292 > CX252",
      "economyMiles": 47000,
      "businessMiles": 115000,
      "available": true,
      "seatsRemaining": null
    }
  ],
  "unavailableFlights": [
    {
      "departureTime": "17:00",
      "arrivalTime": "06:55+2",
      "duration": "25h 55m",
      "stops": ["DOH"],
      "airlines": ["Qatar Airways"],
      "flightNumbers": "QR710 > QR816",
      "available": false
    }
  ]
}
```

The `flights` array contains ONLY bookable/available flights. The `unavailableFlights` array contains flights with "no redemption seats available". The `summary` provides a quick count of both for audit purposes.

Note: Cathay uses flat miles pricing per cabin class (not variable per flight). Set economyMiles/businessMiles based on the class summary cards.

## Safety Rules

- Do NOT click any "Select" button on a flight (this proceeds to passenger details)
- Do NOT proceed past the Select flights step
- Do NOT enter passenger details or payment information
- If you encounter a CAPTCHA, return {"status": "CAPTCHA_ENCOUNTERED"} and stop
- If you encounter a login requirement, return {"status": "LOGIN_REQUIRED"} and stop
- Only navigate to cathaypacific.com and book.cathaypacific.com domains

## Tips

- The "Book with miles" toggle is easy to miss. Make sure it's ON before searching.
- Miles prices are flat per route/class -- all flights on the same route cost the same miles. The variable is availability.
- Partner airlines (Qatar, British Airways, etc.) appear in results alongside Cathay Pacific flights.
- The date carousel lets you check adjacent dates without re-searching from the homepage.
- If a "no available flights" modal appears, close it and try the date carousel for nearby dates.
- Results URL is session-based (POST). Do not reload or navigate away -- you'll lose the results.
