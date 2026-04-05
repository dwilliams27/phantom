# Air France Flying Blue Award Search

Search for award ticket availability on airfrance.fr using Flying Blue miles. Login is required -- the user will be pre-authenticated via saved cookies in the Chrome profile.

## Parameters

You will receive these search parameters:
- `origin`: IATA airport code (e.g., IAD)
- `destination`: IATA airport code (e.g., CDG)
- `departureDate`: Target date (YYYY-MM-DD)
- `tripType`: "oneway" or "roundtrip"
- `passengers`: Number of passengers (default 1)
- `class`: "economy", "business", or "first" (first = La Première)
- `returnDate`: If roundtrip, the return date (YYYY-MM-DD)

## Search Flow

### 1. Navigate to the Homepage

Navigate to: https://wwws.airfrance.fr/en

Wait for the page to load. If a cookie consent banner appears, dismiss it.

### 2. Check Login Status and Refresh Session

IMPORTANT: Air France has two quirks with login state:
- Auth loads asynchronously (1-3 seconds after page load) -- the page initially shows "Log in" even when you ARE logged in.
- Sessions go "soft expired" after ~12 hours. The site still has your credentials but needs a manual refresh: clicking the login dropdown and clicking the login button causes a page refresh that restores the authenticated session without requiring any password or OTP.

Steps:
1. After navigating, wait 5 seconds for auth to load.
2. Take a snapshot. Look for the user's name (e.g., "DAVID") in the header area.
3. If you see their name or Flying Blue tier, you are logged in -- proceed to step 3.
4. If you only see "Log in" text with no name after waiting:
   a. Click the "Log in" button/link in the header
   b. A dropdown or panel may appear -- click the "Log in" or "Sign in" option within it
   c. The page should refresh and your name should appear in the header (no password entry needed -- the site refreshes the session from saved credentials)
   d. Wait 3 seconds, take a snapshot to confirm you are now logged in
5. If after this refresh attempt you are STILL not logged in (a login form asking for email/password appears), return `{"status": "LOGIN_REQUIRED"}` and stop.
6. As a final fallback, try clicking the "Book with Miles" tab regardless -- if the search form works, proceed with the search.

### 3. Select "Book with Miles" Tab

The homepage has a tablist with "Book a flight" and "Book with Miles" tabs. Click the "Book with Miles" tab. Take a snapshot to confirm you're on the miles booking form.

### 4. Set Trip Type

The Trip field is a combobox with "Round trip" and "One-way" options. If the search is one-way, click the Trip combobox and select "One-way". Verify by taking a snapshot.

### 5. Enter Origin Airport

The "Departing from" field is a combobox with typeahead autocomplete.

Steps:
1. Click the "Departing from" combobox
2. Use fill to clear and type the IATA code or city name (e.g., "Washington" or "IAD")
3. A dropdown appears with matching airports. Each option shows: city name, airport name, IATA code, country
4. Options with a building icon are city-level (all airports), plane icon is specific airport
5. Take a snapshot to find the correct option
6. Click the option matching your airport

### 6. Enter Destination Airport

The "Arriving at" combobox works identically to the origin field.

Steps:
1. Click the "Arriving at" combobox
2. Type the destination IATA code or city name
3. Take a snapshot, click the matching option

### 7. Select Departure Date

The date picker opens as a calendar overlay showing 2 months side by side.

Steps:
1. Click the date field (labeled "choose a date" with a calendar icon)
2. The calendar opens with heading "DEPARTURE DATE"
3. Navigate to the correct month using the "Next month" button
4. Day buttons have accessible labels like "03 April 2026"
5. Click the departure date button
6. If roundtrip, the calendar switches to "RETURN DATE" -- click the return date
7. Click the "Confirm" button to close the calendar
8. Take a snapshot to verify the dates are set

Important: Past dates are disabled. Week starts on Monday. Take snapshots after each month navigation to confirm which months are displayed.

### 8. Set Cabin Class

The Cabin field is a combobox. Options:
- Economy
- Premium
- Business
- La Première

Click the combobox and select the appropriate class based on the search parameters. Map "first" class to "La Première".

### 9. Passengers

The passengers control has no standard ref in the snapshot. It displays as "1 adult" in the form.

For single-passenger searches (the default), skip this step -- 1 adult is pre-selected and includes the logged-in user.

