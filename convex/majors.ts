import { query } from "./_generated/server";
import { v } from "convex/values";

export const list = query({
  args: {
    universityId: v.optional(v.id("UniversityTable")),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("MajorsList");
    const rows = await q.collect();

    const filtered = args.universityId
      ? rows.filter((r) => r.University === args.universityId)
      : rows;

    return filtered
      .map((r) => ({
        majorName: r.majorName,
        degreeType: r.degreeType,
      }))
      .sort((a, b) => a.majorName.localeCompare(b.majorName));
  },
});