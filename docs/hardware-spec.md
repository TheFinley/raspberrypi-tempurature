# Hardware Specification

## Compute Node

| Component | Detail |
|---|---|
| Model | Raspberry Pi 3 Model B+ |
| CPU | Broadcom BCM2837B0, Quad-Core ARM Cortex-A53, 1.4GHz |
| RAM | 1GB LPDDR2 SDRAM |
| OS | Raspberry Pi OS (Linux 6.12 aarch64) |
| Hostname | raspberrypi |
| Local IP | <pi-local-ip> |

## Temperature Sensor

| Component | Detail |
|---|---|
| Model | DS18B20 1-Wire Digital Thermometer |
| Protocol | Dallas 1-Wire |
| Resolution | 12-bit (0.0625°C steps) |
| Range | -55°C to +125°C |
| Accuracy | ±0.5°C (from -10°C to +85°C) |
| Pull-up resistor | 4.7kΩ between Data and VCC |

### Wiring

```
DS18B20 Pin    →    Raspberry Pi
─────────────────────────────────
VCC (red)      →    3.3V (Pin 1)
GND (black)    →    GND  (Pin 6)
DATA (yellow)  →    GPIO4 (Pin 7)

4.7kΩ resistor between DATA and VCC
```

### Kernel Drivers

The 1-Wire interface uses two kernel modules loaded at runtime by `readTemp-v4.py`:

```python
subprocess.run(['/usr/sbin/modprobe', 'w1-gpio'], check=False)
subprocess.run(['/usr/sbin/modprobe', 'w1-therm'], check=False)
```

The sensor appears at:
```
/sys/bus/w1/devices/28-xxxxxxxxxxxx/w1_slave
```

The `28*` prefix identifies DS18B20 family devices. Reading `w1_slave` returns two lines:
```
xx xx xx xx xx xx xx xx xx : crc=xx YES
xx xx xx xx xx xx xx xx xx t=24620
```

The `t=` value is temperature in thousandths of a degree Celsius (24620 = 24.62°C).

### Known Sensor Quirk — 85°C Error Reading

On power-up or bus glitch the DS18B20 can return exactly 85.0°C (its default power-on register value). All scripts that process temperature data detect and interpolate over this value. `createChart-v3.py` uses the pandas-native approach:

```python
df['temp'].replace(85.0, pd.NA).interpolate()
```

`pushTelemetry.py` uses an equivalent in-place approach on its concatenated DataFrame:

```python
combined.loc[combined['temp'] == 85.0, 'temp'] = None
combined['temp'].interpolate(inplace=True)
```

## Storage

| Path | Purpose |
|---|---|
| /home/pi/readtemp/tempurature.log | DS18B20 ambient temp log (CSV, 1-min cadence) |
| /home/pi/readtemp/tempurature.png | Ambient temp chart (regenerated every 5 min) |
| /home/pi/readtemp/index.html | FTP-uploaded page for individual.utoronto.ca |

Log file format:
```
2026/06/14 08:04:02,24.62
2026/06/14 08:05:01,24.62
```

Logs are rotated by logrotate (`.log.1`, `.log.2`, etc.). Older rotations are in `Archive/`.
