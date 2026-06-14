# Cron Deployment & Script Reference

## Crontab Overview

```
# Every 1 minute — sensor reads
* * * * *   readTemp-v4.py   → temperature.log

# Every 5 minutes — processing & publishing
*/5 * * * * createChart-v3.py         → temperature.png
*/5 * * * * createHtmlAndUpload-v6.py → index.html + FTP upload
*/5 * * * * pushTelemetry.py          → data/recent_temp.json on GitHub

# Daily
0 7 * * *   sendEmailAndTemp-v4.py   → email with chart attachment
```

---

## Script Reference

### readTemp-v4.py

Reads the DS18B20 temperature sensor via the 1-Wire kernel interface and prints one CSV line to stdout. Cron redirects stdout to `temperature.log`.

**What it does:**
1. Loads kernel modules `w1-gpio` and `w1-therm` via `/usr/sbin/modprobe`
2. Finds the sensor device at `/sys/bus/w1/devices/28*/w1_slave`
3. Reads raw bytes, waits for `YES` CRC confirmation (5-second timeout)
4. Parses the `t=` value, converts from millidegrees to °C
5. Prints `YYYY/MM/DD HH:MM:SS,temp_c` to stdout

**Output example:**
```
2026/06/14 08:04:02,24.62
```

**Cron entry:**
```
* * * * * cd ~/readtemp/ && /usr/bin/python3 ~/readtemp/readTemp-v4.py >> ~/readtemp/temperature.log
```

**Changes from v3:**

| Issue | Fix |
|---|---|
| `calendar` imported but unused; `time` imported twice; `#import tweepy` dead comment | Removed all three |
| `os.system('modprobe ...')` — no return value check, used shell PATH | `subprocess.run(['/usr/sbin/modprobe', ...], check=False)` with absolute path |
| `open(device_file, 'r')` without context manager — handle leaks on exception | Replaced with `with open(...) as f` |
| CRC `while` loop had no timeout — a bad sensor could hang the cron job indefinitely | Added 5-second deadline; raises `RuntimeError` on timeout |
| `if equals_pos != -1` guard returned `None` implicitly on failure | Now raises `RuntimeError` with a descriptive message |
| Commented-out Fahrenheit return — dead code | Removed |

> **Gotcha — modprobe and cron PATH:** `subprocess.run` searches `PATH` for the executable. Cron's default `PATH` is `/usr/bin:/bin`, which does not include `/usr/sbin` where `modprobe` lives. Using a bare `'modprobe'` command name causes a `FileNotFoundError` in cron even though it works in an interactive shell. Always use the absolute path `/usr/sbin/modprobe`.

---

### createChart-v3.py

Reads `temperature.log`, cleans 85°C error readings, and generates a matplotlib line chart saved as `temperature.png`.

**What it does:**
1. Loads entire `temperature.log` into a pandas DataFrame
2. Replaces 85.0°C error readings with linear interpolation via `replace(85.0, pd.NA).interpolate()`
3. Plots temperature over time using matplotlib (non-interactive `Agg` backend)
4. Saves to `/home/pi/readtemp/temperature.png`

**Log:** `1-createChart-v3.log`

**Cron entry:**
```
*/5 * * * * cd ~/readtemp/ && /usr/bin/python3 ~/readtemp/createChart-v3.py >> ~/readtemp/1-createChart-v3.log
```

**Changes from v2:**

| Issue | Fix |
|---|---|
| `matplotlib.animation` imported but unused | Removed |
| `import datetime as dt` duplicated `import datetime`; both unused after change below | Removed both |
| `import numpy as np` no longer needed after change below | Removed |
| `get_data()` used a list comprehension with `dt.datetime.strptime()` | Replaced with `pd.to_datetime(df['date'], format=...)` |
| `clean_up_data()` looped over a numpy array manually | Replaced with `df['temp'].replace(85.0, pd.NA).interpolate()` inline |
| `df.plot(x='date', ...)` passed a column name that is also the index — redundant | Removed `x='date'`; index is used automatically |
| `print()` calls required manual `datetime.now()` for timestamps | Replaced with `logging.basicConfig(stream=sys.stdout)` — timestamps added automatically |
| File paths hardcoded inside functions and `plt.savefig()` call | Extracted to `LOG_FILE` and `OUT_FILE` constants at top of file |

---

### createHtmlAndUpload-v6.py

Generates a simple HTML page showing current temperature and the chart image, then uploads two files to the UofT FTP server.

