# Turkish Airlines Miles&Smiles Award Search

Search for award ticket availability on turkishairlines.com using Miles&Smiles points.

## Parameters

You will receive these search parameters:
- `origin`: IATA airport code (e.g., IAD)
- `destination`: IATA airport code (e.g., BKK)
- `departureDate`: Target date (YYYY-MM-DD)
- `tripType`: "oneway" or "roundtrip"
- `passengers`: Number of passengers (default 1)
- `class`: "economy" or "business"
- `returnDate`: If roundtrip, the return date (YYYY-MM-DD)

## Search Flow

### 1. Navigate to the Award Search Page

Navigate to: https://www.turkishairlines.com/en-us/miles-and-smiles/book-award-tickets/

This URL pre-selects the "Award Ticket" tab. Wait for the page to load fully. If a cookie consent banner appears, dismiss it.

### 2. Set Trip Type

The form defaults to "Round trip". If the search is one-way, click the "One way" button. The trip type buttons have `aria-current="true"` on the selected one. Verify by taking a snapshot after clicking.

### 3. Enter Origin Airport

The From field is a combobox that auto-fills from geolocation. You must clear it and type the origin IATA code.

Steps:
1. Click the From combobox (labeled "From")
2. Use fill to clear and type the IATA code (e.g., "IAD")
3. A dropdown appears with matching airports (role="listbox" with role="option" items)
4. Take a snapshot to find the correct option
5. Click the option that matches your airport code
6. After selecting, focus automatically moves to the To field

### 4. Enter Destination Airport

The To combobox works identically to From.

Steps:
1. The To field should already be focused after step 3. If not, click it.
2. Type the destination IATA code (e.g., "BKK")
3. Take a snapshot to find the matching option in the dropdown
4. Click the correct option
5. After selecting, the date picker automatically opens

### 5. Select Departure Date

The date picker uses react-calendar showing 2 months side by side.

Steps:
1. The calendar should have auto-opened after selecting the destination. If not, click the Dates button.
2. Navigate to the correct month using the next month (›) button. Each click advances one month. Take snapshots to track which months are showing.
3. Day tiles have accessible names like "July 2 Thursday, 2026" via their abbr element's aria-label.
4. Click the day tile for the departure date.
5. If roundtrip, the calendar stays open for the return date -- click the return date tile.
6. If one-way, click the OK button to confirm.
7. After confirmation, the Passengers panel auto-opens.

Important: Past dates are disabled. If the target date is not visible, keep clicking the next month button. Take a snapshot after each navigation to confirm which months are displayed.

### 6. Set Passengers and Class

The passenger/class selector opens after date confirmation.

Steps:
1. The panel should have auto-opened. If not, click the Passengers button (shows "1 Passenger ECO" or similar).
2. To change class: click the "Business" radio button (input with value="BUSINESS"). Default is Economy.
3. To change passenger count: the +/- controls are `<a role="button">` elements (not regular buttons). Click the + button next to Adult to increase count.
4. The passenger count display updates with `aria-live="polite"`.
5. Close the panel by clicking elsewhere or proceeding to search.

### 7. Search

Click the "Search flights" button. Wait for the results page to load. This may take 5-10 seconds. Use wait_for to check for the results list appearing, or take periodic snapshots.

### 8. Extract Results

The results page shows:
- A date carousel at the top with 7 days centered on the selected date. Each day shows the lowest Miles price.
- Flight cards in a list (role="list" with role="listitem")
- Each flight card contains:
  - Departure time + origin airport
  - Arrival time + destination airport ("+N days" if overnight)
  - Total travel duration
  - Connection city (e.g., IST)
  - Aircraft type
  - Economy price in Miles (e.g., "110,000 Miles")
  - Business price in Miles (e.g., "275,000 Miles")
  - Scarcity indicators (e.g., "4 left at this price")

Use evaluate_script or take_snapshot to extract ALL flights shown on the results page. For each flight, extract:
- departureTime
- arrivalTime
- duration (total travel time)
- stops (connection cities)
- aircraft
- economyMiles (number only)
- businessMiles (number only)
- seatsRemaining (if shown, e.g., "4 left")

Also extract the date carousel data: for each of the 7 visible days, the date and lowest Miles price.

### 9. Output Format

Return a JSON object:
```json
{
  "airline": "turkish_airlines",
  "searchMode": "points",
  "origin": "IAD",
  "destination": "BKK",
  "departureDate": "2026-07-02",
  "tripType": "oneway",
  "class": "business",
  "passengers": 1,
  "searchedAt": "2026-04-02T22:00:00Z",
  "dateCarousel": [
    {"date": "2026-06-29", "lowestMiles": 110000},
    {"date": "2026-06-30", "lowestMiles": 110000}
  ],
  "flights": [
    {
      "departureTime": "21:45",
      "arrivalTime": "05:10+2",
      "duration": "20h 25m",
      "stops": ["IST"],
      "aircraft": "A350-900",
      "economyMiles": 110000,
      "businessMiles": 275000,
      "seatsRemaining": "4 left"
    }
  ]
}
```

## Safety Rules

- Do NOT click any "Select fare package", purchase, book, reserve, or checkout buttons
- Do NOT proceed past the "Select flight" step (step 2 in the wizard)
- Do NOT enter passenger information or payment details
- If you encounter a CAPTCHA, return {"status": "CAPTCHA_ENCOUNTERED"} and stop
- If you encounter a login requirement, return {"status": "LOGIN_REQUIRED"} and stop
- Only navigate to turkishairlines.com domains

## Tips

- The comboboxes filter as you type. Typing "IAD" usually shows Washington Dulles immediately. If multiple results appear, pick the one matching the exact IATA code.
- If the calendar opens to the wrong month, don't try to type a date. Use the next/previous month buttons to navigate visually.
- The "Direct flights" checkbox in the date picker filters to nonstop only. Leave it unchecked to see all options (connecting included).
- If results show "No flights found", try adjacent dates using the date carousel at the top.
- All flights from US airports to Asian destinations connect through IST (Istanbul). This is expected.
