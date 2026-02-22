import { v } from "convex/values";
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

export const getMajorRequirement = query({
    args: {major: v.string()},
    handler:async (ctx, args) => {
        const temp = await ctx.db.query("MajorReqs").collect();

        for (let i = 0; i < 65; i++){
            if (temp[i].major == args.major)
                return temp[i].requirementGroups;
        }
    }
})


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