**What it does:**
1. Reads last row of `temperature.log` for current date and temp
2. Writes `index.html` to `/home/pi/readtemp/index.html`
3. FTPs `index.html` and `temperature.png` to `individual.utoronto.ca`

**FTP destination:** `individual.utoronto.ca` (UofT personal web space)

**Credentials:** `FTP_USER` and `FTP_PASS` read from environment variables set in the crontab line. A missing variable raises `KeyError` immediately rather than proceeding silently.

**Log:** `2-createHtmlAndUpload-v6.log`

**Cron entry:**
```
*/5 * * * * FTP_USER=<username> FTP_PASS=<password> /usr/bin/python3 ~/readtemp/createHtmlAndUpload-v6.py >> ~/readtemp/2-createHtmlAndUpload-v6.log
```

**Changes from v5:**

| Issue | Fix |
|---|---|
| `import numpy as np` unused | Removed |
| FTP password hardcoded in source | Moved to `FTP_USER` / `FTP_PASS` env vars read via `os.environ[]` |
| `get_data()` used `datetime.strptime()` list comprehension | Replaced with `pd.to_datetime()` — `import datetime` removed entirely |
| File paths and FTP host scattered as string literals | Extracted to `LOG_FILE`, `CHART_FILE`, `HTML_FILE`, `FTP_HOST` constants |
| `index.html` written to working directory (relative path) | Now written to absolute `HTML_FILE` constant |
| `open()` / `.close()` for HTML file and FTP uploads | Replaced with `with open(...) as f` context managers |
| `print()` with manual `datetime.now()` | Replaced with `logging.basicConfig(stream=sys.stdout)` |
| FTP uploads had no error handling — failed upload left connection open | FTP block wrapped in `try/except`; `logging.exception()` captures traceback; `ftp.quit()` called at end of success path only |
| `ftp = FTP(FTP_HOST)` outside `try` — a failed `ftp.login()` would trigger `finally: ftp.quit()` on an unauthenticated connection, potentially masking the login error with a second exception | Moved `FTP(FTP_HOST)` inside `try`; dropped `finally` — `ftp.quit()` only runs when all uploads succeed |

---

### pushTelemetry.py

The live data pipeline for the React dashboard. Reads the full temperature log history, downsamples to 720 hourly averages (30 days), and commits `data/recent_temp.json` to the GitHub repository via the Contents API. The Netlify-hosted React dashboard fetches this file every 5 minutes.

