const SPACE_RE = /\s+/g;

function canon(value = "") {
  return String(value).trim().toUpperCase().replace(SPACE_RE, " ");
}

function toCourseId(row) {
  if (row?.courseId) return canon(row.courseId);
  const subject = String(row?.subject ?? "").trim();
  const number = String(row?.number ?? "").trim();
  return canon(`${subject} ${number}`);
}

function gradeCompleted(grade) {
  const g = String(grade ?? "").trim().toUpperCase();
  return g.length > 0 && !new Set(["INP", "IP", "W", "UW"]).has(g);
}

function buildPrompt({ major, degreeType, majorProgress, studentCourses, suggestions }) {
  const completed = studentCourses.filter((c) => gradeCompleted(c.grade));
  const inProgress = studentCourses.filter((c) => !gradeCompleted(c.grade));

  const completedLines = completed.slice(0, 50).map((c) => `- ${toCourseId(c)} (${c.grade || "NA"})`);
  const inProgressLines = inProgress.slice(0, 20).map((c) => `- ${toCourseId(c)} (${c.grade || "INP"})`);
  const suggestionLines = suggestions.slice(0, 12).map((s) => `- ${s}`);

  return [
    "You are an academic degree planning assistant for UW-Madison.",
    "Write a concise response with two sections:",
    "1) Overview: what the student has already done",
    "2) Recommended Next Classes: practical next courses from remaining major requirements",
    "Use bullet points and plain language. Mention uncertainty when requirements are manual-review.",
    "Do not invent classes outside the provided suggestions list unless clearly marked as examples.",
    "",
    `Major: ${major}`,
    `Degree Type: ${degreeType}`,
    `Major completion: ${majorProgress?.majorCompletionPercent ?? 0}%`,
    `Evaluated requirement groups: ${majorProgress?.evaluatedGroups ?? 0}`,
    "",
    "Completed courses:",
    ...(completedLines.length ? completedLines : ["- None parsed"]),
    "",
    "In-progress / not-completed courses:",
    ...(inProgressLines.length ? inProgressLines : ["- None"]),
    "",
    "Best candidate next classes from requirements:",
    ...(suggestionLines.length ? suggestionLines : ["- No direct suggestions available"]),
  ].join("\n");
}

function fallbackAdvice({ major, degreeType, majorProgress, studentCourses, suggestions }) {
  const completedCount = studentCourses.filter((c) => gradeCompleted(c.grade)).length;
  const inProgressCount = studentCourses.length - completedCount;

  const overview = [
    `You've completed ${completedCount} courses from your uploaded DARS and currently have ${inProgressCount} courses still in progress or not completed.`,
    `For ${major} (${degreeType}), your current major completion is about ${majorProgress?.majorCompletionPercent?.toFixed?.(2) ?? "0.00"}% based on machine-evaluable requirement groups.`,
  ];

  const nextClasses = suggestions.slice(0, 8);
  if (nextClasses.length === 0) {
    nextClasses.push("Meet with your advisor to review manual-review requirements and identify next classes.");
  }

  const text = [
    "Overview",
    ...overview.map((x) => `- ${x}`),
    "",
    "Recommended Next Classes",
    ...nextClasses.map((x) => `- ${x}`),
    "",
    "Note: This is a fallback summary because the Llama endpoint was unavailable.",
  ].join("\n");

  return { advice: text, source: "fallback" };
}

export function suggestNextCourses(requirements, major, studentCourses) {
  const majorObj = requirements.find((m) => canon(m.major) === canon(major));
  if (!majorObj) return [];

  const completedSet = new Set(studentCourses.filter((c) => gradeCompleted(c.grade)).map(toCourseId));
  const suggestions = [];

  for (const group of majorObj.requirementGroups ?? []) {
    for (const raw of group.courses ?? []) {
      const options = String(raw)
        .split(/\s*&\s*/)
        .map((v) => canon(v))
        .filter(Boolean);

      const unmet = options.filter((opt) => !completedSet.has(opt));
      if (unmet.length > 0) {
        suggestions.push(unmet[0]);
      }

      if (suggestions.length >= 20) {
        return Array.from(new Set(suggestions));
      }
    }
  }

  return Array.from(new Set(suggestions));
}

export async function generateAdvisorOverview({
  requirements,
  major,
  degreeType,
  majorProgress,
  studentCourses,
  model = process.env.LLAMA_MODEL || "llama3.1",
  ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate",
}) {
  const suggestions = suggestNextCourses(requirements, major, studentCourses);
  const prompt = buildPrompt({ major, degreeType, majorProgress, studentCourses, suggestions });

  try {
    const response = await fetch(ollamaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload?.error || `Ollama request failed: ${response.status}`);
    }

    const advice = String(payload?.response || "").trim();
    if (!advice) {
      throw new Error("Ollama returned an empty response");
    }

    return { advice, source: "llama", suggestions };
  } catch (_err) {
    const fallback = fallbackAdvice({ major, degreeType, majorProgress, studentCourses, suggestions });
    return { ...fallback, suggestions };
  }
}
