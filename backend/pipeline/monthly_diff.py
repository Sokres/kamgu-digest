"""Детерминированное сравнение текущего снимка с предыдущим."""

from __future__ import annotations

from digest.models import (
    ConceptRef,
    ConceptShareDelta,
    MonthlyStructuredDelta,
    SnapshotWorkRecord,
    WorkCitationDelta,
)


def _concept_top_names(concepts: list[ConceptRef], limit: int = 3) -> list[str]:
    names: list[str] = []
    for c in sorted(concepts, key=lambda x: x.score, reverse=True):
        n = (c.display_name or "").strip()
        if n and n not in names:
            names.append(n)
        if len(names) >= limit:
            break
    return names


def aggregate_concept_shares(
    works: list[SnapshotWorkRecord],
) -> dict[str, float]:
    """
    Доля работ, у которых концепт входит в топ-3 по score (0..1).
    Усреднение по числу работ в снимке.
    """
    if not works:
        return {}
    counts: dict[str, int] = {}
    for w in works:
        for name in _concept_top_names(w.concepts, 3):
            counts[name] = counts.get(name, 0) + 1
    n = len(works)
    return {k: v / n for k, v in counts.items()}


def _share_deltas(
    prev_shares: dict[str, float],
    curr_shares: dict[str, float],
    limit: int = 12,
) -> list[ConceptShareDelta]:
    names = set(prev_shares) | set(curr_shares)
    rows: list[ConceptShareDelta] = []
    for name in names:
        sp = prev_shares.get(name)
        sc = curr_shares.get(name)
        dp = sp if sp is not None else None
        dc = sc if sc is not None else None
        delta = None
        if dp is not None and dc is not None:
            delta = round(dc - dp, 4)
        elif dc is not None:
            delta = round(dc, 4)
        elif dp is not None:
            delta = round(-dp, 4)
        rows.append(
            ConceptShareDelta(
                concept_name=name,
                share_previous=dp,
                share_current=dc,
                delta=delta,
            )
        )
    rows.sort(key=lambda r: abs(r.delta or 0.0), reverse=True)
    return rows[:limit]


def compute_monthly_structured_delta(
    *,
    profile_id: str,
    current_period: str,
    compared_period: str | None,
    is_baseline: bool,
    previous_works: list[SnapshotWorkRecord] | None,
    current_works: list[SnapshotWorkRecord],
    trend_top_k: int,
) -> MonthlyStructuredDelta:
    prev_list = previous_works or []
    prev_by_key = {w.dedupe_key: w for w in prev_list}
    curr_by_key = {w.dedupe_key: w for w in current_works}

    k = max(1, min(trend_top_k, len(current_works)))
    curr_top_keys = {w.dedupe_key for w in current_works[:k]}
    prev_top_keys = {w.dedupe_key for w in prev_list[:k]} if prev_list else set()

    entered: list[WorkCitationDelta] = []
    for key in sorted(curr_top_keys - prev_top_keys):
        cw = curr_by_key[key]
        pw = prev_by_key.get(key)
        entered.append(
            WorkCitationDelta(
                dedupe_key=key,
                title=cw.title,
                citation_previous=pw.citation_count if pw else None,
                citation_current=cw.citation_count,
                citation_delta=(
                    _delta_cite(cw.citation_count, pw.citation_count if pw else None)
                ),
                rank_previous=pw.rank if pw else None,
                rank_current=cw.rank,
            )
        )

    left: list[WorkCitationDelta] = []
    for key in sorted(prev_top_keys - curr_top_keys):
        pw = prev_by_key[key]
        cw = curr_by_key.get(key)
        left.append(
            WorkCitationDelta(
                dedupe_key=key,
                title=pw.title,
                citation_previous=pw.citation_count,
                citation_current=cw.citation_count if cw else None,
                citation_delta=(
                    _delta_cite(
                        cw.citation_count if cw else None,
                        pw.citation_count,
                    )
                    if cw
                    else None
                ),
                rank_previous=pw.rank,
                rank_current=cw.rank if cw else None,
            )
        )

    gains: list[WorkCitationDelta] = []
    for key, cw in curr_by_key.items():
        pw = prev_by_key.get(key)
        if pw is None:
            continue
        dc = _delta_cite(cw.citation_count, pw.citation_count)
        if dc is None:
            continue
        gains.append(
            WorkCitationDelta(
                dedupe_key=key,
                title=cw.title,
                citation_previous=pw.citation_count,
                citation_current=cw.citation_count,
                citation_delta=dc,
                rank_previous=pw.rank,
                rank_current=cw.rank,
            )
        )
    gains.sort(key=lambda x: x.citation_delta or 0, reverse=True)
    top_gains = gains[:10]

    prev_shares = aggregate_concept_shares(prev_list) if prev_list else {}
    curr_shares = aggregate_concept_shares(current_works)
    share_delta_rows = (
        []
        if is_baseline
        else _share_deltas(prev_shares, curr_shares)
    )

    return MonthlyStructuredDelta(
        profile_id=profile_id,
        current_period=current_period,
        compared_period=compared_period,
        is_baseline=is_baseline,
        top_by_citation_gain=top_gains,
        entered_top_k=entered,
        left_top_k=left,
        concept_share_deltas=share_delta_rows,
    )


def _delta_cite(
    current: int | None,
    previous: int | None,
) -> int | None:
    if current is None or previous is None:
        return None
    return int(current - previous)