**Why GitHub Contents API instead of a direct Netlify deploy:** Pushing via the GitHub API commits only the JSON data file. Netlify's `netlify.toml` contains an ignore rule that cancels any build where `dashboard/` hasn't changed — so these 288 daily data commits trigger no Netlify builds and consume no build credits. See [Dashboard & Netlify](#dashboard--netlify) below.

**What it does:**
1. Reads and concatenates all `temperature.log*` files (current + rotated)
2. Parses timestamps, removes duplicates, interpolates 85°C errors
3. Filters to last 30 days, resamples to 1-hour averages via `pandas.resample('1h').mean()`
4. Takes the last 720 hourly buckets
5. Gets the current blob SHA of `data/recent_temp.json` from GitHub API (needed for updates)
6. PUTs the new JSON content via GitHub Contents API

**Output format (`data/recent_temp.json`):**
```json
{
  "current_temp": 24.62,
  "last_updated": "2026/06/14 08:00:10",
  "labels": ["May 15 08:00", "May 15 09:00", ...],
  "values": [21.3, 21.5, ...]
}
```

**Note on reading frequency:** Uses `resample('1h')` so it is insensitive to how often readings are taken. Changing `readTemp-v4.py` from 1-minute to 10-minute intervals has no effect on the dashboard output.

**Credentials:** `GITHUB_TOKEN` must be set in the crontab line (GitHub PAT with `repo` scope).

**Log:** `5-pushTelemetry.log`

**Cron entry:**
```
*/5 * * * * GITHUB_TOKEN=<pat> /usr/bin/python3 ~/readtemp/pushTelemetry.py >> ~/readtemp/5-pushTelemetry.log 2>&1
```

---

### sendEmailAndTemp-v4.py

Sends a daily email with the current temperature and `temperature.png` as an attachment.

**What it does:**
1. Reads last row of `temperature.log` for current date and temp
2. Composes a MIME email with subject `Temperature: <date> - <temp> C`
3. Attaches `temperature.png`
4. Sends via Gmail SMTP SSL on port 465

**Sender:** `<sender-email>`

**Credentials:** `GMAIL_PASS` read from environment variable set in the crontab line.

**Log:** `4-sendEmailAndTemp-v4.log`

**Cron entry:**
```
0 7 * * * GMAIL_PASS=<app_password> /usr/bin/python3 ~/readtemp/sendEmailAndTemp-v4.py >> ~/readtemp/4-sendEmailAndTemp-v4.log
```

**Changes from v3:**

| Issue | Fix |
|---|---|
| `import numpy as np` unused | Removed |
| Gmail App Password hardcoded in source | Moved to `GMAIL_PASS` env var via `os.environ[]`; missing var raises `KeyError` immediately |
| Commented-out receiver list and duplicate `sendmail` call — dead code | Removed both |
| `get_data()` used `datetime.strptime()` list comprehension | Replaced with `pd.to_datetime()` — `import datetime` removed entirely |
| File paths, email addresses, SMTP host/port scattered as string literals | Extracted to `LOG_FILE`, `CHART_FILE`, `SENDER_EMAIL`, `RECEIVER_EMAIL`, `SMTP_HOST`, `SMTP_PORT` constants |
| `smtplib.SMTP_SSL()` omitted port; `context` created but not passed | Now `SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context)` — explicit port and SSL context used |
| `server.login/sendmail/quit` called bare — connection left open if `sendmail()` raises | Replaced with `with smtplib.SMTP_SSL(...) as server` context manager |
| `print()` with manual `datetime.now()` | Replaced with `logging.basicConfig(stream=sys.stdout)` |

---

## Log Files

| Log file | Script | Purpose |
|---|---|---|
| temperature.log | readTemp-v4.py | Raw DS18B20 readings (appended, rotated) |
| 1-createChart-v3.log | createChart-v3.py | Chart generation output |
| 2-createHtmlAndUpload-v6.log | createHtmlAndUpload-v6.py | FTP upload output |
| 4-sendEmailAndTemp-v4.log | sendEmailAndTemp-v4.py | Email send output |
| 5-pushTelemetry.log | pushTelemetry.py | GitHub push output |

## Data Flow Diagram

```
DS18B20 sensor
    │ every 1 min
    ▼
temperature.log  ──────────────────────────────────────────────────────┐
    │                                                                   │
    │ every 5 min                                                       │ every 5 min
    ▼                                                                   ▼
createChart-v3.py                                              pushTelemetry.py
    │                                                                   │
    ▼                                                                   │  GitHub Contents API
temperature.png ──► createHtmlAndUpload-v6.py          data/recent_temp.json
                          │                               (GitHub repo)
                          ▼                                      │
                   individual.utoronto.ca              raw.githubusercontent.com
                   (FTP web page)                              │
                                                               ▼
                                              React dashboard (raspberrypi-temperature.netlify.app)
                                              browser fetches JSON every 5 min
                                              Netlify builds only when dashboard/ changes
```

---

## Dashboard & Netlify

**URL:** `https://raspberrypi-temperature.netlify.app`

**Stack:** Vite + React 18 + Chart.js, hosted on Netlify, connected to the `TheFinley/raspberrypi-temperature` GitHub repo.

**Key source files (in `dashboard/`):**

| File | Purpose |
|---|---|
| `src/hooks/useTelemetry.js` | Fetches `data/recent_temp.json` from `raw.githubusercontent.com` every 5 min |
| `src/components/TelemetryChart.jsx` | Chart.js canvas via `useRef` — bypasses React re-renders for smooth updates |
| `src/components/MetricCard.jsx` | Current temp + last sync time, colour-coded status |

**netlify.toml (repo root):**

```toml
[build]
  base    = "dashboard"
  command = "npm run build"
  publish = "dist"
  ignore  = "git diff --quiet HEAD^ HEAD -- dashboard/"
```

The `ignore` command is the key to credit protection. `git diff --quiet` exits 0 (no diff) when `dashboard/` is unchanged, which tells Netlify to cancel the build immediately — typically in under 2 seconds with no build minutes consumed. `pushTelemetry.py` commits 288 times a day; without this rule each commit would trigger a full Netlify build.

**To deploy a dashboard change:** edit files under `dashboard/`, commit and push from `D:\Projects\raspberrypi-temperature`. Netlify will detect the `dashboard/` change, run `npm run build`, and deploy automatically.

**Build credits:** Netlify starter plan includes a monthly credit allowance. Credits refresh on the 8th of each month. Only commits that change `dashboard/` consume credits.
