import { z } from "zod";
export const registry = {
    "email:send": z.object({
        to: z.string().email(),
        subject: z.string(),
        body: z.string(),
    }),
    "report:generate": z.object({
        reportId: z.string(),
        format: z.enum(["pdf", "csv"]),
    }),
};
