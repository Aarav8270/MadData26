// convex/progress.ts
import { query } from "./_generated/server";
import { v } from "convex/values";

function canon(x: string) {
  return String(x).trim().toUpperCase().replace(/\s+/g, " ");
}

// Some requirement "courses" entries may contain options joined by "&"
// e.g. "MATH 221 & MATH 222" means both needed to count that option.
function optionParts(option: string) {
  return String(option)
    .split(/\s*&\s*/)
    .map((p) => canon(p))
    .filter(Boolean);
}

export const topMajors = query({
  args: {
    studentCourses: v.array(
      v.object({
        courseId: v.string(), // e.g. "COMP SCI 300"
        credits: v.number(),
        status: v.union(v.literal("completed"), v.literal("in_progress"), v.literal("planned")),
      })
    ),
    topN: v.optional(v.number()),
    includePlanned: v.optional(v.boolean()),
    degreeType: v.optional(v.string()), // "BA" or "BS"
    universityId: v.optional(v.id("UniversityTable")),
  },
  handler: async (ctx, args) => {
    const topN = args.topN ?? 5;
    const includePlanned = args.includePlanned ?? false;
    const degreeFilter = args.degreeType ? canon(args.degreeType) : null;

    // Build student's taken map (courseId -> credits)
    // If you want to exclude in_progress too, filter here.
    const takenCredits = new Map<string, number>();
    for (const c of args.studentCourses) {
      if (!includePlanned && c.status === "planned") continue;
      takenCredits.set(canon(c.courseId), Number(c.credits ?? 0));
    }

    // Load majors (optionally filtered by university + degree type)
    const majorsAll = await ctx.db.query("MajorsList").collect();

    const majors = majorsAll
      .filter((m) => (args.universityId ? m.University === args.universityId : true))
      .filter((m) => (degreeFilter ? canon(m.degreeType) === degreeFilter : true));

    // Load all major requirement blobs (MajorReqs stores groups already)
    const reqBlobs = await ctx.db.query("MajorReqs").collect();
    const reqByMajor = new Map<string, (typeof reqBlobs)[number]>();
    for (const r of reqBlobs) {
      reqByMajor.set(canon(r.major), r);
    }

    const results = majors.map((m) => {
      const majorName = m.majorName;
      const degreeType = m.degreeType;

      const reqBlob = reqByMajor.get(canon(majorName)) ?? reqByMajor.get(canon(m.majorName));
      const groups = reqBlob?.requirementGroups ?? [];

      let satisfiedGroups = 0;

      for (const g of groups) {
        const ruleType = canon(g.ruleType ?? "");

        // Rule 1: choose_n_courses
        if (ruleType === "CHOOSE_N_COURSES") {
          const required = Number(g.requiredCount ?? 0);
          if (required <= 0) continue;

          // Count options satisfied
          // If a course entry contains "&", treat it as a combo that must all be present.
          let satisfiedOptions = 0;
          for (const opt of g.courses ?? []) {
            const parts = optionParts(opt);
            if (parts.length === 0) continue;
            const allPresent = parts.every((p) => takenCredits.has(p));
            if (allPresent) satisfiedOptions++;
          }

          if (satisfiedOptions >= required) satisfiedGroups++;
          continue;
        }

        // Rule 2: min_credits
        if (ruleType === "MIN_CREDITS") {
          const requiredCredits = Number(g.requiredCredits ?? 0);
          if (requiredCredits <= 0) continue;

          // Sum credits of matched courseIds (counting each matched course at most once)
          let earned = 0;
          const seen = new Set<string>();
          for (const opt of g.courses ?? []) {
            const parts = optionParts(opt);
            // For min_credits, a combo "&" is odd — but we’ll treat it as:
            // if all parts present, count sum of their credits once.
            if (parts.length === 0) continue;
            const allPresent = parts.every((p) => takenCredits.has(p));
            if (!allPresent) continue;

            for (const p of parts) {
              if (seen.has(p)) continue;
              seen.add(p);
              earned += Number(takenCredits.get(p) ?? 0);
            }

            if (earned >= requiredCredits) break;
          }

          if (earned >= requiredCredits) satisfiedGroups++;
          continue;
        }

        // Rule 3: manual_review or unknown
        // Conservative: count satisfied if ANY option is present (or any combo fully present)
        let any = false;
        for (const opt of g.courses ?? []) {
          const parts = optionParts(opt);
          if (parts.length === 0) continue;
          const allPresent = parts.every((p) => takenCredits.has(p));
          if (allPresent) {
            any = true;
            break;
          }
        }
        if (any) satisfiedGroups++;
      }

      const totalGroups = groups.length;
      const percent = totalGroups > 0 ? (satisfiedGroups / totalGroups) * 100 : 0;

      return {
        major: majorName,
        degreeType,
        percent: Number(percent.toFixed(2)),
        satisfiedGroups,
        totalGroups,
      };
    });

    results.sort((a, b) => b.percent - a.percent);
    return results.slice(0, topN);
  },
});