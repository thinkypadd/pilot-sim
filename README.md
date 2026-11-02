# Kestrel C-44: 2D Cockpit Flight Simulator

A 2D sidescrolling web flight simulator featuring physical cockpit controls, procedural flight dynamics, and a 2-leg cross-canyon route with a mandatory midway refueling stop.

## Flight Route
- **Departure:** Kala Valley Field (`KALA`, elev 42m, 0.0 km)
- **Midway Service:** Redrock Fuel Depot (`MESA-4`, elev 224m, 4.3 km)
- **Arrival:** Solis Coastal International (`SOLIS`, elev 18m, 8.2 km)

A single full tank cannot clear Cloudspine Ridge (332m) and reach Solis at cruise power, requiring a touchdown and refuel stop at the MESA-4 mesa strip.

## Cockpit Controls (Mouse-Operated)
- **Engine Master:** Toggle switch controls turbine ignition.
- **Throttle Quadrant:** Vertical thrust lever with cruise (60-80%) and WEP afterburner (80-100%) zones.
- **Airbrake / Spoiler:** Drag to dump excess lift and brake in-flight.
- **Attitude / Elevator:** Artificial horizon (ADI) paired with vertical pitch lever (-30° to +35°), level button (0° LVL), and ALT HOLD autopilot.
- **Configuration:** 3-position flaps (`UP`, `T/O`, `LAND`), landing gear lever with 3-Green indicators and weight-on-wheels interlock, plus pre-armable wheel brakes.
- **Glareshield:** Co-pilot phase checklist and master warning annunciators.

## Local Development
Run the test suite:
```bash
node test.mjs
```

Serve the simulator locally:
```bash
python3 -m http.server 8000
```
Open `http://localhost:8000` in any web browser.