For multi-passenger searches: use evaluate_script to click the passengers dialog opener, then interact with the "Add a passenger" button and age type selectors.

### 10. Search

Click the "Search flights" button. Wait for the results page to load. This may take 5-15 seconds. Use wait_for or take periodic snapshots.

### 11. Extract Results

The results page shows:
- A date carousel at the top with 7 days. Each day shows the lowest Miles price + EUR taxes.
- Flights split into "Direct flights" and "Connecting flights" sections
- Each flight card shows:
  - Operating airline (Air France, KLM, or partner)
  - Departure time + arrival time (+1 day indicator)
  - Origin + destination airport codes
  - Direct or number of connections (with connection city)
  - Flight duration
  - Cabin class with fare label (e.g., "Lowest fare")
  - Miles price per passenger
  - Seat availability warnings (e.g., "1 seats left")
  - Expandable "Details" button for flight numbers and aircraft

Use evaluate_script or take_snapshot to extract ALL flights shown on the results page. For each flight, extract:
- departureTime
- arrivalTime
- duration (total travel time)
- stops (connection cities, empty array for direct)
- airline (operating carrier)
- milesPrice (number only, e.g., 179500)
- taxesEur (number only, e.g., 403.75)
- seatsRemaining (if shown, e.g., "1 seat left")
- cabin (the class shown)
- fareType (e.g., "Lowest fare")

Also extract the date carousel data: for each visible day, the date and lowest Miles price + taxes.

### 12. Select Departing Flight and Extract Return Flights (Roundtrip Only)

If this is a roundtrip search, you MUST select a departing flight to see return options:
1. Click "Select" on the cheapest/best departing flight -- this is SAFE, it does NOT purchase anything
2. The page advances to "Return flight" selection
3. Extract all return flights using the same format as outbound flights
4. Extract the return date carousel too
5. Do NOT proceed past the return flight page

### 13. Output Format

For roundtrip searches, use `outboundFlights` and `returnFlights` arrays. For one-way, use just `outboundFlights`.

Return a JSON object:
```json
{
  "airline": "air_france",
  "searchMode": "points",
  "origin": "IAD",
  "destination": "HKG",
  "departureDate": "2026-07-03",
  "tripType": "oneway",
  "class": "business",
  "passengers": 1,
  "searchedAt": "2026-04-03T00:00:00Z",
  "dateCarousel": [
    {"date": "2026-06-30", "lowestMiles": 324000, "taxesEur": 403.75},
    {"date": "2026-07-01", "lowestMiles": 185500, "taxesEur": 403.75}
  ],
  "flights": [
    {
      "departureTime": "18:15",
      "arrivalTime": "08:00+1",
      "duration": "7h 45m",
      "stops": [],
      "airline": "Air France",
      "economyMiles": null,
      "businessMiles": 179500,
      "taxesEur": 403.75,
      "seatsRemaining": null,
      "fareType": "Lowest fare"
    }
  ]
}
```

Note: Air France shows miles price for the SELECTED cabin class only. Set `economyMiles` or `businessMiles` based on which class was searched. The other field should be null unless visible.

## Safety Rules

- Do NOT click any purchase, book, reserve, or checkout buttons
- You MAY click "Select" on a departing flight to see return flight options -- this does NOT purchase anything, it just advances to the return flight selection page. You MUST select a departing flight to see return flights.
- Do NOT proceed past the return flight selection page (do not enter passenger details or payment)
- Do NOT enter passenger details or payment information
- If you encounter a CAPTCHA, return {"status": "CAPTCHA_ENCOUNTERED"} and stop
- If you encounter a login requirement, return {"status": "LOGIN_REQUIRED"} and stop
- Only navigate to airfrance.fr and klm.com domains

## Tips

- The typeahead fields work best with city names rather than IATA codes for common destinations (e.g., "Paris" instead of "CDG" since CDG might not appear first)
- The date picker "Confirm" button must be clicked after selecting dates -- don't just click a date and move on
- Results show Air France AND partner airline flights (KLM, SkyTeam partners). Extract all of them.
- The "Details" button on each flight expands to show flight numbers and aircraft type. You can click it for more info but it's optional.
- Cabin class can be changed on the results page via a dropdown -- no need to go back to search.
- The date carousel tabs are clickable to switch dates without re-searching.
