#!/usr/bin/env python3
"""
pushTelemetry.py — runs every 5 min via cron
Reads DS18B20 log, downsamples to 720 hourly points (30 days),
and pushes recent_temp.json to GitHub via the Contents API.
"""

import base64
import json
import os
import glob
import datetime
import sys

import requests
import pandas as pd

GITHUB_TOKEN   = os.environ.get('GITHUB_TOKEN')
GITHUB_REPO    = 'TheFinley/raspberrypi-tempurature'
GITHUB_BRANCH  = 'main'
GITHUB_FILE    = 'data/recent_temp.json'
LOG_PATTERN    = '/home/pi/readtemp/tempurature.log*'

if not GITHUB_TOKEN:
    print('[ERROR] GITHUB_TOKEN environment variable not set')
    sys.exit(1)


def read_logs():
    frames = []
    for path in sorted(glob.glob(LOG_PATTERN), reverse=True):
        try:
            df = pd.read_csv(path, names=['date', 'temp'], header=None)
            frames.append(df)
        except Exception as e:
            print(f'[WARN] Failed to read {path}: {e}')
            continue
    if not frames:
        raise RuntimeError('No log files found')
    combined = pd.concat(frames, ignore_index=True)
    combined['date'] = pd.to_datetime(combined['date'], format='%Y/%m/%d %H:%M:%S', errors='coerce')
    combined['temp'] = pd.to_numeric(combined['temp'], errors='coerce')
    combined.dropna(inplace=True)
    combined.set_index('date', inplace=True)
    combined.sort_index(inplace=True)
    combined = combined[~combined.index.duplicated(keep='last')]
    combined.loc[combined['temp'] == 85.0, 'temp'] = None
    combined['temp'].interpolate(inplace=True)
    return combined


def downsample(df):
    cutoff = datetime.datetime.now() - datetime.timedelta(days=30)
    hourly = df[df.index >= cutoff].resample('1h').mean().dropna().tail(720)
    labels = [dt.strftime('%b %d %H:%M') for dt in hourly.index]
    values = [round(float(v), 2) for v in hourly['temp']]
    return labels, values


def build_payload(labels, values):
    return json.dumps({
        'current_temp': values[-1] if values else None,
        'last_updated': datetime.datetime.now().strftime('%Y/%m/%d %H:%M:%S'),
        'labels':       labels,
        'values':       values,
    }).encode('utf-8')


def get_file_sha():
    """Fetch the current blob SHA of the file on GitHub (required for updates)."""
    url = f'https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_FILE}'
    headers = {
        'Authorization': f'token {GITHUB_TOKEN}',
        'Accept': 'application/vnd.github.v3+json',
    }
    r = requests.get(url, headers=headers, params={'ref': GITHUB_BRANCH}, timeout=30)
    if r.status_code == 404:
        return None  # File doesn't exist yet
    r.raise_for_status()
    return r.json().get('sha')


def push_to_github(content):
    url = f'https://api.github.com/repos/{GITHUB_REPO}/contents/{GITHUB_FILE}'
    headers = {
        'Authorization': f'token {GITHUB_TOKEN}',
        'Accept': 'application/vnd.github.v3+json',
    }
    current_sha = get_file_sha()
    payload = {
        'message': f'Update telemetry: {datetime.datetime.now().strftime("%Y-%m-%d %H:%M")}',
        'content': base64.b64encode(content).decode('utf-8'),
        'branch':  GITHUB_BRANCH,
    }
    if current_sha:
        payload['sha'] = current_sha

    r = requests.put(url, headers=headers, json=payload, timeout=30)
    r.raise_for_status()
    return r.json().get('commit', {}).get('sha', 'unknown')


def main():
    ts = datetime.datetime.now().strftime('%Y/%m/%d %H:%M:%S')
    print(f'[{ts}] Start')
    try:
        df             = read_logs()
        labels, values = downsample(df)
        content        = build_payload(labels, values)
        commit_sha     = push_to_github(content)
        print(f'[{ts}] Pushed → commit {commit_sha[:7]}  (current: {values[-1]}°C)')
    except Exception as e:
        print(f'[{ts}] FAILED: {e}')
        sys.exit(1)
    print('---')


if __name__ == '__main__':
    main()
