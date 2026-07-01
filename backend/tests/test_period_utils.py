import pytest
from datetime import datetime, timezone

from digest.period_utils import (
    infer_period_mode_from_cron,
    resolve_snapshot_period,
    validate_snapshot_period_label,
)


def test_infer_period_mode_from_cron():
    assert infer_period_mode_from_cron("0 6 * * *") == "day"
    assert infer_period_mode_from_cron("0 6 * * 1") == "day"
    assert infer_period_mode_from_cron("0 6 1 * *") == "month"
    assert infer_period_mode_from_cron("0 6 1 1,4,7,10 *") == "month"


def test_resolve_snapshot_period_day_and_month():
    now = datetime(2026, 7, 1, 12, 0, tzinfo=timezone.utc)
    assert resolve_snapshot_period(None, "day", now=now) == "2026-07-01"
    assert resolve_snapshot_period(None, "month", now=now) == "2026-07"


def test_validate_snapshot_period_label():
    assert validate_snapshot_period_label("2026-07") == "2026-07"
    assert validate_snapshot_period_label("2026-07-15") == "2026-07-15"
    with pytest.raises(ValueError):
        validate_snapshot_period_label("2026-13")
