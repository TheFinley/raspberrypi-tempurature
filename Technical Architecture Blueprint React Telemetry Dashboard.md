# Technical Architecture Blueprint: React Telemetry Dashboard

As requested, here is the complete, production-ready frontend architectural plan. This blueprint is designed to sit directly on top of your hardware setup, bridging your 1-minute local sensor logging with a high-performance React application distributed via Netlify.

---

## 1. System Specifications Matrix (The Infrastructure)

Before designing the interface, we must explicitly account for the environment limitations and the hardware data lifecycle.

### Hardware & Local Software Stack

* **Compute Node:** Raspberry Pi 3 Model B+ (Broadcom BCM2837B0, Quad-Core 1.4GHz, 1GB LPDDR2 SDRAM).
* **Sensor Layer:** DS18B20 1-Wire Digital Thermometer + $4.7\text{k }\Omega$ pull-up resistor.
* **Ingestion Cadence:** A local Python 3 script reads the 1-Wire bus kernel drivers (`w1-gpio`/`w1-therm`) and appends raw timestamps and float data to a local SQLite database (`temperature.db`) **every 1 minute**.
* **Edge Pipeline:** A secondary Python script runs **every 5 minutes** via `cron`. It downsamples the last 30 days of database data into 1-hour increments (720 rows total) and pushes an optimized, highly compressed, 15 KB asset bundle (`index.html` + `recent_temp.json`) directly to Netlify's REST API.

### Target Frontend Stack

* **Build Tooling & Runtime:** React 18+ powered by Vite (optimized for fast, modern, lightweight bundling).
* **Distribution Platform:** Netlify Edge CDN (Serving purely static assets from memory at the edge).
* **Data Visualization:** Chart.js (Canvas-based HTML5 hardware acceleration, perfect for rendering on lower-powered client devices).

---

## 2. Component Architecture & Hierarchy

The component tree follows atomic design principles. It separates layout logic from presentation components to optimize rendering performance.

```
[App Router / Root]
 └── [DashboardLayout]
      ├── [DashboardHeader]
      ├── [MetricsGrid]
      │    ├── [MetricCard (Current Temperature)]
      │    └── [MetricCard (Last Sync Status)]
      └── [AnalyticsContainer]
           └── [TelemetryChart] <── (Direct HTML5 Canvas Target)

```

### Component Responsibilities & Interface Contracts

* ### `App.jsx` (Root Orchestrator)


* **Responsibility:** Injects the global initialization phase, consumes the core telemetry state machine hook, and acts as the top-level error boundary.
* **Props:** None.


* ### `DashboardLayout.jsx` (Structural Layout Component)


* **Responsibility:** Establishes responsive shell view constraints (CSS Grid/Flexbox) ensuring the application scales fluidly from small smartphone screens to wide desktop layouts.
* **Props:** `children: ReactNode`


* ### `DashboardHeader.jsx` (Presentation Component)


* **Responsibility:** Renders localized title details, system environment tags, and branding elements.
* **Props:** None.


* ### `MetricsGrid.jsx` (Layout Utility Container)


* **Responsibility:** Arranges telemetry readout cards into a clean display layout.
* **Props:** `children: ReactNode`


* ### `MetricCard.jsx` (Pure Presentational Component)


* **Responsibility:** Displays individual numerical telemetry variables alongside semantic color indicators based on target ranges.
* **Props:** * `title: string` (e.g., "Ambient Temperature")
* `value: string | number` (e.g., "21.38")
* `unit: string` (e.g., "°C")
* `subtitle: string` (e.g., "Last recorded 3 mins ago")
* `status: 'nominal' | 'warning' | 'critical'`




* ### `AnalyticsContainer.jsx` (Presentational Wrapper)


* **Responsibility:** Wraps the data visualization modules, rendering appropriate structural borders and container headers.
* **Props:** `children: ReactNode`


* ### `TelemetryChart.jsx` (Hardware-Accelerated Render Engine Node)


* **Responsibility:** Maintains a persistent reference to a raw HTML5 `<canvas>` element. It isolates the third-party Chart.js lifecycle from React's component tree.
* **Props:** * `labels: string[]` (720 string array elements formatted as "Mon DD HH:MM")
* `dataPoints: number[]` (720 float elements representing historic intervals)





---

## 3. State Management Blueprint

Because this application relies on a read-only stream of data fetched from a static file (`recent_temp.json`), heavy state managers like Redux or Zustand are unnecessary overhead. Instead, we will encapsulate all state logic inside a single, clean **Custom Hook** (`useTelemetry.js`).

### State Schema Model

The internal state tree managed by our hook matches this structural type definition:

```typescript
interface TelemetryState {
  currentTemp: number;
  lastUpdated: string;
  chartLabels: string[];
  chartValues: number[];
  syncStatus: 'idle' | 'fetching' | 'error';
  errorMessage: string | null;
}

```

### Key Lifecycle Variables:

* `telemetryData`: The active data model driving the dashboard presentation components.
* `cacheBuster`: An implicit timestamp string appended to the fetch requests (`?t=1718314640`) to force edge proxies and local client browsers to bypass cached versions of the JSON payload.

