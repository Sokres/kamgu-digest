"""Ключ периода снимка: месяц (YYYY-MM) или день (YYYY-MM-DD) в UTC."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Literal

SnapshotPeriodMode = Literal["month", "day"]

_MONTH_RE = re.compile(r"^\d{4}-\d{2}$")
_DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def utc_period_key(mode: SnapshotPeriodMode, *, now: datetime | None = None) -> str:
    dt = now or datetime.now(timezone.utc)
    if mode == "day":
        return dt.strftime("%Y-%m-%d")
    return dt.strftime("%Y-%m")


def resolve_snapshot_period(
    force: str | None,
    mode: SnapshotPeriodMode,
    *,
    now: datetime | None = None,
) -> str:
    if force:
        return normalize_force_period(force.strip(), mode)
    return utc_period_key(mode, now=now)


def normalize_force_period(raw: str, mode: SnapshotPeriodMode) -> str:
    s = raw.strip()
    if mode == "day":
        if not _DAY_RE.match(s):
            raise ValueError("force_period must be YYYY-MM-DD for period_mode=day")
        y, m, d = (int(x) for x in s.split("-"))
        datetime(y, m, d)
        return s
    if not _MONTH_RE.match(s):
        raise ValueError("force_period must be YYYY-MM for period_mode=month")
    y, m = s.split("-", 1)
    if not y.isdigit() or not m.isdigit():
        raise ValueError("force_period must be YYYY-MM for period_mode=month")
    mi = int(m)
    if mi < 1 or mi > 12:
        raise ValueError("force_period month must be 01-12")
    return s


def validate_snapshot_period_label(period: str) -> str:
    p = period.strip()
    if _DAY_RE.match(p):
        y, m, d = (int(x) for x in p.split("-"))
        datetime(y, m, d)
        return p
    if _MONTH_RE.match(p):
        y, m = p.split("-", 1)
        mi = int(m)
        if mi < 1 or mi > 12:
            raise ValueError("period month must be 01-12")
        return p
    raise ValueError("period must be YYYY-MM or YYYY-MM-DD")


def infer_period_mode_from_cron(cron: str) -> SnapshotPeriodMode:
    parts = cron.strip().split()
    if len(parts) != 5:
        return "month"
    _, _, dom, mon, dow = parts
    if dom == "1" and mon in ("*", "1,4,7,10"):
        return "month"
    if dom == "*" and mon == "*" and dow == "*":
        return "day"
    if dom == "*" and mon == "*" and dow.isdigit():
        return "day"
    return "month"


def resolve_schedule_period_mode(
    cron_utc: str,
    explicit: SnapshotPeriodMode | None,
) -> SnapshotPeriodMode:
    if explicit is not None:
        return explicit
    return infer_period_mode_from_cron(cron_utc)
