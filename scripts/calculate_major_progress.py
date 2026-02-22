import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SPLIT_AND_RE = re.compile(r"\s*&\s*")
SPACE_RE = re.compile(r"\s+")


@dataclass
class StudentCourse:
    course_id: str
    credits: float
    completed: bool


def canon(value: str) -> str:
    return SPACE_RE.sub(" ", value.strip().upper())


def parse_course_from_dars_row(row: dict[str, Any]) -> StudentCourse:
    if "courseId" in row:
        cid = str(row["courseId"])
    else:
        subject = str(row.get("subject", "")).strip()
        number = str(row.get("number", "")).strip()
        cid = f"{subject} {number}".strip()

    grade = str(row.get("grade", "")).upper().strip()
    completed = grade not in {"INP", "IP", "W", "UW"}
    credits = float(row.get("credits", 0) or 0)
    return StudentCourse(course_id=canon(cid), credits=credits, completed=completed)


def option_parts(option: str) -> list[str]:
    return [canon(x) for x in SPLIT_AND_RE.split(option) if x.strip()]


def score_option(option: str, available_completed: set[str]) -> tuple[float, set[str], bool]:
    parts = option_parts(option)
    if not parts:
        return 0.0, set(), False
    matched = {p for p in parts if p in available_completed}
    score = len(matched) / len(parts)
    return score, matched, len(matched) == len(parts)


def evaluate_choose_group(group: dict[str, Any], available_completed: set[str]) -> tuple[float, set[str], dict[str, Any]]:
    required = int(group.get("requiredCount") or 0)
    if required <= 0:
        return 0.0, set(), {"reason": "invalid_required_count"}

    candidates = []
    for opt in group.get("courses", []):
        score, matched, full = score_option(str(opt), available_completed)
        candidates.append((score, full, opt, matched))

    # prioritize fully satisfied options, then highest partials
    candidates.sort(key=lambda x: (x[1], x[0]), reverse=True)
    picked = candidates[:required]
    total_score = sum(item[0] for item in picked)
    ratio = min(total_score / required, 1.0)

    used_courses: set[str] = set()
    for _, _, _, matched in picked:
        used_courses.update(matched)

    return ratio, used_courses, {
        "pickedOptions": [p[2] for p in picked],
        "rawScore": total_score,
        "required": required,
    }


def evaluate_credit_group(
    group: dict[str, Any],
    available_completed: set[str],
    course_credit_map: dict[str, float],
) -> tuple[float, set[str], dict[str, Any]]:
    required = float(group.get("requiredCredits") or 0)
    if required <= 0:
        return 0.0, set(), {"reason": "invalid_required_credits"}

    matched: list[tuple[str, float]] = []
    for opt in group.get("courses", []):
        cid = canon(str(opt))
        if cid in available_completed:
            matched.append((cid, course_credit_map.get(cid, 0.0)))

    matched.sort(key=lambda x: x[1], reverse=True)
    used: set[str] = set()
    total = 0.0
    for cid, credits in matched:
        used.add(cid)
        total += credits
        if total >= required:
            break

    ratio = min(total / required, 1.0) if required else 0.0
    return ratio, used, {"earnedCredits": total, "requiredCredits": required}


def evaluate_major_progress(
    all_requirements: list[dict[str, Any]],
    major: str,
    degree_type: str,
    student_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    major_key = canon(major)
    major_obj = next((m for m in all_requirements if canon(m.get("major", "")) == major_key), None)
    if not major_obj:
        raise ValueError(f"Major not found in requirements: {major}")

    student_courses = [parse_course_from_dars_row(r) for r in student_rows]
    completed = [c for c in student_courses if c.completed]
    available_completed = {c.course_id for c in completed}
    course_credit_map = {c.course_id: c.credits for c in completed}

    # course counts only once within a single major evaluation
    remaining = set(available_completed)

    group_results = []
    ratios = []

    for group in major_obj.get("requirementGroups", []):
        rule_type = group.get("ruleType")
        used: set[str] = set()
        ratio = 0.0
        detail: dict[str, Any] = {}

        if rule_type == "choose_n_courses":
            ratio, used, detail = evaluate_choose_group(group, remaining)
        elif rule_type == "min_credits":
            ratio, used, detail = evaluate_credit_group(group, remaining, course_credit_map)
        else:
            ratio = 0.0
            detail = {"reason": "manual_review"}

        remaining -= used
        ratios.append(ratio)
        group_results.append(
            {
                "groupId": group.get("groupId"),
                "ruleType": rule_type,
                "completionRatio": round(ratio, 4),
                "usedCourses": sorted(used),
                "detail": detail,
            }
        )

    percent = (sum(ratios) / len(ratios) * 100.0) if ratios else 0.0

    return {
        "major": major_obj.get("major"),
        "degreeType": degree_type,
        "majorCompletionPercent": round(percent, 2),
        "evaluatedGroups": len(group_results),
        "groupResults": group_results,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Calculate major progress from parsed DARS rows")
    parser.add_argument("--requirements", default="backend/data/normalized/MajorSpecificRequirements.JSON")
    parser.add_argument("--major", required=True)
    parser.add_argument("--degree-type", default="BA")
    parser.add_argument("--student-courses", required=True, help="Path to JSON array of parsed DARS rows")
    parser.add_argument("--output", default="")
    args = parser.parse_args()

    requirements = json.loads(Path(args.requirements).read_text(encoding="utf-8"))
    student_rows = json.loads(Path(args.student_courses).read_text(encoding="utf-8"))

    result = evaluate_major_progress(requirements, args.major, args.degree_type, student_rows)
    text = json.dumps(result, indent=2, ensure_ascii=False) + "\n"

    if args.output:
        Path(args.output).write_text(text, encoding="utf-8")
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
