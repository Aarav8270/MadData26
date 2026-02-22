import fs from "fs";

const SPLIT_AND_RE = /\s*&\s*/;
const SPACE_RE = /\s+/g;

function canon(value = "") {
  return String(value).trim().toUpperCase().replace(SPACE_RE, " ");
}

function parseCourseFromRow(row) {
  const courseId = row.courseId ? String(row.courseId) : `${row.subject ?? ""} ${row.number ?? ""}`;
  const grade = String(row.grade ?? "").toUpperCase().trim();
  const completed = !new Set(["INP", "IP", "W", "UW"]).has(grade);
  const credits = Number(row.credits ?? 0) || 0;
  return { courseId: canon(courseId), credits, completed };
}

function optionParts(option) {
  return String(option)
    .split(SPLIT_AND_RE)
    .map((x) => canon(x))
    .filter(Boolean);
}

function scoreOption(option, availableCompleted) {
  const parts = optionParts(option);
  if (parts.length === 0) return { score: 0, matched: new Set(), full: false };
  const matched = new Set(parts.filter((p) => availableCompleted.has(p)));
  return { score: matched.size / parts.length, matched, full: matched.size === parts.length };
}

function evaluateChooseGroup(group, availableCompleted) {
  const required = Number(group.requiredCount ?? 0);
  if (required <= 0) return { ratio: 0, used: new Set(), detail: { reason: "invalid_required_count" } };

  const candidates = (group.courses ?? []).map((opt) => {
    const { score, matched, full } = scoreOption(opt, availableCompleted);
    return { option: opt, score, matched, full };
  });

  candidates.sort((a, b) => (Number(b.full) - Number(a.full)) || (b.score - a.score));
  const picked = candidates.slice(0, required);
  const rawScore = picked.reduce((sum, p) => sum + p.score, 0);
  const used = new Set();
  picked.forEach((p) => p.matched.forEach((m) => used.add(m)));

  return {
    ratio: Math.min(rawScore / required, 1),
    used,
    detail: { pickedOptions: picked.map((p) => p.option), rawScore, required },
  };
}

function evaluateCreditGroup(group, availableCompleted, courseCreditMap) {
  const required = Number(group.requiredCredits ?? 0);
  if (required <= 0) return { ratio: 0, used: new Set(), detail: { reason: "invalid_required_credits" } };

  const matched = [];
  (group.courses ?? []).forEach((opt) => {
    const cid = canon(opt);
    if (availableCompleted.has(cid)) matched.push({ cid, credits: courseCreditMap.get(cid) ?? 0 });
  });

  matched.sort((a, b) => b.credits - a.credits);
  const used = new Set();
  let total = 0;
  for (const { cid, credits } of matched) {
    used.add(cid);
    total += credits;
    if (total >= required) break;
  }

  return {
    ratio: Math.min(total / required, 1),
    used,
    detail: { earnedCredits: total, requiredCredits: required },
  };
}

export function loadRequirements(requirementsPath) {
  const raw = fs.readFileSync(requirementsPath, "utf-8");
  return JSON.parse(raw);
}

export function listMajors(requirements) {
  return requirements.map((m) => m.major).sort((a, b) => a.localeCompare(b));
}

export function evaluateMajorProgress(requirements, major, degreeType, studentRows) {
  const majorKey = canon(major);
  const majorObj = requirements.find((m) => canon(m.major) === majorKey);
  if (!majorObj) throw new Error(`Major not found: ${major}`);

  const completedCourses = studentRows.map(parseCourseFromRow).filter((c) => c.completed);
  const remaining = new Set(completedCourses.map((c) => c.courseId));
  const courseCreditMap = new Map(completedCourses.map((c) => [c.courseId, c.credits]));

  const groupResults = [];
  const ratios = [];

  for (const group of majorObj.requirementGroups ?? []) {
    let ratio = 0;
    let used = new Set();
    let detail = {};

    if (group.ruleType === "choose_n_courses") {
      ({ ratio, used, detail } = evaluateChooseGroup(group, remaining));
    } else if (group.ruleType === "min_credits") {
      ({ ratio, used, detail } = evaluateCreditGroup(group, remaining, courseCreditMap));
    } else {
      detail = { reason: "manual_review" };
    }

    used.forEach((u) => remaining.delete(u));
    ratios.push(ratio);
    groupResults.push({
      groupId: group.groupId,
      ruleType: group.ruleType,
      completionRatio: Number(ratio.toFixed(4)),
      usedCourses: Array.from(used).sort(),
      detail,
    });
  }

  const majorCompletionPercent = ratios.length
    ? Number(((ratios.reduce((a, b) => a + b, 0) / ratios.length) * 100).toFixed(2))
    : 0;

  return {
    major: majorObj.major,
    degreeType: degreeType ?? "BA",
    majorCompletionPercent,
    evaluatedGroups: groupResults.length,
    groupResults,
  };
}
