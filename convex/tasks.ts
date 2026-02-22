import { query } from "./_generated/server";

export const getUniversity = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("UniversityTable").collect();
    },
});