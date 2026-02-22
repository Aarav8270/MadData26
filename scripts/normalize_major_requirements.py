import csv
import json
import logging
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import DefaultDict, Iterable

LOGGER = logging.getLogger("normalize_major_requirements")
CHOOSE_N_RE = re.compile(r"^C(\d+)$", re.IGNORECASE)
NUMERIC_RE = re.compile(r"^\d+(?:\.\d+)?$")
INTERVAL_RE = re.compile(r"^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$")
DEGREE_SUFFIX_RE = re.compile(r"^(BA|BS|BFA|BM|BLS|BSW|JBA|BLA)\b", re.IGNORECASE)


@dataclass(frozen=True)
class RequirementRow:
    major: str
    group_id: str
    course: str
    requirement_token: str


@dataclass(frozen=True)
class ParsedToken:
    token: str
    kind: str  # "choose", "credits", "malformed"
    required_count: int | None
    required_credits: int | None


def strip_degree_suffix(major: str) -> str:
    parts = [part.strip() for part in major.split(",")]
    if len(parts) > 1 and DEGREE_SUFFIX_RE.match(parts[-1]):
        cleaned = ", ".join(parts[:-1]).strip()
        if cleaned:
            return cleaned
    return major.strip()


def parse_requirement_token(token: str) -> ParsedToken:
    normalized = token.strip()
    choose_match = CHOOSE_N_RE.fullmatch(normalized)
    if choose_match:
        return ParsedToken(normalized, "choose", int(choose_match.group(1)), None)

    if NUMERIC_RE.fullmatch(normalized):
        value = float(normalized)
        if value.is_integer():
            return ParsedToken(normalized, "credits", None, int(value))
        LOGGER.warning("malformed_token non_integer_credit token=%s", normalized)
        return ParsedToken(normalized, "malformed", None, None)

    interval_match = INTERVAL_RE.fullmatch(normalized)
    if interval_match:
        lower = float(interval_match.group(1))
        upper = float(interval_match.group(2))
        if lower.is_integer() and upper.is_integer():
            LOGGER.info("interval_token_lower_bound_used token=%s requiredCredits=%d", normalized, int(lower))
            return ParsedToken(normalized, "credits", None, int(lower))
        LOGGER.warning("malformed_token non_integer_interval token=%s", normalized)
        return ParsedToken(normalized, "malformed", None, None)

    LOGGER.warning("malformed_token token=%s", normalized)
    return ParsedToken(normalized, "malformed", None, None)


def read_rows(csv_path: Path) -> Iterable[RequirementRow]:
    with csv_path.open("r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            major = (row.get("Major") or "").strip()
            group_id = (row.get("Group ID") or "").strip()
            course = (row.get("Course") or "").strip()
            requirement_token = (row.get("Credits Required") or "").strip()
            if not major or not group_id or not course:
                LOGGER.warning(
                    "skipping_incomplete_row file=%s major=%s groupId=%s course=%s",
                    csv_path.name,
                    major,
                    group_id,
                    course,
                )
                continue
            yield RequirementRow(major, group_id, course, requirement_token)


def dedupe_courses(courses: Iterable[str], major: str, group_id: str) -> list[str]:
    seen: set[str] = set()
    unique: list[str] = []
    duplicates = 0
    for course in courses:
        if course in seen:
            duplicates += 1
            continue
        seen.add(course)
        unique.append(course)
    if duplicates:
        LOGGER.info("duplicate_courses_removed major=%s groupId=%s duplicates=%d", major, group_id, duplicates)
    return unique


def normalize_group(rows: list[RequirementRow], normalized_major: str) -> dict:
    group_id = rows[0].group_id
    parsed_tokens = [parse_requirement_token(r.requirement_token) for r in rows]
    raw_tokens = sorted({t.token for t in parsed_tokens})
    token_kinds = {t.kind for t in parsed_tokens}
    courses = dedupe_courses((r.course for r in rows), major=normalized_major, group_id=group_id)

    if "malformed" in token_kinds:
        LOGGER.warning("mixed_or_malformed_rule major=%s groupId=%s rawTokens=%s", normalized_major, group_id, raw_tokens)
        return {
            "groupId": group_id,
            "ruleType": "manual_review",
            "requiredCount": None,
            "requiredCredits": None,
            "courses": courses,
            "rawRequirementTokens": raw_tokens,
        }

    if token_kinds == {"choose"}:
        counts = sorted({t.required_count for t in parsed_tokens if t.required_count is not None})
        if len(counts) == 1:
            return {
                "groupId": group_id,
                "ruleType": "choose_n_courses",
                "requiredCount": counts[0],
                "requiredCredits": None,
                "courses": courses,
            }

    if token_kinds == {"credits"}:
        credits = sorted({t.required_credits for t in parsed_tokens if t.required_credits is not None})
        if len(credits) == 1:
            return {
                "groupId": group_id,
                "ruleType": "min_credits",
                "requiredCount": None,
                "requiredCredits": credits[0],
                "courses": courses,
            }

    LOGGER.warning("mixed_rule_detection major=%s groupId=%s rawTokens=%s", normalized_major, group_id, raw_tokens)
    return {
        "groupId": group_id,
        "ruleType": "manual_review",
        "requiredCount": None,
        "requiredCredits": None,
        "courses": courses,
        "rawRequirementTokens": raw_tokens,
    }


def group_sort_key(group: dict) -> tuple[int, str]:
    raw_group = str(group.get("groupId", ""))
    digits = "".join(ch for ch in raw_group if ch.isdigit())
    if digits:
        return (0, digits.zfill(12))
    return (1, raw_group)


def normalize_all(input_dir: Path, output_path: Path) -> None:
    by_major_groups: DefaultDict[str, list[dict]] = defaultdict(list)
    csv_files = sorted(input_dir.glob("*.csv"))

    for csv_path in csv_files:
        grouped: DefaultDict[tuple[str, str], list[RequirementRow]] = defaultdict(list)
        for row in read_rows(csv_path):
            cleaned_major = strip_degree_suffix(row.major)
            grouped[(cleaned_major, row.group_id)].append(row)

        for (cleaned_major, _), rows in grouped.items():
            by_major_groups[cleaned_major].append(normalize_group(rows, normalized_major=cleaned_major))

    payload = []
    for major in sorted(by_major_groups.keys()):
        groups = by_major_groups[major]
        unique_groups: list[dict] = []
        seen: set[str] = set()
        for group in sorted(groups, key=group_sort_key):
            marker = json.dumps(group, sort_keys=True)
            if marker in seen:
                LOGGER.info("duplicate_group_removed major=%s groupId=%s", major, group.get("groupId"))
                continue
            seen.add(marker)
            unique_groups.append(group)

        payload.append({
            "major": major,
            "requirementGroups": unique_groups,
        })

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    LOGGER.info("normalized_majors_written output=%s majorCount=%d", output_path, len(payload))


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    repo_root = Path(__file__).resolve().parents[2]
    input_dir = repo_root / "backend" / "data" / "modified"
    output_path = repo_root / "backend" / "data" / "normalized" / "MajorSpecificRequirements.JSON"
    normalize_all(input_dir=input_dir, output_path=output_path)


if __name__ == "__main__":
    main()
