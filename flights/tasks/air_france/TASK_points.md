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

### 2. Check Login Status

Air France's site shows a "Log in" link in the nav even when you ARE logged in -- this is misleading. Do NOT rely on whether you see "Log in" text. Instead:

1. Click the "Log in" or account button in the top-right header area
2. A dropdown or panel will appear. If it shows the user's name and Flying Blue tier, you are logged in. Close the panel and proceed.
3. If it shows a login form asking for email/password, you are NOT logged in. Return `{"status": "LOGIN_REQUIRED"}` and stop.

If you successfully get to the "Book with Miles" tab and the search form appears functional, you are logged in regardless of what the header shows.

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

### 12. Output Format

Return a JSON object:
```json
{
  "airline": "air_france",
  "searchMode": "points",
  "origin": "IAD",
  "destination": "CDG",
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

- Do NOT click any purchase, book, reserve, select, or checkout buttons beyond the flight selection page
- Do NOT proceed past selecting a departing flight
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
