import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
    UniversityTable: defineTable({
        name: v.string(),
        abbreviation: v.string(),
        location: v.string()
    }),
    CourseTable: defineTable({
        name: v.string(),
        credits: v.number(),
        breadth: v.array(v.string()),
        //prerequirements: v.array(v.string()),
        prerequirements: v.any(),
        generalEd: v.optional(v.string()),
        courseID: v.string(),
        level: v.optional(v.string()),
        university: v.id("UniversityTable"),
        repeatable: v.boolean(),
        description: v.string(),
        ethnicstudies: v.boolean(),
    }),
    GERequirements: defineTable({
        name: v.string(),
        credits: v.number(),
    }),
    MajorsList: defineTable({
        majorName: v.string(),
        degreeType: v.string(),
        University: v.id("UniversityTable"),
    }),
    MajorReqs: defineTable({
        major: v.string(),
        requirementGroups: v.array(v.object({
            groupId: v.string(),
            ruleType: v.string(),
            requiredCount: v.union(v.null(), v.number()),
            requiredCredits: v.union(v.null(), v.number(),),
            courses: v.array(v.string())
        })),
    }),
    DegreeReqs: defineTable({
        name: v.string(), //req over will be metadata (BA/BS) - user has own table
        mathematics: v.number(),
        language: v.boolean(),
        ethnicstudies: v.boolean(),
        LSBreadth: v.object({
            humanities: v.number(),
            literature: v.number(), // linked into humanities
            socialscience: v.number(),
            NaturalScience: v.number(),
            BiologicalScience: v.number(),
            PhysicalScience: v.number(),
        }),
        LASCoursework: v.number(),
        InterAdvCoursework: v.number(),
        TotalCredits: v.number(),
        GPA: v.number(),
    }),
});