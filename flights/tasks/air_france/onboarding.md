# Air France Flying Blue - Onboarding Notes

Research conducted 2026-04-03 via Phantom.

## Award Search URL
https://wwws.airfrance.fr/en (homepage, "Book with Miles" tab)
Results URL pattern: wwws.airfrance.fr/en/search/flights/0

## Login Required
Yes. Flying Blue account needed. Session cookies: `af_id`, `wzuid`, `wzsid`, `wzup`. No JWT or client-side token visible -- auth is server-side session.

## Form Field Details

### Trip Type
- Combobox with "Round trip" (default) and "One-way"
- No Multi-city option in miles mode (available in cash mode)

### Origin/Destination
- Comboboxes with typeahead autocomplete
- Shows city name, airport name, IATA code, country
- Building icon = city-level (all airports), plane icon = specific airport
- When empty/clicked: shows "Popular destinations" (French cities)
- When typing: shows "All destinations" with filtered results

### Date Picker
- Calendar overlay, 2 months side by side
- Monday-start weeks
- Day buttons labeled "03 April 2026" etc.
- Past dates disabled
- Two-step: "DEPARTURE DATE" then "RETURN DATE" for roundtrip
- Must click "Confirm" button after selecting dates
- "Clear dates" button available
- "Next month" button to navigate

### Passengers
- No standard accessibility ref -- requires coordinate-based click or JS
- CSS selector: `.bw-search-widget__passengers-dialog-opener`
- Opens modal dialog "Passengers (N)"
- Shows logged-in user name with auto-checked disabled checkbox
- Age type combobox per passenger: Adult (18+), Child (2-11), Youth (12-17)
- "Add a passenger" button
- "Continue" button to close

### Cabin
- Combobox with: Economy, Premium, Business, La Première
- Default: Economy

### Search Button
- "Search flights" button

## Results Page

### Date Carousel
- 7-day strip with left/right navigation
- Each day shows: lowest Miles + EUR taxes
- Tabs are clickable to switch dates without re-searching

### Flight Results
- Split into "Direct flights" and "Connecting flights" sections
- Shows: airline logo, times, duration, direct/connections, cabin, fare label, miles price
- Seat scarcity: "1 seats left" inline
- "Details" expandable for flight numbers/aircraft
- Cabin filter dropdown + sort options (price, duration, arrival, departure)
- Partner airlines (KLM, SkyTeam) shown alongside Air France

### Sample Pricing (IAD→CDG, July 2026, Business)
- Direct AF flights: 179,500 Miles + EUR 403.75
- Connecting KLM via AMS: 186,000 Miles + EUR 403.75 (1 seat left)
- Date carousel range: 179,000 - 324,000 Miles

### Key Differences from Turkish Airlines
- Miles + mandatory EUR taxes (Turkish shows just miles)
- Direct vs connecting are separated into distinct sections
- Partner airline results shown (Turkish only shows Turkish)
- La Première class option (Turkish maxes at Business)
- Named passenger system (shows logged-in user by name)

## Session Mechanics
- Auth cookies: af_id, wzuid, wzsid, wzup
- Server-side sessions (no client-side tokens)
- Session lifetime: needs monitoring -- unknown if sliding or fixed expiration
- "Remember me" on login: needs testing
- Recommendation: implement warm-up visit strategy once session lifetime is determined
