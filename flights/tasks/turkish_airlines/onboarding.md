# Turkish Airlines Miles&Smiles - Onboarding Notes

Research conducted 2026-04-02 via Phantom stealth audit.

## Award Search URL
https://www.turkishairlines.com/en-us/miles-and-smiles/book-award-tickets/

Pre-selects the "Award Ticket" tab. No login required to search. Login only needed to book.

## Form Field Details

### From/To Comboboxes
- `<input role="combobox">` with `aria-haspopup="listbox"` and `aria-controls="bookerInputList"`
- Type IATA code or city name → live filtering → dropdown with `role="option"` items
- Each option: icon + airport name + (IATA) + city + country
- After selecting From, focus auto-cascades to To
- After selecting To, calendar auto-opens
- From field geo-detects user location (e.g., "Austin (AUS)") -- must clear before typing

### Trip Type
- Two `<span role="button">` elements with `aria-current="true/false"`
- IDs: `round-trip`, `one-way`

### Date Picker
- react-calendar library
- Two months side by side
- Day tiles: `<button>` with `<abbr aria-label="July 2 Thursday, 2026">`
- Today: `.react-calendar__tile--now`
- Selected: `.react-calendar__tile--active`
- Past dates: HTML `disabled`
- Month nav: previous (‹) / next (›) buttons
- Checkboxes: "Flexible dates" (round trip only), "Direct flights"
- OK button: disabled until date selected
- Week starts Monday

### Passenger/Class Selector
- Opens after date confirmation
- Cabin class: `<input type="radio" name="cabin-type" value="ECONOMY|BUSINESS">`
- Count controls: `<a role="button">` (NOT `<button>`!) with IDs like `bookerFlightPaxPickerPlusAdult`
- Min 1 adult, children/infants can be 0
- Display: `<span aria-live="polite">`

### Search Button
- "Search flights" red CTA button

## Results Page

### URL Pattern
`/en-us/miles-and-smiles/book-award-tickets/availability/?cId={UUID}`
Session-based, cannot construct directly.

### Date Carousel
- 7-day strip centered on selected date
- Each day: date + lowest Miles price
- Navigate: previous/next week buttons (-7/+7 days)

### Flight Cards
- `<list aria-label="List of searched flights">` → `<listitem>`
- Route summary: departure time, origin, connection, arrival, destination, duration, aircraft
- "Itinerary details" expandable: per-leg breakdown with flight numbers, layover times
- Economy/Business fare buttons with Miles price and "Per passenger"
- Scarcity: "4 left at this price" (red text)

### Sample Pricing (IAD→BKK, July 2026)
- Economy: 110,000 Miles
- Business: 275,000 Miles
- All flights connect via IST

## Quirks and Gotchas

- From field auto-populates from geolocation -- agent must clear before typing new origin
- Cascading UI: selecting each field auto-opens the next (From → To → Calendar → Passengers)
- Passenger count +/- are `<a>` elements, not `<button>` -- may need click instead of press_key
- Calendar OK button must be clicked to confirm date (don't just click the date)
- Results URL is session-based (cId UUID) -- no way to construct a direct link to results
- "Direct flights" checkbox in calendar controls nonstop filtering -- leave unchecked for all results