---

## 4. Scalable File Layout

This structure cleanly isolates local documentation, build tooling configuration, business logic hooks, and pure user interface components.

```text
/root
├── docs/                        # Architectural documentation & hardware logs
│   ├── hardware-spec.md         # Pinouts, pull-up resistor values, and terminal specs
│   └── cron-deployment.md       # Target crontab script definitions
├── public/                      # Static compilation target assets
│   ├── index.html
│   └── mock_recent_temp.json    # High-fidelity development sandbox file
├── src/
│   ├── assets/                  # Non-dynamic static vectors and brand imagery
│   ├── components/              # Presentation layer components
│   │   ├── AnalyticsContainer.jsx
│   │   ├── DashboardHeader.jsx
│   │   ├── MetricCard.jsx
│   │   ├── MetricsGrid.jsx
│   │   └── TelemetryChart.jsx
│   ├── hooks/                   # Business logic and state processing
│   │   └── useTelemetry.js      # Internal polling engine and fetch manager
│   ├── layouts/                 # Structural wireframe layouts
│   │   └── DashboardLayout.jsx
│   ├── styles/                  # Tokenized configuration variables
│   │   ├── variables.css        # Core system design parameters (colors, padding)
│   │   └── core.css             # Fluid layout configurations
│   ├── utils/                   # Pure utility transformations
│   │   └── dataFormatters.js    # Client-side string adjustments
│   ├── App.jsx                  # Component tree layout composer
│   └── main.jsx                 # Application mounting bootstrap node
├── package.json
└── vite.config.js

```

---

## 5. Logic Engine & Loop Performance Management

*Note: Your prompt template mentioned game loops and win/loss rules—unless your temperature sensor is secretly running a hidden video game, we will map that logic directly onto our real-time telemetry streaming engine instead!*

To prevent infinite re-renders and memory leaks on client browsers, the data streaming loop is designed around two strict rules:

### A. The Polling Interval Controller

The internal web network pipeline is isolated inside a highly structured `useEffect` hook with an empty dependency tree (`[]`). This ensures that only **one single, permanent `setInterval` listener** is registered when the dashboard page initially mounts.

```
[Dashboard Component Mounts]
        │
        ▼
[useEffect Triggers setInterval] ──(Fires every 300s)──► [Fetch recent_temp.json?t=timestamp]
                                                                        │
                                                                        ▼
                                                       [Perform Shallow Equality Check]
                                                                        │
                                       ┌────────────────────────────────┴────────────────────────────────┐
                                       ▼ (Data is Identical)                                             ▼ (Data Has Changed)
                             [Suppress Re-render]                                              [Commit to TelemetryState Engine]

```

### B. Bypassing React via Direct Canvas Updates

If React destroyed and rebuilt the Chart.js canvas component every time the temperature data refreshed, the webpage would stutter, drop frame rates, and potentially leak memory on mobile browsers.

To solve this, the `TelemetryChart` uses a persistent `useRef` that holds onto the raw underlying DOM canvas element. When new 30-day data coordinates arrive every 5 minutes, our code bypasses the React component lifecycle completely. It accesses the active Chart.js instance directly, overwrites the internal data arrays, and calls the native `.update()` method. This redraws the canvas smoothly via the user's hardware graphics card without any costly DOM updates.

---

## 6. Milestone Implementation Roadmap

* ### Milestone 1: High-Fidelity Sandbox Local Development


* **Focus:** Build out the static workspace independent of the Raspberry Pi.
* **Deliverables:** Configure Vite compilation rules. Populate `/public/mock_recent_temp.json` with a 720-row sample dataset representing a full month of temperature curves.


* ### Milestone 2: Atomic Presentation UI Assembly


* **Focus:** Implement the visual layouts, spacing frameworks, and typographic hierarchies.
* **Deliverables:** Create `MetricCard`, `DashboardHeader`, and layout shells. Verify their performance and alignment across desktop, tablet, and mobile dimensions using purely static mock data.


* ### Milestone 3: Canvas Graph Visualization Engine Setup


* **Focus:** Bridge the Chart.js chart container into the React environment.
* **Deliverables:** Program the `TelemetryChart` reference canvas layer. Implement strict memory cleanup routines (`chartInstance.destroy()`) to prevent resource leaks when components unmount.


* ### Milestone 4: Telemetry Synchronization Hook Integration


* **Focus:** Build out the background polling loop data connection.
* **Deliverables:** Complete the custom `useTelemetry` network polling hook. Add error boundary handlers to display helpful warning messages if a network connection drops or the JSON data file fails to load.


* ### Milestone 5: End-to-End Edge Verification


* **Focus:** Production deployment and performance auditing.
* **Deliverables:** Verify production bundle sizes, validate the automatic 5-minute cache-busting logic, and launch the live site on Netlify Edge CDN infrastructure.



---

Does this technical blueprint line up with your vision for the project, or should we make any adjustments to the component hierarchy before we begin building out Milestone 1?