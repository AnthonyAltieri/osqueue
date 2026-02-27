import { z } from "zod";
export declare const registry: {
    "email:send": z.ZodObject<{
        to: z.ZodString;
        subject: z.ZodString;
        body: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        to: string;
        subject: string;
        body: string;
    }, {
        to: string;
        subject: string;
        body: string;
    }>;
    "report:generate": z.ZodObject<{
        reportId: z.ZodString;
        format: z.ZodEnum<["pdf", "csv"]>;
    }, "strip", z.ZodTypeAny, {
        reportId: string;
        format: "pdf" | "csv";
    }, {
        reportId: string;
        format: "pdf" | "csv";
    }>;
};
