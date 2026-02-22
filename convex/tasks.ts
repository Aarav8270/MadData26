import { query } from "./_generated/server";

export const getUniversity = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("UniversityTable").collect();
    },
});


export const getMajorList = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("MajorsList").collect();
    },
});


export const getMajorReqs = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("MajorReqs").collect();
    },
});


export const getGEReqs = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("GERequirements").collect();
    },
});


export const getDegreeReqs = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("DegreeReqs").collect();
    },
});


export const getCourseTable = query({
    args: {},
    handler: async (ctx) => {
        return await ctx.db.query("CourseTable").collect();
    },
});